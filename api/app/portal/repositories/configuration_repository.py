"""Reenvio explícito de corrente cifrada; snapshot fresco e tombstone obrigatórios."""

import hashlib
from datetime import datetime, timedelta

from app.portal.auth import AuthError, Principal
from app.portal.configuration_input import ConfigurationPatch
from app.portal.configurations import ConfigurationService, request_time
from app.portal.crypto import canonical_json
from app.portal.models import IdempotencyClaimDocument, OperationDocument, SnapshotDocument
from app.portal.repositories.control import TransactionPlan, document_path


class ConfigurationRepository:
    def __init__(self, service: ConfigurationService):
        self.service = service

    async def resend(self, principal: Principal, *, source_id: str, operation_id: str,
                     expected_revision: int, now: datetime) -> OperationDocument:
        request_time(operation_id, now)
        device_path = document_path("devices", principal.device_id)
        snapshot_path = document_path("snapshot", "current", device_id=principal.device_id)
        fence_path = document_path("tombstones", source_id, device_id=principal.device_id)
        operation_path = document_path("operations", operation_id, device_id=principal.device_id)
        claim_id = hashlib.sha256(("operations/" + operation_id).encode()).hexdigest()
        claim_path = document_path("idempotencyClaims", claim_id, device_id=principal.device_id)
        digest = hashlib.sha256(canonical_json({"action": "resend", "sourceId": source_id,
            "expectedRevision": expected_revision, "input": {}})).hexdigest()

        def prepare(rows):
            self.service.auth._same_principal(rows[device_path], principal)
            # Replay antes de derivar action de um snapshot que pode ter mudado após aplicar.
            if rows[claim_path]:
                claim = IdempotencyClaimDocument.model_validate(rows[claim_path])
                if claim.digest != digest or claim.operation_id != operation_id or rows[operation_path] is None:
                    raise AuthError("try_again", 409)
                return TransactionPlan(OperationDocument.model_validate(rows[operation_path]))
            if rows[fence_path] or rows[snapshot_path] is None:
                raise AuthError("try_again", 409)
            snapshot = SnapshotDocument.model_validate(rows[snapshot_path])
            if (snapshot.auth_epoch != principal.auth_epoch or snapshot.recovery_epoch != principal.recovery_epoch
                    or now - snapshot.received_at >= timedelta(hours=24)):
                raise AuthError("try_again", 409)
            revision = next((item.revision for item in snapshot.revisions if item.source_id == source_id), 0)
            if revision != expected_revision:
                raise AuthError("try_again", 409)
            return TransactionPlan("update" if any(item.id == source_id for item in snapshot.sources) else "create")

        result = await self.service.repository.transact(
            (device_path, snapshot_path, fence_path, operation_path, claim_path), prepare,
        )
        if isinstance(result, OperationDocument):
            return result
        return await self.service.submit(principal, operation_id=operation_id, source_id=source_id,
            action=result, expected_revision=expected_revision, patch=ConfigurationPatch(), now=now, resend=True)
