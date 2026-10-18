"""Contrato da feature 081 (venda em produção). Travado pelo sdd-plan: o sdd-execute só faz passar."""
import os
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
import pytest
from pydantic import SecretStr, ValidationError

from app.portal.auth import AuthError
from app.portal.pix_orders import PixOrders
from app.portal.providers.mercadopago_preflight import preflight
from app.portal.settings import PortalSettings


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("CCPLAY_PORTAL_") or key in {"PORT", "FIRESTORE_EMULATOR_HOST"}:
            monkeypatch.delenv(key)


PRODUCTION = {
    "environment": "production", "project_id": "real-project",
    "public_origin": "https://portal.example.test", "checkout_enabled": True,
    "aes_key": "a" * 32, "signing_key": "b" * 32,
    "identity_hmac_key": "c" * 32, "recovery_hmac_key": "d" * 32,
    "mercadopago_merchant_id": "123", "mercadopago_access_token": "token",
    "mercadopago_webhook_secret": "secret", "mercadopago_live_mode": True,
}


# FR-001, FR-002, FR-003, SC-003: produção libera venda só em modo real e completa; nada de teste em produção.
def test_production_releases_checkout_only_live_and_complete_and_refuses_test_options():
    released = PortalSettings(**PRODUCTION)
    assert released.checkout_enabled and released.mercadopago_live_mode
    with pytest.raises(ValidationError, match="live_mode_required"):
        PortalSettings(**{**PRODUCTION, "mercadopago_live_mode": False})
    for missing in ("mercadopago_merchant_id", "mercadopago_access_token", "mercadopago_webhook_secret"):
        with pytest.raises(ValidationError, match="checkout_credentials_required"):
            PortalSettings(**{key: value for key, value in PRODUCTION.items() if key != missing})
    with pytest.raises(ValidationError, match="test_live_mode_only_staging"):
        PortalSettings(**{**PRODUCTION, "mercadopago_allow_test_live_mode": True})
    with pytest.raises(ValidationError, match="pix_test_payer_only_staging"):
        PortalSettings(**{**PRODUCTION, "pix_test_payer_email": "buyer@testuser.com"})
    staging = {**PRODUCTION, "environment": "staging", "mercadopago_live_mode": False}
    assert PortalSettings(**staging).checkout_enabled
    with pytest.raises(ValidationError, match="checkout_not_released"):
        PortalSettings(**{**staging, "mercadopago_live_mode": True})


# FR-010: venda aberta sem Pix configurado é um estado (409 pix_disabled), não uma pane; venda fechada segue 503.
async def test_pix_off_with_sale_open_is_pix_disabled_and_closed_sale_stays_unavailable():
    payments = SimpleNamespace(checkout_enabled=True, repository=None)
    now = datetime.now(UTC)
    with pytest.raises(AuthError) as caught:
        await PixOrders(payments, payer_domain=None).pix(None, "r" * 43, False, now)
    assert (caught.value.code, caught.value.status) == ("pix_disabled", 409)
    payments.checkout_enabled = False
    with pytest.raises(AuthError) as caught:
        await PixOrders(payments, payer_domain="pagamentos.fixture.test").pix(None, "r" * 43, False, now)
    assert (caught.value.code, caught.value.status) == ("service_unavailable", 503)


# FR-004, SC-006, Constitution: Segredos Fora dos Clientes e dos Logs — só booleanos; token só vai ao Mercado Pago.
async def test_preflight_reports_only_booleans_and_never_leaks_the_token():
    def scenario(owner: int, tags: list[str], methods: list[str], webhook_status: int):
        seen = []

        def transport(request: httpx.Request):
            seen.append(request)
            if request.url.host == "api.mercadopago.com":
                assert request.headers["authorization"] == "Bearer fake-private-access-token"
                if request.url.path == "/users/me":
                    return httpx.Response(200, json={"id": owner, "nickname": "fake-private-nick",
                                                     "tags": tags, "site_id": "MLB"})
                if request.url.path == "/v1/payment_methods":
                    return httpx.Response(200, json=[{"id": key, "status": "active"} for key in methods])
            if (request.url.host == "portal.fixture.test"
                    and request.url.path == "/portal/v1/payments/mercadopago/webhook"):
                assert "authorization" not in request.headers and "x-signature" not in request.headers
                return httpx.Response(webhook_status, json={"code": "unauthorized"})
            return httpx.Response(404, json={"message": "fake-private-unexpected"})
        return seen, transport

    expectations = (
        ((456, ["normal"], ["visa", "pix"], 401),
         {"owner_matches": True, "real_account": True, "pix_enabled": True, "webhook_rejects_unsigned": True}),
        ((999, ["test_user"], ["visa"], 200),
         {"owner_matches": False, "real_account": False, "pix_enabled": False, "webhook_rejects_unsigned": False}),
    )
    for arguments, expected in expectations:
        seen, transport = scenario(*arguments)
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            result = await preflight(SecretStr("fake-private-access-token"), "456",
                                     "https://portal.fixture.test", client=client)
        assert result == expected
        assert all(type(value) is bool for value in result.values())
        assert "fake-private" not in repr(result)
        assert any(request.url.host == "portal.fixture.test" for request in seen)
