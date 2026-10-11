"""Desafio TV e sessão web restrita; identificação nunca concede acesso comum."""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.portal.access_rotation import AccessResult, AccessRotation
from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token, valid_token
from app.portal.crypto import CipherContext, canonical_json
from app.portal.models import (
    AccessIntentDocument,
    DeviceDocument,
    InviteDocument,
    IssuanceDocument,
    JobDocument,
    RecoveryClaimDocument,
    RecoveryCodeDocument,
    SessionDocument,
)
from app.portal.rate_limit import RateConstraint
from app.portal.recovery_codes import RecoveryCodeError
from app.portal.repositories.control import TransactionPlan, document_path


@dataclass(frozen=True, repr=False)
class RecoveryWebIssuance:
    token: str
    csrf: str
    claim_id: str
    device_id: str
    expires_at: datetime


class RecoveryService:
    def __init__(self, access: AccessRotation):
        self.access = access
        self.auth = access.auth
        self.repository = access.repository
        self.crypto = access.crypto
        self.codes = access.codes

    @staticmethod
    def context(device_id: str, claim_id: str):
        return CipherContext(device_id, "recovery-challenge", claim_id)

    async def challenge(self, identity: str, nonce: str, ip: str, now: datetime) -> dict:
        if (not isinstance(identity, str) or not 1 <= len(identity) <= 512 or not identity.strip()
                or any(ord(char) < 32 or ord(char) > 126 for char in identity)
                or not valid_token(nonce) or not 1 <= len(ip) <= 128):
            raise AuthError("invalid_input", 422)
        rules = tuple(RateConstraint(self.auth.tokens.digest("rate_limit", scope), limit, 900)
                      for scope, limit in (("recovery-ip/" + ip, 20),
                                           ("recovery-identity/" + identity, 5),
                                           ("recovery-global", 100)))
        rate = await self.auth.limits.evaluate(rules, now, consume=True)
        if not rate.allowed:
            raise AuthError("rate_limited", 429, rate.retry_after)
        hashes = self.auth.tokens.candidates("identity", identity)
        identities = tuple(document_path("identityClaims", digest) for digest in hashes)
        preliminary = {}
        async for snapshot in self.repository.client.get_all(
            [self.repository.client.document(path) for path in identities]
        ):
            if snapshot.exists:
                preliminary[snapshot.reference.path] = snapshot.to_dict()
        if len(preliminary) != 1:
            raise AuthError("invalid_credentials")
        device_id = next(iter(preliminary.values()))["deviceId"]
        device_path = document_path("devices", device_id)
        device = DeviceDocument.model_validate((await self.repository.client.document(device_path).get()).to_dict())
        claims = tuple(document_path("recoveryClaims", "claim-" + digest)
                       for digest in self.auth.tokens.candidates("recovery_request", nonce))
        claim_id = "claim-" + self.auth.tokens.digest("recovery_request", nonce)
        claim_path = document_path("recoveryClaims", claim_id)
        token, claim_secret = new_token(), new_token()
        token_hash = self.auth.tokens.digest("invite", token)
        invite_path = document_path("invites", token_hash)
        expiry = now + timedelta(minutes=5)
        bootstrap = {"claimId": claim_id, "deviceId": device_id, "token": token,
                     "claimSecret": claim_secret, "expiresAt": expiry.isoformat()}
        claim = RecoveryClaimDocument(
            claim_id=claim_id, device_id=device_id, identity_hmac=device.identity_hmac,
            claim_secret_hash=self.auth.tokens.digest("issuance_claim", claim_secret),
            challenge_hash=token_hash, auth_epoch=device.auth_epoch,
            recovery_epoch=self.auth.recovery_epoch, created_at=now, expires_at=expiry,
            bootstrap_envelope=self.crypto.encrypt(canonical_json(bootstrap), self.context(device_id, claim_id)),
        )
        invite = InviteDocument(device_id=device_id, purpose="recover", recovery_claim_id=claim_id,
                                auth_epoch=device.auth_epoch, recovery_epoch=self.auth.recovery_epoch,
                                created_at=now, expires_at=expiry)

        def reserve(rows):
            existing = [RecoveryClaimDocument.model_validate(rows[path]) for path in claims if rows[path]]
            if existing:
                if len(existing) != 1:
                    raise AuthError()
                saved = existing[0]
                if (saved.identity_hmac not in hashes or saved.device_id != device_id
                        or saved.recovery_epoch != self.auth.recovery_epoch or saved.expires_at <= now
                        or saved.bootstrap_envelope is None):
                    raise AuthError()
                return TransactionPlan(saved)
            current = DeviceDocument.model_validate(rows[device_path])
            matching = [row for path in identities if (row := rows[path]) is not None]
            if (len(matching) != 1 or matching[0]["deviceId"] != device_id
                    or current.identity_hmac not in hashes or current.auth_epoch != device.auth_epoch
                    or rows[invite_path] is not None):
                raise AuthError()
            return TransactionPlan(claim, {claim_path: claim, invite_path: invite})

        saved = await self.repository.transact((*identities, *claims, device_path, invite_path), reserve)
        return json.loads(self.crypto.decrypt(saved.bootstrap_envelope, self.context(saved.device_id, saved.claim_id)))

    async def exchange(self, token: str, origin: str | None, now: datetime) -> RecoveryWebIssuance:
        self.auth.browser_origin(origin, mutation=True)
        invites = self.auth._paths("invites", "invite", token)
        _, row = await self.auth._lookup(invites)
        invite = InviteDocument.model_validate(row)
        if invite.purpose != "recover" or not invite.recovery_claim_id:
            raise AuthError()
        claim_path = document_path("recoveryClaims", invite.recovery_claim_id)
        device_path = document_path("devices", invite.device_id)
        cookie, csrf = new_token(), new_token()
        session_path = document_path("sessions", self.auth.tokens.digest("recovery_session", cookie))
        session = SessionDocument(device_id=invite.device_id, purpose="recover",
                                  recovery_claim_id=invite.recovery_claim_id, auth_epoch=invite.auth_epoch,
                                  recovery_epoch=self.auth.recovery_epoch,
                                  csrf_hash=self.auth.tokens.digest("csrf", csrf),
                                  created_at=now, last_seen_at=now)

        def consume(rows):
            invite_path, row = self.auth._found(rows, invites)
            saved = InviteDocument.model_validate(row)
            claim = RecoveryClaimDocument.model_validate(rows[claim_path])
            device = DeviceDocument.model_validate(rows[device_path])
            if (saved.purpose != "recover" or saved.consumed_at is not None or saved.expires_at <= now
                    or saved.recovery_epoch != self.auth.recovery_epoch or saved.created_at > now
                    or claim.state != "pending" or claim.expires_at <= now
                    or claim.recovery_epoch != self.auth.recovery_epoch
                    or claim.device_id != device.device_id or claim.identity_hmac != device.identity_hmac
                    or device.auth_epoch != saved.auth_epoch or rows[session_path]):
                raise AuthError()
            issued = RecoveryWebIssuance(cookie, csrf, claim.claim_id, claim.device_id, claim.expires_at)
            return TransactionPlan(issued, {
                invite_path: saved.model_copy(update={"consumed_at": now}),
                claim_path: claim.model_copy(update={"state": "exchanged"}), session_path: session,
            })

        return await self.repository.transact((*invites, claim_path, device_path, session_path), consume)

    async def web_claim(self, token: str, origin: str | None, csrf: str, now: datetime) -> RecoveryClaimDocument:
        self.auth.browser_origin(origin, mutation=True)
        sessions = self.auth._paths("sessions", "recovery_session", token)
        _, row = await self.auth._lookup(sessions)
        session = SessionDocument.model_validate(row)
        if session.purpose != "recover" or not session.recovery_claim_id:
            raise AuthError()
        claim_path = document_path("recoveryClaims", session.recovery_claim_id)

        def authenticate(rows):
            _, row = self.auth._found(rows, sessions)
            current = SessionDocument.model_validate(row)
            claim = RecoveryClaimDocument.model_validate(rows[claim_path])
            if (claim.state not in {"exchanged", "reserved", "confirmed"}
                    or current.purpose != "recover" or current.recovery_claim_id != claim.claim_id
                    or current.device_id != claim.device_id
                    or current.recovery_epoch != self.auth.recovery_epoch
                    or claim.recovery_epoch != self.auth.recovery_epoch or claim.expires_at <= now
                    or claim.created_at > now or current.created_at > now
                    or not valid_token(csrf) or not self.auth.tokens.matches("csrf", csrf, current.csrf_hash)):
                raise AuthError()
            return TransactionPlan(claim)

        return await self.repository.transact((*sessions, claim_path), authenticate)

    def failure_rules(self, claim_id: str, code: str, ip: str):
        canonical = code.upper().replace("-", "").replace(" ", "").translate(
            str.maketrans({"O": "0", "I": "1", "L": "1"})
        )
        code_marker = hashlib.sha256(canonical.encode("utf-8", errors="replace")).hexdigest()
        return tuple(RateConstraint(self.auth.tokens.digest("rate_limit", scope), limit, 900, 900)
                     for scope, limit in (
                         ("recover-pair/" + claim_id + "/" + ip, 5),
                         ("recover-code/" + code_marker, 5), ("recover-ip/" + ip, 25),
                         ("recover-global", 100),
                     ))

    async def _invalid_code(self, rules, now):
        rate = await self.auth.limits.evaluate(rules, now, consume=True)
        if not rate.allowed:
            raise AuthError("rate_limited", 429, rate.retry_after)
        raise AuthError("invalid_credentials")

    async def _existing_confirmation(self, claim_id: str, request_id: str, code_versions: dict,
                                     device_id: str, now: datetime) -> AccessResult | None:
        path = document_path("recoveryClaims", claim_id)
        claim = RecoveryClaimDocument.model_validate((await self.repository.client.document(path).get()).to_dict())
        if claim.state not in {"reserved", "confirmed"}:
            return None
        if (claim.recovery_epoch != self.auth.recovery_epoch or claim.expires_at <= now
                or claim.request_id != request_id or claim.submitted_code_hash not in code_versions
                or claim.device_id != device_id):
            raise AuthError("try_again", 409)
        path = document_path("accessIntents", claim.operation_id, device_id=claim.device_id)
        intent = AccessIntentDocument.model_validate((await self.repository.client.document(path).get()).to_dict())
        if intent.recovery_epoch != self.auth.recovery_epoch or intent.device_id != claim.device_id:
            raise AuthError()
        return await self.access.resume(intent, now)

    async def confirm(self, cookie: str, origin: str | None, csrf: str, *, code: str,
                      confirmed_device_id: str, request_id: str, ip: str, now: datetime) -> AccessResult:
        if not valid_token(request_id) or not isinstance(code, str) or len(code) > 64 or not 1 <= len(ip) <= 128:
            raise AuthError("invalid_input", 422)
        claim = await self.web_claim(cookie, origin, csrf, now)
        form = RateConstraint(self.auth.tokens.digest("rate_limit", "recovery-forms/" + cookie), 30, 60)
        rate = await self.auth.limits.evaluate((form,), now, consume=True)
        if not rate.allowed:
            raise AuthError("rate_limited", 429, rate.retry_after)
        rules = self.failure_rules(claim.claim_id, code, ip)
        code_versions = {}

        async def invalid():
            if code_versions:
                existing = await self._existing_confirmation(claim.claim_id, request_id,
                    code_versions, confirmed_device_id, now)
                if existing is not None:
                    return existing
            return await self._invalid_code(rules, now)

        rate = await self.auth.limits.evaluate(rules, now, consume=False)
        if not rate.allowed:
            raise AuthError("rate_limited", 429, rate.retry_after)
        if confirmed_device_id != claim.device_id:
            return await invalid()
        try:
            code_versions = {digest: version for version, digest in self.codes.candidates(code)}
        except RecoveryCodeError:
            return await invalid()
        claim_path = document_path("recoveryClaims", claim.claim_id)
        device_path = document_path("devices", claim.device_id)
        existing = await self._existing_confirmation(claim.claim_id, request_id,
                                                     code_versions, confirmed_device_id, now)
        if existing is not None:
            return existing
        proof_paths = tuple(document_path("recoveryCodes", digest) for digest in code_versions)
        found = []
        async for snapshot in self.repository.client.get_all(
            [self.repository.client.document(path) for path in proof_paths]
        ):
            if snapshot.exists:
                found.append((snapshot.reference.path, snapshot.to_dict()))
        if len(found) != 1:
            return await invalid()
        proof_path, proof_row = found[0]
        proof = RecoveryCodeDocument.model_validate(proof_row)
        code_hash = proof_path.split("/")[1]
        device = DeviceDocument.model_validate((await self.repository.client.document(device_path).get()).to_dict())
        if (proof.device_id != claim.device_id or proof.hash_key_version != code_versions[code_hash]
                or device.identity_hmac != claim.identity_hmac or device.auth_epoch != claim.auth_epoch
                or device.recovery_code_hmac is None):
            return await invalid()
        previous = None
        operation_id = request_id
        if proof.status == "consumed" or device.access_fence is not None:
            operation_id = proof.consumed_by_operation_id if proof.status == "consumed" else device.access_fence
            if not operation_id or device.access_fence not in {None, operation_id}:
                return await invalid()
            path = document_path("accessIntents", operation_id, device_id=claim.device_id)
            snapshot = await self.repository.client.document(path).get()
            if not snapshot.exists:
                return await invalid()
            previous = AccessIntentDocument.model_validate(snapshot.to_dict())
            expected_epoch = previous.from_auth_epoch if previous.state == "pending_journal" else previous.target_auth_epoch
            expected_hash = previous.previous_code_hmac if previous.state == "pending_journal" else previous.new_code_hmac
            if (previous.state == "acked" or previous.recovery_epoch != self.auth.recovery_epoch
                    or previous.expires_at > now or now + timedelta(minutes=5) > previous.resume_until
                    or device.auth_epoch != expected_epoch or device.recovery_code_hmac != expected_hash):
                return await invalid()
        elif (proof.status != "active" or code_hash != device.recovery_code_hmac
              or proof.version != device.recovery_code_version):
            return await invalid()
        if claim.bootstrap_envelope is None:
            raise AuthError()
        bootstrap = json.loads(self.crypto.decrypt(claim.bootstrap_envelope, self.context(claim.device_id, claim.claim_id)))
        secret = bootstrap["claimSecret"]
        if not self.auth.tokens.matches("issuance_claim", secret, claim.claim_secret_hash):
            raise AuthError()
        # Restore deixa credenciais antigas bloqueadas; só reservar fence permite nova epoch global.
        prepared_device = device.model_copy(update={"recovery_epoch": self.auth.recovery_epoch})
        prepared = self.access._prepare(prepared_device, operation_id, secret,
                                        previous.purpose if previous else "recover", now, previous)
        intent_path = document_path("accessIntents", operation_id, device_id=claim.device_id)
        result_path = document_path("recoveryResults", operation_id)
        job_path = document_path("jobs", self.access.job_id(claim.device_id, operation_id))
        current_code_path = document_path("recoveryCodes", device.recovery_code_hmac)
        new_code_path = document_path("recoveryCodes", prepared.new_code_hmac)
        sessions = self.auth._paths("sessions", "recovery_session", cookie)
        digest = hashlib.sha256(canonical_json({"requestId": request_id, "operationId": operation_id,
            "claimId": claim.claim_id, "deviceId": claim.device_id, "codeHash": code_hash})).hexdigest()

        def reserve(rows):
            _, session_row = self.auth._found(rows, sessions)
            session = SessionDocument.model_validate(session_row)
            current_claim = RecoveryClaimDocument.model_validate(rows[claim_path])
            current = DeviceDocument.model_validate(rows[device_path])
            submitted = RecoveryCodeDocument.model_validate(rows[proof_path])
            active_code = RecoveryCodeDocument.model_validate(rows[current_code_path])
            if (session.purpose != "recover" or session.recovery_claim_id != claim.claim_id
                    or session.recovery_epoch != self.auth.recovery_epoch
                    or not self.auth.tokens.matches("csrf", csrf, session.csrf_hash)):
                raise AuthError()
            if current_claim.state in {"reserved", "confirmed"}:
                if current_claim.idempotency_digest != digest or current_claim.operation_id != operation_id:
                    raise AuthError("try_again", 409)
                return TransactionPlan(AccessIntentDocument.model_validate(rows[intent_path]))
            if (current_claim.state != "exchanged" or current_claim.expires_at <= now
                    or current_claim.recovery_epoch != self.auth.recovery_epoch
                    or current.identity_hmac != claim.identity_hmac or current.auth_epoch != device.auth_epoch
                    or current.recovery_code_hmac != device.recovery_code_hmac
                    or current.access_fence != device.access_fence
                    or submitted.model_dump() != proof.model_dump()
                    or active_code.device_id != claim.device_id or active_code.status != "active"
                    or active_code.version != current.recovery_code_version or rows[new_code_path]):
                raise AuthError("invalid_credentials")
            if previous:
                saved = AccessIntentDocument.model_validate(rows[intent_path])
                if saved.journal_digest != previous.journal_digest or saved.state == "acked":
                    raise AuthError("invalid_credentials")
            elif rows[intent_path] or rows[result_path]:
                raise AuthError("try_again", 409)
            puts = {
                device_path: current.model_copy(update={"access_fence": operation_id,
                                                       "recovery_epoch": self.auth.recovery_epoch}),
                claim_path: current_claim.model_copy(update={"state": "reserved", "bootstrap_envelope": None,
                    "operation_id": operation_id, "request_id": request_id,
                    "submitted_code_hash": code_hash, "idempotency_digest": digest}),
                intent_path: prepared,
                job_path: JobDocument(kind="access_finalize", dedupe_key=operation_id,
                                      device_id=claim.device_id, next_due_at=now),
            }
            if rows[result_path]:
                result = IssuanceDocument.model_validate(rows[result_path])
                if result.state == "acked" or result.expires_at > now or result.device_id != claim.device_id:
                    raise AuthError("invalid_credentials")
                puts[result_path] = result.model_copy(update={"state": "expired", "envelope": None})
            return TransactionPlan(prepared, puts)

        paths = tuple(dict.fromkeys((*sessions, claim_path, device_path, intent_path, result_path,
                                     job_path, proof_path, current_code_path, new_code_path)))
        try:
            saved = await self.repository.transact(paths, reserve)
        except AuthError as error:
            if error.code == "invalid_credentials":
                return await invalid()
            raise
        return await self.access.resume(saved, now)

    async def claim_result(self, claim_id: str, secret: str, now: datetime) -> AccessResult:
        if not valid_token(secret):
            raise AuthError()
        path = document_path("recoveryClaims", claim_id)
        snapshot = await self.repository.client.document(path).get()
        if not snapshot.exists:
            raise AuthError()
        claim = RecoveryClaimDocument.model_validate(snapshot.to_dict())
        if (claim.recovery_epoch != self.auth.recovery_epoch
                or not self.auth.tokens.matches("issuance_claim", secret, claim.claim_secret_hash)):
            raise AuthError()
        if claim.operation_id is None:
            if claim.expires_at <= now:
                raise AuthError()
            return AccessResult(claim_id, "awaiting_confirmation")
        return await self.access.poll(claim.device_id, claim.operation_id, secret, now)
