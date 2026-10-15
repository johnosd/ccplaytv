"""Documentos de controle; catálogo/URLs em claro não pertencem a este modelo."""

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

from app.portal.crypto import CipherEnvelope

OpaqueId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,128}$")]
Digest = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
Revision = Annotated[int, Field(ge=0)]
DisplayId = Annotated[str, StringConstraints(pattern=r"^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$")]
# "generated" só existe em registros anteriores à ADR-015 (preservados); atribuições novas são "mac" ou "derived".
DisplaySource = Literal["mac", "generated", "derived"]


class PortalDocument(BaseModel):
    model_config = ConfigDict(
        extra="forbid", strict=True, populate_by_name=True, alias_generator=to_camel,
        hide_input_in_errors=True, frozen=True,
    )


class DeviceDocument(PortalDocument):
    device_id: OpaqueId
    identity_hmac: Digest = Field(repr=False)
    tv_bearer_hash: Digest = Field(repr=False)
    device_key_hash: Digest = Field(repr=False)
    auth_epoch: Revision
    recovery_epoch: OpaqueId
    entitlement_generation: Revision = 0
    pending_operation_count: int = Field(default=0, ge=0, le=5)
    recovery_code_version: Revision = 1
    recovery_code_hmac: Digest | None = Field(default=None, repr=False)
    recovery_hash_key_version: OpaqueId | None = None
    created_at: AwareDatetime
    trial_started_at: AwareDatetime | None = None
    trial_expires_at: AwareDatetime | None = None
    access_fence: OpaqueId | None = None
    # 070/D-002: ausentes em dispositivos anteriores à 070 até o upgrade por rotação (D-004).
    display_id: DisplayId | None = None
    display_id_source: DisplaySource | None = None

    @model_validator(mode="after")
    def trial_interval(self):
        if (self.display_id is None) != (self.display_id_source is None):
            raise ValueError("display_id_source_required")
        if (self.recovery_code_hmac is None) != (self.recovery_hash_key_version is None):
            raise ValueError("recovery_verifier_version_required")
        if (self.trial_started_at is None) != (self.trial_expires_at is None):
            raise ValueError("invalid_trial_interval")
        if self.trial_started_at and (
            self.trial_expires_at - self.trial_started_at
        ).total_seconds() != 7 * 24 * 60 * 60:
            raise ValueError("invalid_trial_interval")
        return self


class IdentityClaimDocument(PortalDocument):
    device_id: OpaqueId
    created_at: AwareDatetime


class DisplayIdClaimDocument(PortalDocument):
    """Dono exclusivo de um ID exibido (070); criado na mesma transação que grava o ID no dispositivo."""
    device_id: OpaqueId
    created_at: AwareDatetime


class InviteDocument(PortalDocument):
    recovery_claim_id: OpaqueId | None = None
    device_id: OpaqueId
    purpose: Literal["manage", "buy", "recover"]
    auth_epoch: Revision
    recovery_epoch: OpaqueId
    created_at: AwareDatetime
    expires_at: AwareDatetime
    consumed_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def invite_scope(self):
        if (self.purpose == "recover") != (self.recovery_claim_id is not None):
            raise ValueError("invalid_recovery_scope")
        return self


class SessionDocument(PortalDocument):
    purpose: Literal["manage", "recover"] = "manage"
    recovery_claim_id: OpaqueId | None = None
    device_id: OpaqueId
    auth_epoch: Revision
    recovery_epoch: OpaqueId
    csrf_hash: Digest = Field(repr=False)
    created_at: AwareDatetime
    last_seen_at: AwareDatetime

    @model_validator(mode="after")
    def session_scope(self):
        if (self.purpose == "recover") != (self.recovery_claim_id is not None):
            raise ValueError("invalid_recovery_scope")
        return self


class ConfigurationDocument(PortalDocument):
    source_id: OpaqueId
    type: Literal["provider_credentials", "m3u_url"]
    display_name: str = Field(min_length=1, max_length=120)
    config_version: OpaqueId
    active_operation_id: OpaqueId | None = None
    expected_revision: Revision
    applied_revision: Revision | None = None
    envelope: CipherEnvelope = Field(repr=False)
    # 071/D-009: digest do último envio da TV (idempotência); ausente nas configurações criadas pelo portal.
    upload_digest: Digest | None = Field(default=None, repr=False)
    created_at: AwareDatetime
    updated_at: AwareDatetime


