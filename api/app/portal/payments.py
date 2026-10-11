"""Checkout/lookup/reconcile duráveis; nenhuma concessão por redirect ou body webhook."""
import hashlib
from datetime import datetime, timedelta

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.auth_tokens import new_token
from app.portal.commercial_models import LicensingStateDocument, OrderDocument, PaymentEventDocument
from app.portal.licensing import LicensingService
from app.portal.models import JobDocument
from app.portal.providers.base import PaymentProvider, PaymentProviderError
from app.portal.rate_limit import RateConstraint
from app.portal.repositories.control import TransactionPlan, document_path
from app.portal.repositories.licensing_repository import LicensingRepository


def order_view(order: OrderDocument) -> dict:
    return {"orderId": order.order_id, "deviceId": order.device_id, "priceMinor": order.price_minor,
        "currency": order.currency, "termMonths": order.term_months, "status": order.status,
        "checkoutUrl": order.checkout_url if order.status in {"created", "pending"} else None,
        "confirmedAt": order.confirmed_at.isoformat() if order.confirmed_at else None}


class PaymentService:
    def __init__(self, auth: AuthService, licensing: LicensingService, provider: PaymentProvider,
                 *, merchant_id: str, live_mode: bool, checkout_enabled: bool = False):
        self.auth = auth
        self.repository = auth.repository
        self.licensing = licensing
        self.provider = provider
        self.merchant_id = merchant_id
        self.live_mode = live_mode
        self.checkout_enabled = checkout_enabled
        self.commercial = LicensingRepository(auth)

    @staticmethod
    def payment_job(payment_id: str) -> str:
        return "payment-" + hashlib.sha256(payment_id.encode()).hexdigest()

    async def checkout(self, principal: Principal, request_id: str, now: datetime) -> OrderDocument:
        if not self.checkout_enabled:
            raise AuthError("service_unavailable", 503)
        key = self.auth.tokens.digest("rate_limit", "orders/" + principal.device_id)
        decision = await self.auth.limits.evaluate((RateConstraint(key, 5, 600, 600),), now, consume=True)
        if not decision.allowed:
            raise AuthError("rate_limited", 429, decision.retry_after)
        order = await self.commercial.reserve_order(principal, request_id, now)
        device_path = document_path("devices", principal.device_id)
        order_path = document_path("orders", order.order_id)
        job_path = document_path("jobs", "order-" + order.order_id)
        owner = new_token()

        def lease(rows):
            self.auth._same_principal(rows[device_path], principal)
            current = OrderDocument.model_validate(rows[order_path])
            if current.device_id != principal.device_id:
                raise AuthError("unauthorized", 401)
            if current.checkout_url or current.status not in {"created", "pending"}:
                return TransactionPlan((current, False))
            if current.checkout_lease_until and current.checkout_lease_until > now:
                raise AuthError("try_again", 409)
            updated = current.model_copy(update={"checkout_lease": owner, "checkout_lease_until": now + timedelta(seconds=30)})
            job = JobDocument.model_validate(rows[job_path]) if rows[job_path] else JobDocument(kind="reconcile", dedupe_key=order.order_id, device_id=principal.device_id, next_due_at=now)
            return TransactionPlan((updated, True), {order_path: updated, job_path: job})
        order, acquired = await self.repository.transact((device_path, order_path, job_path), lease)
        if not acquired:
            return order
        try:
            preference = await self.provider.preference(order)
        except PaymentProviderError:
            # Reserva e job permanecem; repetir reutiliza orderId, sem fazer outra compra.
            def release(rows):
                current = OrderDocument.model_validate(rows[order_path])
                if current.checkout_lease != owner:
                    return TransactionPlan(None)
                return TransactionPlan(None, {order_path: current.model_copy(update={"checkout_lease": None, "checkout_lease_until": None})})
            await self.repository.transact((order_path,), release)
            raise AuthError("service_unavailable", 503) from None

        def finish(rows):
            self.auth._same_principal(rows[device_path], principal)
            current = OrderDocument.model_validate(rows[order_path])
            if current.checkout_lease != owner:
                raise AuthError("try_again", 409)
            if current.status not in {"created", "pending"}:
                return TransactionPlan(current)
            updated = current.model_copy(update={"status": "pending", "preference_id": preference.preference_id,
                "checkout_url": preference.checkout_url, "checkout_lease": None, "checkout_lease_until": None,
                "updated_at": now, "reconcile_after": now})
            return TransactionPlan(updated, {order_path: updated})
        return await self.repository.transact((device_path, order_path), finish)

    async def record_notification(self, payment_id: str, now: datetime):
        event_path = document_path("paymentEvents", payment_id)
        job_path = document_path("jobs", self.payment_job(payment_id))
        def record(rows):
            previous = PaymentEventDocument.model_validate(rows[event_path]) if rows[event_path] else None
            event = PaymentEventDocument(payment_id=payment_id, created_at=previous.created_at if previous else now,
                last_received_at=now, reconcile_after=now)
            job = JobDocument.model_validate(rows[job_path]) if rows[job_path] else JobDocument(kind="reconcile", dedupe_key=payment_id, next_due_at=now)
            return TransactionPlan(None, {event_path: event, job_path: job.model_copy(update={"next_due_at": now})})
        await self.repository.transact((event_path, job_path), record)

    async def reconcile_payment(self, payment_id: str, now: datetime) -> bool:
        event_path = document_path("paymentEvents", payment_id)
        event_snapshot = await self.repository.client.document(event_path).get(timeout=5, retry=None)
        observed_event = PaymentEventDocument.model_validate(event_snapshot.to_dict()) if event_snapshot.exists else None
        payment = await self.provider.payment(payment_id)
        if (payment.payment_id != payment_id or payment.merchant_id != self.merchant_id
                or payment.price_minor != 3500 or payment.currency != "BRL" or payment.live_mode != self.live_mode
                or payment.updated_at.tzinfo is None or payment.updated_at > now + timedelta(seconds=60)
                or payment.confirmed_at and (payment.confirmed_at.tzinfo is None or payment.confirmed_at > now + timedelta(seconds=60))):
            raise PaymentProviderError()
        order_path = document_path("orders", payment.external_reference)
        order_snapshot = await self.repository.client.document(order_path).get(timeout=5, retry=None)
        if not order_snapshot.exists:
            raise PaymentProviderError()
        order = OrderDocument.model_validate(order_snapshot.to_dict())
        if (order.reference != payment.external_reference or order.price_minor != payment.price_minor
                or order.currency != payment.currency):
            raise PaymentProviderError()
        if payment.status == "approved":
            if payment.confirmed_at is None:
                raise PaymentProviderError()
            await self.commercial.approve(order_id=order.order_id, payment_id=payment_id,
                confirmed_at=payment.confirmed_at, provider_updated_at=payment.updated_at, now=now)
        elif payment.status in {"refunded", "charged_back"}:
            if payment.confirmed_at is None:
                raise PaymentProviderError()
            result = await self.licensing.refund(order_id=order.order_id, payment_id=payment_id,
                status=payment.status, confirmed_at=payment.confirmed_at, provider_updated_at=payment.updated_at, now=now)
            if result != "finalized":
                return False
        else:
            state_path = document_path("licensing", "current", device_id=order.device_id)
            def update(rows):
                current = OrderDocument.model_validate(rows[order_path])
                state = LicensingStateDocument.model_validate(rows[state_path])
                if current.status == "approved" or current.provider_payment_id is not None or (current.provider_updated_at and current.provider_updated_at > payment.updated_at):
                    return TransactionPlan(None)
                puts = {order_path: current.model_copy(update={"status": payment.status, "provider_updated_at": payment.updated_at, "updated_at": now})}
                if payment.status in {"refused", "cancelled"} and state.pending_order_id == current.order_id:
                    puts[state_path] = state.model_copy(update={"pending_order_id": None, "revision": state.revision + 1})
                return TransactionPlan(None, puts)
            await self.repository.transact((order_path, state_path), update)
        if observed_event:
            def complete(rows):
                current = PaymentEventDocument.model_validate(rows[event_path])
                if current.last_received_at != observed_event.last_received_at:
                    return TransactionPlan(False)
                return TransactionPlan(True, {event_path: current.model_copy(update={"state": "completed", "reconcile_after": now + timedelta(hours=1)})})
            return await self.repository.transact((event_path,), complete)
        return True

    async def reconcile_order(self, order_id: str, now: datetime, after: str | None = None):
        path = document_path("orders", order_id)
        saved = await self.repository.client.document(path).get(timeout=5, retry=None)
        if not saved.exists:
            raise PaymentProviderError()
        order = OrderDocument.model_validate(saved.to_dict())
        ids, next_after = await self.provider.search(order.reference, after)
        if len(ids) > 5:
            raise PaymentProviderError()
        for payment_id in ids:
            if not await self.reconcile_payment(payment_id, now):
                return after, False
        def checkpoint(rows):
            current = OrderDocument.model_validate(rows[path])
            return TransactionPlan(None, {path: current.model_copy(update={"reconcile_after": now + timedelta(seconds=10)})})
        await self.repository.transact((path,), checkpoint)
        return next_after, True

    async def read_order(self, principal: Principal, order_id: str, now: datetime) -> OrderDocument:
        device_path = document_path("devices", principal.device_id)
        path = document_path("orders", order_id)
        def read(rows):
            self.auth._same_principal(rows[device_path], principal)
            if rows[path] is None:
                raise AuthError("invalid_input", 422)
            order = OrderDocument.model_validate(rows[path])
            if order.device_id != principal.device_id:
                raise AuthError("unauthorized", 401)
            return TransactionPlan(order)
        order = await self.repository.transact((device_path, path), read)
        if order.reconcile_after <= now:
            try:
                await self.reconcile_order(order_id, now)
            except PaymentProviderError:
                pass  # Indisponibilidade não revoga nem perde pedido; job durável retoma.
        return await self.repository.transact((device_path, path), read)

    async def finish_payment_job(self, payment_id: str, owner: str, now: datetime):
        event_path = document_path("paymentEvents", payment_id)
        job_path = document_path("jobs", self.payment_job(payment_id))
        def finish(rows):
            if rows[job_path] is None:
                return TransactionPlan(False)
            job = JobDocument.model_validate(rows[job_path])
            if job.lease_owner != owner or job.lease_until is None or job.lease_until <= now:
                return TransactionPlan(False)
            event = PaymentEventDocument.model_validate(rows[event_path])
            if event.state == "completed":
                return TransactionPlan(True, deletes=(job_path,))
            return TransactionPlan(False, {job_path: job.model_copy(update={"lease_owner": None,
                "lease_until": None, "next_due_at": now})})
        return await self.repository.transact((event_path, job_path), finish)
