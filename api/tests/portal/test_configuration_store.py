from datetime import timedelta

import httpx
import pytest

from app.portal.application import create_app
from app.portal.auth import AuthError
from app.portal.configuration_delivery import ConfigurationDelivery
from app.portal.configurations import ConfigurationService
from app.portal.models import SnapshotDocument, SourceRevisionDocument, SourceSnapshotDocument
from app.portal.operations import DeletionService
from app.portal.recovery_journal import MemoryJournal
from app.portal.repositories.configuration_repository import ConfigurationRepository
from app.portal.settings import PortalSettings
from tests.portal.test_auth import ORIGIN, remember
from tests.portal.test_configurations import fixture, op_id, remember_children, submit


async def snapshot(service, principal, now, present=True, revision=1):
    return await service.save_snapshot(principal, SnapshotDocument(
        auth_epoch=principal.auth_epoch, recovery_epoch=principal.recovery_epoch,
        captured_at=now, received_at=now, snapshot_revision=0,
        sources=[SourceSnapshotDocument(id="source-a", type="m3u_url", displayName="Fixture",
            connectionState="synced", updatedAt=1)] if present else [],
        revisions=[SourceRevisionDocument(sourceId="source-a", revision=revision)] if present else [],
        imports=[],
    ))


async def test_resend_preserves_private_current_and_replays_after_snapshot_changes(control):
    service, principal, device, now = await fixture(control)
    try:
        original = await submit(service, principal, now)
        await service.transition(principal, original.operation_id, state="applied", revision=1,
                                 import_state="completed", now=now)
        await snapshot(service, principal, now)
        # Novo colaborador simula reinício de processo; corrente não depende da entrega anterior.
        restarted = ConfigurationService(service.auth, service.crypto)
        repository = ConfigurationRepository(restarted)
        request_id = op_id(now)
        resent = await repository.resend(principal, source_id="source-a", operation_id=request_id,
                                         expected_revision=1, now=now)
        assert resent.action == "update" and resent.operation_id != original.operation_id
        body = (await ConfigurationDelivery(restarted).pull(principal, now))[0]
        assert body["input"]["m3uUrl"].endswith("private-fixture") and "type" not in body["input"]
        assert resent.config_version != original.config_version
        await restarted.transition(principal, request_id, state="applied", revision=2,
                                   import_state="completed", now=now)
        await snapshot(service, principal, now + timedelta(seconds=1), revision=2)
        assert (await repository.resend(principal, source_id="source-a", operation_id=request_id,
                                        expected_revision=1, now=now)).operation_id == request_id
        with pytest.raises(AuthError):
            await repository.resend(principal, source_id="source-a", operation_id=request_id,
                                    expected_revision=2, now=now)
    finally:
        await remember_children(control, device.device_id)


async def test_recovery_snapshot_absent_source_can_explicitly_recreate_but_tombstone_blocks(control):
    service, principal, device, now = await fixture(control)
    deletion = DeletionService(service.repository, MemoryJournal(environment="test"))
    deletion_id = op_id(now)
    try:
        original = await submit(service, principal, now)
        await service.transition(principal, original.operation_id, state="applied", revision=1,
                                 import_state="completed", now=now)
        await snapshot(service, principal, now, present=False)
        repository = ConfigurationRepository(service)
        resent = await repository.resend(principal, source_id="source-a", operation_id=op_id(now),
                                         expected_revision=0, now=now)
        assert resent.action == "create" and resent.expected_revision == 0
        body = (await ConfigurationDelivery(service).pull(principal, now))[0]
        assert body["input"]["type"] == "m3u_url"
        await deletion.request_delete(device_id=device.device_id, auth_epoch=1, deletion_id=deletion_id,
                                      source_id="source-a", revision=1, origin="portal", now=now)
        with pytest.raises(AuthError):
            await repository.resend(principal, source_id="source-a", operation_id=op_id(now),
                                    expected_revision=0, now=now)
        # Resposta antiga apenas relata cancelamento; não recifra nem recria configuração.
        replay = await repository.resend(principal, source_id="source-a", operation_id=resent.operation_id,
                                         expected_revision=0, now=now)
        assert replay.state == "cancelled"
    finally:
        await remember_children(control, device.device_id)
        control[1].append("jobs/" + deletion.job_id(device.device_id, deletion_id))


async def test_resend_requires_fresh_snapshot_and_revision_and_never_auto_sends(control):
    service, principal, device, now = await fixture(control)
    try:
        original = await submit(service, principal, now)
        await service.transition(principal, original.operation_id, state="cancelled", revision=None,
                                 import_state=None, now=now)
        repository = ConfigurationRepository(service)
        with pytest.raises(AuthError):
            await repository.resend(principal, source_id="source-a", operation_id=op_id(now),
                                    expected_revision=0, now=now)
        await snapshot(service, principal, now, present=False)
        with pytest.raises(AuthError):
            await repository.resend(principal, source_id="source-a", operation_id=op_id(now),
                                    expected_revision=1, now=now)
        with pytest.raises(AuthError):
            await repository.resend(principal, source_id="source-a", operation_id=op_id(now + timedelta(days=1)),
                                    expected_revision=0, now=now + timedelta(days=1))
        assert await ConfigurationDelivery(service).pull(principal, now) == []
        current = await ConfigurationDelivery(service).public_rows(principal, "configurations")
        assert len(current) == 1 and "private-fixture" not in str(current)
    finally:
        await remember_children(control, device.device_id)


async def test_http_resend_requires_session_csrf_and_returns_only_public_metadata(control, tmp_path):
    service, principal, device, now = await fixture(control)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = service.auth
    app.state.portal_configurations = service
    try:
        original = await submit(service, principal, now)
        await service.transition(principal, original.operation_id, state="applied", revision=1,
                                 import_state="completed", now=now)
        await snapshot(service, principal, now)
        invite = await service.auth.create_invite(principal, "manage", now)
        remember(control, service.auth, "invites", "invite", invite.token)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            path = "/portal/v1/configurations/source-a/resend"
            body = {"expectedRevision": 1}
            headers = {"origin": ORIGIN, "idempotency-key": op_id(now)}
            assert (await client.post(path, headers=headers, json=body)).status_code == 401
            exchanged = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN},
                                          json={"token": invite.token})
            remember(control, service.auth, "sessions", "session", client.cookies.get("ccplay_portal_session"))
            assert (await client.post(path, headers=headers, json=body)).status_code == 403
            headers["x-csrf-token"] = exchanged.json()["csrfToken"]
            assert (await client.post(path, headers={**headers, "origin": "null"}, json=body)).status_code == 403
            resent = await client.post(path, headers=headers, json=body)
            assert resent.status_code == 202 and resent.json()["action"] == "source.update"
            assert "private-fixture" not in resent.text and "ciphertext" not in resent.text
            replay = await client.post(path, headers=headers, json=body)
            assert replay.json() == resent.json()
    finally:
        await remember_children(control, device.device_id)
