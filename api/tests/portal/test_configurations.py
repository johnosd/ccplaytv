import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace

import httpx
import pytest

from app.portal.application import create_app
from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token
from app.portal.configuration_delivery import ConfigurationDelivery
from app.portal.configuration_input import ConfigurationPatch
from app.portal.configurations import ConfigurationService
from app.portal.models import SnapshotDocument
from app.portal.operations import DeletionService
from app.portal.recovery_journal import MemoryJournal
from app.portal.repositories.control import TransactionPlan
from app.portal.settings import PortalSettings
from tests.portal.test_auth import ORIGIN, remember, seeded
from tests.portal.test_crypto import make_crypto


def op_id(now):
    return "op-" + str(int(now.timestamp() * 1000)) + "-" + new_token()


async def fixture(control):
    auth, device, bearer, _, now = await seeded(control)
    principal = await auth.authenticate_tv(bearer)
    return ConfigurationService(auth, make_crypto()), principal, device, now


async def submit(service, principal, now, source="source-a", **changes):
    options = {"operation_id": op_id(now), "source_id": source, "action": "create", "expected_revision": 0,
               "patch": ConfigurationPatch(type="m3u_url", displayName="Fixture",
                   m3uUrl="https://provider.invalid/list?password=private-fixture"), "now": now}
    options.update(changes)
    return await service.submit(principal, **options)


async def remember_children(control, device_id):
    root = control[0].client.collection("devices").document(device_id)
    for collection in ("configurations", "configurationVersions", "operations", "idempotencyClaims",
                       "snapshot", "deletionIntents", "tombstones"):
        control[1].extend([doc.reference.path async for doc in root.collection(collection).stream()])


async def test_permanent_cipher_survives_ack_replay_cancel_and_public_allowlist(control):
    service, principal, device, now = await fixture(control)
    try:
        operation = await submit(service, principal, now)
        delivery = ConfigurationDelivery(service)
        bodies = await delivery.pull(principal, now)
        assert len(bodies) == 1 and bodies[0]["input"]["m3uUrl"].endswith("private-fixture")
        public = await delivery.public_rows(principal, "configurations")
        assert "private-fixture" not in json.dumps(public)
        assert "envelope" not in str(public) and "m3uUrl" not in str(public)
        assert operation.config_version in str(public)
        await service.transition(principal, operation.operation_id, state="applied", revision=1,
                                 import_state="queued", now=now)
        await service.transition(principal, operation.operation_id, state="applied", revision=1,
                                 import_state="completed", now=now)
        replay = await submit(service, principal, now, operation_id=operation.operation_id)
        assert replay.state == "applied" and replay.import_state == "completed"
        root = "devices/" + device.device_id + "/"
        row = (await service.repository.client.document(root + "configurations/source-a").get()).to_dict()
        assert row["envelope"] and row["appliedRevision"] == 1 and row["activeOperationId"] is None
        assert (await service.repository.client.document(root + "configurationVersions/" + operation.config_version).get()).to_dict()["referenceCount"] == 0
        update = await submit(service, principal, now, action="update", expected_revision=1,
                              patch=ConfigurationPatch(displayName="Renamed", m3uUrl=""))
        body = (await delivery.pull(principal, now))[0]
        assert "type" not in body["input"] and body["input"]["m3uUrl"].endswith("private-fixture")
        cancelled = await service.transition(principal, update.operation_id, state="cancelled",
                                             revision=None, import_state=None, now=now)
        assert cancelled.state == "cancelled"
        row = (await service.repository.client.document(root + "configurations/source-a").get()).to_dict()
        assert row["displayName"] == "Renamed" and row["envelope"]
        assert (await service.repository.client.document(root.rstrip("/")).get()).to_dict()["pendingOperationCount"] == 0
    finally:
        await remember_children(control, device.device_id)


