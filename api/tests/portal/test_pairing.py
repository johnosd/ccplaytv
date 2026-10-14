"""Feature 070: ID do dispositivo no formato MAC + chave numérica (logic/pareamento.md, ADR-014, ADR-015)."""

import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.portal.access_rotation import AccessRotation
from app.portal.auth import AuthError, AuthService
from app.portal.auth_tokens import AuthTokens, new_token
from app.portal.crypto import PortalCrypto
from app.portal.display_id import (
    derived_display_id,
    display_claim_path,
    normalize_display_id,
    normalize_mac,
)
from app.portal.enrollment import EnrollmentService
from app.portal.models import DeviceDocument, DisplayIdClaimDocument
from app.portal.recovery_codes import RecoveryCodes
from app.portal.recovery_journal import MemoryJournal
from app.portal.repositories.control import RepositoryConflict, TransactionPlan

ORIGIN = "http://127.0.0.1:5174"
MAC_ID = re.compile(r"^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$")


def services(control):
    repository, paths = control
    tokens = AuthTokens({"fixture": b"i" * 32}, "fixture")
    auth = AuthService(repository, tokens, public_origin=ORIGIN, recovery_epoch=new_token())
    signing = ec.generate_private_key(ec.SECP256R1())
    crypto = PortalCrypto({"fixture": b"a" * 32}, "fixture", signing, "fixture",
                          {"fixture": signing.public_key()})
    codes = RecoveryCodes({"fixture": b"r" * 32}, "fixture")
    paths.extend("rateLimits/" + tokens.digest("rate_limit", scope)
                 for scope in ("enroll-ip/pairing-ip", "enroll-global"))
    return EnrollmentService(auth, crypto, codes), AccessRotation(auth, crypto, codes, MemoryJournal(environment="test"))


async def enroll(control, enrollment, mac=None, identity=None):
    identity = identity or "fixture-" + uuid.uuid4().hex
    issued = await enrollment.enroll(identity, new_token(), "pairing-ip", datetime.now(UTC), mac)
    credentials = issued.credentials
    tokens = enrollment.auth.tokens
    control[1].extend([
        "identityClaims/" + tokens.digest("identity", identity), "devices/" + credentials["deviceId"],
        "recoveryResults/" + issued.operation_id,
        "recoveryCodes/" + enrollment.codes.digest(credentials["recoveryCode"]),
        display_claim_path(tokens, credentials["displayId"]),
    ])
    control[1].extend("rateLimits/" + rule.key_hash for rule in enrollment.auth._manual_limits(
        tokens.digest("display_id", credentials["displayId"]), "pairing-ip"))
    return credentials


def random_mac() -> str:
    octets = bytearray(secrets.token_bytes(6))
    octets[0] &= 0xFC  # universal e unicast: parece MAC de fabricante
    return "-".join(f"{octet:02x}" for octet in octets)


def legacy_device(snapshot, **update) -> dict:
    """Documento como um registro antigo o teria (sem ID, ou com ID sorteado antes da ADR-015)."""
    device = DeviceDocument.model_validate(snapshot.to_dict())
    fields = {"display_id": None, "display_id_source": None} if not update else update
    return device.model_copy(update=fields).model_dump(by_alias=True)


def is_generated(display_id: str) -> bool:
    first = int(display_id[:2], 16)
    return bool(first & 0x02) and not first & 0x01


def test_normalizacao_de_mac_e_do_id_digitado():
    assert normalize_mac("a0-8c-fd-19-0a-8c") == "A0:8C:FD:19:0A:8C"
    assert normalize_mac("A08CFD190A8C") == "A0:8C:FD:19:0A:8C"
    for raw in (None, "", "00:00:00:00:00:00", "FF:FF:FF:FF:FF:FF", "01:00:5E:00:00:FB", "zz", 42):
        assert normalize_mac(raw) is None
    assert normalize_display_id(" a0-8c-fd-19-0a-8c ") == "A0:8C:FD:19:0A:8C"
    assert normalize_display_id("not-an-id") is None


async def test_cadastro_usa_mac_util_gera_chave_de_10_digitos_e_guarda_so_hmac(control):
    enrollment, _ = services(control)
    mac = random_mac()
    credentials = await enroll(control, enrollment, mac)
    assert credentials["displayId"] == normalize_mac(mac)
    assert re.fullmatch(r"\d{10}", credentials["deviceKey"])
    row = (await enrollment.repository.client.document("devices/" + credentials["deviceId"]).get()).to_dict()
    assert row["displayId"] == credentials["displayId"] and row["displayIdSource"] == "mac"
    assert credentials["deviceKey"] not in str(row)
    claim = (await enrollment.repository.client.document(
        display_claim_path(enrollment.auth.tokens, credentials["displayId"])).get()).to_dict()
    assert claim["deviceId"] == credentials["deviceId"]


