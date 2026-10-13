"""Rotação write-ahead: fence → journal → CAS. Resultado só para prova TV vinculada."""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.auth_tokens import new_token, valid_token
from app.portal.crypto import CipherContext, PortalCrypto, canonical_json
from app.portal.display_id import new_device_key, pick_display_id
from app.portal.models import (
    AccessIntentDocument,
    DeviceDocument,
    DisplayIdClaimDocument,
    IssuanceDocument,
    JobDocument,
    RecoveryCodeDocument,
)
from app.portal.recovery_codes import RecoveryCodes, new_recovery_code
from app.portal.recovery_journal import JournalError, JournalEvent, JournalWriter
from app.portal.repositories.control import TransactionPlan, document_path


@dataclass(frozen=True, repr=False)
class AccessResult:
    operation_id: str
    state: str
    credentials: dict | None = None


class AccessRotation:
    def __init__(self, auth: AuthService, crypto: PortalCrypto, codes: RecoveryCodes,
                 journal: JournalWriter):
        self.auth, self.crypto, self.codes, self.journal = auth, crypto, codes, journal
        self.repository = auth.repository

    @staticmethod
    def job_id(device_id: str, operation_id: str):
        return "access-" + hashlib.sha256(f"{device_id}/{operation_id}".encode()).hexdigest()

    @staticmethod
    def event(intent: AccessIntentDocument) -> JournalEvent:
        return JournalEvent(event_id=intent.operation_id + "-" + str(intent.issuance_round),
                            kind="access_revoked", device_id=intent.device_id,
                            epoch=intent.target_auth_epoch,
                            recovery_code_version=intent.target_code_version,
                            operation_id=intent.operation_id,
                            recovery_code_hmac=intent.new_code_hmac,
                            hash_key_version=intent.hash_key_version, occurred_at=intent.issued_at)

    def _prepare(self, device: DeviceDocument, operation_id: str, claim_secret: str,
                 purpose: str, now: datetime, previous: AccessIntentDocument | None = None,
                 display: tuple[str, str] | None = None):
        target_epoch = max(device.auth_epoch, previous.target_auth_epoch if previous else 0) + 1
        target_version = max(device.recovery_code_version, previous.target_code_version if previous else 0) + 1
        issuance_round = previous.issuance_round + 1 if previous else 1
        bearer = device.device_id + "." + new_token()
        key, code = new_device_key(), new_recovery_code()
        # 070/D-004: ID atribuído nesta rotação (upgrade), herdado de uma rodada anterior, ou o já gravado.
        upgrade = display or ((previous.display_id, previous.display_id_source)
                              if previous and previous.display_id else None)
        display_id = upgrade[0] if upgrade else device.display_id
        credentials = {"deviceId": device.device_id, "bearer": bearer, "deviceKey": key,
                       "authEpoch": target_epoch, "recoveryEpoch": device.recovery_epoch,
                       "recoveryCode": code, "recoveryCodeVersion": target_version,
                       **({"displayId": display_id} if display_id else {})}
        envelope = self.crypto.encrypt(canonical_json(credentials), CipherContext(
            device.device_id, "credential-issuance", operation_id,
        ))
        code_hash = self.codes.digest(code)
        event = JournalEvent(event_id=operation_id + "-" + str(issuance_round), kind="access_revoked",
                             device_id=device.device_id, epoch=target_epoch,
                             recovery_code_version=target_version,
                             operation_id=operation_id, recovery_code_hmac=code_hash,
                             hash_key_version=self.codes.active_version, occurred_at=now)
        intent = AccessIntentDocument(
            operation_id=operation_id, device_id=device.device_id, purpose=purpose,
            identity_hmac=device.identity_hmac, recovery_epoch=device.recovery_epoch,
            from_auth_epoch=device.auth_epoch, target_auth_epoch=target_epoch,
            target_code_version=target_version,
            previous_code_hmac=device.recovery_code_hmac, new_code_hmac=code_hash,
            hash_key_version=self.codes.active_version,
            tv_bearer_hash=self.auth.tokens.digest("tv_bearer", bearer),
            device_key_hash=self.auth.tokens.digest("device_key", key),
            claim_secret_hash=self.auth.tokens.digest("issuance_claim", claim_secret),
            state="pending_journal", envelope=envelope,
            issuance_round=issuance_round, started_at=previous.started_at if previous else now, issued_at=now,
            expires_at=now + timedelta(minutes=5), resume_until=previous.resume_until if previous else now + timedelta(hours=24),
            journal_object_id=event.object_id, journal_digest=event.digest,
            display_id=upgrade[0] if upgrade else None, display_id_source=upgrade[1] if upgrade else None,
        )
        return intent

    async def begin(self, principal: Principal, operation_id: str, claim_secret: str,
                    purpose: Literal["revoke", "rotate"], now: datetime,
                    mac: str | None = None) -> AccessResult:
        if not valid_token(claim_secret) or not valid_token(operation_id) or purpose not in {"revoke", "rotate"}:
            raise AuthError("invalid_input", 422)
        device_path = document_path("devices", principal.device_id)
        device = self.auth._same_principal(
            (await self.repository.client.document(device_path).get()).to_dict(), principal,
        )
        if device.recovery_code_hmac is None:
            raise AuthError("service_unavailable", 503)
        display, display_path = None, None
        if device.display_id is None:  # 070/D-004: dispositivo anterior à 070 ganha ID nesta rotação
            try:
                value, source, display_path = await pick_display_id(
                    self.repository, self.auth.tokens, device.identity_hmac, mac, owner=device.device_id)
            except RuntimeError:
                raise AuthError("try_again", 409) from None
            display = (value, source)
        intent = self._prepare(device, operation_id, claim_secret, purpose, now, display=display)
        intent_path = document_path("accessIntents", operation_id, device_id=device.device_id)
        result_path = document_path("recoveryResults", operation_id)
        job_path = document_path("jobs", self.job_id(device.device_id, operation_id))
        old_code_path = document_path("recoveryCodes", device.recovery_code_hmac)
        new_code_path = document_path("recoveryCodes", intent.new_code_hmac)

        def reserve(rows):
            current = self.auth._same_principal(rows[device_path], principal)
            if rows[intent_path] or rows[result_path] or rows[new_code_path]:
                raise AuthError("try_again", 409)
            if current.recovery_code_hmac != intent.previous_code_hmac:
                raise AuthError()
            old_code = RecoveryCodeDocument.model_validate(rows[old_code_path])
            if (old_code.device_id != current.device_id or old_code.status != "active"
                    or old_code.version != current.recovery_code_version):
                raise AuthError()
            puts = {
                device_path: current.model_copy(update={"access_fence": operation_id}),
                intent_path: intent,
                job_path: JobDocument(kind="access_finalize", dedupe_key=operation_id,
                                      device_id=device.device_id, next_due_at=now),
            }
            if display_path is not None:
                owner = rows[display_path]
                if owner is not None and DisplayIdClaimDocument.model_validate(owner).device_id != current.device_id:
                    raise AuthError("try_again", 409)
                if owner is None:
                    puts[display_path] = DisplayIdClaimDocument(device_id=current.device_id, created_at=now)
            return TransactionPlan(None, puts)

        reads = (device_path, intent_path, result_path, job_path, old_code_path, new_code_path)
        await self.repository.transact(reads + ((display_path,) if display_path else ()), reserve)
        return await self.resume(intent, now)

    async def resume(self, intent: AccessIntentDocument, now: datetime) -> AccessResult:
        intent_path = document_path("accessIntents", intent.operation_id, device_id=intent.device_id)
        snapshot = await self.repository.client.document(intent_path).get()
        if not snapshot.exists:
            raise AuthError()
        saved = AccessIntentDocument.model_validate(snapshot.to_dict())
        if saved.recovery_epoch != self.auth.recovery_epoch or saved.journal_digest != intent.journal_digest:
            raise AuthError()
        if saved.state != "pending_journal":
            return AccessResult(saved.operation_id, saved.state)
        event = self.event(saved)
        if event.digest != saved.journal_digest or event.object_id != saved.journal_object_id:
            raise JournalError("journal_digest_conflict")
        try:
            await self.journal.append(event)
        except JournalError as error:
            if str(error) == "journal_digest_conflict":
                raise
            return AccessResult(saved.operation_id, "pending_journal")
        device_path = document_path("devices", saved.device_id)
        result_path = document_path("recoveryResults", saved.operation_id)
        old_code_path = document_path("recoveryCodes", saved.previous_code_hmac)
        new_code_path = document_path("recoveryCodes", saved.new_code_hmac)
        job_path = document_path("jobs", self.job_id(saved.device_id, saved.operation_id))

        def finalize(rows):
            current_intent = AccessIntentDocument.model_validate(rows[intent_path])
            if current_intent.state != "pending_journal":
                return TransactionPlan(AccessResult(saved.operation_id, current_intent.state))
            current = self.auth._device_for_fence(rows[device_path], saved.operation_id)
            if (current.auth_epoch != saved.from_auth_epoch
                    or current.recovery_code_hmac != saved.previous_code_hmac
                    or current_intent.journal_digest != saved.journal_digest):
                raise AuthError()
            old_code = RecoveryCodeDocument.model_validate(rows[old_code_path])
            previous_result = IssuanceDocument.model_validate(rows[result_path]) if rows[result_path] else None
            if (old_code.status != "active" or rows[new_code_path] or previous_result and (
                previous_result.state != "expired" or previous_result.device_id != saved.device_id
                or previous_result.recovery_epoch != saved.recovery_epoch
            )):
                raise AuthError()
            updated = current.model_copy(update={
                "auth_epoch": saved.target_auth_epoch, "recovery_code_version": saved.target_code_version,
                "tv_bearer_hash": saved.tv_bearer_hash, "device_key_hash": saved.device_key_hash,
                "recovery_code_hmac": saved.new_code_hmac,
                "recovery_hash_key_version": saved.hash_key_version, "access_fence": None,
                **({"display_id": saved.display_id, "display_id_source": saved.display_id_source}
                   if saved.display_id and current.display_id is None else {}),
            })
            result = IssuanceDocument(
                operation_id=saved.operation_id, device_id=saved.device_id, purpose=saved.purpose,
                identity_hmac=saved.identity_hmac, claim_secret_hash=saved.claim_secret_hash,
                recovery_epoch=saved.recovery_epoch,
                state="expired" if current_intent.expires_at <= now or current_intent.envelope_expired else "ready",
                envelope=None if current_intent.expires_at <= now or current_intent.envelope_expired
                else current_intent.envelope,
                created_at=saved.issued_at, expires_at=saved.expires_at,
            )
            return TransactionPlan(AccessResult(saved.operation_id, "ready"), {
                device_path: updated,
                intent_path: current_intent.model_copy(update={"state": "ready", "envelope": None}),
                result_path: result,
                old_code_path: old_code.model_copy(update={"status": "consumed",
                    "consumed_by_operation_id": saved.operation_id}),
                new_code_path: RecoveryCodeDocument(device_id=saved.device_id,
                    version=saved.target_code_version, hash_key_version=saved.hash_key_version,
                    created_at=now),
            }, (job_path,))

        return await self.repository.transact((intent_path, device_path, result_path,
                                               old_code_path, new_code_path, job_path), finalize)

    async def _restage(self, previous: AccessIntentDocument, claim_secret: str, now: datetime):
        if now + timedelta(minutes=5) > previous.resume_until:
            raise AuthError()
        device_path = document_path("devices", previous.device_id)
        snapshot = await self.repository.client.document(device_path).get()
        device = DeviceDocument.model_validate(snapshot.to_dict())
        prepared = self._prepare(device, previous.operation_id, claim_secret, previous.purpose, now, previous)
        intent_path = document_path("accessIntents", previous.operation_id, device_id=previous.device_id)
        result_path = document_path("recoveryResults", previous.operation_id)
        job_path = document_path("jobs", self.job_id(previous.device_id, previous.operation_id))
        new_code_path = document_path("recoveryCodes", prepared.new_code_hmac)

        def reserve(rows):
            current = DeviceDocument.model_validate(rows[device_path])
            saved = AccessIntentDocument.model_validate(rows[intent_path])
            if saved.journal_digest != previous.journal_digest:
                if (saved.issuance_round > previous.issuance_round
                        and saved.recovery_epoch == self.auth.recovery_epoch
                        and self.auth.tokens.matches("issuance_claim", claim_secret, saved.claim_secret_hash)):
                    return TransactionPlan(saved)
                raise AuthError("try_again", 409)
            expected_epoch = saved.from_auth_epoch if saved.state == "pending_journal" else saved.target_auth_epoch
            expected_code = saved.previous_code_hmac if saved.state == "pending_journal" else saved.new_code_hmac
            expected_fence = saved.operation_id if saved.state == "pending_journal" else None
            if (saved.state == "acked" or saved.expires_at > now
                    or current.recovery_epoch != self.auth.recovery_epoch
                    or current.auth_epoch != expected_epoch or current.recovery_code_hmac != expected_code
                    or current.access_fence != expected_fence or rows[new_code_path]):
                raise AuthError()
            puts = {
                device_path: current.model_copy(update={"access_fence": saved.operation_id}),
                intent_path: prepared,
                job_path: JobDocument(kind="access_finalize", dedupe_key=saved.operation_id,
                                      device_id=saved.device_id, next_due_at=now),
            }
            if rows[result_path]:
                result = IssuanceDocument.model_validate(rows[result_path])
                if result.state == "acked" or result.device_id != saved.device_id:
                    raise AuthError()
                puts[result_path] = result.model_copy(update={"state": "expired", "envelope": None})
            return TransactionPlan(prepared, puts)

        return await self.repository.transact((device_path, intent_path, result_path,
                                               job_path, new_code_path), reserve)

    async def poll(self, device_id: str, operation_id: str, claim_secret: str, now: datetime) -> AccessResult:
        if not valid_token(claim_secret):
            raise AuthError()
        intent_path = document_path("accessIntents", operation_id, device_id=device_id)
        snapshot = await self.repository.client.document(intent_path).get()
        if not snapshot.exists:
            raise AuthError()
        intent = AccessIntentDocument.model_validate(snapshot.to_dict())
        if (intent.recovery_epoch != self.auth.recovery_epoch or now >= intent.resume_until
                or not self.auth.tokens.matches("issuance_claim", claim_secret, intent.claim_secret_hash)):
            raise AuthError()
        if intent.state != "acked" and intent.expires_at <= now:
            intent = await self._restage(intent, claim_secret, now)
        resumed = await self.resume(intent, now)
        if resumed.state != "ready":
            return resumed
        path = document_path("recoveryResults", operation_id)
        device_path = document_path("devices", device_id)

        def read(rows):
            current = self.auth._device(rows[device_path])
            result = IssuanceDocument.model_validate(rows[path])
            if (current.auth_epoch != intent.target_auth_epoch or result.device_id != device_id
                    or result.recovery_epoch != self.auth.recovery_epoch):
                raise AuthError()
            if result.state == "acked":
                return TransactionPlan(None)
            if result.expires_at <= now or result.state != "ready":
                expired = result.model_copy(update={"state": "expired", "envelope": None})
                return TransactionPlan(None, {path: expired})
            return TransactionPlan(result)

        result = await self.repository.transact((path, device_path), read)
        if result is None:
            return AccessResult(operation_id, "expired_or_acked")
        plaintext = self.crypto.decrypt(result.envelope, CipherContext(
            device_id, "credential-issuance", operation_id,
        ))
        credentials = json.loads(plaintext)
        await self.auth.authenticate_tv(credentials["bearer"])
        return AccessResult(operation_id, "ready", credentials)

    async def acknowledge(self, principal: Principal, operation_id: str, now: datetime):
        intent_path = document_path("accessIntents", operation_id, device_id=principal.device_id)
        result_path = document_path("recoveryResults", operation_id)
        device_path = document_path("devices", principal.device_id)

        def decide(rows):
            self.auth._same_principal(rows[device_path], principal)
            intent = AccessIntentDocument.model_validate(rows[intent_path])
            result = IssuanceDocument.model_validate(rows[result_path])
            if (intent.device_id != principal.device_id or intent.target_auth_epoch != principal.auth_epoch
                    or intent.recovery_epoch != principal.recovery_epoch
                    or result.device_id != principal.device_id or intent.state == "pending_journal"):
                raise AuthError()
            return TransactionPlan(True, {
                intent_path: intent.model_copy(update={"state": "acked", "envelope": None}),
                result_path: result.model_copy(update={"state": "acked", "envelope": None,
                                                       "acked_at": now}),
            })

        return await self.repository.transact((intent_path, result_path, device_path), decide)
