"""Expurgo paginado com releitura CAS; validade lógica nunca depende deste executor."""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta

from google.cloud.firestore_v1.field_path import FieldPath

from app.portal.models import (
    AccessIntentDocument,
    ConfigurationDocument,
    ConfigurationVersionDocument,
    DeviceDocument,
    InviteDocument,
    IssuanceDocument,
    JobDocument,
    OperationDocument,
    RateLimitDocument,
    RecoveryClaimDocument,
    RecoveryCodeDocument,
    SessionDocument,
)
from app.portal.repositories.control import ControlRepository, RepositoryConflict, TransactionPlan

GROUPS = ("invites", "sessions", "rateLimits", "recoveryClaims", "recoveryResults",
          "accessIntents", "recoveryCodes", "operations", "configurationVersions")


@dataclass(frozen=True)
class RetentionPage:
    scanned: int
    changed: int
    checkpoint: str | None
    cycle_complete: bool


class RetentionService:
    def __init__(self, repository: ControlRepository):
        self.repository = repository

    async def ensure_job(self, now: datetime):
        path = "jobs/retention-global"
        def reserve(rows):
            if rows[path] is not None:
                return TransactionPlan(None)
            return TransactionPlan(None, {path: JobDocument(kind="retention", dedupe_key="global",
                                                           next_due_at=now)})
        await self.repository.transact((path,), reserve)

    async def page(self, checkpoint: str | None, now: datetime) -> RetentionPage:
        phase, after = 0, None
        if checkpoint is not None:
            try:
                value = json.loads(checkpoint)
                phase, after = value["phase"], value["after"]
                if type(phase) is not int or not 0 <= phase < len(GROUPS):
                    raise ValueError
                if after is not None:
                    parts = after.split("/")
                    if len(parts) not in {2, 4} or parts[-2] != GROUPS[phase]:
                        raise ValueError
            except (ValueError, TypeError, KeyError, AttributeError):
                raise RepositoryConflict("invalid_retention_checkpoint") from None
        group = GROUPS[phase]
        query = self.repository.client.collection_group(group).order_by(FieldPath.document_id())
        if after is not None:
            query = query.start_after({"__name__": self.repository.client.document(after)})
        documents = [doc async for doc in query.limit(20).stream(timeout=5, retry=None)]
        changed = 0
        for snapshot in documents:
            changed += await self.expire(snapshot.reference.path, now)
        if len(documents) == 20:
            next_checkpoint = json.dumps({"phase": phase, "after": documents[-1].reference.path})
        elif phase + 1 < len(GROUPS):
            next_checkpoint = json.dumps({"phase": phase + 1, "after": None})
        else:
            next_checkpoint = None
        return RetentionPage(len(documents), changed, next_checkpoint, next_checkpoint is None)

    async def expire(self, path: str, now: datetime) -> bool:
        parts = path.split("/")
        group = parts[-2]
        if group not in GROUPS:
            raise RepositoryConflict("invalid_retention_group")
        snapshot = await self.repository.client.document(path).get(timeout=5, retry=None)
        if not snapshot.exists:
            return False
        preliminary = snapshot.to_dict()
        extra = []
        if group == "recoveryCodes":
            code = RecoveryCodeDocument.model_validate(preliminary)
            if code.status == "active":
                return False
            if not code.consumed_by_operation_id:
                raise RepositoryConflict("recovery_consumption_missing")
            extra = [f"devices/{code.device_id}",
                     f"devices/{code.device_id}/accessIntents/{code.consumed_by_operation_id}"]
        elif group in {"operations", "configurationVersions"}:
            if len(parts) != 4 or parts[0] != "devices":
                raise RepositoryConflict("invalid_retention_path")
            extra = [f"devices/{parts[1]}/configurations/{preliminary['sourceId']}"]
            if group == "operations" and preliminary.get("configVersion"):
                extra.append(f"devices/{parts[1]}/configurationVersions/{preliminary['configVersion']}")

        device_path = f"devices/{parts[1]}" if group == "operations" else None
        if device_path is not None:
            extra.append(device_path)

        def expire(rows):
            row = rows[path]
            if row is None:
                return TransactionPlan(False)
            if group == "invites":
                item = InviteDocument.model_validate(row)
                if item.expires_at <= now:
                    return TransactionPlan(True, deletes=(path,))
            elif group == "sessions":
                item = SessionDocument.model_validate(row)
                if (item.created_at + timedelta(minutes=5 if item.purpose == "recover" else 480) <= now
                        or item.last_seen_at + timedelta(minutes=30) <= now):
                    return TransactionPlan(True, deletes=(path,))
            elif group == "rateLimits":
                if RateLimitDocument.model_validate(row).expires_at <= now:
                    return TransactionPlan(True, deletes=(path,))
            elif group == "recoveryClaims":
                item = RecoveryClaimDocument.model_validate(row)
                if item.created_at + timedelta(days=30) <= now:
                    return TransactionPlan(True, deletes=(path,))
                if item.expires_at <= now and item.bootstrap_envelope is not None:
                    return TransactionPlan(True, {path: item.model_copy(update={"bootstrap_envelope": None})})
            elif group == "recoveryResults":
                item = IssuanceDocument.model_validate(row)
                if item.created_at + timedelta(days=30) <= now:
                    return TransactionPlan(True, deletes=(path,))
                if item.expires_at <= now and item.envelope is not None:
                    return TransactionPlan(True, {path: item.model_copy(update={"state": "expired", "envelope": None})})
            elif group == "accessIntents":
                item = AccessIntentDocument.model_validate(row)
                if item.expires_at <= now and item.envelope is not None:
                    return TransactionPlan(True, {path: item.model_copy(update={"envelope": None, "envelope_expired": True})})
            elif group == "recoveryCodes":
                item = RecoveryCodeDocument.model_validate(row)
                if (item.status != "consumed" or item.device_id != code.device_id
                        or item.consumed_by_operation_id != code.consumed_by_operation_id):
                    return TransactionPlan(False)
                device = DeviceDocument.model_validate(rows[extra[0]])
                intent = AccessIntentDocument.model_validate(rows[extra[1]]) if rows[extra[1]] else None
                if (intent is not None and intent.resume_until <= now
                        and device.recovery_code_hmac != parts[-1]):
                    return TransactionPlan(True, deletes=(path,))
            elif group == "operations":
                item = OperationDocument.model_validate(row)
                if item.source_id != preliminary["sourceId"] or item.config_version != preliminary.get("configVersion"):
                    raise RepositoryConflict("immutable_operation_changed")
                # Delete e recibos/digests não são apagados por este sweep. Compactação
                # idempotente de terminais será integrada ao repositório de configurações.
                if (item.action != "delete" and item.state in {"pending", "received", "awaiting_confirmation"}
                        and item.expires_at <= now):
                    version_path = f"devices/{parts[1]}/configurationVersions/{item.config_version}"
                    version = ConfigurationVersionDocument.model_validate(rows[version_path]) if rows[version_path] else None
                    puts = {path: item.model_copy(update={"state": "expired", "counted_pending": False, "lease_owner": None, "lease_until": None})}
                    current = ConfigurationDocument.model_validate(rows[extra[0]]) if rows[extra[0]] else None
                    if current is not None and current.active_operation_id == item.operation_id:
                        puts[extra[0]] = current.model_copy(update={"active_operation_id": None})
                    if item.counted_pending:
                        device = DeviceDocument.model_validate(rows[device_path])
                        if device.pending_operation_count < 1:
                            raise RepositoryConflict("pending_operation_underflow")
                        puts[device_path] = device.model_copy(update={"pending_operation_count": device.pending_operation_count - 1})
                    if version is not None:
                        if version.reference_count < 1:
                            raise RepositoryConflict("configuration_reference_underflow")
                        puts[version_path] = version.model_copy(update={"reference_count": version.reference_count - 1})
                    return TransactionPlan(True, puts)
            elif group == "configurationVersions":
                item = ConfigurationVersionDocument.model_validate(row)
                current = ConfigurationDocument.model_validate(rows[extra[0]]) if rows[extra[0]] else None
                if item.reference_count == 0 and (current is None or current.config_version != item.config_version):
                    return TransactionPlan(True, deletes=(path,))
            return TransactionPlan(False)

        return await self.repository.transact(tuple(dict.fromkeys((path, *extra))), expire)
