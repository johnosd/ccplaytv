"""Feature 073 (US3, D-008, constitution 1.13.0 (i)): cópia cifrada do código de recuperação. Exige emulador."""
import logging

import httpx
import pytest

from app.portal.application import create_app
from app.portal.auth import AuthError, Principal
from app.portal.auth_tokens import new_token
from app.portal.models import DeviceDocument
from app.portal.recovery_escrow import RecoveryEscrowService
from app.portal.repositories.control import TransactionPlan
from app.portal.settings import PortalSettings
from tests.portal.test_access_rotation import prepared, remember_new_code
from tests.portal.test_auth import ORIGIN, remember
from tests.portal.test_recovery import linked, remember_attempt, remember_code
from tests.portal.test_recovery import prepared as prepared_recovery


def remember_escrow(control, service, device_id):
    control[1].append("devices/" + device_id + "/recoveryEscrow/current")
    control[1].extend("rateLimits/" + service.auth.tokens.digest("rate_limit", scope + device_id) for scope in ("escrow/", "reveal/"))


async def test_tv_stores_only_the_current_code_encrypted_and_panel_reveals_only_while_current(control):
    rotation, _, credentials, operation_id, claim, now = await prepared(control)
    service = RecoveryEscrowService(rotation.auth, rotation.crypto, rotation.codes)
    device_id, code = credentials["deviceId"], credentials["recoveryCode"]
    remember_escrow(control, service, device_id)
    principal = await rotation.auth.authenticate_tv(credentials["bearer"])
    # Nada guardado ainda: o painel orienta Atualizar na TV.
    with pytest.raises(AuthError) as caught:
        await service.reveal(principal, now)
    assert (caught.value.code, caught.value.status) == ("not_escrowed", 409)
    # Código válido mas de outra TV/versão errada: recusado sem gravar.
    with pytest.raises(AuthError) as caught:
        await service.put(principal, "7777-8888-9999-AAAA-BBBB-CCCC-DDDD", credentials["recoveryCodeVersion"], now)
    assert caught.value.status in {409, 422}
    with pytest.raises(AuthError) as caught:
        await service.put(principal, code, credentials["recoveryCodeVersion"] + 1, now)
    assert caught.value.status == 409
    assert not (await control[0].client.document("devices/" + device_id + "/recoveryEscrow/current").get()).exists
    await service.put(principal, code, credentials["recoveryCodeVersion"], now)
    await service.put(principal, code, credentials["recoveryCodeVersion"], now)  # reenvio idempotente
    stored = (await control[0].client.document("devices/" + device_id + "/recoveryEscrow/current").get()).to_dict()
    assert code not in str(stored) and code.replace("-", "") not in str(stored)
    assert await service.reveal(principal, now) == {"recoveryCode": code, "recoveryCodeVersion": credentials["recoveryCodeVersion"]}
    # Rotação na TV: a cópia antiga deixa de valer e nunca é revelada; o código antigo também não é mais aceito.
    result = await rotation.begin(principal, operation_id, claim, "rotate", now)
    assert result.state == "ready"
    current = await remember_new_code(control, rotation, device_id)
    with pytest.raises(AuthError) as caught:
        await service.reveal(principal, now)  # credencial anterior à rotação já não autentica
    assert caught.value.status == 401
    fresh = Principal(device_id, current["authEpoch"], current["recoveryEpoch"])
    with pytest.raises(AuthError) as caught:
        await service.reveal(fresh, now)
    assert caught.value.code == "not_escrowed"
    with pytest.raises(AuthError) as caught:
        await service.put(fresh, code, credentials["recoveryCodeVersion"], now)
    assert caught.value.status == 409


