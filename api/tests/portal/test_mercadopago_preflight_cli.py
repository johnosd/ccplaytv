"""081/T011: CLI da checagem prévia imprime só código ou booleanos, nunca os valores do ambiente."""
import json
import os

import pytest

from app.portal.providers import mercadopago_preflight as module

ENV = {"CCPLAY_PORTAL_MERCADOPAGO_ACCESS_TOKEN": "fake-private-token",
       "CCPLAY_PORTAL_MERCADOPAGO_MERCHANT_ID": "456",
       "CCPLAY_PORTAL_PUBLIC_ORIGIN": "https://portal.fixture.test"}


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("CCPLAY_PORTAL_"):
            monkeypatch.delenv(key)


def test_missing_or_invalid_configuration_prints_only_a_code(monkeypatch, capsys):
    assert module.main() == 1
    assert json.loads(capsys.readouterr().out) == {"code": "preflight_unavailable"}
    for key, value in {**ENV, "CCPLAY_PORTAL_PUBLIC_ORIGIN": "http://fake-private.invalid"}.items():
        monkeypatch.setenv(key, value)
    assert module.main() == 1
    out = capsys.readouterr().out
    assert json.loads(out) == {"code": "preflight_unavailable"} and "fake-private" not in out


def test_exit_zero_only_when_every_check_passes_and_values_never_printed(monkeypatch, capsys):
    for key, value in ENV.items():
        monkeypatch.setenv(key, value)
    seen = {}

    async def fake(token, merchant_id, origin, *, client=None):
        seen.update(token=token.get_secret_value(), merchant=merchant_id, origin=origin)
        return dict.fromkeys(module.CHECKS, seen.get("all", True))

    monkeypatch.setattr(module, "preflight", fake)
    assert module.main() == 0
    out = capsys.readouterr().out
    assert json.loads(out) == dict.fromkeys(module.CHECKS, True)
    assert seen == {"token": "fake-private-token", "merchant": "456", "origin": "https://portal.fixture.test"}
    assert "fake-private" not in out and "456" not in out

    async def failing(*_args, **_kwargs):
        return {**dict.fromkeys(module.CHECKS, True), "pix_enabled": False}

    monkeypatch.setattr(module, "preflight", failing)
    assert module.main() == 1
    assert json.loads(capsys.readouterr().out)["pix_enabled"] is False

    async def broken(*_args, **_kwargs):
        raise RuntimeError("fake-private-token https://fake-private.invalid")

    monkeypatch.setattr(module, "preflight", broken)
    assert module.main() == 1
    out = capsys.readouterr().out
    assert json.loads(out) == {"code": "preflight_unavailable"} and "fake-private" not in out
