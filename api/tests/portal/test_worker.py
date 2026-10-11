import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.portal.application import create_app
from app.portal.models import DeviceDocument, JobDocument
from app.portal.operations import DeletionService
from app.portal.recovery_journal import JournalError, MemoryJournal
from app.portal.repositories.control import TransactionPlan
from app.portal.settings import PortalSettings
from app.portal.worker import PortalWorker, TickSummary


class UnavailableJournal:
    async def append(self, _event):
        raise JournalError("journal_unavailable")


async def prepared(control, count=1):
    repository, paths = control
    now = datetime.now(UTC)
    device_id = "test-" + uuid.uuid4().hex
    device = DeviceDocument(device_id=device_id, identity_hmac=uuid.uuid4().hex * 2,
                            tv_bearer_hash="b" * 64, device_key_hash="c" * 64,
                            auth_epoch=1, recovery_epoch="test-restore", created_at=now)
    paths.extend(["devices/" + device_id, "identityClaims/" + device.identity_hmac])
    await repository.enroll(device)
    service = DeletionService(repository, UnavailableJournal())
    for index in range(count):
        deletion_id, source_id = "delete-" + str(index), "source-" + str(index)
        paths.extend(["devices/" + device_id + "/" + collection + "/" + identifier
                      for collection, identifier in (
                          ("deletionIntents", deletion_id), ("tombstones", source_id),
                          ("operations", deletion_id),
                      )])
        paths.append("jobs/" + service.job_id(device_id, deletion_id))
        result = await service.request_delete(device_id=device_id, auth_epoch=1,
                                              deletion_id=deletion_id, source_id=source_id,
                                              revision=1, origin="tv", now=now)
        assert result.state == "pending_journal"
    return PortalWorker(repository, service), device_id, now


async def test_worker_persists_retry_then_new_instance_resumes_after_journal_failure(control):
    worker, device_id, now = await prepared(control)
    result = await worker.run_once(now)
    assert result.failed == 1 and result.completed == 0
    path = "jobs/" + worker.deletions.job_id(device_id, "delete-0")
    row = (await worker.repository.client.document(path).get()).to_dict()
    assert row["leaseOwner"] is None and row["checkpoint"] == "pending_journal"
    assert row["nextDueAt"] > now
    resumed = PortalWorker(worker.repository, DeletionService(
        worker.repository, MemoryJournal(environment="test"),
    ))
    result = await resumed.run_once(now + timedelta(minutes=1))
    assert result.completed == 1 and result.failed == 0
    assert not (await worker.repository.client.document(path).get()).exists
    root = "devices/" + device_id + "/"
    assert (await worker.repository.client.document(root + "deletionIntents/delete-0").get()
            ).to_dict()["state"] == "confirmed"


async def test_worker_limits_batch_and_does_not_steal_active_lease(control):
    worker, device_id, now = await prepared(control, count=6)
    job_id = worker.deletions.job_id(device_id, "delete-0")
    job_path = "jobs/" + job_id

    def prioritize(rows):
        job = JobDocument.model_validate(rows[job_path])
        return TransactionPlan(None, {job_path: job.model_copy(update={
            "next_due_at": now - timedelta(seconds=1),
        })})

    await worker.repository.transact((job_path,), prioritize)
    assert await worker.repository.lease_job(job_id, "other-worker", now,
                                             now + timedelta(seconds=240))
    worker.deletions.journal = MemoryJournal(environment="test")
    result = await worker.run_once(now)
    assert result.scanned == 5
    assert result.leased == 4 and result.completed == 4 and result.deferred == 1
    assert (await worker.repository.client.document("jobs/" + job_id).get()).exists
    with pytest.raises(ValueError, match="aware_time_required"):
        await worker.run_once(datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None))


async def test_public_tick_refused_and_private_tick_is_request_scoped(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
    settings = PortalSettings(environment="test", static_dir=tmp_path)

    class FakeWorker:
        calls = 0

        async def run_once(self):
            self.calls += 1
            return TickSummary(completed=1)

    worker = FakeWorker()
    for role in ("public", "jobs"):
        app = create_app(settings.model_copy(update={"service_role": role}))
        app.state.portal_worker = worker
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://test") as client:
            result = await client.post("/internal/portal/jobs/tick")
            assert result.status_code == (404 if role == "public" else 200)
    assert worker.calls == 1
    # Autorização IAM/OIDC pertence ao ingresso Cloud Run: não simulada como prova real.
