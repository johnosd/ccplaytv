from datetime import UTC, datetime

import httpx
import pytest
from pydantic import SecretStr

from app.portal.commercial_models import OrderDocument
from app.portal.providers.base import PaymentProviderError
from app.portal.providers.mercadopago import MercadoPagoProvider


def order():
    now = datetime.now(UTC)
    return OrderDocument(order_id="order-fixture", device_id="tv-fixture", reference="order-fixture",
                         created_at=now, updated_at=now, reconcile_after=now)


async def test_preference_uses_fixed_server_offer_and_only_official_https_checkout():
    calls = []
    checkout = "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture"
    def transport(request):
        import json
        calls.append(json.loads(request.content))
        assert request.headers["authorization"] == "Bearer fake-private-access-token"
        assert request.url.host == "api.mercadopago.com"
        return httpx.Response(201, json={"id": "fixture", "init_point": checkout})
    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        provider = MercadoPagoProvider(SecretStr("fake-private-access-token"), "https://portal.fixture.test", live_mode=True, client=client)
        preference = await provider.preference(order())
        assert preference.checkout_url == checkout
        assert calls[0]["items"][0]["unit_price"] == 35 and calls[0]["items"][0]["currency_id"] == "BRL"
        assert calls[0]["external_reference"] == "order-fixture"
        assert "tv-fixture" not in str(calls) and "fake-private" not in repr(preference)
        for checkout in ("https://attacker.invalid/", "http://www.mercadopago.com.br/", "https://secret@www.mercadopago.com.br/", "https://www.mercadopago.com.br:invalid/"):
            with pytest.raises(PaymentProviderError):
                await provider.preference(order())


async def test_authenticated_lookup_returns_allowlist_without_card_payer_or_provider_exception():
    value = {"id": 123, "collector_id": 456, "external_reference": "order-fixture", "status": "approved",
        "transaction_amount": 35.0, "currency_id": "BRL", "transaction_amount_refunded": 0,
        "date_approved": "2026-10-11T12:00:00-03:00", "date_last_updated": "2026-10-11T15:00:01Z", "live_mode": True,
        "payer": {"email": "fake-private@example.invalid"}, "card": {"first_six_digits": "fake-private"}}
    def transport(_request):
        return httpx.Response(200, json=value)
    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        provider = MercadoPagoProvider(SecretStr("fake-private-access-token"), "https://portal.fixture.test", live_mode=True, client=client)
        observed = await provider.payment("123")
        assert observed.price_minor == 3500 and observed.merchant_id == "456"
        assert observed.confirmed_at == datetime(2026, 10, 11, 15, tzinfo=UTC)
        assert "fake-private" not in repr(observed)
        value["transaction_amount_refunded"] = 35
        assert (await provider.payment("123")).status == "refunded"
        value["id"] = 124
        with pytest.raises(PaymentProviderError):
            await provider.payment("123")
        with pytest.raises(PaymentProviderError):
            await provider.payment("https://private.invalid")


async def test_provider_network_errors_redirects_and_invalid_amount_are_sanitized():
    def transport(_request):
        raise httpx.ConnectError("https://private.invalid?token=fake-private")
    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        provider = MercadoPagoProvider(SecretStr("fake-private-access-token"), "https://portal.fixture.test", live_mode=False, client=client)
        with pytest.raises(PaymentProviderError) as caught:
            await provider.payment("123")
        assert str(caught.value) == "payment_provider_unavailable"
