"""Feature 070: valores salvos devolvidos ao painel da MESMA TV (D-006, ADR-014, FR-015/021, SC-006)."""

import logging
from types import SimpleNamespace

import httpx

from app.portal.application import create_app
from app.portal.configuration_delivery import ConfigurationDelivery
from app.portal.configuration_input import ConfigurationPatch
from app.portal.licensing import LicensingService
from app.portal.operations import DeletionService
from app.portal.recovery_journal import MemoryJournal
from app.portal.settings import PortalSettings
from tests.portal.test_auth import ORIGIN, remember
from tests.portal.test_configurations import fixture, op_id, remember_children, submit

MARKER_URL = "https://provider.invalid/get.php?username=u-fixture&password=marcador-070"
XTREAM = ConfigurationPatch(type="provider_credentials", displayName="Casa", providerDns="https://painel.invalid:8080",
                            providerUsername="usuario-fixture", providerPassword="senha-marcador-070",
                            epgManualUrl="https://epg.invalid/guia.xml", epgOffsetHours=-3)


async def test_dono_recebe_so_a_allowlist_do_tipo(control):
    service, principal, device, now = await fixture(control)
    try:
        await submit(service, principal, now, source="xt", patch=XTREAM)
        await submit(service, principal, now, source="m3u", patch=ConfigurationPatch(
            type="m3u_url", displayName="Lista", m3uUrl=MARKER_URL))
        delivery = ConfigurationDelivery(service)
        xtream = await delivery.values(principal, "xt")
        assert xtream == {"type": "provider_credentials", "displayName": "Casa",
                          "providerDns": "https://painel.invalid:8080", "providerUsername": "usuario-fixture",
                          "providerPassword": "senha-marcador-070", "epgManualUrl": "https://epg.invalid/guia.xml",
                          "epgOffsetHours": -3}
        m3u = await delivery.values(principal, "m3u")
        assert m3u == {"type": "m3u_url", "displayName": "Lista", "m3uUrl": MARKER_URL}
        for body in (xtream, m3u):
            assert not {"envelope", "configVersion", "deviceId", "authEpoch", "operationId"} & set(body)
    finally:
        await remember_children(control, device.device_id)


async def test_outra_tv_fonte_inexistente_id_malformado_e_excluida_dao_nada(control):
    service, principal, device, now = await fixture(control)
    other_service, other, other_device, _ = await fixture(control)
    deletions = DeletionService(service.repository, MemoryJournal(environment="test"))
    deletion_id = op_id(now)
    try:
        await submit(service, principal, now, source="xt", patch=XTREAM)
        delivery = ConfigurationDelivery(service)
        assert await delivery.values(principal, "xt") is not None
        assert await ConfigurationDelivery(other_service).values(other, "xt") is None
        assert await delivery.values(principal, "nao-existe") is None
        assert await delivery.values(principal, "../xt") is None
        await deletions.request_delete(device_id=device.device_id, auth_epoch=1, deletion_id=deletion_id,
                                       source_id="xt", revision=0, origin="portal", now=now)
        assert await delivery.values(principal, "xt") is None
    finally:
        await remember_children(control, device.device_id)
        await remember_children(control, other_device.device_id)
        control[1].append("jobs/" + deletions.job_id(device.device_id, deletion_id))


async def test_http_sessao_obrigatoria_no_store_cabecalho_com_id_e_licenca_e_nada_em_log(control, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    service, principal, device, now = await fixture(control)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = service.auth
    app.state.portal_configurations = service
    app.state.portal_licensing = LicensingService(service.auth, service.crypto, MemoryJournal(environment="test"))
    app.state.portal_access = SimpleNamespace(repository=service.repository, journal=MemoryJournal(environment="test"))
    invite = await service.auth.create_invite(principal, "manage", now)
    remember(control, service.auth, "invites", "invite", invite.token)
    try:
        await submit(service, principal, now, source="xt", patch=XTREAM)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            assert (await client.get("/portal/v1/configurations/xt/values")).status_code == 401
            assert (await client.get("/portal/v1/session/device")).status_code == 401
            exchanged = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN},
                                          json={"token": invite.token})
            assert exchanged.status_code == 200
            remember(control, service.auth, "sessions", "session", client.cookies.get("ccplay_portal_session"))

            values = await client.get("/portal/v1/configurations/xt/values")
            assert values.status_code == 200
            assert values.headers["cache-control"] == "no-store"
            assert values.json()["providerPassword"] == "senha-marcador-070"
            missing = await client.get("/portal/v1/configurations/nao-existe/values")
            assert missing.status_code == 404 and missing.json()["code"] == "not_found"

            header = await client.get("/portal/v1/session/device")
            body = header.json()
            assert header.status_code == 200 and body["displayId"] == device.display_id
            assert body["license"]["state"] == "trial" and body["license"]["expiresAt"] > body["license"]["startsAt"]
            assert "senha-marcador-070" not in header.text
    finally:
        await remember_children(control, device.device_id)
        control[1].extend([doc.reference.path async for doc in control[0].client.collection("devices")
                           .document(device.device_id).collection("licensing").stream()])
    assert "senha-marcador-070" not in caplog.text and "usuario-fixture" not in caplog.text
