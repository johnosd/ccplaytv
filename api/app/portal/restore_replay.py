"""Replay do journal sobre uma base restaurada e ISOLADA, antes de qualquer tráfego (T039, logic §7).

Aplica só intenções já autorizadas e duráveis no journal: exclusões de fonte, revogações de acesso
(floor de `authEpoch`/`recoveryCodeVersion` e verificador do código corrente) e revogações de licença.
Nunca recria configuração, nunca reativa código revogado e nunca grava segredo: o journal não os tem.
É idempotente: repetir o replay só produz `already_applied`.
"""

import argparse
import asyncio
import json
import secrets
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.portal.commercial_models import GrantDocument
from app.portal.firestore import create_firestore_client
from app.portal.models import (
    DeletionIntentDocument,
    DeviceDocument,
    JobDocument,
    RecoveryCodeDocument,
    TombstoneDocument,
)
from app.portal.operations import DeletionService
from app.portal.recovery_journal import JournalError, JournalEvent
from app.portal.repositories.control import ControlRepository, TransactionPlan, document_path
from app.portal.restore_journal import CloudStorageJournalReader, load_events
from app.portal.settings import PortalSettings


@dataclass
class ReplayReport:
    """Contagens e resultados por evento; nunca carrega segredo, ID exibido nem configuração."""
    counts: Counter = field(default_factory=Counter)
    results: list[tuple[str, str, str]] = field(default_factory=list)  # (event_id, kind, outcome)

    def add(self, event: JournalEvent, outcome: str) -> None:
        self.counts[outcome] += 1
        self.results.append((event.event_id, event.kind, outcome))

    @property
    def complete(self) -> bool:
        """Reabrir tráfego exige todos os eventos aplicados ou comprovadamente sem alvo."""
        return not (self.counts["verifier_missing_blocked"] or self.counts["fence_pending"])


class _DurableJournal:
    """O evento já está no journal: confirma a posse do objeto em vez de escrever de novo."""

    def __init__(self) -> None:
        self.confirmed: set[str] = set()

    async def append(self, event: JournalEvent) -> str:
        if event.object_id not in self.confirmed:
            raise JournalError("journal_unavailable")
        return event.object_id


