import asyncio
from datetime import timedelta

import pytest

from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token
from app.portal.commercial_models import LicenseIntentDocument
from app.portal.crypto import CryptoError
from app.portal.license_calendar import add_months
from app.portal.licensing import AUDIENCE, ISSUER, LicensingService
from app.portal.recovery_journal import JournalError, MemoryJournal
from app.portal.repositories.licensing_repository import LicensingRepository
from tests.portal.test_commercial_repository import cleanup_commercial
from tests.portal.test_configurations import fixture


async def cleanup_licenses(control, device_id):
    await cleanup_commercial(control, device_id)
    control[1].extend([doc.reference.path async for doc in control[0].client.collection("devices").document(device_id).collection("licenseIntents").stream()])


async def test_panel_view_of_entitlement_is_read_only_and_concurrent_calls_do_not_contend(control):
    # 073/R-014: `/session/device` só exibe a licença; não grava geração/teste no dispositivo da TV.
    service, principal, device, now = await fixture(control)
    licensing = LicensingService(service.auth, service.crypto, MemoryJournal(environment="test"))
    try:
        tokens = await asyncio.gather(*(licensing.entitlement(principal, now, persist=False) for _ in range(4)))
        claims = [service.crypto.verify(token, issuer=ISSUER, audience=AUDIENCE, device_id=device.device_id) for token in tokens]
        assert {value["state"] for value in claims} == {"trial"}
        assert claims[0]["expiresAt"] - claims[0]["startsAt"] == 7 * 86400000
        row = (await control[0].client.document("devices/" + device.device_id).get()).to_dict()
        assert row["entitlementGeneration"] == device.entitlement_generation
        # A TV continua gravando normalmente no seu próprio refresh.
        persisted = service.crypto.verify(await licensing.entitlement(principal, now), issuer=ISSUER, audience=AUDIENCE,
                                          device_id=device.device_id)
        assert persisted["generation"] >= 1
    finally:
        await cleanup_licenses(control, device.device_id)


async def test_trial_is_immutable_and_entitlement_is_signed_scoped_and_calendar_safe(control):
    service, principal, device, now = await fixture(control)
    licensing = LicensingService(service.auth, service.crypto, MemoryJournal(environment="test"))
    try:
        first = await licensing.entitlement(principal, now)
        claims = service.crypto.verify(first, issuer=ISSUER, audience=AUDIENCE, device_id=device.device_id)
        assert claims["state"] == "trial" and claims["generation"] == 1
        assert claims["expiresAt"] - claims["startsAt"] == 7 * 86400000
        assert claims["serverTime"] == int(now.timestamp() * 1000)
        second = await licensing.entitlement(principal, now + timedelta(days=8))
        later = service.crypto.verify(second, issuer=ISSUER, audience=AUDIENCE, device_id=device.device_id)
        assert later["startsAt"] == claims["startsAt"] and later["expiresAt"] == claims["expiresAt"]
        with pytest.raises(CryptoError):
            service.crypto.verify(first, issuer=ISSUER, audience=AUDIENCE, device_id="other")
        with pytest.raises(AuthError):
            await licensing.entitlement(principal, now, "unsigned-invalid")
        restored = await licensing.entitlement(principal, now, first)
        assert service.crypto.verify(restored, issuer=ISSUER, audience=AUDIENCE,
            device_id=device.device_id)["generation"] == 2
    finally:
        await cleanup_licenses(control, device.device_id)


async def test_refund_removes_only_one_purchase_recalculates_renewal_and_never_reactivates(control):
    service, principal, device, now = await fixture(control)
    journal = MemoryJournal(environment="test")
    licensing = LicensingService(service.auth, service.crypto, journal)
    repository = LicensingRepository(service.auth)
    try:
        first = await repository.reserve_order(principal, new_token(), now)
        first_payment = "payment-" + new_token()
        await repository.approve(order_id=first.order_id, payment_id=first_payment,
            confirmed_at=now, provider_updated_at=now, now=now)
        second = await repository.reserve_order(principal, new_token(), now)
        second_payment = "payment-" + new_token()
        await repository.approve(order_id=second.order_id, payment_id=second_payment,
            confirmed_at=now + timedelta(seconds=1), provider_updated_at=now, now=now)
        arguments = {"order_id": first.order_id, "payment_id": first_payment, "status": "refunded",
            "confirmed_at": now, "provider_updated_at": now + timedelta(seconds=2), "now": now + timedelta(seconds=2)}
        outcomes = await asyncio.gather(*(licensing.refund(**arguments) for _ in range(2)))
        assert outcomes == ["finalized", "finalized"]
        row = (await control[0].client.document("devices/" + device.device_id).get()).to_dict()
        assert row["entitlementGeneration"] == 3
        grant = (await control[0].client.document("grants/" + second.order_id).get()).to_dict()
        assert grant["startsAt"] == now + timedelta(seconds=1)
        assert grant["expiresAt"] == add_months(now + timedelta(seconds=1))
        refreshed = await licensing.entitlement(principal, now + timedelta(seconds=3))
        claims = service.crypto.verify(refreshed, issuer=ISSUER, audience=AUDIENCE, device_id=device.device_id)
        assert claims["state"] == "active" and claims["generation"] == 3
        assert claims["expiresAt"] == int(grant["expiresAt"].timestamp() * 1000)
        assert (await repository.approve(order_id=first.order_id, payment_id=first_payment,
            confirmed_at=now, provider_updated_at=now, now=now)).status == "refunded"
        assert (await control[0].client.document("devices/" + device.device_id).get()).to_dict()["entitlementGeneration"] == 3
    finally:
        await cleanup_licenses(control, device.device_id)


async def test_journal_failure_keeps_fence_and_grant_then_resume_finishes_before_new_token(control):
    service, principal, device, now = await fixture(control)
    class Unavailable:
        async def append(self, _event):
            raise JournalError("fixture_unavailable")
    licensing = LicensingService(service.auth, service.crypto, Unavailable())
    repository = LicensingRepository(service.auth)
    try:
        order = await repository.reserve_order(principal, new_token(), now)
        payment = "payment-" + new_token()
        await repository.approve(order_id=order.order_id, payment_id=payment,
            confirmed_at=now, provider_updated_at=now, now=now)
        assert await licensing.refund(order_id=order.order_id, payment_id=payment, status="charged_back",
            confirmed_at=now, provider_updated_at=now + timedelta(days=8), now=now + timedelta(days=8)) == "pending_journal"
        with pytest.raises(AuthError):
            await licensing.entitlement(principal, now + timedelta(days=8))
        assert (await control[0].client.document("grants/" + order.order_id).get()).to_dict()["status"] == "valid"
        intents = [row async for row in control[0].client.collection("devices").document(device.device_id).collection("licenseIntents").stream()]
        intent = LicenseIntentDocument.model_validate(intents[0].to_dict())
        control[1].append("jobs/" + intent.operation_id)
        licensing.journal = MemoryJournal(environment="test")
        assert await licensing.resume_refund(intent) == "finalized"
        token = await licensing.entitlement(principal, now + timedelta(days=8))
        assert service.crypto.verify(token, issuer=ISSUER, audience=AUDIENCE, device_id=device.device_id)["state"] == "revoked"
    finally:
        await cleanup_licenses(control, device.device_id)
