"""Controle permanente cifrado; callbacks CAS não fazem crypto, query ou rede."""

import hashlib
import json
import re
from datetime import datetime, timedelta

from google.cloud.firestore_v1.base_query import FieldFilter

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.auth_tokens import new_token
from app.portal.configuration_input import ConfigurationPatch, merge_configuration
from app.portal.crypto import CipherContext, PortalCrypto, canonical_json
from app.portal.models import (
    ConfigurationDocument,
    ConfigurationVersionDocument,
    IdempotencyClaimDocument,
    OperationDocument,
    ReceiptDocument,
    SnapshotDocument,
)
from app.portal.repositories.control import TransactionPlan, document_path
from app.portal.retention import RetentionService

PENDING = {"pending", "received", "awaiting_confirmation"}


def operation_view(item: OperationDocument) -> dict:
    return {"operationId": item.operation_id, "sourceId": item.source_id,
            "action": "source." + item.action, "expectedRevision": item.expected_revision,
            "configVersion": item.config_version, "state": item.state,
            "importState": item.import_state, "createdAt": item.created_at.isoformat(),
            "expiresAt": item.expires_at.isoformat() if item.expires_at else None,
            "receipt": item.receipt.model_dump(by_alias=True) if item.receipt else None}


def request_time(operation_id: str, now: datetime):
    match = re.fullmatch(r"op-([0-9]{13})-([A-Za-z0-9_-]{43})", operation_id)
    if match is None:
        raise AuthError("invalid_input", 422)
    milliseconds = int(match.group(1))
    if not now.timestamp() * 1000 - 7 * 86400000 <= milliseconds <= now.timestamp() * 1000 + 60000:
        raise AuthError("try_again", 409)


