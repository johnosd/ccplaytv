"""Chave de legenda pelo portal (feature 091, ADR-022, constitution 1.17.0 (m)) além do contrato: rotas e limites,
retry/expiração/época, cifra por fornecedor, snapshot com TV antiga e nenhum rastro da chave em log. Exige emulador."""

import json
import logging
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.portal.application import create_app
from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token
from app.portal.configurations import ConfigurationService
from app.portal.crypto import CipherContext, CipherEnvelope, CryptoError
from app.portal.settings import PortalSettings
from app.portal.subtitle_keys import SubtitleKeyService
from tests.portal.test_auth import ORIGIN, remember, seeded
from tests.portal.test_crypto import make_crypto

MARK_OS = "oschaverotas091abcdef0123456789"
MARK_SD = "sdchaverotas091abcdef0123456789"
SECOND = "sdsegundarota091abcdef0123456789"
PROVIDERS = ("opensubtitles", "subdl")


def op_id(now: datetime | None = None) -> str:
    return f"op-{int((now or datetime.now(UTC)).timestamp() * 1000)}-{new_token()}"


def remember_keys(control, auth, device_id):
    for provider in PROVIDERS:
        control[1].append(f"devices/{device_id}/integrations/subtitles-{provider}")
    control[1].extend("rateLimits/" + auth.tokens.digest("rate_limit", scope + "/" + device_id)
                      for scope in ("subtitle-key", "subtitle-pull", "subtitle-ack"))


async def stored(control, device_id, provider):
    return (await control[0].client.document(f"devices/{device_id}/integrations/subtitles-{provider}").get()).to_dict()


@pytest.mark.parametrize("provider", PROVIDERS)
@pytest.mark.parametrize("reason", ("offline", "rate_limited"))
async def test_replace_pending_and_retry_preserve_only_the_current_envelope_until_seven_days(control, provider, reason):
    auth, device, _, _, now = await seeded(control)
    remember_keys(control, auth, device.device_id)
    service = SubtitleKeyService(auth, make_crypto())
    principal = auth._principal(device)
    other = "subdl" if provider == "opensubtitles" else "opensubtitles"
    first, second, foreign = op_id(now), op_id(now), op_id(now)
    await service.request(principal, provider, first, "set", MARK_SD, now)
    await service.request(principal, other, foreign, "set", MARK_OS, now)
    old_envelope = (await stored(control, device.device_id, provider))["envelope"]
    other_before = await stored(control, device.device_id, other)
    replaced_at = now + timedelta(minutes=1)
    await service.request(principal, provider, second, "set", SECOND, replaced_at)
    replacement = await stored(control, device.device_id, provider)
    assert replacement["operationId"] == second and replacement["envelope"] != old_envelope
    # Reenvio idempotente conserva o envelope atual; ack atrasado da primeira operação não o apaga.
    await service.request(principal, provider, second, "set", SECOND, replaced_at)
    await service.ack(principal, provider, first, "applied", None, replaced_at)
    retry_at = replaced_at + timedelta(days=6)
    await service.ack(principal, provider, second, "retry", reason, retry_at)
    retried = await stored(control, device.device_id, provider)
    assert retried["state"] == "pending" and retried["retryReason"] == reason
    assert retried["envelope"] == replacement["envelope"]
    assert retried["expiresAt"] == replacement["expiresAt"]
    operations = (await service.pull(principal, retry_at))["operations"]
    assert next(row for row in operations if row["provider"] == provider) == {
        "provider": provider, "operationId": second, "action": "set", "key": SECOND}
    assert await stored(control, device.device_id, other) == other_before
    # O retry não renova a retenção: no instante exato de sete dias a substituição expira.
    await service.view(principal, replaced_at + timedelta(days=7))
    expired = await stored(control, device.device_id, provider)
    assert expired["state"] == "expired" and expired["envelope"] is None


