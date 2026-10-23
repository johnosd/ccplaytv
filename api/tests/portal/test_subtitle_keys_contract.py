"""Contrato da feature 091 (chave de legenda enviada pelo portal): cifrada em repouso, uma pendente POR FORNECEDOR, só a
mesma TV a lê, apagada ao concluir, nunca em resposta ao navegador. Exige emulador (`PORTAL_TEST_FIRESTORE=1`).
Travado pelo sdd-plan: o sdd-execute só faz passar."""

import json
from datetime import UTC, datetime

import pytest

from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token
from app.portal.subtitle_keys import SubtitleKeyService
from tests.portal.test_auth import seeded
from tests.portal.test_crypto import make_crypto

MARK_OS = "oschavemarcador091abcdef0123456789"
MARK_SD = "sdchavemarcador091abcdef0123456789"
SECOND = "sdsegundachave091abcdef0123456789"


def op_id(now: datetime | None = None) -> str:
    return f"op-{int((now or datetime.now(UTC)).timestamp() * 1000)}-{new_token()}"


def remember_keys(control, auth, device_id):
    for provider in ("opensubtitles", "subdl"):
        control[1].append(f"devices/{device_id}/integrations/subtitles-{provider}")
    control[1].extend("rateLimits/" + auth.tokens.digest("rate_limit", scope + "/" + device_id)
                      for scope in ("subtitle-key", "subtitle-pull", "subtitle-ack"))


async def stored(control, device_id, provider):
    return (await control[0].client.document(f"devices/{device_id}/integrations/subtitles-{provider}").get()).to_dict()


async def test_per_provider_encrypted_pending_only_same_tv_pulls_replace_and_ack_erase_only_their_own(control):
    auth, device, _, _, now = await seeded(control)
    _, other, _, _, _ = await seeded(control)
    remember_keys(control, auth, device.device_id)
    remember_keys(control, auth, other.device_id)
    service = SubtitleKeyService(auth, make_crypto())
    principal, foreign = auth._principal(device), auth._principal(other)
    first, second = op_id(now), op_id(now)
    assert await service.request(principal, "opensubtitles", first, "set", MARK_OS, now) == {
        "operationId": first, "provider": "opensubtitles", "action": "set", "state": "pending"}
    await service.request(principal, "subdl", second, "set", MARK_SD, now)

    # Em repouso: um documento por fornecedor, envelope presente, nunca o texto da chave.
    for provider, mark in (("opensubtitles", MARK_OS), ("subdl", MARK_SD)):
        row = await stored(control, device.device_id, provider)
        assert mark not in json.dumps(row, default=str) and row["envelope"] is not None

    # Só a mesma TV recebe as chaves, uma operação por fornecedor, em ordem estável; reentrega até o ack terminal.
    expected = [{"provider": "opensubtitles", "operationId": first, "action": "set", "key": MARK_OS},
                {"provider": "subdl", "operationId": second, "action": "set", "key": MARK_SD}]
    assert (await service.pull(principal, now))["operations"] == expected
    assert (await service.pull(principal, now))["operations"] == expected
    with pytest.raises(AuthError):  # outra TV nem autentica no documento desta
        await service.pull(foreign, now)

    # Substituir um fornecedor não mexe no outro, e o envelope antigo some.
    third = op_id(now)
    before = (await stored(control, device.device_id, "opensubtitles"))["envelope"]
    await service.request(principal, "subdl", third, "set", SECOND, now)
    operations = (await service.pull(principal, now))["operations"]
    assert operations == [expected[0], {"provider": "subdl", "operationId": third, "action": "set", "key": SECOND}]
    assert (await stored(control, device.device_id, "opensubtitles"))["envelope"] == before

    # Ack de outro fornecedor ou de operação que não é a corrente é idempotente e não apaga nada.
    await service.ack(principal, "opensubtitles", third, "applied", None, now)
    await service.ack(principal, "subdl", second, "applied", None, now)
    assert (await stored(control, device.device_id, "opensubtitles"))["envelope"] is not None
    assert (await stored(control, device.device_id, "subdl"))["envelope"] is not None

    # Ack terminal apaga só o envelope do fornecedor confirmado.
    await service.ack(principal, "opensubtitles", first, "applied", None, now)
    assert (await stored(control, device.device_id, "opensubtitles"))["envelope"] is None
    assert (await stored(control, device.device_id, "subdl"))["envelope"] is not None
    assert [row["provider"] for row in (await service.pull(principal, now))["operations"]] == ["subdl"]

    # O que o navegador vê: estado por fornecedor, nunca uma chave.
    view = await service.view(principal, now)
    assert set(view) == {"opensubtitles", "subdl"}
    assert view["opensubtitles"]["pending"] is None and view["opensubtitles"]["last"]["result"] == "applied"
    assert view["subdl"]["pending"]["action"] == "set"
    printed = json.dumps(view, default=str)
    assert MARK_OS not in printed and MARK_SD not in printed and SECOND not in printed

    # Entrada inválida: fornecedor desconhecido, chave curta, remoção com chave.
    for provider, action, key in (("outro", "set", MARK_SD), ("subdl", "set", "curta"), ("subdl", "remove", MARK_SD)):
        with pytest.raises(AuthError):
            await service.request(principal, provider, op_id(now), action, key, now)
