"""Marcadores fictícios na fronteira HTTP, sem imprimir dados de ambiente."""

import logging

import httpx

from app.portal.application import create_app
from app.portal.settings import PortalSettings
from tests.portal.test_payments import ORIGIN, cleanup, prepared


async def test_invalid_future_fields_and_credentials_never_reach_errors_or_logs(control, tmp_path, caplog):
    payments, _, _, device, bearer, _ = await prepared(control)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = payments.auth
    app.state.portal_licensing = payments.licensing
    marker = "fixture-private-marker-not-a-real-secret"
    caplog.set_level(logging.DEBUG)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            cases = (
                ("/portal/v1/device/entitlement/refresh", {"previousJws": marker, "futurePrivateField": marker},
                 {"origin": "null", "authorization": "Bearer " + bearer}),
                ("/portal/v1/sessions/manual", {"displayId": device.display_id, "deviceKey": marker, "futurePrivateField": marker},
                 {"origin": ORIGIN}),
            )
            for path, body, headers in cases:
                response = await client.post(path, json=body, headers=headers)
                assert response.status_code == 422
                assert response.json() == {"code": "invalid_input", "retryable": False}
                assert marker not in response.text
                assert response.headers["cache-control"] == "no-store"
                assert response.headers["referrer-policy"] == "no-referrer"
                assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
            assert marker not in caplog.text and bearer not in caplog.text
    finally:
        await cleanup(control, device.device_id)
