"""Integridade local do input de restore; não simula aceite de restore real."""

import json
from datetime import UTC, datetime

import pytest

from app.portal.crypto import canonical_json
from app.portal.recovery_journal import JournalError, JournalEvent
from app.portal.restore_journal import decode_journal_object


@pytest.mark.parametrize("metadata", [
    {"kind": "source_deleted", "source_id": "source", "revision": 4},
    {"kind": "access_revoked", "epoch": 7, "recovery_code_version": 3,
     "recovery_code_hmac": "a" * 64, "hash_key_version": "v2"},
    {"kind": "license_revoked", "generation": 9, "reference_id": "order"},
])
def test_writer_roundtrip_and_destination(metadata):
    event = JournalEvent(event_id="event", device_id="device",
                         occurred_at=datetime(2026, 10, 11, tzinfo=UTC), **metadata)
    assert decode_journal_object(event.object_id, event.content()) == event
    with pytest.raises(JournalError, match="^invalid_restore_journal$"):
        decode_journal_object("events/other/event.json", event.content())


@pytest.mark.parametrize("mutation", ["digest", "device", "future", "duplicate",
                                      "truncated", "oversized", "not_object"])
def test_corruption_never_reaches_replay_or_exposes_input(mutation):
    event = JournalEvent(event_id="event", kind="source_deleted", device_id="device",
                         source_id="source", revision=4,
                         occurred_at=datetime(2026, 10, 11, tzinfo=UTC))
    content = event.content()
    value = json.loads(content)
    if mutation == "digest":
        value["digest"] = "0" * 64
    elif mutation == "device":
        value["deviceId"] = "other"
    elif mutation == "future":
        value["futureSecret"] = "private-marker-069"
    else:
        content = {"duplicate": b'{"deviceId":"other",' + content[1:],
                   "truncated": content[:-1], "oversized": b"x" * 8193,
                   "not_object": b"[]"}[mutation]
    if mutation in {"digest", "device", "future"}:
        content = canonical_json(value)
    with pytest.raises(JournalError) as failure:
        decode_journal_object(event.object_id, content)
    assert str(failure.value) == "invalid_restore_journal"
    assert failure.value.__cause__ is None
