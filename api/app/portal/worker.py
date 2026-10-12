"""Executor limitado: uma passagem por requisição/--once, com leases duráveis."""

import argparse
import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta

from google.api_core.exceptions import GoogleAPIError
from google.cloud.firestore_v1.base_query import FieldFilter

from app.portal.access_rotation import AccessRotation
from app.portal.auth import AuthError, AuthService
from app.portal.auth_tokens import AuthTokens, new_token, valid_token
from app.portal.commercial_models import LicenseIntentDocument
from app.portal.crypto import PortalCrypto
from app.portal.firestore import create_firestore_client
from app.portal.licensing import LicensingService
from app.portal.models import AccessIntentDocument, DeletionIntentDocument
from app.portal.operations import DeletionService
from app.portal.payments import PaymentService
from app.portal.providers.base import PaymentProviderError
from app.portal.providers.mercadopago import MercadoPagoProvider
from app.portal.recovery_codes import RecoveryCodes
from app.portal.recovery_journal import CloudStorageJournal, JournalError
from app.portal.repositories.control import ControlRepository, RepositoryConflict, document_path
from app.portal.retention import RetentionService
from app.portal.settings import PortalSettings


@dataclass
class TickSummary:
    scanned: int = 0
    leased: int = 0
    completed: int = 0
    deferred: int = 0
    failed: int = 0
    timed_out: bool = False


class PortalWorker:
    def __init__(self, repository: ControlRepository, deletions: DeletionService,
                 access: AccessRotation | None = None, retention: RetentionService | None = None,
                 licensing: LicensingService | None = None, payments: PaymentService | None = None):
        self.repository = repository
        self.deletions = deletions
        self.access = access
        self.retention = retention
        self.licensing = licensing
        self.payments = payments

    async def run_once(self, now: datetime | None = None) -> TickSummary:
        now = datetime.now(UTC) if now is None else now
        if now.tzinfo is None:
            raise ValueError("aware_time_required")
        summary = TickSummary()
        owner = new_token()
        try:
            async with asyncio.timeout(180):
                if self.retention is not None:
                    await self.retention.ensure_job(now)
                kinds = ["delete_finalize"]
                if self.access is not None:
                    kinds.append("access_finalize")
                if self.retention is not None:
                    kinds.append("retention")
                if self.licensing is not None:
                    kinds.append("license_finalize")
                if self.payments is not None:
                    kinds.append("reconcile")
                query = self.repository.client.collection("jobs").where(
                    filter=FieldFilter("kind", "in", kinds)
                ).where(filter=FieldFilter("nextDueAt", "<=", now)).order_by("nextDueAt").limit(5)
                jobs = [doc async for doc in query.stream(timeout=5, retry=None)]
                summary.scanned = len(jobs)
                for snapshot in jobs:
                    lease_now = max(now, datetime.now(UTC))
                    job = await self.repository.lease_job(snapshot.id, owner, lease_now,
                                                           lease_now + timedelta(seconds=240))
                    if job is None:
                        summary.deferred += 1
                        continue
                    summary.leased += 1
                    try:
                        if job.kind == "retention":
                            page = await self.retention.page(job.checkpoint, lease_now)
                            await self.repository.checkpoint_job(
                                snapshot.id, owner, datetime.now(UTC),
                                lease_now + timedelta(hours=1) if page.cycle_complete else lease_now,
                                page.checkpoint,
                            )
                            summary.completed += 1
                            continue
                        if job.kind == "reconcile":
                            if job.device_id is None:
                                done = await self.payments.reconcile_payment(job.dedupe_key, lease_now)
                                cursor = None
                            else:
                                cursor, done = await self.payments.reconcile_order(job.dedupe_key, lease_now, job.checkpoint)
                            if job.device_id is None and done:
                                await self.payments.finish_payment_job(job.dedupe_key, owner, datetime.now(UTC))
                            else:
                                await self.repository.checkpoint_job(snapshot.id, owner, datetime.now(UTC),
                                    lease_now + timedelta(hours=1) if done and cursor is None else lease_now + timedelta(seconds=60), cursor)
                            summary.completed += int(done)
                            summary.failed += int(not done)
                            continue
                        path = document_path("licenseIntents" if job.kind == "license_finalize" else "accessIntents" if job.kind == "access_finalize"
                                             else "deletionIntents", job.dedupe_key,
                                             device_id=job.device_id)
                        intent_snapshot = await self.repository.client.document(path).get(
                            timeout=5, retry=None,
                        )
                        if not intent_snapshot.exists:
                            raise RepositoryConflict("deletion_intent_missing")
                        if job.kind == "license_finalize":
                            state = await self.licensing.resume_refund(LicenseIntentDocument.model_validate(intent_snapshot.to_dict()))
                        elif job.kind == "access_finalize":
                            intent = AccessIntentDocument.model_validate(intent_snapshot.to_dict())
                            result = await self.access.resume(intent, lease_now)
                            state = result.state
                        else:
                            intent = DeletionIntentDocument.model_validate(intent_snapshot.to_dict())
                            result = await self.deletions.resume_delete(job.device_id, intent, lease_now)
                            state = result.state
                        if state in {"confirmed", "pending_device", "ready", "acked", "finalized"}:
                            summary.completed += 1
                        else:
                            summary.failed += 1
                            await self.repository.checkpoint_job(
                                snapshot.id, owner, datetime.now(UTC),
                                lease_now + timedelta(seconds=min(900, 10 * 2 ** min(job.attempt, 6))),
                                state,
                            )
                    except (RepositoryConflict, JournalError, GoogleAPIError, AuthError, PaymentProviderError):
                        # Incidente de digest nunca é confirmado nem expurgado como sucesso.
                        summary.failed += 1
                        await self.repository.checkpoint_job(
                            snapshot.id, owner, datetime.now(UTC),
                            lease_now + timedelta(minutes=15), "finalization_failed",
                        )
        except TimeoutError:
            # Lease expira e próximo tick retoma; nunca manter trabalho após resposta.
            summary.timed_out = True
        return summary


