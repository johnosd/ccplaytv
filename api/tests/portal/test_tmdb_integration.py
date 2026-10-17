"""Chave TMDB pelo portal (feature 077, ADR-020, constitution 1.15.0 (j)): cifrada em repouso, só a mesma TV a lê,
uma pendente por TV, apagada ao concluir/cancelar/expirar, nunca em log nem em resposta ao navegador. Exige emulador."""

import json
import logging
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.portal.application import create_app
from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token
from app.portal.configurations import ConfigurationService
from app.portal.settings import PortalSettings
from app.portal.tmdb_integration import TmdbIntegrationService
from tests.portal.test_auth import ORIGIN, remember, seeded
from tests.portal.test_crypto import make_crypto

MARKER = "tmdbmarcador077abcdef0123456789"
SECOND = "tmdbsegunda077abcdef0123456789"


def op_id(now: datetime | None = None) -> str:
    return f"op-{int((now or datetime.now(UTC)).timestamp() * 1000)}-{new_token()}"


def remember_integration(control, auth, device_id):
    control[1].append(f"devices/{device_id}/integrations/tmdb")
    control[1].extend("rateLimits/" + auth.tokens.digest("rate_limit", scope + "/" + device_id)
                      for scope in ("tmdb", "tmdb-pull", "tmdb-ack"))


async def stored(control, device_id):
    return (await control[0].client.document(f"devices/{device_id}/integrations/tmdb").get()).to_dict()


async def test_encrypted_at_rest_only_same_tv_pulls_and_replace_drops_the_old_envelope(control):
    auth, device, _, _, now = await seeded(control)
    _, other, _, _, _ = await seeded(control)
    remember_integration(control, auth, device.device_id)
    remember_integration(control, auth, other.device_id)
    service = TmdbIntegrationService(auth, make_crypto())
    principal, foreign = auth._principal(device), auth._principal(other)
    first = op_id(now)
    assert await service.request(principal, first, "set", MARKER, now) == {
        "operationId": first, "action": "set", "state": "pending"}
    row = await stored(control, device.device_id)
    assert MARKER not in json.dumps(row, default=str) and row["envelope"] is not None
    # Só a mesma TV recebe a chave; outra TV não vê nada.
    assert (await service.pull(principal, now))["operation"] == {"operationId": first, "action": "set", "key": MARKER}
    with pytest.raises(AuthError):  # outra TV (outra emissão) nem autentica: o caminho sai sempre do principal
        await service.pull(foreign, now)
    # Reentrega até o ack terminal.
    assert (await service.pull(principal, now))["operation"]["key"] == MARKER
    # Reenvio com o mesmo Idempotency-Key (resposta perdida) não duplica nem troca o envelope.
    before = (await stored(control, device.device_id))["envelope"]
    await service.request(principal, first, "set", SECOND, now)
    assert (await stored(control, device.device_id))["envelope"] == before
    # Uma operação nova substitui a pendente e apaga o envelope antigo na mesma transação.
    second = op_id(now)
    await service.request(principal, second, "set", SECOND, now)
    row = await stored(control, device.device_id)
    assert row["operationId"] == second and SECOND not in json.dumps(row, default=str)
    assert (await service.pull(principal, now))["operation"] == {"operationId": second, "action": "set", "key": SECOND}
    # Ack da operação antiga (substituída) é idempotente e não revela nada.
    assert await service.ack(principal, first, "applied", None, now) == {"operationId": first, "state": "applied"}
    assert (await service.view(principal, now))["pending"]["action"] == "set"


