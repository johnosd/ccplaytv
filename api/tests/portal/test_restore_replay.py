"""Replay do journal sobre base restaurada (T039/logic §7): nada revogado volta a valer."""

import uuid
from datetime import UTC, datetime, timedelta

from app.portal.commercial_models import GrantDocument
from app.portal.models import (
    DeviceDocument,
    OperationDocument,
    RecoveryCodeDocument,
    TombstoneDocument,
)
from app.portal.recovery_journal import JournalEvent
from app.portal.repositories.control import TransactionPlan
from app.portal.restore_replay import RestoreReplay
from tests.portal.test_operations import seed

NOW = datetime(2026, 10, 14, 3, 0, tzinfo=UTC)


async def device_with_code(control, *, auth_epoch=1, generation=0, version=1, code="d" * 64):
    repository, paths = control
    device_id = "replay-" + uuid.uuid4().hex
    identity = uuid.uuid4().hex * 2
    device = DeviceDocument(
        device_id=device_id, identity_hmac=identity, tv_bearer_hash="b" * 64, device_key_hash="c" * 64,
        auth_epoch=auth_epoch, recovery_epoch="test-restore", created_at=NOW - timedelta(days=3),
        entitlement_generation=generation, recovery_code_version=version,
        recovery_code_hmac=code, recovery_hash_key_version="v1",
    )
    await repository.enroll(device)
    paths.extend(["devices/" + device_id, "identityClaims/" + identity, "recoveryCodes/" + code])
    code_path = "recoveryCodes/" + code
    await repository.transact((code_path,), lambda _: TransactionPlan(None, {code_path: RecoveryCodeDocument(
        device_id=device_id, version=version, hash_key_version="v1", created_at=NOW)}))
    return repository, device_id


async def read(repository, path):
    return (await repository.client.document(path).get()).to_dict()


async def test_backup_anterior_a_delete_nao_ressuscita_a_fonte_nem_reentrega_o_segredo(control):
    service, device_id, now = await seed(control)
    repository = service.repository
    root = "devices/" + device_id + "/"
    # Estado do backup: configuração, versão cifrada e comando de criação ainda vivos; sem tombstone.
    assert (await read(repository, root + "configurations/source-a")) is not None
    assert (await read(repository, root + "tombstones/source-a")) is None
    event = JournalEvent(event_id="delete-a", kind="source_deleted", device_id=device_id,
                         source_id="source-a", revision=2, occurred_at=now)

    report = await RestoreReplay(repository).apply([event], now + timedelta(hours=1))

    assert report.counts["applied"] == 1 and report.complete
    assert await read(repository, root + "configurations/source-a") is None
    assert await read(repository, root + "configurationVersions/version-a") is None
    assert OperationDocument.model_validate(
        await read(repository, root + "operations/create-a")).state == "cancelled"
    tombstone = TombstoneDocument.model_validate(await read(repository, root + "tombstones/source-a"))
    assert tombstone.last_known_revision == 2 and tombstone.origin == "portal"
    # A TV ainda precisa aplicar/confirmar a exclusão: o comando de delete fica pendente, sem expirar.
    delete = OperationDocument.model_validate(await read(repository, root + "operations/delete-a"))
    assert delete.action == "delete" and delete.state == "pending" and delete.expires_at is None
    assert await service.read_configuration(device_id, "source-a", auth_epoch=1,
                                            recovery_epoch="test-restore") is None

    again = await RestoreReplay(repository).apply([event], now + timedelta(hours=2))
    assert again.counts["already_applied"] == 1 and again.counts["applied"] == 0


async def test_acesso_revogado_eleva_floor_invalida_credenciais_antigas_e_troca_verificador(control):
    repository, device_id = await device_with_code(control, auth_epoch=1, version=1)
    event = JournalEvent(event_id="op-rot-1", kind="access_revoked", device_id=device_id, epoch=3,
                         recovery_code_version=2, operation_id="op-rot", recovery_code_hmac="e" * 64,
                         hash_key_version="v1", occurred_at=NOW)
    control[1].append("recoveryCodes/" + "e" * 64)

    report = await RestoreReplay(repository).apply([event], NOW)

    assert report.counts["applied"] == 1
    device = DeviceDocument.model_validate(await read(repository, "devices/" + device_id))
    assert device.auth_epoch == 3 and device.recovery_code_version == 2
    assert device.recovery_code_hmac == "e" * 64
    # As credenciais revogadas não podem voltar a valer: hashes trocados por valores que ninguém possui.
    assert device.tv_bearer_hash != "b" * 64 and device.device_key_hash != "c" * 64
    old = RecoveryCodeDocument.model_validate(await read(repository, "recoveryCodes/" + "d" * 64))
    new = RecoveryCodeDocument.model_validate(await read(repository, "recoveryCodes/" + "e" * 64))
    assert old.status == "consumed" and old.consumed_by_operation_id == "op-rot"
    assert new.status == "active" and new.version == 2

    again = await RestoreReplay(repository).apply([event], NOW)
    assert again.counts["already_applied"] == 1


