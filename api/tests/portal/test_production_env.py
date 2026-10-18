"""081/T009: o arquivo gerado sobe a configuração de produção e a geração nunca imprime segredos."""
import json
import os
import re

import pytest

from app.portal.auth_tokens import AuthTokens
from app.portal.crypto import PortalCrypto
from app.portal.production_env import main
from app.portal.recovery_codes import RecoveryCodes
from app.portal.settings import PortalSettings


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("CCPLAY_PORTAL_") or key in {"PORT", "FIRESTORE_EMULATOR_HOST"}:
            monkeypatch.delenv(key)


def parse(text: str) -> dict[str, str]:
    values, block = {}, None
    for line in text.splitlines():
        if block and line.startswith("  "):
            values[block] += line[2:] + "\n"
            continue
        block = None
        key, raw = line.split(": ", 1)
        if raw == "|":
            block, values[key] = key, ""
        else:
            values[key] = json.loads(raw)
    return values


def test_generated_file_loads_as_production_and_output_has_only_names_and_public_key(tmp_path, capsys):
    out = tmp_path / "production.env.yaml"
    assert main(["--project-id", "ccplaytv-prod-fixture", "--public-origin", "https://portal.fixture.test",
                 "--out", str(out)]) == 0
    printed = capsys.readouterr().out
    values = parse(out.read_text(encoding="utf-8"))
    report = json.loads(printed)
    assert report["written"] == list(values)
    assert set(report["licensePublicKeys"]) == {"prod1"} and "d" not in report["licensePublicKeys"]["prod1"]
    for key, value in values.items():
        if key.endswith(("_KEY", "_EPOCH")):
            assert value.strip().splitlines()[0][:12] not in printed
    assert "PRIVATE KEY" not in printed
    settings = PortalSettings(**{key.removeprefix("CCPLAY_PORTAL_").lower(): value for key, value in values.items()})
    assert (settings.environment, settings.checkout_enabled, settings.mercadopago_live_mode) == ("production", False, True)
    crypto = PortalCrypto.from_settings(settings)
    assert crypto.public_jwks()["keys"][0]["x"] == report["licensePublicKeys"]["prod1"]["x"]
    AuthTokens.from_settings(settings)
    RecoveryCodes.from_settings(settings)


def test_never_overwrites_and_rejects_demo_or_http(tmp_path, capsys):
    out = tmp_path / "production.env.yaml"
    out.write_text("existing", encoding="utf-8")
    assert main(["--project-id", "ccplaytv-prod-fixture", "--public-origin", "https://portal.fixture.test",
                 "--out", str(out)]) == 1
    assert json.loads(capsys.readouterr().out) == {"code": "env_file_exists"}
    assert out.read_text(encoding="utf-8") == "existing"
    for project, origin in (("demo-ccplaytv-portal", "https://portal.fixture.test"),
                            ("ccplaytv-prod-fixture", "http://portal.fixture.test")):
        assert main(["--project-id", project, "--public-origin", origin, "--out", str(tmp_path / "other.yaml")]) == 1
        assert re.fullmatch(r'\{"code": "invalid_[a-z_]+"\}\n', capsys.readouterr().out)
    assert not (tmp_path / "other.yaml").exists()