async def test_ack_applied_and_rejected_clear_the_envelope_retry_keeps_it_and_last_survives(control):
    auth, device, _, _, now = await seeded(control)
    remember_integration(control, auth, device.device_id)
    service = TmdbIntegrationService(auth, make_crypto())
    principal = auth._principal(device)
    first = op_id(now)
    await service.request(principal, first, "set", MARKER, now)
    await service.ack(principal, first, "retry", "offline", now)
    row = await stored(control, device.device_id)
    assert row["state"] == "pending" and row["retryReason"] == "offline" and row["envelope"] is not None
    assert (await service.view(principal, now))["pending"]["retryReason"] == "offline"
    await service.ack(principal, first, "rejected", "refused", now)
    row = await stored(control, device.device_id)
    assert row["state"] == "rejected" and row["envelope"] is None and row["lastReason"] == "refused"
    assert MARKER not in json.dumps(row, default=str)
    view = await service.view(principal, now)
    assert view["pending"] is None and view["last"]["result"] == "rejected" and view["last"]["reason"] == "refused"
    # Ack repetido depois do terminal é idempotente.
    await service.ack(principal, first, "applied", None, now)
    assert (await service.view(principal, now))["last"]["result"] == "rejected"
    # Nova operação mantém o último resultado até a TV concluir a próxima.
    second = op_id(now)
    await service.request(principal, second, "set", SECOND, now)
    view = await service.view(principal, now)
    assert view["pending"]["action"] == "set" and view["last"]["result"] == "rejected"
    await service.ack(principal, second, "applied", None, now)
    view = await service.view(principal, now)
    assert view["pending"] is None and view["last"] == {
        "action": "set", "result": "applied", "at": view["last"]["at"]}
    assert await service.pull(principal, now) == {"operation": None}


async def test_remove_cancel_expiry_and_epoch_change_discard_the_pending_operation(control):
    auth, device, _, _, now = await seeded(control)
    remember_integration(control, auth, device.device_id)
    service = TmdbIntegrationService(auth, make_crypto())
    principal = auth._principal(device)
    removal = op_id(now)
    await service.request(principal, removal, "remove", None, now)
    assert (await service.pull(principal, now))["operation"] == {"operationId": removal, "action": "remove"}
    await service.ack(principal, removal, "applied", None, now)
    # Cancelar apaga o envelope; sem pendência é um no-op.
    cancelled = op_id(now)
    await service.request(principal, cancelled, "set", MARKER, now)
    await service.cancel(principal, now)
    await service.cancel(principal, now)
    row = await stored(control, device.device_id)
    assert row["state"] == "cancelled" and row["envelope"] is None
    assert (await service.view(principal, now))["last"]["action"] == "remove"
    # Vence em 7 dias: a TV não recebe mais a chave e o envelope é apagado.
    expiring = op_id(now)
    await service.request(principal, expiring, "set", MARKER, now)
    later = now + timedelta(days=7, seconds=1)
    assert await service.pull(principal, later) == {"operation": None}
    row = await stored(control, device.device_id)
    assert row["state"] == "expired" and row["envelope"] is None
    # Troca da chave de acesso (época diferente): a pendência de antes é tratada como inexistente.
    changed = op_id(now)
    await service.request(principal, changed, "set", MARKER, now)
    # A chave de acesso é trocada (auth_epoch sobe no registro da TV): a pendência da época anterior some.
    await control[0].client.document(f"devices/{device.device_id}").update({"authEpoch": principal.auth_epoch + 1})
    newer = principal.__class__(principal.device_id, principal.auth_epoch + 1, principal.recovery_epoch)
    assert await service.pull(newer, now) == {"operation": None}
    document = await stored(control, device.device_id)
    assert document["state"] == "expired" and document["envelope"] is None
    assert MARKER not in json.dumps(document, default=str)