class ConfigurationService:
    def __init__(self, auth: AuthService, crypto: PortalCrypto):
        self.auth, self.crypto, self.repository = auth, crypto, auth.repository
        self.retention = RetentionService(self.repository)

    @staticmethod
    def context(device_id: str, source_id: str, version: str):
        return CipherContext(device_id, source_id, version)

    @staticmethod
    def base_revision(snapshot: dict | None, config: ConfigurationDocument | None,
                      source_id: str, principal: Principal) -> int:
        if snapshot is not None:
            saved = SnapshotDocument.model_validate(snapshot)
            if saved.auth_epoch == principal.auth_epoch and saved.recovery_epoch == principal.recovery_epoch:
                return next((item.revision for item in saved.revisions if item.source_id == source_id), 0)
        return config.applied_revision if config and config.applied_revision is not None else 0

    async def expire_pending(self, device_id: str, now: datetime):
        query = self.repository.client.collection("devices").document(device_id).collection("operations").where(
            filter=FieldFilter("state", "in", sorted(PENDING))
        ).where(filter=FieldFilter("action", "in", ["create", "update"])).limit(5)
        for snapshot in [doc async for doc in query.stream(timeout=5, retry=None)]:
            item = OperationDocument.model_validate(snapshot.to_dict())
            if item.action != "delete" and item.expires_at <= now:
                await self.retention.expire(snapshot.reference.path, now)

    async def submit(self, principal: Principal, *, operation_id: str, source_id: str,
                     action: str, expected_revision: int, patch: ConfigurationPatch,
                     now: datetime, resend: bool = False) -> OperationDocument:
        if action not in {"create", "update"} or type(expected_revision) is not int or expected_revision < 0:
            raise AuthError("invalid_input", 422)
        # Digest do pedido original, antes de merge com segredo guardado.
        digest = hashlib.sha256(canonical_json({"action": "resend" if resend else action, "sourceId": source_id,
            "expectedRevision": expected_revision, "input": patch.private_values()})).hexdigest()
        request_time(operation_id, now)
        await self.expire_pending(principal.device_id, now)
        device_path = document_path("devices", principal.device_id)
        config_path = document_path("configurations", source_id, device_id=principal.device_id)
        snapshot_path = document_path("snapshot", "current", device_id=principal.device_id)
        fence_path = document_path("tombstones", source_id, device_id=principal.device_id)
        operation_path = document_path("operations", operation_id, device_id=principal.device_id)
        claim_id = hashlib.sha256(("operations/" + operation_id).encode()).hexdigest()
        claim_path = document_path("idempotencyClaims", claim_id, device_id=principal.device_id)
        def replay(rows):
            self.auth._same_principal(rows[device_path], principal)
            if rows[claim_path] is None:
                return TransactionPlan(None)
            saved = IdempotencyClaimDocument.model_validate(rows[claim_path])
            if saved.digest != digest or saved.operation_id != operation_id or rows[operation_path] is None:
                raise AuthError("try_again", 409)
            return TransactionPlan(OperationDocument.model_validate(rows[operation_path]))

        existing = await self.repository.transact((device_path, claim_path, operation_path), replay)
        if existing is not None:
            return existing
        first = await self.repository.client.document(config_path).get(timeout=5, retry=None)
        previous = ConfigurationDocument.model_validate(first.to_dict()) if first.exists else None
        if resend and previous is None:
            raise AuthError("try_again", 404)
        private = json.loads(self.crypto.decrypt(previous.envelope, self.context(
            principal.device_id, source_id, previous.config_version,
        ))) if previous else None
        merged = merge_configuration(private, patch, action)
        version_id = new_token()
        envelope = self.crypto.encrypt(canonical_json(merged), self.context(principal.device_id, source_id, version_id))
        version_path = document_path("configurationVersions", version_id, device_id=principal.device_id)
        old_version_path = document_path("configurationVersions", previous.config_version,
                                         device_id=principal.device_id) if previous else None
        operation = OperationDocument(operation_id=operation_id, source_id=source_id, action=action,
            expected_revision=expected_revision, config_version=version_id, auth_epoch=principal.auth_epoch,
            idempotency_digest=digest, counted_pending=True, created_at=now, expires_at=now + timedelta(days=7))
        config = ConfigurationDocument(source_id=source_id, type=merged["type"],
            display_name=merged["displayName"], config_version=version_id, active_operation_id=operation_id,
            expected_revision=expected_revision, applied_revision=previous.applied_revision if previous else None,
            envelope=envelope, created_at=previous.created_at if previous else now, updated_at=now)
        version = ConfigurationVersionDocument(source_id=source_id, config_version=version_id,
            envelope=envelope, reference_count=1, created_at=now)
        claim = IdempotencyClaimDocument(operation_id=operation_id, digest=digest, created_at=now)

        def reserve(rows):
            device = self.auth._same_principal(rows[device_path], principal)
            if rows[claim_path]:
                saved = IdempotencyClaimDocument.model_validate(rows[claim_path])
                if saved.digest != digest or saved.operation_id != operation_id or rows[operation_path] is None:
                    raise AuthError("try_again", 409)
                return TransactionPlan(OperationDocument.model_validate(rows[operation_path]))
            if rows[fence_path] is not None:
                raise AuthError("try_again", 410)
            current = ConfigurationDocument.model_validate(rows[config_path]) if rows[config_path] else None
            if (current != previous or current is not None and current.active_operation_id is not None
                    or action == "create" and current is not None and not resend or rows[operation_path] or rows[version_path]
                    or device.pending_operation_count >= 5
                    or expected_revision != self.base_revision(rows[snapshot_path], current, source_id, principal)):
                raise AuthError("try_again", 409)
            if resend:
                snapshot = SnapshotDocument.model_validate(rows[snapshot_path]) if rows[snapshot_path] else None
                if (snapshot is None or snapshot.auth_epoch != principal.auth_epoch
                        or snapshot.recovery_epoch != principal.recovery_epoch
                        or now - snapshot.received_at >= timedelta(hours=24)
                        or (action == "update") != any(item.id == source_id for item in snapshot.sources)):
                    raise AuthError("try_again", 409)
            deletes = ()
            if old_version_path and rows[old_version_path]:
                old = ConfigurationVersionDocument.model_validate(rows[old_version_path])
                if old.reference_count == 0:
                    deletes = (old_version_path,)
            return TransactionPlan(operation, {device_path: device.model_copy(update={
                "pending_operation_count": device.pending_operation_count + 1}),
                config_path: config, version_path: version, operation_path: operation, claim_path: claim}, deletes)

        paths = (device_path, config_path, snapshot_path, fence_path, operation_path, claim_path, version_path)
        if old_version_path:
            paths += (old_version_path,)
        return await self.repository.transact(paths, reserve)

    async def save_snapshot(self, principal: Principal, snapshot: SnapshotDocument) -> SnapshotDocument:
        device_path = document_path("devices", principal.device_id)
        path = document_path("snapshot", "current", device_id=principal.device_id)
        if snapshot.auth_epoch != principal.auth_epoch or snapshot.recovery_epoch != principal.recovery_epoch:
            raise AuthError()
        def save(rows):
            self.auth._same_principal(rows[device_path], principal)
            previous = SnapshotDocument.model_validate(rows[path]) if rows[path] else None
            if previous and previous.auth_epoch == principal.auth_epoch and previous.recovery_epoch == principal.recovery_epoch:
                if previous.captured_at > snapshot.captured_at:
                    raise AuthError("try_again", 409)
                if previous.captured_at == snapshot.captured_at:
                    if (previous.sources != snapshot.sources or previous.revisions != snapshot.revisions
                            or previous.imports != snapshot.imports or previous.integrations != snapshot.integrations):
                        raise AuthError("try_again", 409)
                    return TransactionPlan(previous)
            updated = snapshot.model_copy(update={"snapshot_revision": (previous.snapshot_revision if previous else 0) + 1})
            return TransactionPlan(updated, {path: updated})
        return await self.repository.transact((device_path, path), save)

    async def transition(self, principal: Principal, operation_id: str, *, state: str,
                         revision: int | None, import_state: str | None, now: datetime) -> OperationDocument:
        if state not in {"applied", "conflict", "awaiting_confirmation", "error", "cancelled"}:
            raise AuthError("invalid_input", 422)
        if import_state is not None and import_state not in {"queued", "running", "completed", "error"}:
            raise AuthError("invalid_input", 422)
        device_path = document_path("devices", principal.device_id)
        operation_path = document_path("operations", operation_id, device_id=principal.device_id)
        snapshot = await self.repository.client.document(operation_path).get(timeout=5, retry=None)
        if not snapshot.exists:
            raise AuthError("try_again", 404)
        preliminary = OperationDocument.model_validate(snapshot.to_dict())
        if preliminary.action == "delete":
            raise AuthError("invalid_input", 422)
        config_path = document_path("configurations", preliminary.source_id, device_id=principal.device_id)
        version_path = document_path("configurationVersions", preliminary.config_version, device_id=principal.device_id)
        fence_path = document_path("tombstones", preliminary.source_id, device_id=principal.device_id)

        def transition(rows):
            device = self.auth._same_principal(rows[device_path], principal)
            if rows[operation_path] is None:
                raise AuthError("try_again", 404)
            item = OperationDocument.model_validate(rows[operation_path])
            if (item.auth_epoch != principal.auth_epoch and state != "cancelled" or item.source_id != preliminary.source_id
                    or item.config_version != preliminary.config_version):
                raise AuthError("try_again", 409)
            if item.state not in PENDING:
                # ACK de importação pode atualizar só o estado do mesmo comando aplicado.
                if item.state == "applied" and state == "applied" and import_state is not None and not rows[fence_path]:
                    if item.receipt is None or item.receipt.revision != revision:
                        raise AuthError("try_again", 409)
                    if (item.import_state in {"completed", "error"} and import_state != item.import_state
                            or item.import_state == "running" and import_state == "queued"):
                        return TransactionPlan(item)
                    updated = item.model_copy(update={"import_state": import_state})
                    return TransactionPlan(updated, {operation_path: updated})
                return TransactionPlan(item)
            if (item.auth_epoch != principal.auth_epoch and state != "cancelled") or rows[fence_path] is not None:
                raise AuthError("try_again", 409)
            if item.expires_at <= now:
                raise AuthError("try_again", 409)
            if state != "cancelled" and (type(revision) is not int or revision < item.expected_revision):
                raise AuthError("invalid_input", 422)
            if state == "applied" and revision != item.expected_revision + 1:
                raise AuthError("try_again", 409)
            if import_state is not None and import_state not in {"queued", "running", "completed", "error"}:
                raise AuthError("invalid_input", 422)
            terminal = state != "awaiting_confirmation"
            updated = item.model_copy(update={"state": state, "counted_pending": False if terminal else item.counted_pending,
                "receipt": ReceiptDocument(revision=revision, state=state) if state != "cancelled" else None,
                "import_state": import_state, "lease_owner": None, "lease_until": None})
            puts = {operation_path: updated}
            current = ConfigurationDocument.model_validate(rows[config_path]) if rows[config_path] else None
            if state == "applied" and current:
                puts[config_path] = current.model_copy(update={"applied_revision": revision,
                    "active_operation_id": None if current.active_operation_id == item.operation_id else current.active_operation_id})
            elif terminal and current and current.active_operation_id == item.operation_id:
                puts[config_path] = current.model_copy(update={"active_operation_id": None})
            if terminal:
                if item.counted_pending:
                    if device.pending_operation_count < 1:
                        raise AuthError("service_unavailable", 503)
                    puts[device_path] = device.model_copy(update={"pending_operation_count": device.pending_operation_count - 1})
                version = ConfigurationVersionDocument.model_validate(rows[version_path]) if rows[version_path] else None
                if version is not None:
                    if version.reference_count < 1:
                        raise AuthError("service_unavailable", 503)
                    puts[version_path] = version.model_copy(update={"reference_count": version.reference_count - 1})
            return TransactionPlan(updated, puts)
        return await self.repository.transact((device_path, operation_path, config_path, version_path, fence_path), transition)
