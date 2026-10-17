"""Reservas comerciais transacionais; callbacks sem rede, relógio ou aleatoriedade."""
import hashlib
from datetime import datetime

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.auth_tokens import new_token, valid_token
from app.portal.commercial_models import LicensingStateDocument, OrderClaimDocument, OrderDocument
from app.portal.crypto import canonical_json
from app.portal.repositories.control import TransactionPlan, document_path


class LicensingRepository:
    def __init__(self, auth: AuthService):
        self.auth = auth
        self.repository = auth.repository

    async def reserve_order(self, principal: Principal, request_id: str, now: datetime) -> OrderDocument:
        if not valid_token(request_id):
            raise AuthError("invalid_input", 422)
        order_id = new_token()
        device_path = document_path("devices", principal.device_id)
        state_path = document_path("licensing", "current", device_id=principal.device_id)
        claim_id = hashlib.sha256((principal.device_id + "/" + request_id).encode()).hexdigest()
        claim_path = document_path("orderClaims", claim_id)
        candidate_path = document_path("orders", order_id)
        digest = hashlib.sha256(canonical_json({"deviceId": principal.device_id,
            "offerVersion": "annual-brl-3500-v1", "priceMinor": 3500, "currency": "BRL", "termMonths": 12})).hexdigest()

        def inspect(rows):
            self.auth._same_principal(rows[device_path], principal)
            if rows[claim_path] is not None:
                claim = OrderClaimDocument.model_validate(rows[claim_path])
                if claim.device_id != principal.device_id or claim.digest != digest:
                    raise AuthError("try_again", 409)
                return TransactionPlan((claim.order_id, None))
            state = LicensingStateDocument.model_validate(rows[state_path]) if rows[state_path] else LicensingStateDocument(device_id=principal.device_id)
            if state.revocation_fence:
                raise AuthError("try_again", 409)
            return TransactionPlan((state.pending_order_id, state.revision))

        for _ in range(5):
            existing_id, revision = await self.repository.transact((device_path, state_path, claim_path), inspect)
            existing_path = document_path("orders", existing_id) if existing_id else candidate_path
            paths = tuple(dict.fromkeys((device_path, state_path, claim_path, candidate_path, existing_path)))

            def reserve(rows, existing_id=existing_id, existing_path=existing_path, revision=revision):
                self.auth._same_principal(rows[device_path], principal)
                state = LicensingStateDocument.model_validate(rows[state_path]) if rows[state_path] else LicensingStateDocument(device_id=principal.device_id)
                if rows[claim_path] is not None:
                    claim = OrderClaimDocument.model_validate(rows[claim_path])
                    if claim.device_id != principal.device_id or claim.digest != digest:
                        raise AuthError("try_again", 409)
                    if claim.order_id != existing_id:
                        return TransactionPlan(None)
                    order = OrderDocument.model_validate(rows[existing_path])
                    if order.device_id != principal.device_id:
                        raise AuthError("invalid_credentials", 401)
                    return TransactionPlan(order)
                if revision != state.revision or state.pending_order_id != existing_id:
                    return TransactionPlan(None)
                if state.revocation_fence:
                    raise AuthError("try_again", 409)
                puts = {}
                if existing_id:
                    order = OrderDocument.model_validate(rows[existing_path])
                    if order.device_id != principal.device_id or order.status not in {"created", "pending"}:
                        return TransactionPlan(None)
                else:
                    if rows[candidate_path] is not None:
                        raise AuthError("try_again", 409)
                    order = OrderDocument(order_id=order_id, device_id=principal.device_id,
                        reference=order_id, created_at=now, updated_at=now, reconcile_after=now)
                    puts[candidate_path] = order
                    puts[state_path] = state.model_copy(update={"pending_order_id": order_id, "revision": state.revision + 1})
                puts[claim_path] = OrderClaimDocument(device_id=principal.device_id, order_id=order.order_id,
                    digest=digest, created_at=now)
                return TransactionPlan(order, puts)

            result = await self.repository.transact(paths, reserve)
            if result is not None:
                return result
        raise AuthError("try_again", 409)

    async def approve(self, *, order_id: str, payment_id: str, confirmed_at: datetime,
                      provider_updated_at: datetime, now: datetime) -> OrderDocument:
        """Chamado só após lookup autenticado/validação integral pelo serviço de pagamentos."""
        from app.portal.commercial_models import GrantDocument, PaymentClaimDocument
        from app.portal.license_calendar import add_months, schedule_grants
        order_path = document_path("orders", order_id)
        payment_path = document_path("paymentClaims", payment_id)
        grant_path = document_path("grants", order_id)
        order_snapshot = await self.repository.client.document(order_path).get(timeout=5, retry=None)
        if not order_snapshot.exists:
            raise AuthError("invalid_input", 422)
        initial_order = OrderDocument.model_validate(order_snapshot.to_dict())
        if initial_order.provider_payment_id is not None and initial_order.provider_payment_id != payment_id:
            # 073/D-005: segundo pagamento aprovado no mesmo pedido (Pix na TV + cartão no portal) também concede.
            return await self.approve_surplus(parent=initial_order, payment_id=payment_id, confirmed_at=confirmed_at,
                                              provider_updated_at=provider_updated_at, now=now)
        device_path = document_path("devices", initial_order.device_id)
        state_path = document_path("licensing", "current", device_id=initial_order.device_id)
        from app.portal.models import DeviceDocument

        for _ in range(5):
            def inspect(rows):
                device = DeviceDocument.model_validate(rows[device_path])
                state = LicensingStateDocument.model_validate(rows[state_path])
                if device.access_fence or state.revocation_fence:
                    raise AuthError("try_again", 409)
                return TransactionPlan(state)
            state = await self.repository.transact((device_path, state_path), inspect)
            ids = tuple(dict.fromkeys((*state.grant_order_ids, order_id)))
            paths = tuple(dict.fromkeys((device_path, state_path, order_path, payment_path,
                *(document_path("grants", value) for value in ids))))
            # Limite da unidade transacional: nunca fazer concessão parcial fora do CAS.
            if len(paths) > 100:
                raise AuthError("service_unavailable", 503)

            def commit(rows, expected_state=state, ids=ids):
                device = DeviceDocument.model_validate(rows[device_path])
                current = LicensingStateDocument.model_validate(rows[state_path])
                order = OrderDocument.model_validate(rows[order_path])
                if current != expected_state:
                    return TransactionPlan(None)
                if device.access_fence or current.revocation_fence:
                    raise AuthError("try_again", 409)
                if order.device_id != initial_order.device_id:
                    raise AuthError("invalid_input", 422)
                if order.provider_payment_id is not None and order.provider_payment_id != payment_id:
                    # Outro pagamento aprovou este pedido entre a leitura e a transação: vira excedente (D-005).
                    return TransactionPlan("surplus")
                if rows[payment_path] is not None:
                    claim = PaymentClaimDocument.model_validate(rows[payment_path])
                    if claim.order_id != order_id or claim.device_id != order.device_id:
                        raise AuthError("try_again", 409)
                if order.provider_payment_id is not None:
                    # Replays e notificações antigas jamais reativam grant estornado.
                    return TransactionPlan(order)
                if order.status not in {"created", "pending", "refused", "cancelled"}:
                    raise AuthError("try_again", 409)
                if rows[grant_path] is not None:
                    raise AuthError("try_again", 409)
                grant = GrantDocument(order_id=order_id, device_id=order.device_id,
                    provider_payment_id=payment_id, confirmed_at=confirmed_at, starts_at=confirmed_at,
                    expires_at=add_months(confirmed_at), status="valid")
                grants = [GrantDocument.model_validate(rows[document_path("grants", value)])
                    for value in current.grant_order_ids]
                if any(value.device_id != order.device_id for value in grants):
                    raise AuthError("invalid_input", 422)
                scheduled = schedule_grants([*grants, grant])
                approved = order.model_copy(update={"status": "approved", "confirmed_at": confirmed_at,
                    "provider_payment_id": payment_id, "provider_updated_at": provider_updated_at, "updated_at": now,
                    "pix_qr_code": None})
                puts = {order_path: approved, payment_path: PaymentClaimDocument(payment_id=payment_id,
                    order_id=order_id, device_id=order.device_id, created_at=now),
                    device_path: device.model_copy(update={"entitlement_generation": device.entitlement_generation + 1}),
                    state_path: current.model_copy(update={"revision": current.revision + 1,
                        "grant_order_ids": list(ids),
                        "pending_order_id": None if current.pending_order_id == order_id else current.pending_order_id})}
                puts.update({document_path("grants", value.order_id): value for value in scheduled})
                return TransactionPlan(approved, puts)

            result = await self.repository.transact(paths, commit)
            if result == "surplus":
                parent = OrderDocument.model_validate((await self.repository.client.document(order_path).get(timeout=5, retry=None)).to_dict())
                return await self.approve_surplus(parent=parent, payment_id=payment_id, confirmed_at=confirmed_at,
                                                  provider_updated_at=provider_updated_at, now=now)
            if result is not None:
                return result
        raise AuthError("try_again", 409)

    @staticmethod
    def surplus_order_id(parent_order_id: str, payment_id: str) -> str:
        return "s" + hashlib.sha256((parent_order_id + "/" + payment_id).encode()).hexdigest()[:42]

    async def approve_surplus(self, *, parent: OrderDocument, payment_id: str, confirmed_at: datetime,
                              provider_updated_at: datetime, now: datetime) -> OrderDocument:
        """073/D-005: pedido derivado com grant próprio (+12 meses), idempotente por `paymentClaims/{paymentId}`.
        Chamado só depois do lookup autenticado que validou valor, moeda, conta e referência do pai."""
        from app.portal.commercial_models import GrantDocument, PaymentClaimDocument
        from app.portal.license_calendar import add_months, schedule_grants
        from app.portal.models import DeviceDocument
        surplus_id = self.surplus_order_id(parent.order_id, payment_id)
        device_path = document_path("devices", parent.device_id)
        state_path = document_path("licensing", "current", device_id=parent.device_id)
        payment_path = document_path("paymentClaims", payment_id)
        surplus_path = document_path("orders", surplus_id)
        grant_path = document_path("grants", surplus_id)

        for _ in range(5):
            def inspect(rows):
                device = DeviceDocument.model_validate(rows[device_path])
                state = LicensingStateDocument.model_validate(rows[state_path])
                if device.access_fence or state.revocation_fence:
                    raise AuthError("try_again", 409)
                return TransactionPlan(state)
            state = await self.repository.transact((device_path, state_path), inspect)
            ids = tuple(dict.fromkeys((*state.grant_order_ids, surplus_id)))
            paths = tuple(dict.fromkeys((device_path, state_path, payment_path, surplus_path,
                *(document_path("grants", value) for value in ids))))
            if len(paths) > 100:
                raise AuthError("service_unavailable", 503)

            def commit(rows, expected_state=state, ids=ids):
                device = DeviceDocument.model_validate(rows[device_path])
                current = LicensingStateDocument.model_validate(rows[state_path])
                if current != expected_state:
                    return TransactionPlan(None)
                if device.access_fence or current.revocation_fence:
                    raise AuthError("try_again", 409)
                if rows[payment_path] is not None:
                    claim = PaymentClaimDocument.model_validate(rows[payment_path])
                    if claim.order_id != surplus_id or claim.device_id != parent.device_id:
                        raise AuthError("try_again", 409)
                    return TransactionPlan(OrderDocument.model_validate(rows[surplus_path]))
                if rows[surplus_path] is not None or rows[grant_path] is not None:
                    raise AuthError("try_again", 409)
                grants = [GrantDocument.model_validate(rows[document_path("grants", value)])
                    for value in current.grant_order_ids]
                if any(value.device_id != parent.device_id for value in grants):
                    raise AuthError("invalid_input", 422)
                grant = GrantDocument(order_id=surplus_id, device_id=parent.device_id, provider_payment_id=payment_id,
                    confirmed_at=confirmed_at, starts_at=confirmed_at, expires_at=add_months(confirmed_at), status="valid")
                surplus = OrderDocument(order_id=surplus_id, device_id=parent.device_id, reference=surplus_id,
                    status="approved", created_at=now, updated_at=now, confirmed_at=confirmed_at,
                    provider_payment_id=payment_id, provider_updated_at=provider_updated_at, reconcile_after=now,
                    parent_order_id=parent.order_id)
                puts = {surplus_path: surplus, payment_path: PaymentClaimDocument(payment_id=payment_id,
                    order_id=surplus_id, device_id=parent.device_id, created_at=now),
                    device_path: device.model_copy(update={"entitlement_generation": device.entitlement_generation + 1}),
                    state_path: current.model_copy(update={"revision": current.revision + 1, "grant_order_ids": list(ids)})}
                puts.update({document_path("grants", value.order_id): value for value in schedule_grants([*grants, grant])})
                return TransactionPlan(surplus, puts)

            result = await self.repository.transact(paths, commit)
            if result is not None:
                return result
        raise AuthError("try_again", 409)
