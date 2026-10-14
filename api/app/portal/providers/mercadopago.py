"""Checkout Pro Preferences/API autenticada; não confia no retorno do navegador."""
import json
import re
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit

import httpx
from pydantic import SecretStr

from app.portal.commercial_models import OrderDocument
from app.portal.providers.base import CheckoutPreference, PaymentObservation, PaymentProviderError

API_ORIGIN = "https://api.mercadopago.com"


def minor(value) -> int:
    if isinstance(value, bool):
        raise PaymentProviderError()
    amount = Decimal(str(value)) * 100
    if not amount.is_finite() or amount != amount.to_integral_value() or amount < 0:
        raise PaymentProviderError()
    return int(amount)


def timestamp(value) -> datetime:
    if not isinstance(value, str):
        raise PaymentProviderError()
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise PaymentProviderError()
    return parsed.astimezone(UTC)


class MercadoPagoProvider:
    def __init__(self, token: SecretStr, public_origin: str, *, live_mode: bool,
                 client: httpx.AsyncClient | None = None):
        parsed = urlsplit(public_origin)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise PaymentProviderError()
        self._token = token
        self._origin = public_origin.rstrip("/")
        self._live_mode = live_mode
        self._client = client

    async def _request(self, method: str, path: str, *, body=None, params=None):
        if not re.fullmatch(r"/[A-Za-z0-9_/-]+", path) or ".." in path or "//" in path:
            raise PaymentProviderError()
        client = self._client or httpx.AsyncClient(timeout=5, follow_redirects=False)
        try:
            async with client.stream(method, API_ORIGIN + path, json=body, params=params,
                headers={"authorization": "Bearer " + self._token.get_secret_value(),
                         "content-type": "application/json"}, timeout=5, follow_redirects=False) as response:
                if response.status_code < 200 or response.status_code >= 300:
                    raise PaymentProviderError()
                chunks = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > 1048576:
                        raise PaymentProviderError()
                    chunks.append(chunk)
                value = json.loads(b"".join(chunks))
                if not isinstance(value, dict):
                    raise PaymentProviderError()
                return value
        except (httpx.HTTPError, ValueError, TypeError, KeyError, OverflowError):
            raise PaymentProviderError() from None
        finally:
            if self._client is None:
                await client.aclose()

    async def preference(self, order: OrderDocument) -> CheckoutPreference:
        value = await self._request("POST", "/checkout/preferences", body={
            "external_reference": order.reference,
            "items": [{"id": order.offer_version, "title": "CCPlayTV - licença anual para uma TV",
                       "quantity": 1, "currency_id": "BRL", "unit_price": 35}],
            "back_urls": {status: self._origin + "/?checkout=return" for status in ("success", "pending", "failure")},
            "notification_url": self._origin + "/portal/v1/payments/mercadopago/webhook",
            "payment_methods": {"installments": 1, "excluded_payment_types": [{"id": "ticket"}, {"id": "atm"}]},
        })
        preference_id = value.get("id")
        checkout_url = value.get("init_point" if self._live_mode else "sandbox_init_point")
        if not isinstance(preference_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", preference_id) or not isinstance(checkout_url, str) or len(checkout_url) > 4096:
            raise PaymentProviderError()
        try:
            parsed = urlsplit(checkout_url)
            port = parsed.port
        except ValueError:
            raise PaymentProviderError() from None
        hosts = {"www.mercadopago.com.br"} if self._live_mode else {"www.mercadopago.com.br", "sandbox.mercadopago.com.br"}
        if parsed.scheme != "https" or parsed.hostname not in hosts or port not in {None, 443} or parsed.username or parsed.password or parsed.fragment:
            raise PaymentProviderError()
        return CheckoutPreference(preference_id, checkout_url)

    async def payment(self, payment_id: str) -> PaymentObservation:
        if not re.fullmatch(r"[0-9]{1,40}", payment_id):
            raise PaymentProviderError()
        value = await self._request("GET", "/v1/payments/" + payment_id)
        try:
            if str(value["id"]) != payment_id or type(value["live_mode"]) is not bool:
                raise PaymentProviderError()
            merchant = str(value["collector_id"])
            reference = value["external_reference"]
            if not re.fullmatch(r"[0-9]{1,40}", merchant) or not isinstance(reference, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", reference):
                raise PaymentProviderError()
            statuses = {"approved": "approved", "rejected": "refused", "cancelled": "cancelled",
                "refunded": "refunded", "charged_back": "charged_back", "pending": "pending",
                "in_process": "pending", "in_mediation": "pending", "authorized": "pending"}
            status = statuses[value["status"]]
            price = minor(value["transaction_amount"])
            refunded = minor(value.get("transaction_amount_refunded", 0))
            if refunded > price:
                raise PaymentProviderError()
            if refunded and status == "approved":
                status = "refunded"
            currency = value["currency_id"]
            if not isinstance(currency, str) or len(currency) != 3:
                raise PaymentProviderError()
            return PaymentObservation(payment_id, reference, merchant, price, currency, status,
                timestamp(value["date_approved"]) if value.get("date_approved") else None,
                timestamp(value["date_last_updated"]), value["live_mode"], refunded)
        except (ValueError, TypeError, KeyError, InvalidOperation, OverflowError):
            raise PaymentProviderError() from None

    async def search(self, reference: str, after: str | None = None):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", reference) or (after is not None and not re.fullmatch(r"[0-9]{1,6}", after)):
            raise PaymentProviderError()
        offset = int(after or "0")
        if offset > 10000:
            raise PaymentProviderError()
        value = await self._request("GET", "/v1/payments/search", params={"external_reference": reference,
            "sort": "date_created", "criteria": "asc", "limit": 5, "offset": offset})
        try:
            rows = value["results"]
            total = value["paging"]["total"]
            if not isinstance(rows, list) or len(rows) > 5 or type(total) is not int or total < 0:
                raise PaymentProviderError()
            ids = [str(row["id"]) for row in rows]
            if any(not re.fullmatch(r"[0-9]{1,40}", key) for key in ids) or len(ids) != len(set(ids)):
                raise PaymentProviderError()
            next_after = str(offset + len(ids)) if offset + len(ids) < total and ids else None
            return ids, next_after
        except (ValueError, TypeError, KeyError):
            raise PaymentProviderError() from None
