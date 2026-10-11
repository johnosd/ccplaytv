from datetime import UTC, datetime
from unittest.mock import Mock

import pytest
from google.api_core.exceptions import PreconditionFailed, ServiceUnavailable
from pydantic import ValidationError

from app.portal.recovery_journal import (
    CloudStorageJournal,
    JournalError,
    JournalEvent,
    MemoryJournal,
)


def source_event(**changes):
    return JournalEvent(**{
        "event_id": "delete-a", "kind": "source_deleted", "device_id": "tv-a",
        "source_id": "source-a", "revision": 2, "occurred_at": datetime(2026, 10, 11, tzinfo=UTC),
        **changes,
    })


async def test_journal_is_create_only_idempotent_and_rejects_different_content():
    writer = MemoryJournal(environment="test")
    event = source_event()
    assert await writer.append(event) == "events/tv-a/delete-a.json"
    assert await writer.append(event) == event.object_id
    with pytest.raises(JournalError, match="journal_digest_conflict"):
        await writer.append(source_event(revision=3))
    with pytest.raises(JournalError, match="fake_journal_test_only"):
        MemoryJournal(environment="production")
    with pytest.raises(ValidationError) as error:
        source_event(password="fake-private-password")
    assert "fake-private-password" not in str(error.value)


async def test_storage_uses_generation_zero_and_requires_identical_existing_object():
    writer = object.__new__(CloudStorageJournal)
    writer._bucket = Mock()
    blob = writer._bucket.blob.return_value
    event = source_event()
    assert await writer.append(event) == event.object_id
    assert blob.upload_from_string.call_args.kwargs["if_generation_match"] == 0
    assert blob.upload_from_string.call_args.args[0] == event.content()
    blob.upload_from_string.side_effect = PreconditionFailed("fixture")
    blob.download_as_bytes.return_value = event.content()
    assert await writer.append(event) == event.object_id
    blob.download_as_bytes.return_value = source_event(revision=3).content()
    with pytest.raises(JournalError, match="journal_digest_conflict"):
        await writer.append(event)
    blob.upload_from_string.side_effect = ServiceUnavailable("fake-private")
    with pytest.raises(JournalError, match="^journal_unavailable$"):
        await writer.append(event)
