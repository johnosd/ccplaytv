import asyncio
import hashlib
import hmac
from dataclasses import replace
from datetime import timedelta

import httpx
import pytest
from pydantic import SecretStr

from app.portal.application import create_app
from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token
from app.portal.licensing import LicensingService
from app.portal.payments import PaymentService
from app.portal.providers.base import PaymentObservation, PaymentProviderError
from app.portal.providers.fake import FakePaymentProvider
from app.portal.recovery_journal import MemoryJournal
from app.portal.settings import PortalSettings
from tests.portal.test_auth import ORIGIN, remember, seeded
from tests.portal.test_commercial_repository import cleanup_commercial
from tests.portal.test_crypto import make_crypto


async def prepared(control):
    auth, device, bearer, _, now = await seeded(control)
    principal = await auth.authenticate_tv(bearer)
    licensing = LicensingService(auth, make_crypto(), MemoryJournal(environment="test"))
    provider = FakePaymentProvider(environment="test")
    payments = PaymentService(auth, licensing, provider, merchant_id="456", live_mode=False, checkout_enabled=True)
    control[1].append("rateLimits/" + auth.tokens.digest("rate_limit", "orders/" + device.device_id))
    return payments, provider, principal, device, bearer, now


async def cleanup(control, device_id, payment_ids=()):
    await cleanup_commercial(control, device_id)
    from google.cloud.firestore_v1.base_query import FieldFilter
    control[1].extend([row.reference.path async for row in control[0].client.collection("jobs").where(filter=FieldFilter("deviceId", "==", device_id)).stream()])
    for payment_id in payment_ids:
        control[1].extend(("paymentEvents/" + payment_id, "jobs/" + PaymentService.payment_job(payment_id)))


def observed(order, now, payment_id="123"):
    return PaymentObservation(payment_id, order.order_id, "456", 3500, "BRL", "approved", now, now, False)