def create_worker(settings: PortalSettings) -> PortalWorker:
    # Nenhum fallback automático para journal em memória, inclusive no CLI.
    journal = CloudStorageJournal(settings)
    tokens = AuthTokens.from_settings(settings)
    crypto = PortalCrypto.from_settings(settings)
    codes = RecoveryCodes.from_settings(settings)
    if not valid_token(settings.service_recovery_epoch):
        raise ValueError("recovery_epoch_required")
    repository = ControlRepository(create_firestore_client(settings))
    auth = AuthService(repository, tokens, public_origin=settings.public_origin,
                       recovery_epoch=settings.service_recovery_epoch)
    licensing = LicensingService(auth, crypto, journal)
    payments = None
    if settings.mercadopago_access_token and settings.mercadopago_merchant_id:
        provider = MercadoPagoProvider(settings.mercadopago_access_token, settings.public_origin,
                                       live_mode=settings.mercadopago_live_mode)
        payments = PaymentService(auth, licensing, provider, merchant_id=settings.mercadopago_merchant_id,
                                  live_mode=settings.mercadopago_live_mode,
                                  allow_test_live_mode=settings.mercadopago_allow_test_live_mode)
    return PortalWorker(repository, DeletionService(repository, journal),
                        AccessRotation(auth, crypto, codes, journal), RetentionService(repository), licensing, payments)


async def _once(settings: PortalSettings) -> int:
    worker = create_worker(settings)
    try:
        summary = await worker.run_once()
        print(json.dumps(asdict(summary)))
        return 1 if summary.failed or summary.timed_out else 0
    finally:
        worker.repository.client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Uma passagem limitada pelos jobs do portal")
    parser.add_argument("--once", action="store_true", required=True)
    parser.parse_args()
    try:
        return asyncio.run(_once(PortalSettings()))
    except Exception:  # noqa: BLE001 - CLI não imprime credenciais de SDK/settings
        print(json.dumps({"code": "worker_unavailable", "retryable": True}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