class UsageBackupDocument(PortalDocument):
    """072: backup dos dados de uso de uma TV (só a última versão). Payload inteiro cifrado; contagens em claro."""
    format: Literal[1]
    created_at: AwareDatetime
    client_created_at: AwareDatetime
    counts: dict[str, int]
    envelope: CipherEnvelope = Field(repr=False)

class ConfigurationVersionDocument(PortalDocument):
    source_id: OpaqueId
    config_version: OpaqueId
    envelope: CipherEnvelope = Field(repr=False)
    reference_count: Revision
    created_at: AwareDatetime


class ReceiptDocument(PortalDocument):
    revision: Revision
    state: Literal["applied", "conflict", "awaiting_confirmation", "error"]


class OperationDocument(PortalDocument):
    operation_id: OpaqueId
    source_id: OpaqueId
    action: Literal["create", "update", "delete"]
    expected_revision: Revision
    config_version: OpaqueId | None = None
    auth_epoch: Revision
    state: Literal[
        "pending", "received", "awaiting_confirmation", "applied", "conflict",
        "error", "cancelled", "expired",
    ] = "pending"
    idempotency_digest: Digest
    counted_pending: bool = False
    created_at: AwareDatetime
    expires_at: AwareDatetime | None = None
    lease_owner: OpaqueId | None = None
    lease_until: AwareDatetime | None = None
    receipt: ReceiptDocument | None = None
    import_state: Literal["queued", "running", "completed", "error"] | None = None

    @model_validator(mode="after")
    def delivery_expiry(self):
        if self.action == "delete":
            if self.expires_at is not None or self.config_version is not None:
                raise ValueError("delete_never_expires")
        elif self.expires_at is None or self.config_version is None or (
            self.expires_at - self.created_at
        ).total_seconds() != 7 * 24 * 60 * 60:
            raise ValueError("invalid_delivery_window")
        return self


class TombstoneDocument(PortalDocument):
    deletion_id: OpaqueId
    source_id: OpaqueId
    origin: Literal["tv", "portal"]
    last_known_revision: Revision
    deleted_at: AwareDatetime
    confirmed_at: AwareDatetime | None = None
    journal_object_id: str


class DeletionIntentDocument(PortalDocument):
    deletion_id: OpaqueId
    source_id: OpaqueId
    origin: Literal["tv", "portal"]
    revision: Revision
    state: Literal["pending_journal", "pending_device", "confirmed"]
    created_at: AwareDatetime
    confirmed_at: AwareDatetime | None = None
    journal_object_id: str
    journal_digest: Digest


class JobDocument(PortalDocument):
    kind: Literal["delete_finalize", "access_finalize", "license_finalize", "reconcile", "retention", "backup_check"]
    dedupe_key: OpaqueId
    device_id: OpaqueId | None = None
    lease_owner: OpaqueId | None = None
    lease_until: AwareDatetime | None = None
    attempt: Revision = 0
    next_due_at: AwareDatetime
    checkpoint: str | None = None

    @model_validator(mode="after")
    def finalization_destination(self):
        if self.kind in {"delete_finalize", "access_finalize", "license_finalize"} and self.device_id is None:
            raise ValueError("job_destination_required")
        return self


class RateLimitDocument(PortalDocument):
    count: Revision
    window_started_at: AwareDatetime
    blocked_until: AwareDatetime | None = None
    expires_at: AwareDatetime


class RecoveryCodeDocument(PortalDocument):
    device_id: OpaqueId
    version: Revision
    hash_key_version: OpaqueId
    status: Literal["active", "consumed"] = "active"
    consumed_by_operation_id: OpaqueId | None = None
    created_at: AwareDatetime


class IssuanceDocument(PortalDocument):
    operation_id: OpaqueId
    device_id: OpaqueId
    purpose: Literal["enroll", "recover", "revoke", "rotate"]
    identity_hmac: Digest = Field(repr=False)
    claim_secret_hash: Digest = Field(repr=False)
    recovery_epoch: OpaqueId
    state: Literal["ready", "acked", "expired"]
    envelope: CipherEnvelope | None = Field(default=None, repr=False)
    created_at: AwareDatetime
    expires_at: AwareDatetime
    acked_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def issuance_window(self):
        if (self.expires_at - self.created_at).total_seconds() != 300:
            raise ValueError("invalid_issuance_window")
        if (self.state == "ready") != (self.envelope is not None):
            raise ValueError("invalid_issuance_state")
        return self


