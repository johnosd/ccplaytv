"""Reassociação pela própria TV depois de "Desvincular" (feature 072, ADR-017, constitution 1.12.0 (h)).

A TV prova a posse do registro com a identidade de plataforma (HMAC do DUID) **e** o código de recuperação que ela
guardava. Aprovada a prova, reaproveita a rotação write-ahead `revoke` da 069 (`AccessRotation`): epoch + 1 (derruba
sessões e o QR antigo), bearer, chave e código novos, mesmo `deviceId` e mesmo ID exibido. Recusa sempre uniforme;
o código nunca entra em log, erro ou resposta além das credenciais novas.
"""

import base64
import hashlib
import hmac
from datetime import datetime

from app.portal.access_rotation import AccessRotation
from app.portal.auth import AuthError
from app.portal.auth_tokens import valid_token
from app.portal.models import DeviceDocument, IdentityClaimDocument, RecoveryCodeDocument
from app.portal.rate_limit import RateConstraint
from app.portal.recovery_codes import RecoveryCodeError
from app.portal.repositories.control import document_path


def relink_operation_id(nonce: str) -> str:
    """Determinístico pelo nonce durável da TV: repetir a mesma reassociação devolve a mesma emissão."""
    digest = hashlib.sha256(b"ccplay-self-relink-v1:" + nonce.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


class SelfRelinkService:
    def __init__(self, access: AccessRotation):
        self.access = access
        self.auth = access.auth
        self.codes = access.codes
        self.repository = access.repository

    async def relink(self, identity: str, nonce: str, code: str, ip: str, now: datetime,
                     mac: str | None = None) -> dict:
        if (not isinstance(identity, str) or not 1 <= len(identity) <= 512 or not identity.strip()
                or any(ord(char) < 32 or ord(char) > 126 for char in identity)
                or not valid_token(nonce) or not isinstance(code, str) or not 1 <= len(code) <= 128
                or not 1 <= len(ip) <= 128):
            raise AuthError("invalid_input", 422)
        identity_hash = self.auth.tokens.digest("identity", identity)
        rules = tuple(RateConstraint(self.auth.tokens.digest("rate_limit", scope), limit, 3600)
                      for scope, limit in (("relink-ip/" + ip, 20), ("relink-identity/" + identity_hash, 5),
                                           ("relink-global", 200)))
        rate = await self.auth.limits.evaluate(rules, now, consume=True)
        if not rate.allowed:
            raise AuthError("rate_limited", 429, rate.retry_after)
        operation_id = relink_operation_id(nonce)
        device_id = await self._claimed_device(identity)
        if device_id is not None and (await self.repository.client.document(document_path(
                "accessIntents", operation_id, device_id=device_id)).get()).exists:
            # Repetição (resposta perdida): o código antigo já foi consumido; a prova agora é o nonce privado,
            # conferido pela própria rotação (`claim_secret`).
            return await self._result(device_id, operation_id, nonce, now)
        device = await self._prove(identity, code)
        try:
            await self.access.begin(self.auth._principal(device), operation_id, nonce, "revoke", now, mac)
        except AuthError as error:
            if error.status != 409:  # 409 = intenção já existe (repetição com o mesmo nonce): segue para o resultado
                raise
        return await self._result(device.device_id, operation_id, nonce, now)

    async def _result(self, device_id: str, operation_id: str, nonce: str, now: datetime) -> dict:
        result = await self.access.poll(device_id, operation_id, nonce, now)
        if result.state != "ready" or not result.credentials:
            raise AuthError("try_again", 409)
        return {"operationId": operation_id, **result.credentials}

    async def _claimed_device(self, identity: str) -> str | None:
        for digest in self.auth.tokens.candidates("identity", identity):
            snapshot = await self.repository.client.document(document_path("identityClaims", digest)).get()
            if snapshot.exists:
                return IdentityClaimDocument.model_validate(snapshot.to_dict()).device_id
        return None

    async def _prove(self, identity: str, code: str) -> DeviceDocument:
        device_id = await self._claimed_device(identity)
        if device_id is None:
            raise AuthError("invalid_credentials")
        snapshot = await self.repository.client.document(document_path("devices", device_id)).get()
        if not snapshot.exists:
            raise AuthError("invalid_credentials")
        device = DeviceDocument.model_validate(snapshot.to_dict())
        try:
            candidates = self.codes.candidates(code)
        except RecoveryCodeError:
            raise AuthError("invalid_credentials") from None
        if (device.recovery_epoch != self.auth.recovery_epoch or device.recovery_code_hmac is None
                or not any(hmac.compare_digest(digest, device.recovery_code_hmac) for _, digest in candidates)):
            raise AuthError("invalid_credentials")
        stored = await self.repository.client.document(
            document_path("recoveryCodes", device.recovery_code_hmac)).get()
        if not stored.exists:
            raise AuthError("invalid_credentials")
        record = RecoveryCodeDocument.model_validate(stored.to_dict())
        if (record.device_id != device.device_id or record.status != "active"
                or record.version != device.recovery_code_version):
            raise AuthError("invalid_credentials")
        return device
