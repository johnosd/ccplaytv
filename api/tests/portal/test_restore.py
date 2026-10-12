"""Guardas estáticas do runbook de backup/restore.

O teste não chama gcloud: restore real exige um snapshot READY e permanece como
último gate operacional da feature.
"""

from pathlib import Path

RUNBOOK = (
    Path(__file__).resolve().parents[3]
    / "infra"
    / "portal"
    / "backup"
    / "manage-backup.ps1"
)


def test_restore_requires_isolated_database_and_encryption():
    script = RUNBOOK.read_text(encoding="utf-8")
    assert "isolated_restore_database_required" in script
    assert "--destination-database=$DestinationDatabase" in script
    assert "--encryption-type=google-default-encryption" in script
    assert "reopenTraffic=$false" in script


def test_dry_run_is_default_and_does_not_use_eval():
    script = RUNBOOK.read_text(encoding="utf-8")
    assert "if (-not $Apply)" in script
    assert "executes=$false" in script
    assert "\nInvoke-Expression" not in script