async def test_mac_repetido_ou_inutil_gera_id_local_unicast_sem_tomar_o_de_outra_tv(control):
    enrollment, _ = services(control)
    mac = random_mac()
    first = await enroll(control, enrollment, mac)
    second = await enroll(control, enrollment, mac)
    assert first["displayId"] == normalize_mac(mac)
    assert second["displayId"] != first["displayId"] and is_generated(second["displayId"])
    for useless in (None, "00:00:00:00:00:00", "01:00:5E:00:00:FB"):
        generated = await enroll(control, enrollment, useless)
        assert MAC_ID.fullmatch(generated["displayId"]) and is_generated(generated["displayId"])


async def test_sessao_manual_por_id_exibido_com_recusa_uniforme_e_limite(control):
    enrollment, _ = services(control)
    credentials = await enroll(control, enrollment, random_mac())
    auth, now = enrollment.auth, datetime.now(UTC)
    display_id, key = credentials["displayId"], credentials["deviceKey"]
    session = await auth.manual_session(display_id.lower().replace(":", "-"), key, "pairing-ip", ORIGIN, now)
    control[1].extend(auth._paths("sessions", "session", session.token))
    control[1].append("rateLimits/" + auth.tokens.digest("rate_limit", "forms/" + session.token))
    assert session.principal.device_id == credentials["deviceId"]
    wrong_key = f"{(int(key) + 1) % 10**10:010d}"
    unknown = "02:00:00:00:00:01" if display_id != "02:00:00:00:00:01" else "02:00:00:00:00:03"
    codes = set()
    for candidate_id, candidate_key in ((display_id, wrong_key), (unknown, key), ("lixo", key), (display_id, "123")):
        with pytest.raises(AuthError) as error:
            await auth.manual_session(candidate_id, candidate_key, "other-ip-" + uuid.uuid4().hex[:6], ORIGIN, now)
        codes.add((error.value.code, error.value.status))
    assert codes == {("invalid_credentials", 401)}
    for _ in range(5):  # limite por par (ID + origem) = 5 em 15 min
        with pytest.raises(AuthError):
            await auth.manual_session(display_id, wrong_key, "pairing-ip", ORIGIN, now)
    with pytest.raises(AuthError) as error:
        await auth.manual_session(display_id, key, "pairing-ip", ORIGIN, now)
    assert error.value.status == 429 and error.value.retry_after > 0


async def test_revoke_troca_a_chave_mantem_o_id_e_derruba_chave_antiga(control):
    enrollment, rotation = services(control)
    old = await enroll(control, enrollment, random_mac())
    now = datetime.now(UTC)
    operation_id, claim = new_token(), new_token()
    control[1].extend(["devices/" + old["deviceId"] + "/accessIntents/" + operation_id,
                       "recoveryResults/" + operation_id, "jobs/" + AccessRotation.job_id(old["deviceId"], operation_id)])
    principal = await rotation.auth.authenticate_tv(old["bearer"])
    assert (await rotation.begin(principal, operation_id, claim, "revoke", now)).state == "ready"
    delivered = (await rotation.poll(old["deviceId"], operation_id, claim, now)).credentials
    row = (await rotation.repository.client.document("devices/" + old["deviceId"]).get()).to_dict()
    control[1].append("recoveryCodes/" + row["recoveryCodeHmac"])
    assert delivered["displayId"] == old["displayId"] and re.fullmatch(r"\d{10}", delivered["deviceKey"])
    assert delivered["deviceKey"] != old["deviceKey"]
    with pytest.raises(AuthError) as error:
        await rotation.auth.manual_session(old["displayId"], old["deviceKey"], "rotated-ip", ORIGIN, now)
    assert error.value.code == "invalid_credentials"
    control[1].extend("rateLimits/" + rule.key_hash for rule in rotation.auth._manual_limits(
        rotation.auth.tokens.digest("display_id", old["displayId"]), "rotated-ip"))


async def test_dispositivo_anterior_a_070_ganha_id_na_rotacao(control):
    enrollment, rotation = services(control)
    old = await enroll(control, enrollment, None)
    path = "devices/" + old["deviceId"]
    # Registro como já existiria no banco antes da 070: o serviço nunca apaga um ID (ADR-015).
    await rotation.repository.client.document(path).set(legacy_device(await rotation.repository.client.document(path).get()))
    now = datetime.now(UTC)
    operation_id, claim = new_token(), new_token()
    control[1].extend([path + "/accessIntents/" + operation_id, "recoveryResults/" + operation_id,
                       "jobs/" + AccessRotation.job_id(old["deviceId"], operation_id)])
    principal = await rotation.auth.authenticate_tv(old["bearer"])
    mac = random_mac()
    assert (await rotation.begin(principal, operation_id, claim, "revoke", now, mac)).state == "ready"
    delivered = (await rotation.poll(old["deviceId"], operation_id, claim, now + timedelta(seconds=1))).credentials
    row = (await rotation.repository.client.document(path).get()).to_dict()
    control[1].extend(["recoveryCodes/" + row["recoveryCodeHmac"], display_claim_path(rotation.auth.tokens, delivered["displayId"])])
    assert delivered["displayId"] == normalize_mac(mac) == row["displayId"]
    assert row["displayIdSource"] == "mac"