class RestoreReplay:
    def __init__(self, repository: ControlRepository):
        self.repository = repository
        self._journal = _DurableJournal()
        self.deletions = DeletionService(repository, self._journal)

    async def apply(self, events: Iterable[JournalEvent], now: datetime) -> ReplayReport:
        ordered = sorted(events, key=lambda event: (event.occurred_at, event.kind, event.event_id))
        report = ReplayReport()
        for event in ordered:
            handler = {"source_deleted": self._source_deleted, "access_revoked": self._access_revoked,
                       "license_revoked": self._license_revoked}[event.kind]
            report.add(event, await handler(event, now))
        return report

    async def _source_deleted(self, event: JournalEvent, now: datetime) -> str:
        device_id, source_id = event.device_id, event.source_id
        device_path = document_path("devices", device_id)
        intent_path = document_path("deletionIntents", event.event_id, device_id=device_id)
        fence_path = document_path("tombstones", source_id, device_id=device_id)
        job_path = document_path("jobs", DeletionService.job_id(device_id, event.event_id))
        config_path = document_path("configurations", source_id, device_id=device_id)

        def reserve(rows):
            if rows[device_path] is None:
                return TransactionPlan(("device_absent", None))
            if rows[intent_path] is not None:
                intent = DeletionIntentDocument.model_validate(rows[intent_path])
                if intent.journal_digest != event.digest:
                    raise JournalError("journal_digest_conflict")
                return TransactionPlan(("present", intent))
            intent = DeletionIntentDocument(
                deletion_id=event.event_id, source_id=source_id, origin="portal",
                revision=event.revision, state="pending_journal", created_at=event.occurred_at,
                journal_object_id=event.object_id, journal_digest=event.digest)
            puts = {intent_path: intent, job_path: JobDocument(
                kind="delete_finalize", dedupe_key=event.event_id, device_id=device_id, next_due_at=now)}
            previous = rows[fence_path]
            if previous is None:
                puts[fence_path] = TombstoneDocument(
                    deletion_id=event.event_id, source_id=source_id, origin="portal",
                    last_known_revision=event.revision, deleted_at=event.occurred_at,
                    journal_object_id=event.object_id)
            else:
                old = TombstoneDocument.model_validate(previous)
                if event.revision > old.last_known_revision:
                    puts[fence_path] = old.model_copy(update={"last_known_revision": event.revision})
            return TransactionPlan(("created", intent), puts)

        state, intent = await self.repository.transact(
            (device_path, intent_path, fence_path, job_path), reserve)
        if state == "device_absent":
            return "device_absent"
        self._journal.confirmed.add(event.object_id)
        changed = state == "created"
        if intent.state == "pending_journal":
            await self.deletions.resume_delete(device_id, intent, now)
            changed = True
        # Configuração restaurada de um backup anterior à exclusão: tem que sumir, nunca ser reentregue.
        if (await self.repository.client.document(config_path).get()).exists:
            await self.deletions.purge_source(device_id, intent)

            def drop(rows):
                if rows[fence_path] is None:
                    raise JournalError("deletion_fence_missing")
                return TransactionPlan(None, deletes=(config_path,))

            await self.repository.transact((fence_path, config_path), drop)
            changed = True
        return "applied" if changed else "already_applied"

    async def _access_revoked(self, event: JournalEvent, now: datetime) -> str:
        device_path = document_path("devices", event.device_id)
        snapshot = (await self.repository.client.document(device_path).get()).to_dict()
        if snapshot is None:
            return "device_absent"
        previous_hmac = snapshot.get("recoveryCodeHmac")
        new_path = (document_path("recoveryCodes", event.recovery_code_hmac)
                    if event.recovery_code_hmac else None)
        old_path = (document_path("recoveryCodes", previous_hmac)
                    if previous_hmac and previous_hmac != event.recovery_code_hmac else None)
        paths = (device_path, *(path for path in (new_path, old_path) if path))
        target_version = event.recovery_code_version or 0

        def apply(rows):
            if rows[device_path] is None:
                return TransactionPlan("device_absent")
            device = DeviceDocument.model_validate(rows[device_path])
            if device.recovery_code_hmac != previous_hmac:
                raise JournalError("replay_contention")
            newer_epoch = event.epoch > device.auth_epoch
            newer_code = target_version > device.recovery_code_version
            if not newer_epoch and not newer_code:
                return TransactionPlan("already_applied")
            update, puts, outcome = {}, {}, "applied"
            if newer_epoch:
                # O journal não guarda as credenciais novas; as antigas foram revogadas. Trocar os hashes por
                # valores que ninguém possui impede reativá-las até o fluxo de recuperação emitir novas.
                update.update(auth_epoch=event.epoch, tv_bearer_hash=secrets.token_hex(32),
                              device_key_hash=secrets.token_hex(32))
            if newer_code:
                update["recovery_code_version"] = target_version
                if event.recovery_code_hmac is not None:
                    update.update(recovery_code_hmac=event.recovery_code_hmac,
                                  recovery_hash_key_version=event.hash_key_version)
                    if rows[new_path] is None:
                        puts[new_path] = RecoveryCodeDocument(
                            device_id=device.device_id, version=target_version,
                            hash_key_version=event.hash_key_version, created_at=event.occurred_at)
                else:
                    update.update(recovery_code_hmac=None, recovery_hash_key_version=None)
                    outcome = "verifier_missing_blocked"
                if old_path is not None and rows[old_path] is not None:
                    old = RecoveryCodeDocument.model_validate(rows[old_path])
                    if old.status == "active":
                        puts[old_path] = old.model_copy(update={
                            "status": "consumed",
                            "consumed_by_operation_id": event.operation_id or event.event_id})
            if device.access_fence is not None and outcome == "applied":
                outcome = "fence_pending"
            puts[device_path] = device.model_copy(update=update)
            return TransactionPlan(outcome, puts)

        return await self.repository.transact(paths, apply)

    async def _license_revoked(self, event: JournalEvent, now: datetime) -> str:
        device_path = document_path("devices", event.device_id)
        grant_path = document_path("grants", event.reference_id)

        def apply(rows):
            if rows[device_path] is None:
                return TransactionPlan("device_absent")
            device = DeviceDocument.model_validate(rows[device_path])
            puts = {}
            if event.generation > device.entitlement_generation:
                puts[device_path] = device.model_copy(update={"entitlement_generation": event.generation})
            if rows[grant_path] is not None:
                grant = GrantDocument.model_validate(rows[grant_path])
                if grant.device_id == device.device_id and grant.status == "valid":
                    # Causa exata (estorno/chargeback) é reconciliada com o provedor antes do tráfego.
                    puts[grant_path] = grant.model_copy(update={"status": "refunded"})
            return TransactionPlan("applied" if puts else "already_applied", puts)

        return await self.repository.transact((device_path, grant_path), apply)

async def _run(settings: PortalSettings, apply: bool) -> int:
    events = load_events(CloudStorageJournalReader(settings).objects())
    if not apply:
        print(json.dumps({"events": dict(Counter(event.kind for event in events)), "executes": False}))
        return 0
    client = create_firestore_client(settings)
    try:
        report = await RestoreReplay(ControlRepository(client)).apply(events, datetime.now(UTC))
    finally:
        client.close()
    print(json.dumps({"counts": dict(report.counts), "complete": report.complete}))
    return 0 if report.complete else 2


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Replay do journal numa base restaurada e isolada (dry-run por padrão)")
    parser.add_argument("--apply", action="store_true")
    options = parser.parse_args()
    try:
        return asyncio.run(_run(PortalSettings(), options.apply))
    except Exception:  # noqa: BLE001 - o CLI não imprime credenciais de SDK/settings
        print(json.dumps({"code": "restore_replay_unavailable", "retryable": True}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
