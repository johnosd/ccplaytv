"""Integração real com emulator explícito; nunca roda contra Firestore em nuvem."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.portal.models import DeviceDocument, JobDocument
from app.portal.repositories.control import RepositoryConflict, TransactionPlan


def candidate(identity: str, device_id: str) -> DeviceDocument:
    now = datetime.now(UTC)
    return DeviceDocument(
        device_id=device_id, identity_hmac=identity, tv_bearer_hash="b" * 64,
        device_key_hash="c" * 64, auth_epoch=1, recovery_epoch="test-restore",
        created_at=now, trial_started_at=now, trial_expires_at=now + timedelta(days=7),
    )


async def test_concurrent_enrollment_has_one_identity_and_no_credential_disclosure(control):
    repository, paths = control
    identity = uuid.uuid4().hex * 2
    devices = [candidate(identity, "test-" + uuid.uuid4().hex) for _ in range(2)]
    paths.extend(["identityClaims/" + identity, *("devices/" + d.device_id for d in devices)])
    results = await asyncio.gather(*(repository.enroll(d) for d in devices), return_exceptions=True)
    assert sum(isinstance(result, str) for result in results) == 1
    failure = next(result for result in results if isinstance(result, Exception))
    assert isinstance(failure, RepositoryConflict)
    assert str(failure) == "identity_exists"
    claim = (await repository.client.document(paths[0]).get()).to_dict()
    assert claim["deviceId"] in [device.device_id for device in devices]
    snapshots = await asyncio.gather(*(repository.client.document(path).get() for path in paths[1:]))
    assert sum(snapshot.exists for snapshot in snapshots) == 1


async def test_transaction_preserves_trial_and_rejects_write_without_read(control):
    repository, paths = control
    device = candidate(uuid.uuid4().hex * 2, "test-" + uuid.uuid4().hex)
    path = "devices/" + device.device_id
    paths.extend([path, "identityClaims/" + device.identity_hmac])
    await repository.enroll(device)
    moved = device.model_copy(update={
        "trial_started_at": device.trial_started_at + timedelta(days=1),
        "trial_expires_at": device.trial_expires_at + timedelta(days=1),
    })
    with pytest.raises(RepositoryConflict, match="immutable_trial"):
        await repository.transact((path,), lambda _: TransactionPlan(None, {path: moved}))
    with pytest.raises(RepositoryConflict, match="credential_rotation_required"):
        await repository.transact((path,), lambda _: TransactionPlan(None, {
            path: device.model_copy(update={"auth_epoch": 2}),
        }))
    with pytest.raises(RepositoryConflict, match="recovery_epoch_rotation_required"):
        await repository.transact((path,), lambda _: TransactionPlan(None, {
            path: device.model_copy(update={"recovery_epoch": "different-restore"}),
        }))
    saved = DeviceDocument.model_validate((await repository.client.document(path).get()).to_dict())
    assert saved.trial_started_at == device.trial_started_at
    with pytest.raises(RepositoryConflict, match="write_without_read"):
        await repository.transact((path,), lambda _: TransactionPlan(None, {"devices/other": device}))


async def test_shared_job_lease_has_one_owner_and_stale_owner_cannot_checkpoint(control):
    repository, paths = control
    job_id = "test-" + uuid.uuid4().hex
    path = "jobs/" + job_id
    paths.append(path)
    now = datetime.now(UTC)
    job = JobDocument(kind="retention", dedupe_key=job_id, next_due_at=now)
    await repository.transact((path,), lambda _: TransactionPlan(None, {path: job}))
    results = await asyncio.gather(*(
        repository.lease_job(job_id, owner, now, now + timedelta(seconds=60))
        for owner in ("worker-a", "worker-b")
    ))
    assert sum(result is not None for result in results) == 1
    first = next(result for result in results if result is not None)
    later = now + timedelta(seconds=61)
    second = await repository.lease_job(job_id, "worker-c", later, later + timedelta(seconds=60))
    assert second.attempt == 2
    assert not await repository.checkpoint_job(job_id, first.lease_owner, later, later, "old")
    assert await repository.checkpoint_job(job_id, "worker-c", later,
                                           later + timedelta(hours=1), "done")
    assert await repository.lease_job(job_id, "worker-d", later,
                                      later + timedelta(seconds=60)) is None
