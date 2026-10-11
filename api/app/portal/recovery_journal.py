"""Journal write-ahead independente do restore; nunca recebe configuração ou token."""

import asyncio
import hashlib
import hmac
from typing import Literal, Protocol

from google.api_core.exceptions import GoogleAPIError, PreconditionFailed
from google.api_core.retry import Retry
from google.cloud import storage
from pydantic import AwareDatetime, Field, model_validator

from app.portal.crypto import canonical_json
from app.portal.models import Digest, OpaqueId, PortalDocument, Revision
from app.portal.settings import PortalSettings


class JournalError(ValueError):
    pass


class JournalEvent(PortalDocument):
    schema_version: Literal[1] = 1
    event_id: OpaqueId
    kind: Literal["source_deleted", "access_revoked", "license_revoked"]
    device_id: OpaqueId
    source_id: OpaqueId | None = None
    revision: Revision | None = None
    generation: Revision | None = None
    epoch: Revision | None = None
    recovery_code_version: Revision | None = None
    operation_id: OpaqueId | None = None
    recovery_code_hmac: Digest | None = Field(default=None, repr=False)
    hash_key_version: OpaqueId | None = None
    occurred_at: AwareDatetime
    reference_id: OpaqueId | None = None

    @model_validator(mode="after")
    def required_metadata(self):
        if self.kind == "source_deleted" and (self.source_id is None or self.revision is None):
            raise ValueError("source_event_metadata_required")
        if self.kind == "access_revoked" and self.epoch is None:
            raise ValueError("access_event_metadata_required")
        if self.kind == "license_revoked" and (
            self.generation is None or self.reference_id is None
        ):
            raise ValueError("license_event_metadata_required")
        if (self.recovery_code_hmac is None) != (self.hash_key_version is None):
            raise ValueError("recovery_verifier_version_required")
        return self

    @property
    def object_id(self) -> str:
        return f"events/{self.device_id}/{self.event_id}.json"

    @property
    def digest(self) -> str:
        return hashlib.sha256(canonical_json(self.model_dump(
            mode="json", by_alias=True, exclude_none=True
        ))).hexdigest()

    def content(self) -> bytes:
        return canonical_json({
            **self.model_dump(mode="json", by_alias=True, exclude_none=True), "digest": self.digest,
        })


class JournalWriter(Protocol):
    async def append(self, event: JournalEvent) -> str: ...


class MemoryJournal:
    """Somente teste local; não constitui evidência de durabilidade/backup."""

    def __init__(self, *, environment: str):
        if environment != "test":
            raise JournalError("fake_journal_test_only")
        self._objects: dict[str, bytes] = {}

    async def append(self, event: JournalEvent) -> str:
        content = event.content()
        previous = self._objects.setdefault(event.object_id, content)
        if not hmac.compare_digest(previous, content):
            raise JournalError("journal_digest_conflict")
        return event.object_id


class CloudStorageJournal:
    def __init__(self, settings: PortalSettings):
        if settings.environment not in {"staging", "production"} or not settings.journal_bucket:
            raise JournalError("cloud_journal_configuration_required")
        self._bucket = storage.Client(project=settings.project_id).bucket(settings.journal_bucket)

    async def append(self, event: JournalEvent) -> str:
        # SDK Storage síncrono fora do callback Firestore, aguardado antes de qualquer ACK.
        return await asyncio.to_thread(self._append, event)

    def _append(self, event: JournalEvent) -> str:
        blob = self._bucket.blob(event.object_id)
        content = event.content()
        try:
            try:
                blob.upload_from_string(
                    content, content_type="application/json", if_generation_match=0, timeout=5,
                    retry=Retry(initial=0.2, maximum=1, deadline=10),
                )
            except PreconditionFailed:
                existing = blob.download_as_bytes(
                    start=0, end=8192, timeout=5,
                    retry=Retry(initial=0.2, maximum=1, deadline=10),
                )
                if not hmac.compare_digest(existing, content):
                    raise JournalError("journal_digest_conflict") from None
            return event.object_id
        except GoogleAPIError:
            raise JournalError("journal_unavailable") from None
