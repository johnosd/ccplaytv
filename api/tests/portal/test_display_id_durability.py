"""Guardas da ADR-015 no operacional da 069 (T060, invariantes I-1 e I-2 da 070).

O ID exibido (`display_id`) e sua reserva (`displayIdClaims`) são duráveis: nenhuma
rotina de retenção, backup ou restore pode apagá-los ou regravá-los. Estes testes não
exigem emulador; a imutabilidade no repositório está em `test_pairing.py`.
"""

from pathlib import Path

import pytest

from app.portal.recovery_journal import JournalEvent
from app.portal.repositories.control import RepositoryConflict
from app.portal.retention import GROUPS, RetentionService

BACKUP_RUNBOOK = Path(__file__).resolve().parents[3] / "infra" / "portal" / "backup" / "manage-backup.ps1"
DURABLE_COLLECTIONS = ("devices", "identityClaims", "displayIdClaims")


def test_retention_groups_never_include_durable_identity_collections():
    assert not set(DURABLE_COLLECTIONS).intersection(GROUPS)


@pytest.mark.parametrize(
    "path",
    [
        "displayIdClaims/abc123",
        "identityClaims/abc123",
        "devices/abc123",
        "devices/abc123/configurations/source1",
    ],
)
async def test_retention_expire_refuses_durable_identity_paths(path):
    # A recusa vem antes de qualquer leitura: o executor nem precisa de cliente Firestore.
    service = RetentionService(repository=None)  # type: ignore[arg-type]
    with pytest.raises(RepositoryConflict, match="invalid_retention_group"):
        await service.expire(path, now=None)  # type: ignore[arg-type]


def test_backup_runbook_is_database_wide_not_a_collection_list():
    script = BACKUP_RUNBOOK.read_text(encoding="utf-8")
    # Backup/restore por lista de coleções deixaria `displayIdClaims` de fora e
    # permitiria que outra TV tomasse um ID já atribuído após o restore.
    assert "--collection-ids" not in script
    assert "collection-ids" not in script.lower()


def test_restore_journal_event_never_carries_the_display_id_or_the_key():
    fields = set(JournalEvent.model_fields)
    assert not fields.intersection({"display_id", "device_key", "device_key_hash", "key", "mac"})
