import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from app.portal.crypto import CipherEnvelope
from app.portal.models import (
    ConfigurationDocument,
    ConfigurationVersionDocument,
    InviteDocument,
    OperationDocument,
)
from app.portal.operations import DeletionService
from app.portal.recovery_journal import MemoryJournal
from app.portal.repositories.control import TransactionPlan
from app.portal.retention import RetentionService
from app.portal.worker import PortalWorker


async def test_delivery_expiry_never_removes_current_cipher_or_pending_delete(control):
    repository, paths = control
    service = RetentionService(repository)
    now = datetime.now(UTC)
    root = "devices/test-" + uuid.uuid4().hex + "/"
    cipher = CipherEnvelope(key_version="fixture", nonce="fixture", ciphertext="fixture")
    current = ConfigurationDocument(source_id="source-a", type="m3u_url", display_name="Fixture",
        config_version="current", expected_revision=0, envelope=cipher, created_at=now, updated_at=now)
    version = ConfigurationVersionDocument(source_id="source-a", config_version="current",
        envelope=cipher, reference_count=1, created_at=now)
    orphan = version.model_copy(update={"config_version": "orphan", "reference_count": 0})
    operation = OperationDocument(operation_id="create", source_id="source-a", action="create",
        expected_revision=0, config_version="current", auth_epoch=1, idempotency_digest="a" * 64,
        created_at=now, expires_at=now + timedelta(days=7))
    deletion = OperationDocument(operation_id="delete", source_id="source-b", action="delete",
        expected_revision=0, auth_epoch=1, idempotency_digest="b" * 64, created_at=now)
    documents = {root + "configurations/source-a": current,
        root + "configurationVersions/current": version, root + "configurationVersions/orphan": orphan,
        root + "operations/create": operation, root + "operations/delete": deletion}
    paths.extend(documents)
    await repository.transact(tuple(documents), lambda _: TransactionPlan(None, documents))
    assert not await service.expire(root + "operations/create", now + timedelta(days=7, microseconds=-1))
    results = await asyncio.gather(*(
        service.expire(root + "operations/create", now + timedelta(days=7)) for _ in range(2)
    ))
    assert sum(results) == 1
    saved = (await repository.client.document(root + "configurationVersions/current").get()).to_dict()
    assert saved["referenceCount"] == 0
    assert not await service.expire(root + "configurationVersions/current", now + timedelta(days=8))
    assert await service.expire(root + "configurationVersions/orphan", now + timedelta(days=8))
    assert not await service.expire(root + "operations/delete", now + timedelta(days=100))
    assert (await repository.client.document(root + "configurations/source-a").get()).to_dict() == current.model_dump(by_alias=True)
    assert (await repository.client.document(root + "operations/create").get()).to_dict()["state"] == "expired"
    assert (await repository.client.document(root + "operations/delete").get()).to_dict()["state"] == "pending"


async def test_retention_pages_at_most_twenty_and_durable_cursor_resumes(control):
    repository, paths = control
    now = datetime.now(UTC)
    prefix = uuid.uuid4().hex
    documents = {"invites/" + prefix + str(index): InviteDocument(device_id="fixture", purpose="manage",
        auth_epoch=1, recovery_epoch="fixture", created_at=now,
        expires_at=now + timedelta(minutes=5)) for index in range(23)}
    paths.extend(documents)
    await repository.transact(tuple(documents), lambda _: TransactionPlan(None, documents))
    service = RetentionService(repository)
    page = await service.page(None, now)
    assert page.scanned <= 20 and page.checkpoint is not None
    # Nova instância retoma o cursor. Mesmo que haja outras fixtures no emulator,
    # cada página permanece limitada e não reapresenta documentos desta página.
    resumed = await RetentionService(repository).page(page.checkpoint, now)
    assert resumed.scanned <= 20
    for path in documents:
        assert (await repository.client.document(path).get()).exists


async def test_private_worker_persists_retention_checkpoint_without_resident_loop(control):
    repository, paths = control
    paths.append("jobs/retention-global")
    now = datetime.now(UTC)
    worker = PortalWorker(repository, DeletionService(repository, MemoryJournal(environment="test")),
                          retention=RetentionService(repository))
    first = await worker.run_once(now)
    assert first.completed == 1 and first.failed == 0
    row = (await repository.client.document("jobs/retention-global").get()).to_dict()
    assert row["checkpoint"] is not None and row["leaseOwner"] is None
    assert row["kind"] == "retention"
    prior = row["checkpoint"]
    restarted = PortalWorker(repository, worker.deletions, retention=RetentionService(repository))
    second = await restarted.run_once(max(now, row["nextDueAt"]))
    assert second.completed == 1 and second.failed == 0
    row = (await repository.client.document("jobs/retention-global").get()).to_dict()
    assert row["checkpoint"] != prior
