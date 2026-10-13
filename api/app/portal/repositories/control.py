"""Transações com conjunto explícito de leituras e decisões síncronas repetíveis."""

import asyncio
import copy
import random
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from google.api_core.exceptions import Aborted
from google.cloud.firestore_v1 import AsyncClient, async_transactional

from app.portal.commercial_models import OrderClaimDocument, OrderDocument, PaymentClaimDocument
from app.portal.models import (
    ConfigurationVersionDocument,
    DeviceDocument,
    DisplayIdClaimDocument,
    IdempotencyClaimDocument,
    IdentityClaimDocument,
    JobDocument,
    PortalDocument,
)


class RepositoryConflict(ValueError):
    pass


def document_path(collection: str, document_id: str, *, device_id: str | None = None) -> str:
    root = {"devices", "identityClaims", "displayIdClaims", "invites", "sessions", "jobs", "recoveryCodes",
            "recoveryClaims", "recoveryResults", "rateLimits", "settings",
            "orders", "orderClaims", "paymentClaims", "paymentEvents", "grants"}
    nested = {"configurations", "configurationVersions", "operations", "tombstones",
              "deletionIntents", "accessIntents", "snapshot", "idempotencyClaims", "licensing", "licenseIntents"}
    for value in (document_id, device_id):
        if value is not None and not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
            raise RepositoryConflict("invalid_document_id")
    if device_id is None and collection in root:
        return f"{collection}/{document_id}"
    if device_id is not None and collection in nested:
        return f"devices/{device_id}/{collection}/{document_id}"
    raise RepositoryConflict("invalid_collection")


@dataclass(repr=False)
class TransactionPlan:
    result: Any
    puts: dict[str, PortalDocument] = field(default_factory=dict)
    deletes: tuple[str, ...] = ()