@pytest.mark.parametrize("provider", PROVIDERS)
async def test_remove_browser_to_device_ack_and_snapshot_returns_none_only_for_that_provider(control, tmp_path, provider):
    auth, device, bearer, _, now = await seeded(control)
    remember_keys(control, auth, device.device_id)
    control[1].append(f"devices/{device.device_id}/snapshot/current")
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_configurations = ConfigurationService(auth, make_crypto())
    service = app.state.portal_subtitle_keys = SubtitleKeyService(auth, make_crypto())
    principal = auth._principal(device)
    other = "subdl" if provider == "opensubtitles" else "opensubtitles"
    other_id = op_id(now)
    await service.request(principal, other, other_id, "set", MARK_OS, now)
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        invite = await auth.create_invite(principal, "manage", now)
        remember(control, auth, "invites", "invite", invite.token)
        exchanged = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN}, json={"token": invite.token})
        remember(control, auth, "sessions", "session", client.cookies.get("ccplay_portal_session"))
        browser = {"origin": ORIGIN, "x-csrf-token": exchanged.json()["csrfToken"]}
        base = "/portal/v1/integrations/subtitles"
        # Uma chave pendente é substituída pela remoção e seu envelope sai imediatamente.
        await service.request(principal, provider, op_id(now), "set", MARK_SD, now)
        operation = op_id()
        removed = await client.post(f"{base}/{provider}/remove", headers={**browser, "idempotency-key": operation}, json={})
        assert removed.status_code == 202 and removed.json()["action"] == "remove"
        assert (await stored(control, device.device_id, provider))["envelope"] is None
        # Repetir o mesmo pedido não duplica; a TV recebe remove sem valor de chave.
        assert (await client.post(f"{base}/{provider}/remove", headers={**browser, "idempotency-key": operation}, json={})).status_code == 202
        operations = (await client.get("/portal/v1/device/integrations/subtitles", headers=tv)).json()["operations"]
        assert next(row for row in operations if row["provider"] == provider) == {
            "provider": provider, "operationId": operation, "action": "remove"}
        result = await client.post("/portal/v1/device/integrations/subtitles/ack", headers=tv,
                                   json={"provider": provider, "operationId": operation, "state": "applied"})
        assert result.status_code == 200
        snapshot = {"capturedAt": now.isoformat(), "sources": [], "revisions": [], "imports": [],
                    "integrations": {"tmdb": "none", "subtitles": {provider: "none", other: "configured"}}}
        assert (await client.put("/portal/v1/device/snapshot", headers=tv, json=snapshot)).status_code == 200
        state = (await client.get(base)).json()
        assert state[provider]["pending"] is None and state[provider]["tvReported"] == "none"
        assert state[provider]["last"]["action"] == "remove" and state[provider]["last"]["result"] == "applied"
        assert state[other]["pending"]["action"] == "set" and state[other]["tvReported"] == "configured"
        assert (await stored(control, device.device_id, other))["envelope"] is not None


async def test_ack_states_retry_keeps_the_envelope_and_the_last_result_survives_per_provider(control):
    auth, device, _, _, now = await seeded(control)
    remember_keys(control, auth, device.device_id)
    service = SubtitleKeyService(auth, make_crypto())
    principal = auth._principal(device)
    first, other = op_id(now), op_id(now)
    await service.request(principal, "subdl", first, "set", MARK_SD, now)
    await service.request(principal, "opensubtitles", other, "set", MARK_OS, now)
    # Offline/limite: continua pendente com o motivo; o envelope fica. O outro fornecedor não é afetado.
    await service.ack(principal, "subdl", first, "retry", "rate_limited", now)
    row = await stored(control, device.device_id, "subdl")
    assert row["state"] == "pending" and row["retryReason"] == "rate_limited" and row["envelope"] is not None
    assert (await service.view(principal, now))["subdl"]["pending"]["retryReason"] == "rate_limited"
    assert "retryReason" not in (await service.view(principal, now))["opensubtitles"]["pending"]
    # Recusada: apaga o envelope e guarda o motivo; nunca a chave.
    await service.ack(principal, "subdl", first, "rejected", "invalid_format", now)
    row = await stored(control, device.device_id, "subdl")
    assert row["state"] == "rejected" and row["envelope"] is None and row["lastReason"] == "invalid_format"
    assert MARK_SD not in json.dumps(row, default=str)
    view = await service.view(principal, now)
    assert view["subdl"]["pending"] is None and view["subdl"]["last"]["result"] == "rejected"
    assert view["opensubtitles"]["pending"]["action"] == "set"
    # Motivo ou estado fora da lista: recusado.
    for state, reason in (("applied", "refused"), ("bogus", None), ("retry", "refused"), ("rejected", "offline")):
        with pytest.raises(AuthError):
            await service.ack(principal, "opensubtitles", other, state, reason, now)
    # Remover: sem chave no pedido; a TV recebe a ação e confirma.
    removal = op_id(now)
    await service.request(principal, "opensubtitles", removal, "remove", None, now)
    pulled = (await service.pull(principal, now))["operations"]
    assert pulled == [{"provider": "opensubtitles", "operationId": removal, "action": "remove"}]
    await service.ack(principal, "opensubtitles", removal, "applied", None, now)
    assert (await service.pull(principal, now)) == {"operations": []}
    assert (await service.view(principal, now))["opensubtitles"]["last"]["action"] == "remove"