async def test_code_revealed_in_panel_recovers_same_tv_after_reinstall_and_only_current_is_shown(control):
    # SC-006, US3/AC2–AC3 (C1 do converge): o código que o portal mostra é o que recupera a TV formatada pelo site.
    recovery, old, identity, now = await prepared_recovery(control)
    service = RecoveryEscrowService(recovery.auth, recovery.crypto, recovery.codes)
    device_id = old["deviceId"]
    remember_escrow(control, service, device_id)
    path = "devices/" + device_id
    # Licença paga já concedida: fica no registro da TV (geração), não na instalação.
    await recovery.repository.transact((path,), lambda rows: TransactionPlan(None, {path: DeviceDocument.model_validate(
        rows[path]).model_copy(update={"entitlement_generation": 7})}))
    principal = await recovery.auth.authenticate_tv(old["bearer"])
    await service.put(principal, old["recoveryCode"], old["recoveryCodeVersion"], now)
    revealed = (await service.reveal(principal, now))["recoveryCode"]
    assert revealed == old["recoveryCode"]
    # Reinstalação: a TV só tem a identidade da plataforma; a pessoa digita no site o código que anotou do portal.
    challenge, web = await linked(control, recovery, identity, now)
    operation_id = new_token()
    remember_attempt(control, recovery, challenge, revealed, operation_id)
    result = await recovery.confirm(web.token, recovery.auth.public_origin, web.csrf, code=revealed,
                                    confirmed_device_id=device_id, request_id=operation_id, ip="fixture-ip", now=now)
    assert result.state == "ready"
    row = await remember_code(control, recovery, device_id)
    delivered = (await recovery.claim_result(challenge["claimId"], challenge["claimSecret"], now)).credentials
    assert delivered["deviceId"] == device_id and row["entitlementGeneration"] == 7
    fresh = await recovery.auth.authenticate_tv(delivered["bearer"])
    # O portal nunca mostra o código consumido: até a TV enviar o novo, orienta Atualizar; depois, só o atual.
    with pytest.raises(AuthError) as caught:
        await service.reveal(fresh, now)
    assert caught.value.code == "not_escrowed"
    await service.put(fresh, delivered["recoveryCode"], delivered["recoveryCodeVersion"], now)
    shown = await service.reveal(fresh, now)
    assert shown["recoveryCode"] == delivered["recoveryCode"] != revealed
    with pytest.raises(AuthError):
        await recovery.auth.authenticate_tv(old["bearer"])


async def test_routes_tv_bearer_put_and_panel_post_with_csrf_no_store_limited_and_never_logged(control, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    rotation, _, credentials, _, _, now = await prepared(control)
    service = RecoveryEscrowService(rotation.auth, rotation.crypto, rotation.codes)
    device_id, code = credentials["deviceId"], credentials["recoveryCode"]
    remember_escrow(control, service, device_id)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = rotation.auth
    app.state.portal_recovery_escrow = service
    principal = await rotation.auth.authenticate_tv(credentials["bearer"])
    tv = {"origin": "null", "authorization": "Bearer " + credentials["bearer"]}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        path = "/portal/v1/device/recovery-code/escrow"
        body = {"recoveryCode": code, "recoveryCodeVersion": credentials["recoveryCodeVersion"]}
        assert (await client.put(path, headers={"origin": "null"}, json=body)).status_code == 401
        assert (await client.put(path, headers=tv, json={**body, "extra": 1})).status_code == 422
        stored = await client.put(path, headers=tv, json=body)
        assert stored.status_code == 204 and stored.headers["cache-control"] == "no-store"
        invite = await rotation.auth.create_invite(principal, "manage", now)
        remember(control, rotation.auth, "invites", "invite", invite.token)
        exchanged = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN}, json={"token": invite.token})
        remember(control, rotation.auth, "sessions", "session", client.cookies.get("ccplay_portal_session"))
        csrf = exchanged.json()["csrfToken"]
        reveal = "/portal/v1/session/recovery-code"
        assert (await client.post(reveal, headers={"origin": ORIGIN}, json={})).status_code == 403  # sem CSRF
        assert (await client.get(reveal)).status_code in {404, 405}  # nunca por GET (sem pré-carga/cache)
        shown = await client.post(reveal, headers={"origin": ORIGIN, "x-csrf-token": csrf}, json={})
        assert shown.status_code == 200 and shown.headers["cache-control"] == "no-store"
        assert shown.json() == {"recoveryCode": code, "recoveryCodeVersion": credentials["recoveryCodeVersion"]}
        statuses = [(await client.post(reveal, headers={"origin": ORIGIN, "x-csrf-token": csrf}, json={})).status_code for _ in range(5)]
        assert statuses[-1] == 429
    assert code not in caplog.text and new_token() not in caplog.text