async def test_concurrent_limit_five_and_same_key_different_body_conflict(control):
    service, principal, device, now = await fixture(control)
    try:
        results = await asyncio.gather(*(submit(service, principal, now, source="source-" + str(i))
                                         for i in range(7)), return_exceptions=True)
        successful = [item for item in results if not isinstance(item, Exception)]
        assert len(successful) == 5
        assert all(isinstance(item, AuthError) and item.status == 409
                   for item in results if isinstance(item, Exception))
        first = successful[0]
        with pytest.raises(AuthError):
            await submit(service, principal, now, source=first.source_id,
                         operation_id=first.operation_id, patch=ConfigurationPatch(
                             type="m3u_url", displayName="Different", m3uUrl="https://provider.invalid/new"))
        root = "devices/" + device.device_id
        assert (await service.repository.client.document(root).get()).to_dict()["pendingOperationCount"] == 5
        # Expiry libera contador e referência; corrente cifrada permanece.
        await service.expire_pending(device.device_id, now + timedelta(days=7))
        assert (await service.repository.client.document(root).get()).to_dict()["pendingOperationCount"] == 0
        assert len(await ConfigurationDelivery(service).public_rows(principal, "configurations")) == 5
    finally:
        await remember_children(control, device.device_id)


async def test_delete_dominates_replay_and_cancels_pending_counter(control):
    service, principal, device, now = await fixture(control)
    deletions = DeletionService(service.repository, MemoryJournal(environment="test"))
    try:
        operation = await submit(service, principal, now)
        deletion_id = op_id(now)
        result = await deletions.request_delete(device_id=device.device_id, auth_epoch=1,
            deletion_id=deletion_id, source_id="source-a", revision=0, origin="portal", now=now)
        assert result.state == "pending_device"
        assert (await submit(service, principal, now, operation_id=operation.operation_id)).state == "cancelled"
        assert (await ConfigurationDelivery(service).pull(principal, now))[0]["action"] == "source.delete"
        with pytest.raises(AuthError) as error:
            await submit(service, principal, now)
        assert error.value.status == 410
        assert await ConfigurationDelivery(service).public_rows(principal, "configurations") == []
        assert (await service.repository.client.document("devices/" + device.device_id).get()).to_dict()["pendingOperationCount"] == 0
    finally:
        await remember_children(control, device.device_id)
        control[1].append("jobs/" + deletions.job_id(device.device_id, deletion_id))


async def test_snapshot_cas_revision_epoch_and_cross_device_payload(control):
    service, principal, device, now = await fixture(control)
    try:
        snapshot = SnapshotDocument(auth_epoch=1, recovery_epoch=principal.recovery_epoch,
            captured_at=now, received_at=now, snapshot_revision=0,
            sources=[{"id": "local", "type": "m3u_url", "displayName": "Local", "connectionState": "synced", "updatedAt": 1}],
            revisions=[{"sourceId": "local", "revision": 4}], imports=[])
        assert (await service.save_snapshot(principal, snapshot)).snapshot_revision == 1
        assert (await service.save_snapshot(principal, snapshot)).snapshot_revision == 1
        with pytest.raises(AuthError):
            await service.save_snapshot(principal, snapshot.model_copy(update={"captured_at": now - timedelta(seconds=1)}))
        with pytest.raises(AuthError):
            await submit(service, principal, now, source="local", expected_revision=3)
        operation = await submit(service, principal, now, source="local", expected_revision=4)
        other_service, other, other_device, _ = await fixture(control)
        try:
            assert await ConfigurationDelivery(other_service).pull(other, now) == []
            with pytest.raises(AuthError):
                await other_service.transition(other, operation.operation_id, state="applied",
                                               revision=5, import_state=None, now=now)
        finally:
            await remember_children(control, other_device.device_id)
    finally:
        await remember_children(control, device.device_id)


async def test_expired_ids_and_invalid_terminal_import_ack_never_mutate(control):
    service, principal, device, now = await fixture(control)
    try:
        operation = await submit(service, principal, now)
        await service.transition(principal, operation.operation_id, state="applied", revision=1,
                                 import_state="completed", now=now)
        with pytest.raises(AuthError) as error:
            await service.transition(principal, operation.operation_id, state="applied", revision=1,
                                     import_state="made_up", now=now)
        assert error.value.status == 422
        with pytest.raises(AuthError):
            await submit(service, principal, now + timedelta(days=8), operation_id=operation.operation_id)
        root = "devices/" + device.device_id
        saved = (await service.repository.client.document(root).get()).to_dict()
        changed = device.model_copy(update={"auth_epoch": 2, "tv_bearer_hash": "0" * 64, "device_key_hash": "1" * 64})
        await service.repository.transact((root,), lambda _: TransactionPlan(None, {root: changed}))
        with pytest.raises(AuthError):
            await ConfigurationDelivery(service).pull(principal, now)
        assert saved["pendingOperationCount"] == 0
    finally:
        await remember_children(control, device.device_id)