async def test_routes_browser_put_and_tv_pull_ack_no_store_limited_and_never_logged(control, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    auth, device, bearer, _, now = await seeded(control)
    remember_integration(control, auth, device.device_id)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_tmdb = TmdbIntegrationService(auth, make_crypto())
    principal = auth._principal(device)
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    seen = []
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        invite = await auth.create_invite(principal, "manage", now)
        remember(control, auth, "invites", "invite", invite.token)
        exchanged = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN}, json={"token": invite.token})
        remember(control, auth, "sessions", "session", client.cookies.get("ccplay_portal_session"))
        browser = {"origin": ORIGIN, "x-csrf-token": exchanged.json()["csrfToken"]}
        path = "/portal/v1/integrations/tmdb"
        # Sem CSRF/Idempotency-Key ou com chave fora do formato: recusa sem gravar.
        assert (await client.put(path, headers={"origin": ORIGIN}, json={"key": MARKER})).status_code == 403
        assert (await client.put(path, headers=browser, json={"key": MARKER})).status_code == 422
        bad = {**browser, "idempotency-key": op_id()}
        for value in ("curta", "com espaço " + "x" * 20, "x" * 601):
            refused = await client.put(path, headers=bad, json={"key": value})
            assert refused.status_code == 422 and value not in refused.text
        assert (await client.put(path, headers=bad, json={"key": MARKER, "extra": 1})).status_code == 422
        # Chave válida: 202, no-store, sem eco.
        accepted = await client.put(path, headers=bad, json={"key": MARKER})
        seen.append(accepted)
        assert accepted.status_code == 202 and accepted.headers["cache-control"] == "no-store"
        assert accepted.json()["state"] == "pending" and MARKER not in accepted.text
        status = await client.get(path)
        seen.append(status)
        assert status.status_code == 200 and status.json()["pending"]["action"] == "set"
        assert status.json()["tvReported"] is None and MARKER not in status.text
        # A TV (bearer, sem Origin) recebe a chave; o navegador nunca.
        assert (await client.get("/portal/v1/device/integrations/tmdb", headers={"origin": "null"})).status_code == 401
        pulled = await client.get("/portal/v1/device/integrations/tmdb", headers=tv)
        assert pulled.status_code == 200 and pulled.headers["cache-control"] == "no-store"
        operation = pulled.json()["operation"]
        assert operation["action"] == "set" and operation["key"] == MARKER
        acked = await client.post("/portal/v1/device/integrations/tmdb/ack", headers=tv,
                                  json={"operationId": operation["operationId"], "state": "applied"})
        assert acked.status_code == 200 and acked.json() == {"operationId": operation["operationId"], "state": "applied"}
        for body in ({"operationId": operation["operationId"], "state": "applied", "reason": "x"},
                     {"operationId": operation["operationId"], "state": "bogus"},
                     {"operationId": operation["operationId"], "state": "applied", "key": MARKER}):
            assert (await client.post("/portal/v1/device/integrations/tmdb/ack", headers=tv, json=body)).status_code == 422
        final = await client.get(path)
        seen.append(final)
        assert final.json()["pending"] is None and final.json()["last"]["result"] == "applied"
        assert (await client.get("/portal/v1/device/integrations/tmdb", headers=tv)).json() == {"operation": None}
        # Remover e cancelar pelo navegador.
        removed = await client.post(path + "/remove", headers={**browser, "idempotency-key": op_id()}, json={})
        assert removed.status_code == 202 and removed.json()["action"] == "remove"
        assert (await client.delete(path + "/pending", headers=browser)).status_code == 204
        assert (await client.get(path)).json()["pending"] is None
        # Limite de 10 mutações por hora por TV: recusa uniforme.
        codes = []
        for _ in range(12):
            codes.append((await client.put(path, headers={**browser, "idempotency-key": op_id()}, json={"key": SECOND})).status_code)
        assert 429 in codes
    assert all(MARKER not in response.text for response in seen)
    assert MARKER not in caplog.text and SECOND not in caplog.text


async def test_snapshot_reports_tmdb_state_and_old_tv_without_it_is_unknown(control, tmp_path):
    auth, device, bearer, _, now = await seeded(control)
    remember_integration(control, auth, device.device_id)
    control[1].append(f"devices/{device.device_id}/snapshot/current")
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_tmdb = TmdbIntegrationService(auth, make_crypto())
    app.state.portal_configurations = ConfigurationService(auth, make_crypto())
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    principal = auth._principal(device)
    service = app.state.portal_tmdb
    snapshot = {"capturedAt": (now - timedelta(seconds=5)).isoformat(), "sources": [], "revisions": [], "imports": []}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        assert (await client.put("/portal/v1/device/snapshot", headers=tv, json=snapshot)).status_code == 200
        assert (await service.view(principal, now))["tvReported"] is None
        configured = {**snapshot, "capturedAt": (now - timedelta(seconds=2)).isoformat(), "integrations": {"tmdb": "configured"}}
        assert (await client.put("/portal/v1/device/snapshot", headers=tv, json=configured)).status_code == 200
        assert (await service.view(principal, now))["tvReported"] == "configured"
        wrong = {**snapshot, "capturedAt": now.isoformat(), "integrations": {"tmdb": MARKER}}
        assert (await client.put("/portal/v1/device/snapshot", headers=tv, json=wrong)).status_code == 422
