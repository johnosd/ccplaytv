"""Envio TV → site (071/D-009): só as regras que protegem dados — idempotência, tombstone, CAS e sigilo."""

import json
import logging

import httpx

from app.portal.application import create_app
from app.portal.configuration_delivery import ConfigurationDelivery
from app.portal.configuration_input import ConfigurationPatch
from app.portal.configurations import ConfigurationService
from app.portal.device_uploads import DeviceSourceUploads
from app.portal.models import ConfigurationDocument, TombstoneDocument
from app.portal.settings import PortalSettings
from tests.portal.test_auth import ORIGIN, seeded
from tests.portal.test_configurations import fixture, remember_children, submit
from tests.portal.test_crypto import make_crypto

MARKER_USER = "usuario-marcador-071"
MARKER_PASSWORD = "senha-marcador-071"


def xtream(**changes):
    values = {"type": "provider_credentials", "displayName": "Xtream da TV", "providerDns": "https://painel.invalid:8080",
              "providerUsername": MARKER_USER, "providerPassword": MARKER_PASSWORD}
    values.update(changes)
    return ConfigurationPatch(**values)


async def test_upload_is_applied_idempotent_by_digest_and_creates_no_operation(control):
    service, principal, device, now = await fixture(control)
    uploads = DeviceSourceUploads(service)
    try:
        assert await uploads.upload(principal, source_id="tv-source", revision=1, patch=xtream(), now=now) == "stored"
        assert await uploads.upload(principal, source_id="tv-source", revision=1, patch=xtream(), now=now) == "unchanged"
        root = "devices/" + device.device_id
        row = (await service.repository.client.document(root + "/configurations/tv-source").get()).to_dict()
        assert row["appliedRevision"] == 1 and row["activeOperationId"] is None and row["uploadDigest"]
        assert MARKER_PASSWORD not in json.dumps(row, default=str)
        operations = [doc async for doc in service.repository.client.collection(root + "/operations").stream()]
        assert operations == []
        assert (await service.repository.client.document(root).get()).to_dict()["pendingOperationCount"] == 0
        # Valor novo na revisão seguinte substitui o anterior por completo; o painel lê os valores salvos.
        changed = xtream(displayName="Renomeada", providerPassword="outra-senha-071")
        assert await uploads.upload(principal, source_id="tv-source", revision=2, patch=changed, now=now) == "stored"
        values = await ConfigurationDelivery(service).values(principal, "tv-source")
        assert values["displayName"] == "Renomeada" and values["providerPassword"] == "outra-senha-071"
        assert values["providerUsername"] == MARKER_USER
    finally:
        await remember_children(control, device.device_id)


async def test_tombstone_answers_gone_and_incomplete_input_is_invalid(control):
    service, principal, device, now = await fixture(control)
    uploads = DeviceSourceUploads(service)
    try:
        fence = TombstoneDocument(deletion_id="deletion-1", source_id="gone-source", origin="tv",
                                  last_known_revision=1, deleted_at=now, journal_object_id="journal-1")
        await service.repository.client.document(
            "devices/" + device.device_id + "/tombstones/gone-source").set(fence.model_dump(by_alias=True))
        assert await uploads.upload(principal, source_id="gone-source", revision=2, patch=xtream(), now=now) == "gone"
        row = await service.repository.client.document(
            "devices/" + device.device_id + "/configurations/gone-source").get()
        assert not row.exists
        incomplete = ConfigurationPatch(type="provider_credentials", displayName="Sem senha",
                                        providerDns="https://painel.invalid", providerUsername=MARKER_USER)
        assert await uploads.upload(principal, source_id="incomplete", revision=1, patch=incomplete, now=now) == "invalid"
    finally:
        await remember_children(control, device.device_id)


async def test_pending_portal_edit_is_never_overwritten_by_the_tv(control):
    service, principal, device, now = await fixture(control)
    uploads = DeviceSourceUploads(service)
    try:
        await submit(service, principal, now, source="edited-source")  # operação do portal ainda pendente
        before = (await service.repository.client.document(
            "devices/" + device.device_id + "/configurations/edited-source").get()).to_dict()
        state = await uploads.upload(principal, source_id="edited-source", revision=1, patch=xtream(), now=now)
        assert state == "conflict"
        after = (await service.repository.client.document(
            "devices/" + device.device_id + "/configurations/edited-source").get()).to_dict()
        assert after["configVersion"] == before["configVersion"] and after["activeOperationId"]
        assert ConfigurationDocument.model_validate(after).display_name == "Fixture"
    finally:
        await remember_children(control, device.device_id)


async def test_http_upload_batch_limit_no_store_and_values_absent_from_logs(control, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    auth, device, bearer, _, _ = await seeded(control)
    service = ConfigurationService(auth, make_crypto())
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_configurations = service
    headers = {"origin": "null", "authorization": "Bearer " + bearer}
    item = {"sourceId": "http-upload", "revision": 1, "input": {"type": "provider_credentials",
            "displayName": "HTTP", "providerDns": "https://painel.invalid", "providerUsername": MARKER_USER,
            "providerPassword": MARKER_PASSWORD}}
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            assert (await client.post("/portal/v1/device/sources", json={"sources": [item]})).status_code == 401
            too_many = [{**item, "sourceId": "s" + str(index)} for index in range(11)]
            refused = await client.post("/portal/v1/device/sources", headers=headers, json={"sources": too_many})
            assert refused.status_code == 422 and MARKER_PASSWORD not in refused.text
            ok = await client.post("/portal/v1/device/sources", headers=headers, json={"sources": [item]})
            assert ok.status_code == 200 and ok.json() == {"results": [{"sourceId": "http-upload", "state": "stored"}]}
            assert ok.headers["cache-control"] == "no-store"
            assert MARKER_PASSWORD not in ok.text and MARKER_PASSWORD not in str(dict(ok.headers))
            again = await client.post("/portal/v1/device/sources", headers=headers, json={"sources": [item]})
            assert again.json()["results"][0]["state"] == "unchanged"
        assert MARKER_PASSWORD not in caplog.text and MARKER_USER not in caplog.text
    finally:
        await remember_children(control, device.device_id)
        control[1].append("rateLimits/" + auth.tokens.digest("rate_limit", "upload/" + device.device_id))