async def test_expiry_and_epoch_change_discard_the_pending_operation_of_each_provider(control):
    auth, device, _, _, now = await seeded(control)
    remember_keys(control, auth, device.device_id)
    service = SubtitleKeyService(auth, make_crypto())
    principal = auth._principal(device)
    await service.request(principal, "subdl", op_id(now), "set", MARK_SD, now)
    later = now + timedelta(days=7, seconds=1)
    assert await service.pull(principal, later) == {"operations": []}
    row = await stored(control, device.device_id, "subdl")
    assert row["state"] == "expired" and row["envelope"] is None
    await service.request(principal, "opensubtitles", op_id(now), "set", MARK_OS, now)
    await control[0].client.document(f"devices/{device.device_id}").update({"authEpoch": principal.auth_epoch + 1})
    newer = principal.__class__(principal.device_id, principal.auth_epoch + 1, principal.recovery_epoch)
    assert await service.pull(newer, now) == {"operations": []}
    document = await stored(control, device.device_id, "opensubtitles")
    assert document["state"] == "expired" and document["envelope"] is None
    assert MARK_OS not in json.dumps(document, default=str)


async def test_the_cipher_context_names_the_provider_so_one_envelope_does_not_open_as_the_other(control):
    auth, device, _, _, now = await seeded(control)
    remember_keys(control, auth, device.device_id)
    crypto = make_crypto()
    service = SubtitleKeyService(auth, crypto)
    principal = auth._principal(device)
    operation = op_id(now)
    await service.request(principal, "subdl", operation, "set", MARK_SD, now)
    envelope = CipherEnvelope.model_validate((await stored(control, device.device_id, "subdl"))["envelope"])
    assert crypto.decrypt(envelope, CipherContext(device.device_id, "subtitle-key:subdl", operation)).decode() == MARK_SD
    with pytest.raises(CryptoError):
        crypto.decrypt(envelope, CipherContext(device.device_id, "subtitle-key:opensubtitles", operation))
    with pytest.raises(CryptoError):  # nem como a chave TMDB
        crypto.decrypt(envelope, CipherContext(device.device_id, "tmdb-key", operation))


