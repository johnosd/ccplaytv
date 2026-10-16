"""Pix dinâmico da TV (feature 073, D-001–D-004, D-012).

Mesmo pedido pendente da 069 (`reserve_order`): reabrir reaproveita o Pix válido sem chamar o provedor; vencido só é
trocado por pedido explícito (`renew`). A concessão continua sendo a da 069 (lookup autenticado → `approve`); daqui
nunca sai licença. O copia-e-cola só vai na resposta da TV, nunca em log, erro ou `repr`.
"""
import hashlib
from datetime import datetime, timedelta

from app.portal.auth import AuthError, Principal
from app.portal.auth_tokens import new_token
from app.portal.commercial_models import OrderDocument
from app.portal.models import JobDocument
from app.portal.payments import PaymentService
from app.portal.providers.base import PaymentProviderError
from app.portal.rate_limit import RateConstraint
from app.portal.repositories.control import TransactionPlan, document_path

PIX_TERM = timedelta(minutes=30)
# Folga mínima para reapresentar um Pix: menos que isso, a pessoa não consegue pagar a tempo.
PIX_MARGIN = timedelta(seconds=60)
OPEN_STATES = {"created", "pending"}


def pix_usable(order: OrderDocument, now: datetime) -> bool:
    return bool(order.pix_payment_id and order.pix_expires_at and order.pix_expires_at - now >= PIX_MARGIN)


def pix_view(order: OrderDocument, display_id: str | None, now: datetime) -> dict:
    if order.status == "approved":
        state = "approved"
    elif order.status == "refused":
        state = "refused"
    elif order.status in OPEN_STATES:
        state = "pending" if pix_usable(order, now) else "expired"
    else:
        state = "cancelled"
    view = {"orderId": order.order_id, "state": state, "serverTime": now.isoformat(),
            "priceMinor": order.price_minor, "termMonths": order.term_months}
    if order.pix_expires_at:
        view["expiresAt"] = order.pix_expires_at.isoformat()
    if state == "pending" and order.pix_qr_code:
        view["qrCode"] = order.pix_qr_code
    if display_id:
        view["displayId"] = display_id
    return view