async def test_checkout_response_loss_retry_reuses_order_and_pending_never_rebuys(control):
    payments, provider, principal, device, _, now = await prepared(control)
    request_id = new_token()
    try:
        provider.unavailable = True
        with pytest.raises(AuthError):
            await payments.checkout(principal, request_id, now)
        provider.unavailable = False
        order = await payments.checkout(principal, request_id, now)
        assert order.status == "pending"
        assert (await payments.checkout(principal, new_token(), now)).order_id == order.order_id
        assert len(provider.preferences) == 1
        assert (await control[0].client.document("devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 0
    finally:
        await cleanup(control, device.device_id)


async def test_duplicate_notification_lookup_claims_and_provider_failure_preserve_rights(control):
    payments, provider, principal, device, _, now = await prepared(control)
    try:
        order = await payments.checkout(principal, new_token(), now)
        provider.observations["123"] = observed(order, now)
        await asyncio.gather(*(payments.record_notification("123", now) for _ in range(2)))
        assert all(await asyncio.gather(*(payments.reconcile_payment("123", now) for _ in range(2))))
        row = (await control[0].client.document("devices/" + device.device_id).get()).to_dict()
        assert row["entitlementGeneration"] == 1
        provider.unavailable = True
        with pytest.raises(PaymentProviderError):
            await payments.reconcile_payment("123", now)
        assert (await payments.read_order(principal, order.order_id, now + timedelta(seconds=11))).status == "approved"
        assert (await control[0].client.document("devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 1
    finally:
        await cleanup(control, device.device_id, ("123",))


async def test_merchant_price_currency_reference_and_mode_must_match_authenticated_lookup(control):
    payments, provider, principal, device, _, now = await prepared(control)
    try:
        order = await payments.checkout(principal, new_token(), now)
        for changes in ({"merchant_id": "other"}, {"price_minor": 1}, {"currency": "USD"},
                        {"external_reference": "missing-order"}, {"live_mode": True}, {"confirmed_at": now + timedelta(days=1)}):
            provider.observations["123"] = replace(observed(order, now), **changes)
            with pytest.raises(PaymentProviderError):
                await payments.reconcile_payment("123", now)
        assert (await control[0].client.document("orders/" + order.order_id).get()).to_dict()["status"] == "pending"
        assert (await control[0].client.document("devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 0
    finally:
        await cleanup(control, device.device_id)


async def test_http_webhook_signature_persists_minimal_event_without_grant_and_tv_is_bearer_only(control, tmp_path):
    payments, provider, principal, device, bearer, now = await prepared(control)
    secret = "fixture-webhook-secret"
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path,
                                   mercadopago_webhook_secret=SecretStr(secret)))
    app.state.portal_auth = payments.auth
    app.state.portal_payments = payments
    app.state.portal_licensing = payments.licensing
    try:
        order = await payments.checkout(principal, new_token(), now)
        provider.observations["123"] = observed(order, now)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            ts, request_id = "1791720000", "fixture-request"
            signature = hmac.new(secret.encode(), ("id:123;request-id:" + request_id + ";ts:" + ts + ";").encode(), hashlib.sha256).hexdigest()
            headers = {"x-signature": "ts=" + ts + ",v1=" + signature, "x-request-id": request_id}
            body = {"type": "payment", "data": {"id": "123"}, "transaction_amount": 1,
                    "payer": {"email": "fake-private@example.invalid"}, "card": {"secret": "fake-private"}}
            path = "/portal/v1/payments/mercadopago/webhook?data.id=123"
            assert (await client.post(path, json=body)).status_code == 401
            assert (await client.post(path + "&data.id=456", headers=headers, json=body)).status_code == 401
            received = await client.post(path, headers=headers, json=body)
            assert received.status_code == 200 and received.json() == {"state": "received"}
            stored = (await control[0].client.document("paymentEvents/123").get()).to_dict()
            assert "fake-private" not in str(stored) and "transaction_amount" not in str(stored)
            assert (await control[0].client.document("devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 0
            assert (await client.get("/portal/v1/device/entitlement", headers={"origin": "null"})).status_code == 401
            token = await client.get("/portal/v1/device/entitlement", headers={"origin": "null", "authorization": "Bearer " + bearer})
            assert token.status_code == 200 and set(token.json()) == {"jws"}
            invite = await payments.auth.create_invite(principal, "manage", now)
            remember(control, payments.auth, "invites", "invite", invite.token)
            exchanged = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN}, json={"token": invite.token})
            remember(control, payments.auth, "sessions", "session", client.cookies.get("ccplay_portal_session"))
            offer = await client.get("/portal/v1/offer")
            assert offer.status_code == 200 and offer.json()["priceMinor"] == 3500 and offer.json()["checkoutEnabled"] is False
            altered = await client.post("/portal/v1/orders", headers={"origin": ORIGIN, "x-csrf-token": exchanged.json()["csrfToken"], "idempotency-key": new_token()}, json={"priceMinor": 1})
            assert altered.status_code == 422
            status = await client.get("/portal/v1/orders/" + order.order_id)
            assert status.status_code == 200 and status.json()["status"] == "approved"
    finally:
        await cleanup(control, device.device_id, ("123",))


async def test_worker_recovers_approval_and_refund_when_webhook_is_missing(control):
    from app.portal.operations import DeletionService
    from app.portal.worker import PortalWorker
    payments, provider, principal, device, _, now = await prepared(control)
    try:
        order = await payments.checkout(principal, new_token(), now)
        provider.observations["123"] = observed(order, now)
        worker = PortalWorker(payments.repository, DeletionService(payments.repository, payments.licensing.journal),
                              licensing=payments.licensing, payments=payments)
        result = await worker.run_once(now)
        assert result.failed == 0 and result.completed >= 1
        assert (await control[0].client.document("orders/" + order.order_id).get()).to_dict()["status"] == "approved"
        later = now + timedelta(hours=1, seconds=1)
        provider.observations["123"] = replace(observed(order, now), status="refunded", updated_at=later)
        result = await worker.run_once(later)
        assert result.failed == 0
        assert (await control[0].client.document("orders/" + order.order_id).get()).to_dict()["status"] == "refunded"
    finally:
        from tests.portal.test_licensing import cleanup_licenses
        await cleanup_licenses(control, device.device_id)
        await cleanup(control, device.device_id, ("123",))
