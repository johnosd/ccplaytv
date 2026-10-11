import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.portal.auth import AuthError, Principal
from app.portal.auth_tokens import new_token
from app.portal.commercial_models import LicensingStateDocument, OrderDocument
from app.portal.repositories.control import RepositoryConflict, TransactionPlan
from app.portal.repositories.licensing_repository import LicensingRepository
from tests.portal.test_configurations import fixture


async def cleanup_commercial(control, device_id):
    for collection in ("orders", "orderClaims", "grants", "paymentClaims"):
        from google.cloud.firestore_v1.base_query import FieldFilter
        query = control[0].client.collection(collection).where(filter=FieldFilter("deviceId", "==", device_id))
        control[1].extend([doc.reference.path async for doc in query.stream()])
    control[1].append("devices/" + device_id + "/licensing/current")


async def test_concurrent_order_reservation_reuses_pending_and_replays_after_restart(control):
    service, principal, device, now = await fixture(control)
    try:
        ids = [new_token(), new_token()]
        repository = LicensingRepository(service.auth)
        orders = await asyncio.gather(*(repository.reserve_order(principal, value, now) for value in ids))
        assert orders[0].order_id == orders[1].order_id
        assert (orders[0].price_minor, orders[0].currency, orders[0].term_months) == (3500, "BRL", 12)
        assert orders[0].device_id == device.device_id
        assert await LicensingRepository(service.auth).reserve_order(principal, ids[0], now) == orders[0]
        state = (await control[0].client.document("devices/" + device.device_id + "/licensing/current").get()).to_dict()
        assert state["pendingOrderId"] == orders[0].order_id and state["revision"] == 1
        assert (await control[0].client.document("devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 0
    finally:
        await cleanup_commercial(control, device.device_id)


async def test_order_price_destination_and_payment_binding_are_immutable_and_fence_blocks(control):
    service, principal, device, now = await fixture(control)
    try:
        repository = LicensingRepository(service.auth)
        order = await repository.reserve_order(principal, new_token(), now)
        path = "orders/" + order.order_id
        for change in ({"price_minor": 1}, {"device_id": "other"}, {"reference": "other"}, {"term_months": 1}):
            with pytest.raises(RepositoryConflict):
                await control[0].transact((path,), lambda rows, change=change: TransactionPlan(None,
                    {path: OrderDocument.model_validate(rows[path]).model_copy(update=change)}))
        with pytest.raises(AuthError):
            await repository.reserve_order(Principal(principal.device_id, principal.auth_epoch + 1,
                principal.recovery_epoch), new_token(), now)
        state_path = "devices/" + device.device_id + "/licensing/current"
        await control[0].transact((state_path,), lambda rows: TransactionPlan(None,
            {state_path: LicensingStateDocument.model_validate(rows[state_path]).model_copy(update={"revocation_fence": "revocation-fixture"})}))
        with pytest.raises(AuthError):
            await repository.reserve_order(principal, new_token(), now)
    finally:
        await cleanup_commercial(control, device.device_id)


async def test_approved_payment_claim_is_atomic_idempotent_and_orders_recalculate_chronologically(control):
    service, principal, device, now = await fixture(control)
    try:
        repository = LicensingRepository(service.auth)
        first = await repository.reserve_order(principal, new_token(), now)
        paid = datetime(2024, 2, 29, 12, 30, tzinfo=UTC)
        payment_id = "payment-" + new_token()
        outcomes = await asyncio.gather(*(repository.approve(order_id=first.order_id,
            payment_id=payment_id, confirmed_at=paid, provider_updated_at=now, now=now) for _ in range(2)))
        assert outcomes[0] == outcomes[1]
        row = (await control[0].client.document("devices/" + device.device_id).get()).to_dict()
        assert row["entitlementGeneration"] == 1
        first_grant = (await control[0].client.document("grants/" + first.order_id).get()).to_dict()
        assert first_grant["expiresAt"] == datetime(2025, 2, 28, 12, 30, tzinfo=UTC)
        second = await repository.reserve_order(principal, new_token(), now)
        with pytest.raises(AuthError):
            await repository.approve(order_id=second.order_id, payment_id=payment_id,
                confirmed_at=paid, provider_updated_at=now, now=now)
        assert (await control[0].client.document("orders/" + second.order_id).get()).to_dict()["status"] == "created"
        # Chegada fora de ordem: segunda compra confirmada antes da primeira.
        other_payment = "payment-" + new_token()
        await repository.approve(order_id=second.order_id, payment_id=other_payment,
            confirmed_at=paid - timedelta(days=1), provider_updated_at=now, now=now)
        grants = [(await control[0].client.document("grants/" + value).get()).to_dict()
                  for value in (first.order_id, second.order_id)]
        assert grants[1]["startsAt"] == paid - timedelta(days=1)
        assert grants[0]["startsAt"] == grants[1]["expiresAt"]
        assert grants[0]["expiresAt"] == datetime(2026, 2, 28, 12, 30, tzinfo=UTC)
        assert (await control[0].client.document("devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 2
    finally:
        await cleanup_commercial(control, device.device_id)
