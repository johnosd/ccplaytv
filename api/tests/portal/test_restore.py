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


def test_inspect_does_not_reparse_datetime_by_current_culture():
    # pwsh 7 já converte snapshotTime em DateTime; Parse por texto quebra em pt-BR
    # ("10/13/2026 03:31:48"). Regressão observada em 2026-10-13.
    script = RUNBOOK.read_text(encoding="utf-8")
    assert "-is [datetime]" in script
    assert "[Globalization.CultureInfo]::InvariantCulture" in script
    assert "[DateTimeOffset]::Parse($latest.snapshotTime)" not in script


def test_dry_run_is_default_and_does_not_use_eval():
    script = RUNBOOK.read_text(encoding="utf-8")
    assert "if (-not $Apply)" in script
    assert "executes=$false" in script
    assert "\nInvoke-Expression" not in script