async def test_http_origin_csrf_snapshot_allowlist_delivery_and_ack(control, tmp_path):
    service, principal, device, now = await fixture(control)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = service.auth
    app.state.portal_configurations = service
    invite = await service.auth.create_invite(principal, "manage", now)
    remember(control, service.auth, "invites", "invite", invite.token)
    token = None
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            exchanged = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN},
                                          json={"token": invite.token})
            assert exchanged.status_code == 200
            csrf = exchanged.json()["csrfToken"]
            token = client.cookies.get("ccplay_portal_session")
            remember(control, service.auth, "sessions", "session", token)
            body = {"action": "source.create", "sourceId": "http-source", "expectedRevision": 0,
                    "input": {"type": "m3u_url", "displayName": "HTTP", "m3uUrl": "https://provider.invalid/private-fixture"}}
            operation_id = op_id(now)
            headers = {"origin": ORIGIN, "idempotency-key": operation_id}
            assert (await client.post("/portal/v1/operations", headers=headers, json=body)).status_code == 403
            headers["x-csrf-token"] = csrf
            created = await client.post("/portal/v1/operations", headers=headers, json=body)
            assert created.status_code == 202
            assert "private-fixture" not in created.text and "ciphertext" not in created.text
            assert (await client.post("/portal/v1/operations", headers={**headers, "origin": "null"}, json=body)).status_code == 403
            public = await client.get("/portal/v1/configurations")
            assert public.status_code == 200 and "private-fixture" not in public.text
            tv_headers = {"origin": "null", "authorization": "Bearer " + device.device_id + "." + new_token()}
            assert (await client.get("/portal/v1/device/operations", headers=tv_headers)).status_code == 401
            # Test fixture has only hashed bearer; use a separately enrolled TV for HTTP authentication.
            auth, second, bearer, _, _ = await seeded(control)
            app.state.portal_auth = auth
            second_service = ConfigurationService(auth, service.crypto)
            app.state.portal_configurations = second_service
            second_principal = await auth.authenticate_tv(bearer)
            second_operation = await submit(second_service, second_principal, now)
            tv_headers["authorization"] = "Bearer " + bearer
            pulled = await client.get("/portal/v1/device/operations", headers=tv_headers)
            assert pulled.status_code == 200 and "private-fixture" in pulled.text
            limited = await client.get("/portal/v1/device/operations", headers=tv_headers)
            assert limited.status_code == 429 and int(limited.headers["retry-after"]) > 0
            ack = await client.post("/portal/v1/device/operations/" + second_operation.operation_id + "/ack",
                                    headers=tv_headers, json={"state": "applied", "revision": 1, "importState": "completed"})
            assert ack.status_code == 200
            snapshot = {"capturedAt": now.isoformat(), "sources": [{"id": "source-a", "type": "m3u_url",
                        "displayName": "HTTP", "connectionState": "synced", "updatedAt": 1}],
                        "revisions": [{"sourceId": "source-a", "revision": 1}], "imports": []}
            rejected = await client.put("/portal/v1/device/snapshot", headers=tv_headers,
                json={**snapshot, "sources": [{**snapshot["sources"][0], "m3uUrl": "https://private.invalid"}]})
            assert rejected.status_code == 422 and "private.invalid" not in rejected.text
            assert (await client.put("/portal/v1/device/snapshot", headers=tv_headers, json=snapshot)).status_code == 200
            await remember_children(control, second.device_id)
            control[1].append("rateLimits/" + auth.tokens.digest("rate_limit", "pull/" + second.device_id))
    finally:
        await remember_children(control, device.device_id)