class AccessIntentDocument(PortalDocument):
    operation_id: OpaqueId
    device_id: OpaqueId
    purpose: Literal["recover", "revoke", "rotate"]
    identity_hmac: Digest = Field(repr=False)
    recovery_epoch: OpaqueId
    from_auth_epoch: Revision
    target_auth_epoch: Revision
    target_code_version: Revision
    previous_code_hmac: Digest = Field(repr=False)
    new_code_hmac: Digest = Field(repr=False)
    hash_key_version: OpaqueId
    tv_bearer_hash: Digest = Field(repr=False)
    device_key_hash: Digest = Field(repr=False)
    claim_secret_hash: Digest = Field(repr=False)
    state: Literal["pending_journal", "ready", "acked"]
    envelope: CipherEnvelope | None = Field(default=None, repr=False)
    envelope_expired: bool = False
    issuance_round: int = Field(default=1, ge=1)
    started_at: AwareDatetime
    issued_at: AwareDatetime
    expires_at: AwareDatetime
    resume_until: AwareDatetime
    journal_object_id: str
    journal_digest: Digest
    # 070/D-004: ID atribuído nesta rotação (upgrade de dispositivo antigo); o finalize grava no dispositivo.
    display_id: DisplayId | None = None
    display_id_source: DisplaySource | None = None

    @model_validator(mode="after")
    def issuance_constraints(self):
        if (self.target_auth_epoch <= self.from_auth_epoch
                or (self.expires_at - self.issued_at).total_seconds() != 300
                or (self.resume_until - self.started_at).total_seconds() != 86400
                or (self.state == "pending_journal" and not self.envelope_expired) != (self.envelope is not None)):
            raise ValueError("invalid_access_intent")
        return self


class RecoveryClaimDocument(PortalDocument):
    claim_id: OpaqueId
    device_id: OpaqueId
    identity_hmac: Digest = Field(repr=False)
    claim_secret_hash: Digest = Field(repr=False)
    challenge_hash: Digest = Field(repr=False)
    auth_epoch: Revision
    recovery_epoch: OpaqueId
    state: Literal["pending", "exchanged", "reserved", "confirmed"] = "pending"
    created_at: AwareDatetime
    expires_at: AwareDatetime
    bootstrap_envelope: CipherEnvelope | None = Field(default=None, repr=False)
    operation_id: OpaqueId | None = None
    request_id: OpaqueId | None = None
    submitted_code_hash: Digest | None = Field(default=None, repr=False)
    idempotency_digest: Digest | None = None

    @model_validator(mode="after")
    def challenge_window(self):
        if (self.expires_at - self.created_at).total_seconds() != 300:
            raise ValueError("invalid_challenge_window")
        if self.state in {"reserved", "confirmed"} and (
            self.operation_id is None or self.request_id is None or self.submitted_code_hash is None
            or self.idempotency_digest is None or self.bootstrap_envelope is not None
        ):
            raise ValueError("invalid_recovery_reservation")
        return self


class SourceSnapshotDocument(PortalDocument):
    id: OpaqueId
    type: Literal["provider_credentials", "m3u_url"]
    display_name: str = Field(min_length=1, max_length=120)
    connection_state: Literal["never_synced", "synced", "error"]
    updated_at: int = Field(ge=0)


class SourceRevisionDocument(PortalDocument):
    source_id: OpaqueId
    revision: Revision


class ImportSnapshotDocument(PortalDocument):
    source_id: OpaqueId
    config_revision: Revision
    state: Literal["queued", "running", "completed", "error"]


class SnapshotDocument(PortalDocument):
    auth_epoch: Revision
    recovery_epoch: OpaqueId
    captured_at: AwareDatetime
    received_at: AwareDatetime
    snapshot_revision: Revision
    sources: list[SourceSnapshotDocument]
    revisions: list[SourceRevisionDocument]
    imports: list[ImportSnapshotDocument]

    @model_validator(mode="after")
    def snapshot_sources(self):
        ids = [item.id for item in self.sources]
        revisions = [item.source_id for item in self.revisions]
        imports = [item.source_id for item in self.imports]
        if (len(ids) != len(set(ids)) or set(ids) != set(revisions) or len(ids) != len(revisions)
                or len(imports) != len(set(imports)) or not set(imports).issubset(ids)):
            raise ValueError("invalid_snapshot_sources")
        return self


class IdempotencyClaimDocument(PortalDocument):
    operation_id: OpaqueId
    digest: Digest
    created_at: AwareDatetime
