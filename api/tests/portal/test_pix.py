"""Feature 073: Pix na TV (D-001–D-006, D-012). Exige emulador (`PORTAL_TEST_FIRESTORE=1`)."""
import logging
from dataclasses import replace
from datetime import timedelta

import httpx
import pytest

from app.portal.application import create_app
from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token
from app.portal.commercial_models import OrderDocument
from app.portal.licensing import AUDIENCE, ISSUER
from app.portal.pix_orders import PixOrders, pending_order
from app.portal.providers.base import PaymentObservation
from app.portal.settings import PortalSettings
from tests.portal.test_auth import ORIGIN
from tests.portal.test_licensing import cleanup_licenses
from tests.portal.test_payments import cleanup, prepared

DOMAIN = "pagamentos.fixture.test"


def remember_pix(control, payments, device_id):
    control[1].append("rateLimits/" + payments.auth.tokens.digest("rate_limit", "pix-refresh/" + device_id))


async def order_row(control, order_id) -> OrderDocument:
    return OrderDocument.model_validate((await control[0].client.document("orders/" + order_id).get()).to_dict())


def approved(order_id, payment_id, at, status="approved"):
    return PaymentObservation(payment_id, order_id, "456", 3500, "BRL", status, at, at, False)


async def test_pix_reuses_valid_charge_expired_needs_renew_and_payer_is_synthetic(control):
    payments, provider, principal, device, _, now = await prepared(control)
    pix = PixOrders(payments, payer_domain=DOMAIN)
    try:
        first = await pix.pix(principal, new_token(), False, now)
        assert first["state"] == "pending" and first["qrCode"].startswith("000201")
        assert (first["priceMinor"], first["termMonths"], first["displayId"]) == (3500, 12, device.display_id)
        again = await pix.pix(principal, new_token(), False, now + timedelta(minutes=5))
        assert (again["orderId"], again["qrCode"]) == (first["orderId"], first["qrCode"])
        assert len(provider.pix_calls) == 1
        payer = provider.pix_calls[0][2]
        assert payer.startswith("tv-") and payer.endswith("@" + DOMAIN) and device.device_id not in payer
        late = now + timedelta(minutes=29, seconds=30)
        expired = await pix.pix(principal, new_token(), False, late)
        assert expired["state"] == "expired" and "qrCode" not in expired and len(provider.pix_calls) == 1
        renewed = await pix.pix(principal, new_token(), True, late)
        assert renewed["state"] == "pending" and renewed["orderId"] == first["orderId"]
        assert renewed["qrCode"] != first["qrCode"] and provider.pix_calls[-1][1] == 2
        # "Gerar novo" com Pix ainda pagável não cria um segundo Pix em paralelo.
        assert (await pix.pix(principal, new_token(), True, late))["qrCode"] == renewed["qrCode"]
        assert len(provider.pix_calls) == 2
        assert renewed["qrCode"] not in repr(await order_row(control, first["orderId"]))
    finally:
        await cleanup(control, device.device_id)


async def test_pix_unavailable_when_sale_off_domain_missing_or_provider_down_and_other_tv_refused(control):
    payments, provider, principal, device, _, now = await prepared(control)
    pix = PixOrders(payments, payer_domain=DOMAIN)
    remember_pix(control, payments, device.device_id)
    other_payments, _, other_principal, other, _, _ = await prepared(control)
    try:
        payments.checkout_enabled = False
        with pytest.raises(AuthError) as caught:
            await pix.pix(principal, new_token(), False, now)
        assert caught.value.status == 503
        payments.checkout_enabled = True
        with pytest.raises(AuthError) as caught:
            await PixOrders(payments, payer_domain=None).pix(principal, new_token(), False, now)
        assert caught.value.status == 503
        provider.unavailable = True
        with pytest.raises(AuthError) as caught:
            await pix.pix(principal, new_token(), False, now)
        assert caught.value.status == 503 and "000201" not in str(caught.value)
        provider.unavailable = False
        view = await pix.pix(principal, new_token(), False, now)
        assert view["state"] == "pending"
        # Pedido de outra TV: a TV autenticada não lê nem concilia (401), mesmo com o orderId em mãos.
        foreign = await PixOrders(other_payments, payer_domain=DOMAIN).pix(other_principal, new_token(), False, now)
        with pytest.raises(AuthError) as caught:
            await pix.refresh(principal, foreign["orderId"], now)
        assert caught.value.status == 401
        assert view["orderId"] != foreign["orderId"]
    finally:
        await cleanup(control, device.device_id)
        await cleanup(control, other.device_id)