async def test_delivery_rechecks_fence_after_decryption_and_same_request_converges(control, monkeypatch):
    service, principal, device, now = await fixture(control)
    deletions = DeletionService(service.repository, MemoryJournal(environment="test"))
    deletion_id = op_id(now)
    try:
        request_id = op_id(now)
        both = await asyncio.gather(*(submit(service, principal, now, operation_id=request_id) for _ in range(2)))
        assert both[0] == both[1]
        delivery = ConfigurationDelivery(service)
        first = await delivery.pull(principal, now)
        replay = await delivery.pull(principal, now)
        assert first[0]["operationId"] == replay[0]["operationId"] == request_id
        original_decrypt = service.crypto.decrypt
        original_transact = service.repository.transact
        armed = False

        def decrypt(*args, **kwargs):
            nonlocal armed
            result = original_decrypt(*args, **kwargs)
            armed = True
            return result

        async def transact(paths, decide):
            nonlocal armed
            if armed:
                armed = False
                await deletions.request_delete(device_id=device.device_id, auth_epoch=1,
                    deletion_id=deletion_id, source_id="source-a", revision=0, origin="portal", now=now)
            return await original_transact(paths, decide)

        monkeypatch.setattr(service.crypto, "decrypt", decrypt)
        monkeypatch.setattr(service.repository, "transact", transact)
        assert await delivery.pull(principal, now) == []
        assert (await delivery.pull(principal, now))[0]["action"] == "source.delete"
    finally:
        await remember_children(control, device.device_id)
        control[1].append("jobs/" + deletions.job_id(device.device_id, deletion_id))


async def test_metadata_pagination_and_optional_clear_intent_survive_edits(control):
    service, principal, device, now = await fixture(control)
    try:
        for source in ("source-a", "source-b"):
            await submit(service, principal, now, source=source)
        delivery = ConfigurationDelivery(service)
        page = await delivery.public_rows(principal, "configurations", limit=1)
        assert page[0]["sourceId"] == "source-a"
        next_page = await delivery.public_rows(principal, "configurations", limit=1, after="source-a")
        assert next_page[0]["sourceId"] == "source-b"
        operations = await delivery.public_rows(principal, "operations")
        first = next(item for item in operations if item["sourceId"] == "source-a")
        await service.transition(principal, first["operationId"], state="applied", revision=1,
                                 import_state="completed", now=now)
        update = await submit(service, principal, now, action="update", expected_revision=1,
                              patch=ConfigurationPatch(clearFields=["epgManualUrl", "epgOffsetHours"]))
        await service.transition(principal, update.operation_id, state="applied", revision=2,
                                 import_state="completed", now=now)
        await submit(service, principal, now, action="update", expected_revision=2,
                     patch=ConfigurationPatch(displayName="Later rename"))
        payload = next(item["input"] for item in await delivery.pull(principal, now) if item["sourceId"] == "source-a")
        assert payload["clearFields"] == ["epgManualUrl", "epgOffsetHours"]
        assert "m3uUrl" in payload and "type" not in payload
    finally:
        await remember_children(control, device.device_id)


async def test_delete_conflict_remains_deliverable_until_explicit_applied_ack(control, tmp_path):
    auth, device, bearer, _, now = await seeded(control)
    principal = await auth.authenticate_tv(bearer)
    service = ConfigurationService(auth, make_crypto())
    deletion = DeletionService(auth.repository, MemoryJournal(environment="test"))
    deletion_id = op_id(now)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_configurations = service
    app.state.portal_access = SimpleNamespace(repository=auth.repository, journal=deletion.journal)
    try:
        result = await deletion.request_delete(device_id=device.device_id, auth_epoch=1,
            deletion_id=deletion_id, source_id="source-a", revision=1, origin="portal", now=now)
        assert result.state == "pending_device"
        headers = {"origin": "null", "authorization": "Bearer " + bearer}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            path = "/portal/v1/device/operations/" + deletion_id + "/ack"
            response = await client.post(path, headers=headers, json={"state": "conflict", "revision": 2})
            assert response.status_code == 200 and response.json()["state"] == "conflict"
            rows = await ConfigurationDelivery(service).pull(principal, now + timedelta(days=8))
            assert len(rows) == 1 and rows[0]["state"] == "conflict"
            response = await client.post(path, headers=headers, json={"state": "applied", "revision": 3})
            assert response.status_code == 200
            assert await ConfigurationDelivery(service).pull(principal, now + timedelta(days=8)) == []
    finally:
        await remember_children(control, device.device_id)
        control[1].append("jobs/" + deletion.job_id(device.device_id, deletion_id))