async def test_sem_mac_util_o_id_e_derivado_da_identidade_e_reproduzivel(control):
    """ADR-015: sem MAC (ou MAC de outra TV) o ID vem da identidade — nunca de sorteio."""
    enrollment, _ = services(control)
    tokens = enrollment.auth.tokens
    identity = "fixture-" + uuid.uuid4().hex
    hmac_identity = tokens.digest("identity", identity)
    assert derived_display_id(tokens, hmac_identity) == derived_display_id(tokens, hmac_identity)
    assert derived_display_id(tokens, hmac_identity) != derived_display_id(tokens, tokens.digest("identity", "outra"))
    assert derived_display_id(tokens, hmac_identity, 0) != derived_display_id(tokens, hmac_identity, 1)
    credentials = await enroll(control, enrollment, None, identity)
    assert credentials["displayId"] == derived_display_id(tokens, hmac_identity)
    row = (await enrollment.repository.client.document("devices/" + credentials["deviceId"]).get()).to_dict()
    assert row["displayIdSource"] == "derived" and is_generated(credentials["displayId"])
    mac = random_mac()
    await enroll(control, enrollment, mac)
    colliding_identity = "fixture-" + uuid.uuid4().hex
    colliding = await enroll(control, enrollment, mac, colliding_identity)
    assert colliding["displayId"] == derived_display_id(tokens, tokens.digest("identity", colliding_identity))


async def test_mesma_tv_recadastrada_apos_perda_do_registro_recebe_o_mesmo_id(control):
    enrollment, _ = services(control)
    tokens, client = enrollment.auth.tokens, enrollment.repository.client
    identity = "fixture-" + uuid.uuid4().hex
    first = await enroll(control, enrollment, None, identity)
    # Perda de dados do serviço (fora das regras do repositório): some o registro, a posse da identidade e a do ID.
    for path in ("devices/" + first["deviceId"], "identityClaims/" + tokens.digest("identity", identity),
                 display_claim_path(tokens, first["displayId"])):
        await client.document(path).delete()
    again = await enroll(control, enrollment, None, identity)
    assert again["deviceId"] != first["deviceId"] and again["displayId"] == first["displayId"]


async def test_id_atribuido_nunca_e_trocado_apagado_ou_tomado(control):
    enrollment, _ = services(control)
    repository, tokens = enrollment.repository, enrollment.auth.tokens
    credentials = await enroll(control, enrollment, random_mac())
    path, claim_path = "devices/" + credentials["deviceId"], display_claim_path(tokens, credentials["displayId"])

    def change(update):
        def plan(rows):
            device = DeviceDocument.model_validate(rows[path])
            return TransactionPlan(None, {path: device.model_copy(update=update)})
        return plan

    for update in ({"display_id": "02:AA:BB:CC:DD:EE"}, {"display_id": None, "display_id_source": None},
                   {"display_id_source": "derived"}):
        with pytest.raises(RepositoryConflict, match="immutable_display_id"):
            await repository.transact((path,), change(update))
    with pytest.raises(RepositoryConflict, match="durable_claim_delete_forbidden"):
        await repository.transact((claim_path,), lambda _: TransactionPlan(None, deletes=(claim_path,)))
    with pytest.raises(RepositoryConflict, match="immutable_display_id_claim"):
        await repository.transact((claim_path,), lambda _: TransactionPlan(None, {
            claim_path: DisplayIdClaimDocument(device_id="outra-tv", created_at=datetime.now(UTC))}))
    row = (await repository.client.document(path).get()).to_dict()
    assert row["displayId"] == credentials["displayId"] and row["displayIdSource"] == "mac"


async def test_registro_antigo_com_id_sorteado_e_preservado_na_rotacao(control):
    enrollment, rotation = services(control)
    old = await enroll(control, enrollment, None)
    path = "devices/" + old["deviceId"]
    legacy_id = "06:11:22:33:44:55"
    await rotation.repository.client.document(path).set(legacy_device(
        await rotation.repository.client.document(path).get(), display_id=legacy_id, display_id_source="generated"))
    now = datetime.now(UTC)
    operation_id, claim = new_token(), new_token()
    control[1].extend([path + "/accessIntents/" + operation_id, "recoveryResults/" + operation_id,
                       "jobs/" + AccessRotation.job_id(old["deviceId"], operation_id)])
    principal = await rotation.auth.authenticate_tv(old["bearer"])
    assert (await rotation.begin(principal, operation_id, claim, "revoke", now, random_mac())).state == "ready"
    delivered = (await rotation.poll(old["deviceId"], operation_id, claim, now + timedelta(seconds=1))).credentials
    row = (await rotation.repository.client.document(path).get()).to_dict()
    control[1].append("recoveryCodes/" + row["recoveryCodeHmac"])
    assert delivered["displayId"] == legacy_id == row["displayId"] and row["displayIdSource"] == "generated"
