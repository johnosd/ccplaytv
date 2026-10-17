"""Trial/ledger/JWS e revogação write-ahead; sem chamadas ao provedor de pagamento."""
import hashlib
from datetime import datetime, timedelta

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.commercial_models import (
    GrantDocument,
    LicenseIntentDocument,
    LicensingStateDocument,
    OrderDocument,
    PaymentClaimDocument,
)
from app.portal.crypto import CryptoError, PortalCrypto
from app.portal.license_calendar import schedule_grants
from app.portal.models import DeviceDocument, JobDocument
from app.portal.recovery_journal import JournalError, JournalEvent, JournalWriter
from app.portal.repositories.control import TransactionPlan, document_path

ISSUER = "ccplaytv-portal"
AUDIENCE = "ccplaytv"


def ms(value: datetime) -> int:
    return int(value.timestamp() * 1000)


class LicensingService:
    def __init__(self, auth: AuthService, crypto: PortalCrypto, journal: JournalWriter):
        self.auth = auth
        self.crypto = crypto
        self.repository = auth.repository
        self.journal = journal

    async def entitlement(self, principal: Principal, now: datetime, previous_jws: str | None = None,
                          *, persist: bool = True) -> str:
        """`persist=False` (073/R-014): só para exibir no portal — calcula o mesmo estado sem gravar geração/teste no
        dispositivo, para GETs concorrentes do painel não disputarem a escrita do mesmo documento."""
        floor = 0
        if previous_jws is not None:
            try:
                claims = self.crypto.verify(previous_jws, issuer=ISSUER, audience=AUDIENCE, device_id=principal.device_id)
                if set(claims) != {"iss", "aud", "deviceId", "state", "generation", "startsAt", "expiresAt", "serverTime"}:
                    raise CryptoError()
                if claims["state"] not in {"trial", "active", "revoked"}:
                    raise CryptoError()
                if any(type(claims[key]) is not int or not 0 <= claims[key] <= 9007199254740990
                       for key in ("generation", "startsAt", "expiresAt", "serverTime")) or claims["expiresAt"] <= claims["startsAt"]:
                    raise CryptoError()
                floor = claims["generation"]
            except CryptoError:
                raise AuthError("invalid_input", 422) from None
        device_path = document_path("devices", principal.device_id)
        state_path = document_path("licensing", "current", device_id=principal.device_id)

        for _ in range(5):
            def inspect(rows):
                self.auth._same_principal(rows[device_path], principal)
                state = LicensingStateDocument.model_validate(rows[state_path]) if rows[state_path] else LicensingStateDocument(device_id=principal.device_id)
                if state.revocation_fence:
                    raise AuthError("try_again", 409)
                return TransactionPlan(state)
            state = await self.repository.transact((device_path, state_path), inspect)
            paths = (device_path, state_path, *(document_path("grants", value) for value in state.grant_order_ids))
            if len(paths) > 100:
                raise AuthError("service_unavailable", 503)

            def read(rows, expected_state=state):
                device = DeviceDocument.model_validate(rows[device_path])
                self.auth._same_principal(rows[device_path], principal)
                current = LicensingStateDocument.model_validate(rows[state_path]) if rows[state_path] else LicensingStateDocument(device_id=principal.device_id)
                if current != expected_state:
                    return TransactionPlan(None)
                if current.revocation_fence:
                    raise AuthError("try_again", 409)
                grants = [GrantDocument.model_validate(rows[document_path("grants", value)]) for value in current.grant_order_ids]
                if any(value.device_id != principal.device_id for value in grants):
                    raise AuthError("invalid_input", 422)
                stored_generation = device.entitlement_generation
                puts = {}
                if device.trial_started_at is None:
                    device = device.model_copy(update={"trial_started_at": device.created_at, "trial_expires_at": device.created_at + timedelta(days=7)})
                    puts[device_path] = device
                generation = device.entitlement_generation
                if previous_jws is not None:
                    generation = max(generation, floor) + 1
                elif generation == 0:
                    generation = 1
                if generation != device.entitlement_generation:
                    device = device.model_copy(update={"entitlement_generation": generation})
                    puts[device_path] = device
                return TransactionPlan((device, current, grants, stored_generation), puts if persist else {})
            snapshot = await self.repository.transact(paths, read)
            if snapshot is None:
                continue
            device, current, grants, stored_generation = snapshot
            valid = sorted((value for value in grants if value.status == "valid"), key=lambda value: (value.starts_at, value.order_id))
            trial_active = device.trial_started_at <= now < device.trial_expires_at
            ongoing = [value for value in valid if value.starts_at <= now < value.expires_at]
            if valid and (ongoing or not trial_active):
                chosen = ongoing[0] if ongoing else valid[-1]
                start, expiry, status = chosen.starts_at, valid[-1].expires_at, "active"
            else:
                start, expiry = device.trial_started_at, device.trial_expires_at
                status = "trial" if trial_active or not grants else "revoked"
            token = self.crypto.sign({"iss": ISSUER, "aud": AUDIENCE, "deviceId": principal.device_id,
                "generation": device.entitlement_generation, "state": status,
                "startsAt": ms(start), "expiresAt": ms(expiry), "serverTime": ms(now)})

            def validate(rows, generation=device.entitlement_generation if persist else stored_generation,
                         revision=current.revision):
                self.auth._same_principal(rows[device_path], principal)
                observed = DeviceDocument.model_validate(rows[device_path])
                latest = LicensingStateDocument.model_validate(rows[state_path]) if rows[state_path] else LicensingStateDocument(device_id=principal.device_id)
                return TransactionPlan(observed.entitlement_generation == generation and latest.revision == revision and latest.revocation_fence is None)
            if await self.repository.transact((device_path, state_path), validate):
                return token
        raise AuthError("try_again", 409)

    async def refund(self, *, order_id: str, payment_id: str, status: str,
                     confirmed_at: datetime, provider_updated_at: datetime, now: datetime) -> str:
        if status not in {"refunded", "charged_back"}:
            raise AuthError("invalid_input", 422)
        order_path = document_path("orders", order_id)
        saved = await self.repository.client.document(order_path).get(timeout=5, retry=None)
        if not saved.exists:
            raise AuthError("invalid_input", 422)
        order = OrderDocument.model_validate(saved.to_dict())
        operation_id = "license-" + hashlib.sha256((order_id + "/" + payment_id + "/" + status + "/" + provider_updated_at.isoformat()).encode()).hexdigest()
        device_path = document_path("devices", order.device_id)
        state_path = document_path("licensing", "current", device_id=order.device_id)
        intent_path = document_path("licenseIntents", operation_id, device_id=order.device_id)
        payment_path = document_path("paymentClaims", payment_id)
        job_path = document_path("jobs", operation_id)

        def reserve(rows):
            device = DeviceDocument.model_validate(rows[device_path])
            current_order = OrderDocument.model_validate(rows[order_path])
            state = LicensingStateDocument.model_validate(rows[state_path])
            if rows[intent_path] is not None:
                return TransactionPlan(LicenseIntentDocument.model_validate(rows[intent_path]))
            if device.access_fence or device.recovery_epoch != self.auth.recovery_epoch or state.revocation_fence:
                raise AuthError("try_again", 409)
            if current_order.provider_payment_id not in {None, payment_id}:
                raise AuthError("try_again", 409)
            if rows[payment_path] is not None:
                claim = PaymentClaimDocument.model_validate(rows[payment_path])
                if claim.order_id != order_id or claim.device_id != order.device_id:
                    raise AuthError("try_again", 409)
            if current_order.status in {"refunded", "charged_back"}:
                return TransactionPlan(None)
            if current_order.provider_updated_at and current_order.provider_updated_at > provider_updated_at:
                return TransactionPlan(None)
            event = JournalEvent(event_id=operation_id, kind="license_revoked", device_id=order.device_id,
                generation=device.entitlement_generation + 1, reference_id=order_id, occurred_at=now)
            intent = LicenseIntentDocument(operation_id=operation_id, device_id=order.device_id,
                order_id=order_id, payment_id=payment_id, status=status, confirmed_at=confirmed_at,
                provider_updated_at=provider_updated_at, target_generation=event.generation,
                created_at=now, journal_object_id=event.object_id, journal_digest=event.digest)
            return TransactionPlan(intent, {intent_path: intent,
                state_path: state.model_copy(update={"revocation_fence": operation_id, "revision": state.revision + 1}),
                job_path: JobDocument(kind="license_finalize", device_id=order.device_id,
                    dedupe_key=operation_id, next_due_at=now)})
        intent = await self.repository.transact((device_path, state_path, order_path, intent_path, payment_path, job_path), reserve)
        return "finalized" if intent is None else await self.resume_refund(intent)

    async def resume_refund(self, intent: LicenseIntentDocument) -> str:
        if intent.state == "finalized":
            return "finalized"
        event = JournalEvent(event_id=intent.operation_id, kind="license_revoked", device_id=intent.device_id,
            generation=intent.target_generation, reference_id=intent.order_id, occurred_at=intent.created_at)
        if event.digest != intent.journal_digest or event.object_id != intent.journal_object_id:
            raise JournalError("journal_digest_conflict")
        try:
            await self.journal.append(event)
        except JournalError:
            return "pending_journal"
        device_path = document_path("devices", intent.device_id)
        state_path = document_path("licensing", "current", device_id=intent.device_id)
        intent_path = document_path("licenseIntents", intent.operation_id, device_id=intent.device_id)
        order_path = document_path("orders", intent.order_id)
        payment_path = document_path("paymentClaims", intent.payment_id)
        job_path = document_path("jobs", intent.operation_id)
        snapshot = await self.repository.client.document(state_path).get(timeout=5, retry=None)
        state = LicensingStateDocument.model_validate(snapshot.to_dict())
        paths = (device_path, state_path, intent_path, order_path, payment_path, job_path,
            *(document_path("grants", value) for value in state.grant_order_ids))
        if len(paths) > 100:
            raise AuthError("service_unavailable", 503)

        def finalize(rows):
            current_intent = LicenseIntentDocument.model_validate(rows[intent_path])
            if current_intent.state == "finalized":
                return TransactionPlan("finalized")
            if current_intent != intent:
                raise AuthError("try_again", 409)
            current = LicensingStateDocument.model_validate(rows[state_path])
            device = DeviceDocument.model_validate(rows[device_path])
            order = OrderDocument.model_validate(rows[order_path])
            if order.device_id != intent.device_id or order.provider_payment_id not in {None, intent.payment_id}:
                raise AuthError("try_again", 409)
            if current.revocation_fence != intent.operation_id or current.grant_order_ids != state.grant_order_ids or device.access_fence:
                raise AuthError("try_again", 409)
            if rows[payment_path] is not None:
                claim = PaymentClaimDocument.model_validate(rows[payment_path])
                if claim.order_id != intent.order_id or claim.device_id != intent.device_id:
                    raise AuthError("try_again", 409)
            grants = [GrantDocument.model_validate(rows[document_path("grants", value)]) for value in current.grant_order_ids]
            if any(grant.device_id != intent.device_id for grant in grants):
                raise AuthError("invalid_input", 422)
            updated = schedule_grants([grant.model_copy(update={"status": intent.status}) if grant.order_id == intent.order_id else grant for grant in grants])
            puts = {intent_path: current_intent.model_copy(update={"state": "finalized"}),
                device_path: device.model_copy(update={"entitlement_generation": max(device.entitlement_generation, intent.target_generation)}),
                state_path: current.model_copy(update={"revocation_fence": None, "revision": current.revision + 1,
                    "pending_order_id": None if current.pending_order_id == intent.order_id else current.pending_order_id}),
                order_path: order.model_copy(update={"status": intent.status, "provider_payment_id": intent.payment_id,
                    "confirmed_at": order.confirmed_at or intent.confirmed_at,
                    "provider_updated_at": intent.provider_updated_at, "updated_at": intent.created_at,
                    "pix_qr_code": None})}
            if rows[payment_path] is None:
                puts[payment_path] = PaymentClaimDocument(payment_id=intent.payment_id, order_id=intent.order_id,
                    device_id=intent.device_id, created_at=intent.created_at)
            puts.update({document_path("grants", value.order_id): value for value in updated})
            return TransactionPlan("finalized", puts, (job_path,) if rows[job_path] else ())
        return await self.repository.transact(paths, finalize)