async def test_routes_browser_put_and_tv_pull_ack_no_store_limited_unknown_provider_and_never_logged(control, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    auth, device, bearer, _, now = await seeded(control)
    remember_keys(control, auth, device.device_id)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_subtitle_keys = SubtitleKeyService(auth, make_crypto())
    principal = auth._principal(device)
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    seen = []
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        invite = await auth.create_invite(principal, "manage", now)
        remember(control, auth, "invites", "invite", invite.token)
        exchanged = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN}, json={"token": invite.token})
        remember(control, auth, "sessions", "session", client.cookies.get("ccplay_portal_session"))
        browser = {"origin": ORIGIN, "x-csrf-token": exchanged.json()["csrfToken"]}
        base = "/portal/v1/integrations/subtitles"
        # Sem CSRF/Idempotency-Key, fornecedor desconhecido, formato inválido, corpo extra: recusa sem gravar nem ecoar.
        assert (await client.put(base + "/subdl", headers={"origin": ORIGIN}, json={"key": MARK_SD})).status_code == 403
        assert (await client.put(base + "/subdl", headers=browser, json={"key": MARK_SD})).status_code == 422
        good = {**browser, "idempotency-key": op_id()}
        assert (await client.put(base + "/outro", headers=good, json={"key": MARK_SD})).status_code == 422
        for value in ("curta", "com espaço " + "x" * 12, "x" * 201):
            refused = await client.put(base + "/subdl", headers=good, json={"key": value})
            assert refused.status_code == 422 and value not in refused.text
        assert (await client.put(base + "/subdl", headers=good, json={"key": MARK_SD, "extra": 1})).status_code == 422
        # Chave válida de cada fornecedor: 202, no-store, sem eco.
        for provider, mark in (("subdl", MARK_SD), ("opensubtitles", MARK_OS)):
            accepted = await client.put(f"{base}/{provider}", headers={**browser, "idempotency-key": op_id()}, json={"key": mark})
            seen.append(accepted)
            assert accepted.status_code == 202 and accepted.headers["cache-control"] == "no-store"
            assert accepted.json()["state"] == "pending" and accepted.json()["provider"] == provider and mark not in accepted.text
        status = await client.get(base)
        seen.append(status)
        body = status.json()
        assert status.status_code == 200 and set(body) == {"opensubtitles", "subdl"}
        assert body["subdl"]["pending"]["action"] == "set" and body["subdl"]["tvReported"] is None
        # A TV (bearer) recebe as chaves; o navegador nunca.
        pull = "/portal/v1/device/integrations/subtitles"
        assert (await client.get(pull, headers={"origin": "null"})).status_code == 401
        pulled = await client.get(pull, headers=tv)
        assert pulled.status_code == 200 and pulled.headers["cache-control"] == "no-store"
        operations = pulled.json()["operations"]
        assert [(row["provider"], row["key"]) for row in operations] == [("opensubtitles", MARK_OS), ("subdl", MARK_SD)]
        ack = "/portal/v1/device/integrations/subtitles/ack"
        first = operations[0]
        acked = await client.post(ack, headers=tv, json={"provider": "opensubtitles", "operationId": first["operationId"], "state": "applied"})
        assert acked.status_code == 200 and acked.json() == {"operationId": first["operationId"], "state": "applied"}
        for payload in ({"provider": "opensubtitles", "operationId": first["operationId"], "state": "applied", "reason": "x"},
                        {"provider": "opensubtitles", "operationId": first["operationId"], "state": "bogus"},
                        {"provider": "outro", "operationId": first["operationId"], "state": "applied"},
                        {"operationId": first["operationId"], "state": "applied"},
                        {"provider": "subdl", "operationId": first["operationId"], "state": "applied", "key": MARK_SD}):
            assert (await client.post(ack, headers=tv, json=payload)).status_code == 422
        # Ack com a operação de OUTRO fornecedor: 200 idempotente e sem efeito (a do SubDL continua pendente).
        crossed = await client.post(ack, headers=tv, json={"provider": "subdl", "operationId": first["operationId"], "state": "applied"})
        assert crossed.status_code == 200
        assert [row["provider"] for row in (await client.get(pull, headers=tv)).json()["operations"]] == ["subdl"]
        final = await client.get(base)
        seen.append(final)
        assert final.json()["opensubtitles"]["pending"] is None and final.json()["opensubtitles"]["last"]["result"] == "applied"
        # Remover pelo navegador; não existe cancelar nesta feature.
        removed = await client.post(base + "/subdl/remove", headers={**browser, "idempotency-key": op_id()}, json={})
        assert removed.status_code == 202 and removed.json()["action"] == "remove"
        assert (await client.delete(base + "/subdl/pending", headers=browser)).status_code in (404, 405)
        assert (await client.post(base + "/outro/remove", headers={**browser, "idempotency-key": op_id()}, json={})).status_code == 422
        # Limite de 10 mutações por hora por TV (os dois fornecedores somados): recusa uniforme.
        codes = []
        for _ in range(12):
            codes.append((await client.put(base + "/subdl", headers={**browser, "idempotency-key": op_id()}, json={"key": SECOND})).status_code)
        assert 429 in codes
    assert all(MARK_SD not in response.text and MARK_OS not in response.text for response in seen)
    assert MARK_SD not in caplog.text and MARK_OS not in caplog.text and SECOND not in caplog.text


async def test_snapshot_reports_subtitle_keys_and_an_old_tv_without_it_is_unknown(control, tmp_path):
    auth, device, bearer, _, now = await seeded(control)
    remember_keys(control, auth, device.device_id)
    control[1].append(f"devices/{device.device_id}/snapshot/current")
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_subtitle_keys = SubtitleKeyService(auth, make_crypto())
    app.state.portal_configurations = ConfigurationService(auth, make_crypto())
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    principal = auth._principal(device)
    service = app.state.portal_subtitle_keys
    snapshot = {"capturedAt": (now - timedelta(seconds=5)).isoformat(), "sources": [], "revisions": [], "imports": []}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        # TV antiga: só `tmdb` (ou nada) — o portal vê `null`, nunca "não configurada".
        old = {**snapshot, "integrations": {"tmdb": "none"}}
        assert (await client.put("/portal/v1/device/snapshot", headers=tv, json=old)).status_code == 200
        view = await service.view(principal, now)
        assert view["subdl"]["tvReported"] is None and view["opensubtitles"]["tvReported"] is None
        reported = {**snapshot, "capturedAt": (now - timedelta(seconds=2)).isoformat(),
                    "integrations": {"tmdb": "none", "subtitles": {"opensubtitles": "none", "subdl": "rejected"}}}
        assert (await client.put("/portal/v1/device/snapshot", headers=tv, json=reported)).status_code == 200
        view = await service.view(principal, now)
        assert view["subdl"]["tvReported"] == "rejected" and view["opensubtitles"]["tvReported"] == "none"
        for bad in ({"opensubtitles": "none"}, {"opensubtitles": "none", "subdl": MARK_SD},
                    {"opensubtitles": "none", "subdl": "configured", "extra": "x"}):
            wrong = {**snapshot, "capturedAt": now.isoformat(), "integrations": {"tmdb": "none", "subtitles": bad}}
            assert (await client.put("/portal/v1/device/snapshot", headers=tv, json=wrong)).status_code == 422
