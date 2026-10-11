"""Vínculo inicial CAS; só nonce privado da mesma emissão autoriza sua repetição."""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.auth_tokens import new_token, valid_token
from app.portal.crypto import CipherContext, PortalCrypto, canonical_json
from app.portal.models import (
    DeviceDocument,
    IdentityClaimDocument,
    IssuanceDocument,
    RecoveryCodeDocument,
)
from app.portal.rate_limit import RateConstraint
from app.portal.recovery_codes import RecoveryCodes, new_recovery_code
from app.portal.repositories.control import TransactionPlan, document_path


@dataclass(frozen=True, repr=False)
class EnrollmentIssuance:
    operation_id: str
    credentials: dict


class EnrollmentService:
    def __init__(self, auth: AuthService, crypto: PortalCrypto, codes: RecoveryCodes):
        self.auth = auth
        self.repository = auth.repository
        self.crypto = crypto
        self.codes = codes

    @staticmethod
    def _context(device_id: str, operation_id: str):
        return CipherContext(device_id, "credential-issuance", operation_id)

    async def enroll(self, identity: str, nonce: str, ip: str, now: datetime) -> EnrollmentIssuance:
        if (not isinstance(identity, str) or not 1 <= len(identity) <= 512
                or not identity.strip() or any(ord(char) < 32 or ord(char) > 126 for char in identity)
                or not valid_token(nonce) or not 1 <= len(ip) <= 128):
            raise AuthError("invalid_input", 422)
        rules = tuple(RateConstraint(self.auth.tokens.digest("rate_limit", scope), limit, 3600)
                      for scope, limit in (("enroll-ip/" + ip, 20), ("enroll-global", 100)))
        rate = await self.auth.limits.evaluate(rules, now, consume=True)
        if not rate.allowed:
            raise AuthError("rate_limited", 429, rate.retry_after)
        identity_hashes = self.auth.tokens.candidates("identity", identity)
        claims = tuple(document_path("identityClaims", digest) for digest in identity_hashes)
        nonce_hashes = self.auth.tokens.candidates("enrollment", nonce)
        results = tuple(document_path("recoveryResults", "enroll-" + digest) for digest in nonce_hashes)
        nonce_hash = self.auth.tokens.digest("enrollment", nonce)
        operation_id = "enroll-" + nonce_hash
        result_path = document_path("recoveryResults", operation_id)
        device_id, secret, key, code = new_token(), new_token(), new_token(), new_recovery_code()
        bearer = device_id + "." + secret
        identity_hash = self.auth.tokens.digest("identity", identity)
        credentials = {"deviceId": device_id, "bearer": bearer, "deviceKey": key, "authEpoch": 1,
                       "recoveryEpoch": self.auth.recovery_epoch, "recoveryCode": code,
                       "recoveryCodeVersion": 1}
        device_path = document_path("devices", device_id)
        code_path = document_path("recoveryCodes", self.codes.digest(code))
        device = DeviceDocument(device_id=device_id, identity_hmac=identity_hash,
                                tv_bearer_hash=self.auth.tokens.digest("tv_bearer", bearer),
                                device_key_hash=self.auth.tokens.digest("device_key", key),
                                auth_epoch=1, recovery_epoch=self.auth.recovery_epoch, created_at=now,
                                recovery_code_hmac=self.codes.digest(code),
                                recovery_hash_key_version=self.codes.active_version)
        envelope = self.crypto.encrypt(canonical_json(credentials), self._context(device_id, operation_id))
        result = IssuanceDocument(operation_id=operation_id, device_id=device_id, purpose="enroll",
                                  identity_hmac=identity_hash, claim_secret_hash=nonce_hash,
                                  recovery_epoch=self.auth.recovery_epoch, state="ready",
                                  envelope=envelope, created_at=now, expires_at=now + timedelta(minutes=5))

        def decide(rows):
            existing = [IssuanceDocument.model_validate(rows[path]) for path in results if rows[path]]
            if existing:
                if len(existing) != 1:
                    raise AuthError()
                saved = existing[0]
                if (saved.purpose != "enroll" or saved.identity_hmac not in identity_hashes
                        or saved.claim_secret_hash not in nonce_hashes
                        or saved.recovery_epoch != self.auth.recovery_epoch or saved.state != "ready"
                        or saved.expires_at <= now or saved.created_at > now):
                    raise AuthError()
                return TransactionPlan(saved)
            if any(rows[path] is not None for path in claims):
                raise AuthError("recovery_required", 409)
            if rows[device_path] is not None or rows[code_path] is not None:
                raise AuthError("try_again", 409)
            claim_path = document_path("identityClaims", identity_hash)
            return TransactionPlan(result, {
                claim_path: IdentityClaimDocument(device_id=device_id, created_at=now),
                device_path: device, result_path: result,
                code_path: RecoveryCodeDocument(device_id=device_id, version=1,
                                                hash_key_version=self.codes.active_version,
                                                created_at=now),
            })

        saved = await self.repository.transact((*claims, *results, device_path, code_path), decide)
        plaintext = self.crypto.decrypt(saved.envelope, self._context(saved.device_id, saved.operation_id))
        credentials = json.loads(plaintext)
        await self.auth.authenticate_tv(credentials["bearer"])
        return EnrollmentIssuance(saved.operation_id, credentials)

    async def acknowledge(self, principal: Principal, operation_id: str, now: datetime):
        path = document_path("recoveryResults", operation_id)
        device_path = document_path("devices", principal.device_id)

        def decide(rows):
            self.auth._same_principal(rows[device_path], principal)
            if rows[path] is None:
                raise AuthError()
            saved = IssuanceDocument.model_validate(rows[path])
            if (saved.purpose != "enroll" or saved.device_id != principal.device_id
                    or saved.recovery_epoch != principal.recovery_epoch):
                raise AuthError()
            if saved.state == "acked":
                return TransactionPlan(True)
            return TransactionPlan(True, {path: saved.model_copy(update={
                "state": "acked", "envelope": None, "acked_at": now,
            })})

        return await self.repository.transact((path, device_path), decide)