async def test_refresh_reconciles_on_demand_and_old_attempt_cancel_keeps_current_pix(control):
    payments, provider, principal, device, _, now = await prepared(control)
    pix = PixOrders(payments, payer_domain=DOMAIN)
    remember_pix(control, payments, device.device_id)
    try:
        first = await pix.pix(principal, new_token(), False, now)
        order_id = first["orderId"]
        old_payment = (await order_row(control, order_id)).pix_payment_id
        late = now + timedelta(minutes=31)
        renewed = await pix.pix(principal, new_token(), True, late)
        current_payment = (await order_row(control, order_id)).pix_payment_id
        assert current_payment != old_payment
        # D-006: o cancelamento da tentativa vencida não derruba o pedido nem o Pix novo.
        provider.observations[old_payment] = PaymentObservation(old_payment, order_id, "456", 3500, "BRL",
                                                                "cancelled", None, late, False)
        assert await payments.reconcile_payment(old_payment, late)
        row = await order_row(control, order_id)
        assert row.status == "pending" and row.pix_qr_code == renewed["qrCode"]
        pending = await pix.refresh(principal, order_id, late + timedelta(seconds=1))
        assert pending["state"] == "pending" and (await control[0].client.document(
            "devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 0
        provider.observations[current_payment] = approved(order_id, current_payment, late + timedelta(minutes=1))
        done = await pix.refresh(principal, order_id, late + timedelta(minutes=2))
        assert done["state"] == "approved" and "qrCode" not in done
        row = await order_row(control, order_id)
        assert row.status == "approved" and row.pix_qr_code is None
        assert (await control[0].client.document("devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 1
    finally:
        await cleanup_licenses(control, device.device_id)
        await cleanup(control, device.device_id)


async def test_second_approved_payment_on_same_order_grants_once_more_and_refund_hits_only_it(control):
    payments, provider, principal, device, _, now = await prepared(control)
    pix = PixOrders(payments, payer_domain=DOMAIN)
    try:
        first = await pix.pix(principal, new_token(), False, now)
        order_id = first["orderId"]
        checkout = await payments.checkout(principal, new_token(), now)
        assert checkout.order_id == order_id
        pix_payment = (await order_row(control, order_id)).pix_payment_id
        card_payment = "777"
        provider.observations[pix_payment] = approved(order_id, pix_payment, now)
        provider.observations[card_payment] = approved(order_id, card_payment, now + timedelta(minutes=1))
        later = now + timedelta(minutes=2)
        assert await payments.reconcile_payment(pix_payment, later)
        assert await payments.reconcile_payment(card_payment, later)
        assert await payments.reconcile_payment(card_payment, later)  # notificação repetida não soma
        state = (await control[0].client.document("devices/" + device.device_id + "/licensing/current").get()).to_dict()
        assert len(state["grantOrderIds"]) == 2
        token = await payments.licensing.entitlement(principal, later)
        claims = payments.licensing.crypto.verify(token, issuer=ISSUER, audience=AUDIENCE, device_id=device.device_id)
        assert claims["state"] == "active" and claims["expiresAt"] > int((now + timedelta(days=700)).timestamp() * 1000)
        surplus_id = next(value for value in state["grantOrderIds"] if value != order_id)
        refunded_at = now + timedelta(minutes=5)
        provider.observations[card_payment] = replace(provider.observations[card_payment], status="refunded", updated_at=refunded_at)
        assert await payments.reconcile_payment(card_payment, refunded_at)
        assert (await order_row(control, surplus_id)).status == "refunded"
        assert (await order_row(control, order_id)).status == "approved"
        token = await payments.licensing.entitlement(principal, refunded_at)
        claims = payments.licensing.crypto.verify(token, issuer=ISSUER, audience=AUDIENCE, device_id=device.device_id)
        assert claims["state"] == "active" and claims["expiresAt"] < int((now + timedelta(days=400)).timestamp() * 1000)
    finally:
        await cleanup_licenses(control, device.device_id)
        await cleanup(control, device.device_id, (pix_payment, card_payment))


async def test_portal_sees_pending_pix_without_code_and_no_new_charge(control):
    # 073/US2/AC3, FR-010: o portal avisa o Pix pendente da TV; o aviso nunca traz o copia-e-cola e não cobra de novo.
    payments, provider, principal, device, _, now = await prepared(control)
    pix = PixOrders(payments, payer_domain=DOMAIN)
    try:
        assert await pending_order(payments.repository, principal, now) is None
        view = await pix.pix(principal, new_token(), False, now)
        notice = await pending_order(payments.repository, principal, now + timedelta(minutes=1))
        assert notice == {"orderId": view["orderId"], "method": "pix", "expiresAt": view["expiresAt"]}
        assert "000201" not in str(notice) and len(provider.pix_calls) == 1
        # Pagar com cartão no portal usa o MESMO pedido pendente (nada de pedido novo).
        assert (await payments.checkout(principal, new_token(), now)).order_id == view["orderId"]
        # Pix vencido sem checkout: o aviso de Pix some; com checkout aberto, vira aviso de checkout.
        assert (await pending_order(payments.repository, principal, now + timedelta(minutes=31)))["method"] == "checkout"
        pix_payment = (await order_row(control, view["orderId"])).pix_payment_id
        provider.observations[pix_payment] = approved(view["orderId"], pix_payment, now)
        assert await payments.reconcile_payment(pix_payment, now + timedelta(minutes=2))
        assert await pending_order(payments.repository, principal, now + timedelta(minutes=2)) is None
    finally:
        await cleanup_licenses(control, device.device_id)
        await cleanup(control, device.device_id)


async def test_tv_refresh_reconciles_open_card_order_without_webhook(control, tmp_path):
    # T034: cartão pago no Checkout Pro do portal, webhook recusado — o Atualizar da TV concilia e recebe a licença.
    payments, provider, principal, device, bearer, now = await prepared(control)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path, pix_payer_domain=DOMAIN))
    app.state.portal_auth = payments.auth
    app.state.portal_payments = payments
    app.state.portal_licensing = payments.licensing
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    try:
        order = await payments.checkout(principal, new_token(), now)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            path = "/portal/v1/device/entitlement/refresh"
            claims = lambda response: payments.licensing.crypto.verify(response.json()["jws"], issuer=ISSUER,
                                                                       audience=AUDIENCE, device_id=device.device_id)
            provider.observations["901"] = approved(order.order_id, "901", now)
            provider.unavailable = True  # provedor fora do ar: o Atualizar ainda responde com a licença atual
            assert claims(await client.post(path, headers=tv, json={}))["state"] == "trial"
            assert (await order_row(control, order.order_id)).status in {"created", "pending"}
            provider.unavailable = False
            active = claims(await client.post(path, headers=tv, json={}))
            assert active["state"] == "active" and (await order_row(control, order.order_id)).status == "approved"
    finally:
        await cleanup_licenses(control, device.device_id)
        await cleanup(control, device.device_id, ("901",))


def test_sandbox_test_payer_is_refused_outside_staging_and_test():
    # 073/R-001: o comprador de teste do sandbox nunca pode chegar a produção nem a live mode.
    with pytest.raises(ValueError):
        PortalSettings(environment="development", project_id="demo-x", firestore_emulator_host="127.0.0.1:8085",
                       pix_test_payer_email="test_user_1@testuser.com")
    assert PortalSettings(environment="test", project_id="demo-x", firestore_emulator_host="127.0.0.1:8085",
                          pix_test_payer_email="test_user_1@testuser.com").pix_test_payer_email == "test_user_1@testuser.com"


async def test_staging_test_payer_replaces_synthetic_email_only_when_set(control):
    payments, provider, principal, device, _, now = await prepared(control)
    try:
        await PixOrders(payments, payer_domain=None, test_payer_email="test_user_1@testuser.com").pix(principal, new_token(), False, now)
        assert provider.pix_calls[-1][2] == "test_user_1@testuser.com"
    finally:
        await cleanup(control, device.device_id)


async def test_tv_routes_are_bearer_only_strict_no_store_and_never_log_the_code(control, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    payments, _, _, device, bearer, _ = await prepared(control)
    remember_pix(control, payments, device.device_id)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path, pix_payer_domain=DOMAIN))
    app.state.portal_auth = payments.auth
    app.state.portal_payments = payments
    app.state.portal_licensing = payments.licensing
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            path = "/portal/v1/device/orders/pix"
            assert (await client.post(path, headers={"origin": "null"}, json={"renew": False, "requestId": new_token()})).status_code == 401
            assert (await client.post(path, headers=tv, json={"renew": False, "requestId": new_token(), "priceMinor": 1})).status_code == 422
            response = await client.post(path, headers=tv, json={"renew": False, "requestId": new_token()})
            assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
            body = response.json()
            assert body["state"] == "pending" and body["priceMinor"] == 3500 and body["qrCode"].startswith("000201")
            refreshed = await client.post(path + "/refresh", headers=tv, json={"orderId": body["orderId"]})
            assert refreshed.status_code == 200 and refreshed.headers["cache-control"] == "no-store"
            assert refreshed.json()["orderId"] == body["orderId"]
            browser = await client.post(path, headers={"origin": ORIGIN, "authorization": "Bearer " + bearer},
                                        json={"renew": False, "requestId": new_token()})
            assert browser.status_code == 403
        assert body["qrCode"] not in caplog.text
    finally:
        await cleanup(control, device.device_id)