async def test_evento_antigo_nunca_regride_estado_mais_novo(control):
    repository, device_id = await device_with_code(control, auth_epoch=5, version=4, code="f" * 64)
    stale = JournalEvent(event_id="op-old-1", kind="access_revoked", device_id=device_id, epoch=2,
                         recovery_code_version=2, operation_id="op-old", recovery_code_hmac="a" * 64,
                         hash_key_version="v1", occurred_at=NOW - timedelta(days=1))
    before = await read(repository, "devices/" + device_id)

    report = await RestoreReplay(repository).apply([stale], NOW)

    assert report.counts["already_applied"] == 1
    assert await read(repository, "devices/" + device_id) == before


async def test_sem_verificador_recuperavel_bloqueia_o_fluxo_e_nao_reativa_o_codigo_antigo(control):
    repository, device_id = await device_with_code(control, auth_epoch=1, version=1, code="9" * 64)
    event = JournalEvent(event_id="op-nov-1", kind="access_revoked", device_id=device_id, epoch=2,
                         recovery_code_version=2, occurred_at=NOW)

    report = await RestoreReplay(repository).apply([event], NOW)

    assert report.counts["verifier_missing_blocked"] == 1 and not report.complete
    device = DeviceDocument.model_validate(await read(repository, "devices/" + device_id))
    assert device.recovery_code_hmac is None and device.recovery_hash_key_version is None
    old = RecoveryCodeDocument.model_validate(await read(repository, "recoveryCodes/" + "9" * 64))
    assert old.status == "consumed"


async def test_licenca_revogada_eleva_geracao_e_revoga_o_grant_sem_duplicar(control):
    repository, device_id = await device_with_code(control, generation=4, code="8" * 64)
    order_id = "order-" + uuid.uuid4().hex
    grant_path = "grants/" + order_id
    control[1].append(grant_path)
    grant = GrantDocument(order_id=order_id, device_id=device_id, provider_payment_id="pay-1",
                          confirmed_at=NOW - timedelta(days=2), starts_at=NOW - timedelta(days=2),
                          expires_at=NOW + timedelta(days=300), status="valid")
    await repository.transact((grant_path,), lambda _: TransactionPlan(None, {grant_path: grant}))
    event = JournalEvent(event_id="refund-1", kind="license_revoked", device_id=device_id,
                         generation=5, reference_id=order_id, occurred_at=NOW)

    report = await RestoreReplay(repository).apply([event], NOW)

    assert report.counts["applied"] == 1
    assert DeviceDocument.model_validate(
        await read(repository, "devices/" + device_id)).entitlement_generation == 5
    assert GrantDocument.model_validate(await read(repository, grant_path)).status == "refunded"
    assert (await RestoreReplay(repository).apply([event], NOW)).counts["already_applied"] == 1


async def test_dispositivo_ausente_e_reportado_e_nada_e_criado(control):
    repository, _ = control
    ghost = "ghost-" + uuid.uuid4().hex
    events = [
        JournalEvent(event_id="e1", kind="source_deleted", device_id=ghost, source_id="s", revision=1,
                     occurred_at=NOW),
        JournalEvent(event_id="e2", kind="access_revoked", device_id=ghost, epoch=2, occurred_at=NOW),
        JournalEvent(event_id="e3", kind="license_revoked", device_id=ghost, generation=2,
                     reference_id="order-x", occurred_at=NOW),
    ]

    report = await RestoreReplay(repository).apply(events, NOW)

    assert report.counts["device_absent"] == 3 and report.complete
    assert await read(repository, "devices/" + ghost) is None
    assert await read(repository, "devices/" + ghost + "/tombstones/s") is None

def test_cli_recusa_a_base_ativa_antes_de_tocar_a_rede(capsys):
    from app.portal.restore_replay import main

    for database in ("(default)", ""):
        code = main(["--project-id", "projeto", "--database", database, "--journal-bucket", "bucket"])
        assert code == 3
    assert "isolated_restore_database_required" in capsys.readouterr().out
