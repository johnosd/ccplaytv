from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.portal.models import DeviceDocument, OperationDocument, TombstoneDocument
from app.portal.repositories.control import ControlRepository, RepositoryConflict, document_path

NOW = datetime(2026, 10, 11, tzinfo=UTC)


def device(**changes):
    return DeviceDocument(**{
        "device_id": "tv-a", "identity_hmac": "a" * 64, "tv_bearer_hash": "b" * 64,
        "device_key_hash": "c" * 64, "auth_epoch": 1, "recovery_epoch": "restore-a",
        "created_at": NOW, "trial_started_at": NOW, "trial_expires_at": NOW + timedelta(days=7),
        **changes,
    })


def test_device_disallows_raw_identity_and_never_restarts_trial_or_rolls_back_epoch():
    old = device()
    assert "a" * 64 not in repr(old)
    with pytest.raises(ValidationError) as error:
        device(identity_hmac="fake-private-duid")
    assert "fake-private-duid" not in str(error.value)
    for changed, code in (
        (device(trial_started_at=NOW + timedelta(days=1),
                trial_expires_at=NOW + timedelta(days=8)), "immutable_trial"),
        (device(auth_epoch=0), "generation_rollback"),
        (device(identity_hmac="d" * 64), "immutable_identity"),
    ):
        with pytest.raises(RepositoryConflict, match=code):
            ControlRepository._validate_device_transition(old.model_dump(by_alias=True), changed)


def test_delete_never_expires_and_tombstone_rejects_secret_fields():
    deletion = {"operation_id": "op-a", "source_id": "source-a", "action": "delete",
                "expected_revision": 1, "auth_epoch": 1, "idempotency_digest": "a" * 64,
                "created_at": NOW}
    assert OperationDocument(**deletion).expires_at is None
    with pytest.raises(ValidationError, match="delete_never_expires"):
        OperationDocument(**deletion, expires_at=NOW + timedelta(days=7))
    with pytest.raises(ValidationError):
        TombstoneDocument(deletion_id="del-a", source_id="source-a", origin="tv",
                          last_known_revision=1, deleted_at=NOW, journal_object_id="event-a",
                          password="fake-private")


def test_delivery_window_and_timestamps_are_strict():
    pending = {"operation_id": "op-a", "source_id": "source-a", "action": "create",
               "expected_revision": 0, "config_version": "config-a", "auth_epoch": 1,
               "idempotency_digest": "a" * 64, "created_at": NOW}
    assert OperationDocument(**pending, expires_at=NOW + timedelta(days=7)).state == "pending"
    with pytest.raises(ValidationError, match="invalid_delivery_window"):
        OperationDocument(**pending, expires_at=NOW + timedelta(days=8))
    with pytest.raises(ValidationError):
        device(created_at=datetime(2026, 10, 11))  # noqa: DTZ001 - entrada inválida deliberada
    with pytest.raises(ValidationError):
        device(auth_epoch=True)


def test_document_ids_cannot_escape_device_namespace():
    assert document_path("operations", "op-a", device_id="tv-a") == "devices/tv-a/operations/op-a"
    for collection, identifier, device_id in (
        ("devices", "../tv-b", None), ("operations", "op-a", "tv-a/x"),
        ("unknown", "id", None), ("sessions", "id", "tv-a"),
    ):
        with pytest.raises(RepositoryConflict):
            document_path(collection, identifier, device_id=device_id)
