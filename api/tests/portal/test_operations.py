import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.portal.crypto import CipherEnvelope
from app.portal.models import (
    ConfigurationDocument,
    ConfigurationVersionDocument,
    DeletionIntentDocument,
    DeviceDocument,
    OperationDocument,
)
from app.portal.operations import DeletionService
from app.portal.recovery_journal import JournalError, MemoryJournal
from app.portal.repositories.control import RepositoryConflict, TransactionPlan


async def seed(control, *, journal=None):
    repository, paths = control
    now = datetime.now(UTC)
    device_id = "test-" + uuid.uuid4().hex
    identity = uuid.uuid4().hex * 2
    device = DeviceDocument(device_id=device_id, identity_hmac=identity, tv_bearer_hash="b" * 64,
                            device_key_hash="c" * 64, auth_epoch=1, recovery_epoch="test-restore",
                            created_at=now)
    paths.extend(["devices/" + device_id, "identityClaims/" + identity])
    await repository.enroll(device)
    root = "devices/" + device_id + "/"
    envelope = CipherEnvelope(key_version="v1", nonce="fixture-nonce", ciphertext="fixture-cipher")
    config = ConfigurationDocument(source_id="source-a", type="m3u_url", display_name="Fixture",
                                   config_version="version-a", expected_revision=1, envelope=envelope,
                                   created_at=now, updated_at=now)
    version = ConfigurationVersionDocument(source_id="source-a", config_version="version-a",
                                           envelope=envelope, reference_count=1, created_at=now)
    pending = OperationDocument(operation_id="create-a", source_id="source-a", action="create",
                                expected_revision=0, config_version="version-a", auth_epoch=1,
                                idempotency_digest="a" * 64, created_at=now,
                                expires_at=now + timedelta(days=7))
    documents = {root + "configurations/source-a": config,
                 root + "configurationVersions/version-a": version,
                 root + "operations/create-a": pending}
    paths.extend(documents)
    paths.extend([root + "deletionIntents/delete-a", root + "tombstones/source-a",
                  root + "operations/delete-a",
                  "jobs/" + DeletionService.job_id(device_id, "delete-a")])
    await repository.transact(tuple(documents), lambda _: TransactionPlan(None, documents))
    return DeletionService(repository, journal or MemoryJournal(environment="test")), device_id, now


async def test_journal_failure_keeps_fence_and_outbox_then_retry_purges_without_recreation(control):
    class Unavailable:
        async def append(self, event):
            raise JournalError("journal_unavailable")

    service, device_id, now = await seed(control, journal=Unavailable())
    arguments = {"device_id": device_id, "auth_epoch": 1, "deletion_id": "delete-a",
                 "source_id": "source-a", "revision": 2, "origin": "tv", "now": now}
    pending = await service.request_delete(**arguments)
    assert pending.state == "pending_journal"
    assert not pending.can_ack_tv
    root = "devices/" + device_id + "/"
    client = service.repository.client
    assert (await client.document(root + "configurations/source-a").get()).exists
    assert await service.read_configuration(device_id, "source-a", auth_epoch=1,
                                            recovery_epoch="test-restore") is None
    service.journal = MemoryJournal(environment="test")
    confirmed = await service.request_delete(**{**arguments, "now": now + timedelta(days=1)})
    assert confirmed.can_ack_tv
    assert not (await client.document(root + "configurations/source-a").get()).exists
    assert not (await client.document(root + "configurationVersions/version-a").get()).exists
    operation = (await client.document(root + "operations/create-a").get()).to_dict()
    assert operation["state"] == "cancelled"
    assert (await client.document(root + "tombstones/source-a").get()).exists
    assert (await service.request_delete(**arguments)).can_ack_tv


async def test_crash_after_journal_is_resumable_and_portal_delete_waits_past_seven_days(control):
    service, device_id, now = await seed(control)
    arguments = {"device_id": device_id, "auth_epoch": 1, "deletion_id": "delete-a",
                 "source_id": "source-a", "revision": 1, "origin": "portal", "now": now}
    original = service._purge_versions_and_cancel

    async def crash(*_):
        raise RuntimeError("simulated crash after append")

    service._purge_versions_and_cancel = crash
    with pytest.raises(RuntimeError, match="simulated crash"):
        await service.request_delete(**arguments)
    job = (await service.repository.client.document(
        "jobs/" + service.job_id(device_id, "delete-a")
    ).get()).to_dict()
    assert job["deviceId"] == device_id and job["dedupeKey"] == "delete-a"
    service._purge_versions_and_cancel = original
    result = await service.request_delete(**{**arguments, "now": now + timedelta(days=10)})
    assert result.state == "pending_device"
    assert not result.can_ack_tv
    root = "devices/" + device_id + "/"
    operation = OperationDocument.model_validate(
        (await service.repository.client.document(root + "operations/delete-a").get()).to_dict()
    )
    assert operation.expires_at is None
    assert await service.acknowledge_delete(device_id=device_id, auth_epoch=1, deletion_id="delete-a",
                                            revision=2, now=now + timedelta(days=11))
    intent = DeletionIntentDocument.model_validate(
        (await service.repository.client.document(root + "deletionIntents/delete-a").get()).to_dict()
    )
    assert intent.state == "confirmed"


async def test_concurrent_delete_is_idempotent_and_revoked_access_cannot_reserve(control):
    service, device_id, now = await seed(control)
    arguments = {"device_id": device_id, "auth_epoch": 1, "deletion_id": "delete-a",
                 "source_id": "source-a", "revision": 2, "origin": "tv", "now": now}
    with pytest.raises(RepositoryConflict, match="unauthorized"):
        await service.request_delete(**{**arguments, "auth_epoch": 0})
    results = await asyncio.gather(*(service.request_delete(**arguments) for _ in range(2)))
    assert all(result.can_ack_tv for result in results)
    with pytest.raises(RepositoryConflict, match="idempotency_conflict"):
        await service.request_delete(**{**arguments, "source_id": "source-b"})