class PixOrders:
    def __init__(self, payments: PaymentService, *, payer_domain: str | None, test_payer_email: str | None = None):
        self.payments = payments
        self.repository = payments.repository
        self.payer_domain = payer_domain
        # R-001: só staging/test (o settings recusa em produção) — comprador de teste exigido pelo sandbox.
        self.test_payer_email = test_payer_email

    def _payer_email(self, device_id: str) -> str:
        if self.test_payer_email:
            return self.test_payer_email
        # D-013: não pessoal, estável por TV, sem expor o deviceId.
        return "tv-" + hashlib.sha256(device_id.encode()).hexdigest()[:16] + "@" + self.payer_domain

    async def _display_id(self, principal: Principal) -> str | None:
        path = document_path("devices", principal.device_id)
        return await self.repository.transact((path,), lambda rows: TransactionPlan(
            self.payments.auth._same_principal(rows[path], principal).display_id))

    async def pix(self, principal: Principal, request_id: str, renew: bool, now: datetime) -> dict:
        payments = self.payments
        if not payments.checkout_enabled or not (self.payer_domain or self.test_payer_email):
            raise AuthError("service_unavailable", 503)
        order = await payments.commercial.reserve_order(principal, request_id, now)
        display_id = await self._display_id(principal)
        # Pedido terminado, Pix ainda pagável ou vencido sem pedido explícito: nada de provedor.
        if order.status not in OPEN_STATES or pix_usable(order, now) or (order.pix_payment_id and not renew):
            return pix_view(order, display_id, now)
        auth = payments.auth
        key = auth.tokens.digest("rate_limit", "orders/" + principal.device_id)
        decision = await auth.limits.evaluate((RateConstraint(key, 5, 600, 600),), now, consume=True)
        if not decision.allowed:
            raise AuthError("rate_limited", 429, decision.retry_after)
        device_path = document_path("devices", principal.device_id)
        order_path = document_path("orders", order.order_id)
        job_path = document_path("jobs", "order-" + order.order_id)
        owner = new_token()

        def lease(rows):
            auth._same_principal(rows[device_path], principal)
            current = OrderDocument.model_validate(rows[order_path])
            if current.device_id != principal.device_id:
                raise AuthError("unauthorized", 401)
            # Outra chamada já gerou (ou o pedido terminou) entre a leitura e o lease: devolve o que existe.
            if current.status not in OPEN_STATES or current.pix_attempt != order.pix_attempt:
                return TransactionPlan((current, False))
            if current.checkout_lease_until and current.checkout_lease_until > now:
                raise AuthError("try_again", 409)
            updated = current.model_copy(update={"checkout_lease": owner, "checkout_lease_until": now + timedelta(seconds=30)})
            job = JobDocument.model_validate(rows[job_path]) if rows[job_path] else JobDocument(
                kind="reconcile", dedupe_key=order.order_id, device_id=principal.device_id, next_due_at=now)
            return TransactionPlan((updated, True), {order_path: updated, job_path: job})
        current, acquired = await self.repository.transact((device_path, order_path, job_path), lease)
        if not acquired:
            return pix_view(current, display_id, now)
        attempt = current.pix_attempt + 1
        try:
            charge = await payments.provider.pix(current, attempt=attempt, expires_at=now + PIX_TERM,
                                                 payer_email=self._payer_email(principal.device_id))
        except PaymentProviderError:
            def release(rows):
                latest = OrderDocument.model_validate(rows[order_path])
                if latest.checkout_lease != owner:
                    return TransactionPlan(None)
                return TransactionPlan(None, {order_path: latest.model_copy(update={"checkout_lease": None, "checkout_lease_until": None})})
            await self.repository.transact((order_path,), release)
            raise AuthError("service_unavailable", 503) from None

        def finish(rows):
            auth._same_principal(rows[device_path], principal)
            latest = OrderDocument.model_validate(rows[order_path])
            if latest.checkout_lease != owner:
                raise AuthError("try_again", 409)
            if latest.status not in OPEN_STATES:
                return TransactionPlan(latest)
            updated = latest.model_copy(update={"status": "pending", "pix_payment_id": charge.payment_id,
                "pix_qr_code": charge.qr_code, "pix_expires_at": charge.expires_at, "pix_attempt": attempt,
                "checkout_lease": None, "checkout_lease_until": None, "updated_at": now, "reconcile_after": now})
            return TransactionPlan(updated, {order_path: updated})
        return pix_view(await self.repository.transact((device_path, order_path), finish), display_id, now)

    async def refresh(self, principal: Principal, order_id: str, now: datetime) -> dict:
        """Atualizar da tela de Pix (D-004): concilia sob demanda; nunca cria Pix nem concede por conta própria."""
        auth = self.payments.auth
        key = auth.tokens.digest("rate_limit", "pix-refresh/" + principal.device_id)
        decision = await auth.limits.evaluate((RateConstraint(key, 12, 60, 60),), now, consume=True)
        if not decision.allowed:
            raise AuthError("rate_limited", 429, decision.retry_after)
        order = await self.payments.read_order(principal, order_id, now)
        return pix_view(order, await self._display_id(principal), now)



async def open_order(repository, principal: Principal) -> OrderDocument | None:
    """Pedido em aberto (`created`/`pending`) da TV autenticada, só pelo Firestore."""
    from app.portal.commercial_models import LicensingStateDocument
    state_path = document_path("licensing", "current", device_id=principal.device_id)
    snapshot = await repository.client.document(state_path).get(timeout=5, retry=None)
    if not snapshot.exists:
        return None
    state = LicensingStateDocument.model_validate(snapshot.to_dict())
    if not state.pending_order_id:
        return None
    saved = await repository.client.document(document_path("orders", state.pending_order_id)).get(timeout=5, retry=None)
    if not saved.exists:
        return None
    order = OrderDocument.model_validate(saved.to_dict())
    return order if order.device_id == principal.device_id and order.status in OPEN_STATES else None


async def reconcile_open_order(payments: PaymentService, principal: Principal, now: datetime) -> None:
    """Atualizar da TV (ADR-016: só por ação da pessoa): concilia o pedido em aberto antes de emitir a licença, para o
    cartão pago no portal chegar mesmo sem webhook. Provedor fora do ar não impede a licença atual."""
    order = await open_order(payments.repository, principal)
    if order is None:
        return
    try:
        await payments.read_order(principal, order.order_id, now)
    except (AuthError, PaymentProviderError):
        pass


async def pending_order(repository, principal: Principal, now: datetime) -> dict | None:
    """Aviso do portal (FR-010, D-007): pedido pendente da TV, sem copia-e-cola. Só lê o Firestore — não depende do
    provedor estar configurado, então não pode derrubar `/session/device`."""
    order = await open_order(repository, principal)
    if order is None:
        return None
    if pix_usable(order, now):
        return {"orderId": order.order_id, "method": "pix", "expiresAt": order.pix_expires_at.isoformat()}
    if order.checkout_url:
        return {"orderId": order.order_id, "method": "checkout", "expiresAt": None}
    return None
