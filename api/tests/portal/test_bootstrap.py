"""Isolamento do bootstrap, configuração fail-closed e respostas sem segredos."""

import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from app.portal.application import create_app
from app.portal.settings import PortalSettings


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("CCPLAY_PORTAL_") or key in {"PORT", "FIRESTORE_EMULATOR_HOST"}:
            monkeypatch.delenv(key)


def local_settings(**kwargs):
    return PortalSettings(FIRESTORE_EMULATOR_HOST="127.0.0.1:8085", **kwargs)


def test_missing_emulator_never_falls_back_to_cloud():
    with pytest.raises(ValidationError, match="local_emulator_required"):
        PortalSettings()
    with pytest.raises(ValidationError, match="local_emulator_loopback_required"):
        PortalSettings(FIRESTORE_EMULATOR_HOST="production.example:443")
    with pytest.raises(ValidationError):
        local_settings(project_id="real-project")


def test_production_rejects_emulator_and_unreleased_checkout():
    with pytest.raises(ValidationError, match="cloud_environment_required"):
        local_settings(environment="production", project_id="real-project")
    with pytest.raises(ValidationError, match="checkout_not_released"):
        local_settings(checkout_enabled=True)
    with pytest.raises(ValidationError, match="private_keys_required"):
        PortalSettings(environment="production", project_id="real-project",
                       public_origin="https://portal.example.test")


@pytest.mark.parametrize("role", ["public", "jobs"])
async def test_health_reserved_routes_and_headers(role, tmp_path):
    (tmp_path / "index.html").write_text("portal fixture", encoding="utf-8")
    app = create_app(local_settings(service_role=role, static_dir=tmp_path))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://test") as client:
        response = await client.get("/health")
        assert response.json() == {"status": "ok"}
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
        for path in ["/portal/v1/unknown", "/internal/portal/jobs/tick"]:
            result = await client.post(path, json={"password": "fake-private"})
            private_tick = role == "jobs" and path == "/internal/portal/jobs/tick"
            assert result.status_code == (503 if private_tick else 404)
            assert result.json() == ({"code": "service_unavailable", "retryable": True}
                                     if private_tick else {"code": "not_found", "retryable": False})
            assert "fake-private" not in result.text
        static = await client.get("/")
        assert static.status_code == (200 if role == "public" else 404)


def test_fresh_entrypoint_import_does_not_import_sql_or_load_dotenv():
    env = {key: value for key, value in os.environ.items()
           if not key.startswith("CCPLAY_PORTAL_")}
    env.update(CCPLAY_PORTAL_ENVIRONMENT="test",
               FIRESTORE_EMULATOR_HOST="127.0.0.1:8085")
    probe = (
        "import portal_main,sys,json; "
        "print(json.dumps([m for m in sys.modules if "
        "m in ('main','app.db') or m.startswith(('sqlalchemy','psycopg','app.routers'))]))"
    )
    result = subprocess.run([sys.executable, "-c", probe], env=env,
                            cwd=Path(__file__).resolve().parents[2],
                            capture_output=True, text=True, check=True)
    assert json.loads(result.stdout) == []


async def test_errors_are_sanitized_before_server_logging(caplog, tmp_path):
    # A rota de erro adicionada pelo teste não deve depender de um build estático local.
    app = create_app(local_settings(static_dir=tmp_path / "not-built"))

    @app.get("/probe-error")
    async def fail():
        raise RuntimeError("fake-private-password https://private.example.test")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://test") as client:
        result = await client.get("/probe-error")
        assert result.status_code == 500
        assert result.json() == {"code": "internal_error", "retryable": True}
        assert "fake-private" not in result.text + caplog.text


def test_firestore_uses_explicit_emulator_and_detects_environment_change(monkeypatch):
    from app.portal.firestore import create_firestore_client

    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
    settings = local_settings()
    client = create_firestore_client(settings)
    assert client.project == "demo-ccplaytv-portal"
    client.close()
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST")
    with pytest.raises(RuntimeError, match="firestore_environment_changed"):
        create_firestore_client(settings)
