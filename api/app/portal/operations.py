"""Exclusão write-ahead: fence durável → journal → expurgo limitado → confirmação."""

import hashlib
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from google.cloud.firestore_v1.base_query import FieldFilter

from app.portal.models import (
    DeletionIntentDocument,
    DeviceDocument,
    JobDocument,
    OperationDocument,
    ReceiptDocument,
    TombstoneDocument,
)
from app.portal.recovery_journal import JournalError, JournalEvent, JournalWriter
from app.portal.repositories.control import (
    ControlRepository,
    RepositoryConflict,
    TransactionPlan,
    document_path,
)


@dataclass(frozen=True)
class DeletionResult:
    deletion_id: str
    source_id: str
    state: Literal["pending_journal", "pending_cleanup", "pending_device", "confirmed"]

    @property
    def can_ack_tv(self) -> bool:
        return self.state == "confirmed"


class DeletionService:
    def __init__(self, repository: ControlRepository, journal: JournalWriter):
        self.repository = repository
        self.journal = journal

    @staticmethod
    def job_id(device_id: str, deletion_id: str) -> str:
        return "delete-" + hashlib.sha256(f"{device_id}/{deletion_id}".encode()).hexdigest()

    @staticmethod
    def _event(device_id: str, intent: DeletionIntentDocument) -> JournalEvent:
        return JournalEvent(
            event_id=intent.deletion_id, kind="source_deleted", device_id=device_id,
            source_id=intent.source_id, revision=intent.revision, occurred_at=intent.created_at,
        )

    async def request_delete(
        self, *, device_id: str, auth_epoch: int, deletion_id: str, source_id: str,
        revision: int, origin: Literal["tv", "portal"], now: datetime,
    ) -> DeletionResult:
        device_path = document_path("devices", device_id)
        intent_path = document_path("deletionIntents", deletion_id, device_id=device_id)
        tombstone_path = document_path("tombstones", source_id, device_id=device_id)
        job_path = document_path("jobs", self.job_id(device_id, deletion_id))
        operation_path = document_path("operations", deletion_id, device_id=device_id)

        def reserve(rows):
            if rows[device_path] is None:
                raise RepositoryConflict("unauthorized")
            device = DeviceDocument.model_validate(rows[device_path])
            if device.auth_epoch != auth_epoch or device.access_fence is not None:
                raise RepositoryConflict("unauthorized")
            previous_operation = rows[operation_path]
            if previous_operation and (
                previous_operation["action"] != "delete"
                or previous_operation["sourceId"] != source_id
            ):
                raise RepositoryConflict("idempotency_conflict")
            if rows[intent_path] is not None:
                existing = DeletionIntentDocument.model_validate(rows[intent_path])
                if (existing.source_id, existing.origin, existing.revision) != (
                    source_id, origin, revision
                ):
                    raise RepositoryConflict("idempotency_conflict")
                return TransactionPlan(existing)
            event = JournalEvent(
                event_id=deletion_id, kind="source_deleted", device_id=device_id,
                source_id=source_id, revision=revision, occurred_at=now,
            )
            intent = DeletionIntentDocument(
                deletion_id=deletion_id, source_id=source_id, origin=origin, revision=revision,
                state="pending_journal", created_at=now, journal_object_id=event.object_id,
                journal_digest=event.digest,
            )
            previous = rows[tombstone_path]
            tombstone = TombstoneDocument(
                deletion_id=deletion_id, source_id=source_id, origin=origin,
                last_known_revision=max(revision, previous["lastKnownRevision"] if previous else 0),
                deleted_at=now, journal_object_id=event.object_id,
            )
            job = JobDocument(kind="delete_finalize", dedupe_key=deletion_id,
                              device_id=device_id, next_due_at=now)
            return TransactionPlan(intent, {
                intent_path: intent, tombstone_path: tombstone, job_path: job,
            })

        intent = await self.repository.transact(
            (device_path, intent_path, tombstone_path, job_path, operation_path), reserve
        )
        return await self.resume_delete(device_id, intent, now)

    async def resume_delete(
        self, device_id: str, intent: DeletionIntentDocument, now: datetime,
    ) -> DeletionResult:
        intent_path = document_path("deletionIntents", intent.deletion_id, device_id=device_id)
        fence_path = document_path("tombstones", intent.source_id, device_id=device_id)

        def read_intent(rows):
            if rows[intent_path] is None or rows[fence_path] is None:
                raise RepositoryConflict("deletion_fence_missing")
            saved = DeletionIntentDocument.model_validate(rows[intent_path])
            if saved.journal_digest != intent.journal_digest:
                raise RepositoryConflict("invalid_journal_intent")
            return TransactionPlan(saved)

        intent = await self.repository.transact((intent_path, fence_path), read_intent)
        if intent.state != "pending_journal":
            return DeletionResult(intent.deletion_id, intent.source_id, intent.state)
        event = self._event(device_id, intent)
        if event.digest != intent.journal_digest or event.object_id != intent.journal_object_id:
            raise RepositoryConflict("invalid_journal_intent")
        try:
            await self.journal.append(event)
        except JournalError as error:
            if str(error) == "journal_digest_conflict":
                raise
            return DeletionResult(intent.deletion_id, intent.source_id, "pending_journal")
        if not await self._purge_versions_and_cancel(device_id, intent):
            return DeletionResult(intent.deletion_id, intent.source_id, "pending_cleanup")
        return await self._finalize(device_id, intent, now)

    async def purge_source(self, device_id: str, intent: DeletionIntentDocument) -> bool:
        """Expurgo idempotente de versões/comandos de fonte já tombstonada (replay de restore)."""
        return await self._purge_versions_and_cancel(device_id, intent)

    async def _purge_versions_and_cancel(
        self, device_id: str, intent: DeletionIntentDocument,
    ) -> bool:
        root = self.repository.client.collection("devices").document(device_id)
        versions = root.collection("configurationVersions").where(
            filter=FieldFilter("sourceId", "==", intent.source_id)
        )
        operations = root.collection("operations").where(
            filter=FieldFilter("sourceId", "==", intent.source_id)
        ).where(filter=FieldFilter("state", "in", ["pending", "received", "awaiting_confirmation"]))
        # Duas páginas por chamada; jobs retomam quando houver mais, sem loop residente.
        for _ in range(2):
            version_docs = [doc async for doc in versions.limit(30).stream()]
            operation_docs = []
            for action in ("create", "update"):
                query = operations.where(filter=FieldFilter("action", "==", action)).limit(5)
                operation_docs.extend([doc async for doc in query.stream()])
            if not version_docs and not operation_docs:
                return True
            fence_path = document_path("tombstones", intent.source_id, device_id=device_id)
            version_paths = tuple(doc.reference.path for doc in version_docs)
            operation_paths = tuple(doc.reference.path for doc in operation_docs)
            device_path = document_path("devices", device_id)

            def purge(
                rows, fence_path=fence_path, operation_paths=operation_paths,
                version_paths=version_paths, device_path=device_path,
            ):
                if rows[fence_path] is None:
                    raise RepositoryConflict("deletion_fence_missing")
                puts = {}
                released = 0
                for path in operation_paths:
                    if rows[path] is None:
                        continue
                    operation = OperationDocument.model_validate(rows[path])
                    if operation.state in {"pending", "received", "awaiting_confirmation"}:
                        released += int(operation.counted_pending)
                        puts[path] = operation.model_copy(update={"state": "cancelled", "counted_pending": False})
                if released:
                    device = DeviceDocument.model_validate(rows[device_path])
                    if device.pending_operation_count < released:
                        raise RepositoryConflict("pending_operation_underflow")
                    puts[device_path] = device.model_copy(update={"pending_operation_count": device.pending_operation_count - released})
                return TransactionPlan(None, puts, version_paths)

            await self.repository.transact((fence_path, device_path, *version_paths, *operation_paths), purge)
        remaining_versions = [doc async for doc in versions.limit(1).stream()]
        if remaining_versions:
            return False
        for action in ("create", "update"):
            if [doc async for doc in operations.where(
                filter=FieldFilter("action", "==", action)
            ).limit(1).stream()]:
                return False
        return True

    async def _finalize(
        self, device_id: str, intent: DeletionIntentDocument, now: datetime,
    ) -> DeletionResult:
        intent_path = document_path("deletionIntents", intent.deletion_id, device_id=device_id)
        fence_path = document_path("tombstones", intent.source_id, device_id=device_id)
        config_path = document_path("configurations", intent.source_id, device_id=device_id)
        operation_path = document_path("operations", intent.deletion_id, device_id=device_id)
        job_path = document_path("jobs", self.job_id(device_id, intent.deletion_id))
        device_path = document_path("devices", device_id)

        def finish(rows):
            saved = DeletionIntentDocument.model_validate(rows[intent_path])
            if saved.state != "pending_journal":
                return TransactionPlan(DeletionResult(saved.deletion_id, saved.source_id, saved.state))
            if rows[fence_path] is None or saved.journal_digest != intent.journal_digest:
                raise RepositoryConflict("deletion_fence_missing")
            device = DeviceDocument.model_validate(rows[device_path])
            state = "confirmed" if saved.origin == "tv" else "pending_device"
            finalized = saved.model_copy(update={
                "state": state, "confirmed_at": now if state == "confirmed" else None,
            })
            operation = OperationDocument(
                operation_id=saved.deletion_id, source_id=saved.source_id, action="delete",
                expected_revision=saved.revision, auth_epoch=device.auth_epoch,
                state="applied" if state == "confirmed" else "pending",
                idempotency_digest=saved.journal_digest, created_at=saved.created_at,
                receipt=ReceiptDocument(revision=saved.revision, state="applied")
                if state == "confirmed" else None,
            )
            tombstone = TombstoneDocument.model_validate(rows[fence_path])
            if state == "confirmed":
                tombstone = tombstone.model_copy(update={"confirmed_at": now})
            return TransactionPlan(DeletionResult(saved.deletion_id, saved.source_id, state),
                                   {intent_path: finalized, operation_path: operation,
                                    fence_path: tombstone},
                                   (config_path, job_path))

        return await self.repository.transact(
            (intent_path, fence_path, config_path, operation_path, job_path, device_path), finish
        )

    async def read_configuration(
        self, device_id: str, source_id: str, *, auth_epoch: int, recovery_epoch: str,
    ) -> dict | None:
        """Leitura interna de ciphertext; qualquer tombstone impede entrega/reenvio."""
        config = document_path("configurations", source_id, device_id=device_id)
        fence = document_path("tombstones", source_id, device_id=device_id)
        device = document_path("devices", device_id)

        def read(rows):
            if rows[device] is None:
                raise RepositoryConflict("unauthorized")
            principal = DeviceDocument.model_validate(rows[device])
            if (principal.auth_epoch != auth_epoch or principal.recovery_epoch != recovery_epoch
                    or principal.access_fence is not None):
                raise RepositoryConflict("unauthorized")
            return TransactionPlan(None if rows[fence] else rows[config])

        return await self.repository.transact(
            (device, config, fence), read
        )

    async def acknowledge_delete(
        self, *, device_id: str, auth_epoch: int, deletion_id: str, revision: int, now: datetime,
    ) -> bool:
        device_path = document_path("devices", device_id)
        intent_path = document_path("deletionIntents", deletion_id, device_id=device_id)
        operation_path = document_path("operations", deletion_id, device_id=device_id)
        intent_snapshot = await self.repository.client.document(intent_path).get()
        if not intent_snapshot.exists:
            raise RepositoryConflict("not_found")
        source_id = DeletionIntentDocument.model_validate(intent_snapshot.to_dict()).source_id
        fence_path = document_path("tombstones", source_id, device_id=device_id)

        def acknowledge(rows):
            device = DeviceDocument.model_validate(rows[device_path])
            if device.auth_epoch != auth_epoch or device.access_fence is not None:
                raise RepositoryConflict("unauthorized")
            intent = DeletionIntentDocument.model_validate(rows[intent_path])
            if intent.state not in {"pending_device", "confirmed"} or revision < intent.revision:
                raise RepositoryConflict("invalid_deletion_ack")
            if intent.state == "confirmed":
                return TransactionPlan(True)
            operation = OperationDocument.model_validate(rows[operation_path])
            tombstone = TombstoneDocument.model_validate(rows[fence_path])
            return TransactionPlan(True, {
                intent_path: intent.model_copy(update={"state": "confirmed", "confirmed_at": now}),
                fence_path: tombstone.model_copy(update={"confirmed_at": now}),
                operation_path: operation.model_copy(update={
                    "state": "applied", "receipt": ReceiptDocument(revision=revision, state="applied"),
                }),
            })

        return await self.repository.transact(
            (device_path, intent_path, operation_path, fence_path), acknowledge
        )