class ControlRepository:
    def __init__(self, client: AsyncClient):
        self.client = client

    async def transact(
        self, paths: tuple[str, ...],
        decide: Callable[[Mapping[str, dict | None]], TransactionPlan],
    ) -> Any:
        if not paths or len(paths) > 100 or len(set(paths)) != len(paths):
            raise RepositoryConflict("invalid_read_set")
        for path in sorted(paths):
            parts = path.split("/")
            if len(parts) == 2:
                validated = document_path(parts[0], parts[1])
            elif len(parts) == 4 and parts[0] == "devices":
                validated = document_path(parts[2], parts[3], device_id=parts[1])
            else:
                raise RepositoryConflict("invalid_document_path")
            if validated != path:
                raise RepositoryConflict("invalid_document_path")
        references = {path: self.client.document(path) for path in sorted(paths)}

        @async_transactional
        async def run(transaction):
            rows = {}
            # Todas as leituras precedem qualquer escrita, inclusive documentos inexistentes.
            for path, reference in references.items():
                snapshot = await reference.get(transaction=transaction)
                rows[path] = snapshot.to_dict() if snapshot.exists else None
            plan = decide(copy.deepcopy(rows))
            if not isinstance(plan, TransactionPlan):
                raise RepositoryConflict("synchronous_plan_required")
            if not (set(plan.puts) | set(plan.deletes)).issubset(references):
                raise RepositoryConflict("write_without_read")
            if set(plan.puts).intersection(plan.deletes):
                raise RepositoryConflict("ambiguous_write")
            for path in plan.deletes:
                if ("/tombstones/" in path or path.startswith(("identityClaims/", "displayIdClaims/"))
                        or path.startswith("devices/") and path.count("/") == 1):
                    raise RepositoryConflict("durable_claim_delete_forbidden")
            for path, document in plan.puts.items():
                if not isinstance(document, PortalDocument):
                    raise RepositoryConflict("invalid_document_model")
                if path.startswith("devices/") and path.count("/") == 1:
                    if not isinstance(document, DeviceDocument):
                        raise RepositoryConflict("invalid_device_document")
                    self._validate_device_transition(rows[path], document)
                if (rows[path] is not None and isinstance(document, IdentityClaimDocument)
                        and rows[path]["deviceId"] != document.device_id):
                    raise RepositoryConflict("immutable_identity_claim")
                if (rows[path] is not None and isinstance(document, DisplayIdClaimDocument)
                        and rows[path]["deviceId"] != document.device_id):
                    raise RepositoryConflict("immutable_display_id_claim")
                if (rows[path] is not None and isinstance(document, IdempotencyClaimDocument)
                        and IdempotencyClaimDocument.model_validate(rows[path]) != document):
                    raise RepositoryConflict("immutable_idempotency_claim")
                if (rows[path] is not None and isinstance(document, (OrderClaimDocument, PaymentClaimDocument))
                        and document.__class__.model_validate(rows[path]) != document):
                    raise RepositoryConflict("immutable_commercial_claim")
                if rows[path] is not None and isinstance(document, OrderDocument):
                    old_order = OrderDocument.model_validate(rows[path])
                    fixed = ("order_id", "device_id", "offer_version", "price_minor", "currency", "term_months", "reference", "created_at")
                    if any(getattr(old_order, key) != getattr(document, key) for key in fixed):
                        raise RepositoryConflict("immutable_order_offer")
                    if old_order.confirmed_at is not None and old_order.confirmed_at != document.confirmed_at:
                        raise RepositoryConflict("immutable_payment_confirmation")
                    if old_order.provider_payment_id is not None and old_order.provider_payment_id != document.provider_payment_id:
                        raise RepositoryConflict("immutable_order_payment")
                if rows[path] is not None and isinstance(document, ConfigurationVersionDocument):
                    old = {k: v for k, v in rows[path].items() if k != "referenceCount"}
                    new = document.model_dump(by_alias=True, exclude={"reference_count"})
                    if old != new:
                        raise RepositoryConflict("immutable_configuration_version")
                if rows[path] is None:
                    transaction.create(references[path], document.model_dump(by_alias=True))
                else:
                    transaction.set(references[path], document.model_dump(by_alias=True))
            for path in plan.deletes:
                transaction.delete(references[path])
            return plan.result

        # O decorator do SDK só repete ABORTED do commit; leituras também podem
        # abortar. Repetir a unidade inteira com jitter evita lockstep entre instâncias.
        try:
            async with asyncio.timeout(30):
                for attempt in range(5):
                    try:
                        return await run(self.client.transaction(max_attempts=1))
                    except (Aborted, ValueError) as error:
                        aborted = isinstance(error, Aborted) or isinstance(error.__cause__, Aborted)
                        if not aborted:
                            raise
                        if attempt == 4:
                            raise RepositoryConflict("transaction_unavailable") from None
                        await asyncio.sleep(random.uniform(0.05, 0.2) * 2 ** attempt)
        except TimeoutError:
            raise RepositoryConflict("transaction_unavailable") from None

    @staticmethod
    def _validate_device_transition(previous: dict | None, current: DeviceDocument):
        if previous is None:
            return
        old = DeviceDocument.model_validate(previous)
        if (old.identity_hmac != current.identity_hmac or old.device_id != current.device_id
                or old.created_at != current.created_at):
            raise RepositoryConflict("immutable_identity")
        # ADR-015: o ID exibido é atribuído uma vez e nunca é trocado nem apagado.
        if old.display_id is not None and (current.display_id != old.display_id
                                           or current.display_id_source != old.display_id_source):
            raise RepositoryConflict("immutable_display_id")
        if old.trial_started_at is not None and (
            old.trial_started_at != current.trial_started_at
            or old.trial_expires_at != current.trial_expires_at
        ):
            raise RepositoryConflict("immutable_trial")
        if current.recovery_epoch != old.recovery_epoch and current.access_fence is None and (
            current.auth_epoch <= old.auth_epoch or current.tv_bearer_hash == old.tv_bearer_hash
            or current.device_key_hash == old.device_key_hash
        ):
            raise RepositoryConflict("recovery_epoch_rotation_required")
        if current.auth_epoch > old.auth_epoch and (
            current.tv_bearer_hash == old.tv_bearer_hash or current.device_key_hash == old.device_key_hash
        ):
            raise RepositoryConflict("credential_rotation_required")
        if (current.auth_epoch < old.auth_epoch
                or current.entitlement_generation < old.entitlement_generation
                or current.recovery_code_version < old.recovery_code_version):
            raise RepositoryConflict("generation_rollback")

    async def enroll(self, device: DeviceDocument) -> str:
        claim_path = document_path("identityClaims", device.identity_hmac)
        device_path = document_path("devices", device.device_id)

        def decide(rows):
            if rows[claim_path] is not None:
                raise RepositoryConflict("identity_exists")
            if rows[device_path] is not None:
                raise RepositoryConflict("device_exists")
            claim = IdentityClaimDocument(device_id=device.device_id, created_at=device.created_at)
            return TransactionPlan(device.device_id, {claim_path: claim, device_path: device})

        return await self.transact((claim_path, device_path), decide)

    async def lease_job(
        self, job_id: str, owner: str, now: datetime, until: datetime,
    ) -> JobDocument | None:
        if not 0 < (until - now).total_seconds() <= 300:
            raise RepositoryConflict("invalid_lease_window")
        path = document_path("jobs", job_id)

        def decide(rows):
            if rows[path] is None:
                return TransactionPlan(None)
            job = JobDocument.model_validate(rows[path])
            if job.next_due_at > now or job.lease_until and job.lease_until > now:
                return TransactionPlan(None)
            leased = JobDocument.model_validate({**job.model_dump(),
                "lease_owner": owner, "lease_until": until, "attempt": job.attempt + 1,
            })
            return TransactionPlan(leased, {path: leased})

        return await self.transact((path,), decide)

    async def checkpoint_job(
        self, job_id: str, owner: str, now: datetime, next_due: datetime,
        checkpoint: str | None,
    ) -> bool:
        path = document_path("jobs", job_id)

        def decide(rows):
            if rows[path] is None:
                return TransactionPlan(False)
            job = JobDocument.model_validate(rows[path])
            if job.lease_owner != owner or job.lease_until is None or job.lease_until <= now:
                return TransactionPlan(False)
            updated = JobDocument.model_validate({**job.model_dump(),
                "lease_owner": None, "lease_until": None, "next_due_at": next_due,
                "checkpoint": checkpoint,
            })
            return TransactionPlan(True, {path: updated})

        return await self.transact((path,), decide)
