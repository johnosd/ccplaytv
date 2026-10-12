"""Licença somente à TV; checkout e status comerciais same-origin."""
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import Field, SecretStr

from app.portal.auth import AuthError
from app.portal.licensing import AUDIENCE, ISSUER, LicensingService
from app.portal.payment_signature import verify_payment_signature
from app.portal.payments import PaymentService, order_view
from app.portal.providers.mercadopago import MercadoPagoProvider
from app.portal.routes.auth import Input, access_service, payload
from app.portal.routes.operations import browser_principal, tv_principal

router = APIRouter(prefix="/portal/v1")


class EmptyInput(Input):
    pass


class RefreshInput(Input):
    previousJws: SecretStr | None = Field(default=None, max_length=16384, repr=False)


async def licensing_service(request: Request):
    if not hasattr(request.app.state, "portal_licensing"):
        access = await access_service(request)
        request.app.state.portal_licensing = LicensingService(access.auth, access.crypto, access.journal)
    return request.app.state.portal_licensing


async def payment_service(request: Request):
    if not hasattr(request.app.state, "portal_payments"):
        settings = request.app.state.portal_settings
        if not settings.mercadopago_access_token or not settings.mercadopago_merchant_id:
            raise AuthError("service_unavailable", 503)
        licensing = await licensing_service(request)
        provider = MercadoPagoProvider(settings.mercadopago_access_token, settings.public_origin,
                                       live_mode=settings.mercadopago_live_mode)
        request.app.state.portal_payments = PaymentService(licensing.auth, licensing, provider,
            merchant_id=settings.mercadopago_merchant_id, live_mode=settings.mercadopago_live_mode,
            checkout_enabled=settings.checkout_enabled,
            allow_test_live_mode=settings.mercadopago_allow_test_live_mode)
    return request.app.state.portal_payments


@router.post("/device/trial")
async def trial(request: Request):
    principal = await tv_principal(request)
    await payload(request, EmptyInput)
    return {"jws": await (await licensing_service(request)).entitlement(principal, datetime.now(UTC))}


@router.get("/device/entitlement")
async def entitlement(request: Request):
    principal = await tv_principal(request)
    return {"jws": await (await licensing_service(request)).entitlement(principal, datetime.now(UTC))}


@router.post("/device/entitlement/refresh")
async def refresh(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, RefreshInput)
    return {"jws": await (await licensing_service(request)).entitlement(principal, datetime.now(UTC),
        body.previousJws.get_secret_value() if body.previousJws else None)}


@router.get("/session/device")
async def device(request: Request):
    principal = await browser_principal(request)
    service = await licensing_service(request)
    token = await service.entitlement(principal, datetime.now(UTC))
    claims = service.crypto.verify(token, issuer=ISSUER, audience=AUDIENCE, device_id=principal.device_id)
    return {"deviceId": principal.device_id, "license": {key: claims[key] for key in
        ("state", "startsAt", "expiresAt", "generation", "serverTime")}}


@router.get("/offer")
async def offer(request: Request):
    await browser_principal(request)
    return {"priceMinor": 3500, "currency": "BRL", "termMonths": 12, "deviceCount": 1,
            "renewal": "manual", "checkoutEnabled": request.app.state.portal_settings.checkout_enabled}


@router.post("/orders")
async def order(request: Request):
    principal = await browser_principal(request, mutation=True)
    await payload(request, EmptyInput)
    value = await (await payment_service(request)).checkout(principal,
        request.headers.get("idempotency-key", ""), datetime.now(UTC))
    return JSONResponse(order_view(value), status_code=202)


@router.get("/orders/{order_id}")
async def order_status(order_id: str, request: Request):
    principal = await browser_principal(request)
    return order_view(await (await payment_service(request)).read_order(principal, order_id, datetime.now(UTC)))


@router.get("/license-keys")
async def license_keys(request: Request):
    # Chaves públicas; clientes só aceitam kids previamente confiados no pacote.
    return (await licensing_service(request)).crypto.public_jwks()


@router.post("/payments/mercadopago/webhook")
async def webhook(request: Request):
    settings = request.app.state.portal_settings
    if settings.mercadopago_webhook_secret is None:
        raise AuthError("service_unavailable", 503)
    ids = request.query_params.getlist("data.id")
    if len(ids) != 1:
        raise AuthError("unauthorized", 401)
    payment_id = ids[0]
    verify_payment_signature(request.headers.get("x-signature"), request.headers.get("x-request-id"),
                             payment_id, settings.mercadopago_webhook_secret)
    # Reduzir antes de persistir: tipo/data.id, nunca copiar cartão/payer/webhook cru.
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > 65536:
            raise AuthError("payload_too_large", 413)
        data.extend(chunk)
    import json
    try:
        body = json.loads(data)
        if body["type"] != "payment" or str(body["data"]["id"]) != payment_id:
            raise AuthError("invalid_input", 422)
    except (ValueError, TypeError, KeyError):
        raise AuthError("invalid_input", 422) from None
    await (await payment_service(request)).record_notification(payment_id, datetime.now(UTC))
    return {"state": "received"}
