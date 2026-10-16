"""Cópia cifrada do código de recuperação (feature 073, D-008, constitution 1.13.0 (i)).

A TV envia, por ação da pessoa (Atualizar), o código que já guarda; o serviço só aceita se o HMAC e a versão batem com
o dispositivo, cifra com a mesma `PortalCrypto` das configurações e guarda uma única cópia
(`devices/{id}/recoveryEscrow/current`). O painel da MESMA TV pode revelá-la por ação explícita; cópia cujo HMAC não é
o corrente (rotação, recuperação) nunca é revelada. O código nunca vai para log, erro, journal ou `repr`.
"""
import hmac
from datetime import datetime

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.crypto import CipherContext, PortalCrypto
from app.portal.models import RecoveryEscrowDocument
from app.portal.rate_limit import RateConstraint
from app.portal.recovery_codes import RecoveryCodeError, RecoveryCodes
from app.portal.repositories.control import TransactionPlan, document_path


class RecoveryEscrowService:
    def __init__(self, auth: AuthService, crypto: PortalCrypto, codes: RecoveryCodes):
        self.auth = auth
        self.repository = auth.repository
        self.crypto = crypto
        self.codes = codes

    @staticmethod
    def _path(device_id: str) -> str:
        return document_path("recoveryEscrow", "current", device_id=device_id)

    @staticmethod
    def _context(device_id: str, version: int) -> CipherContext:
        return CipherContext(device_id, "recovery-code", str(version))

    async def _limit(self, scope: str, limit: int, window: int, now: datetime):
        key = self.auth.tokens.digest("rate_limit", scope)
        decision = await self.auth.limits.evaluate((RateConstraint(key, limit, window, window),), now, consume=True)
        if not decision.allowed:
            raise AuthError("rate_limited", 429, decision.retry_after)

    async def put(self, principal: Principal, code: str, version: int, now: datetime) -> None:
        """TV → serviço. Divergência (código antigo, versão errada) = 409 sem gravar nada."""
        await self._limit("escrow/" + principal.device_id, 10, 3600, now)
        try:
            candidates = dict(self.codes.candidates(code))
        except RecoveryCodeError:
            raise AuthError("invalid_input", 422) from None
        device_path = document_path("devices", principal.device_id)
        path = self._path(principal.device_id)

        def write(rows):
            device = self.auth._same_principal(rows[device_path], principal)
            expected = device.recovery_code_hmac
            digest = candidates.get(device.recovery_hash_key_version or "")
            if (expected is None or digest is None or not hmac.compare_digest(digest, expected)
                    or version != device.recovery_code_version):
                raise AuthError("try_again", 409)
            if rows[path] is not None:
                saved = RecoveryEscrowDocument.model_validate(rows[path])
                if saved.code_hmac == expected and saved.code_version == version:
                    return TransactionPlan(None)  # já guardada: reenvio idempotente
            document = RecoveryEscrowDocument(code_version=version, code_hmac=expected,
                hash_key_version=device.recovery_hash_key_version,
                envelope=self.crypto.encrypt(code.encode(), self._context(principal.device_id, version)), updated_at=now)
            return TransactionPlan(None, {path: document})
        await self.repository.transact((device_path, path), write)

    async def reveal(self, principal: Principal, now: datetime) -> dict:
        """Painel da mesma TV, por ação explícita. Sem cópia ou cópia de um código que não vale mais → `not_escrowed`."""
        await self._limit("reveal/" + principal.device_id, 5, 600, now)
        device_path = document_path("devices", principal.device_id)
        path = self._path(principal.device_id)

        def read(rows):
            device = self.auth._same_principal(rows[device_path], principal)
            if rows[path] is None:
                raise AuthError("not_escrowed", 409)
            saved = RecoveryEscrowDocument.model_validate(rows[path])
            if (device.recovery_code_hmac is None or not hmac.compare_digest(saved.code_hmac, device.recovery_code_hmac)
                    or saved.code_version != device.recovery_code_version):
                raise AuthError("not_escrowed", 409)
            return TransactionPlan(saved)
        saved = await self.repository.transact((device_path, path), read)
        code = self.crypto.decrypt(saved.envelope, self._context(principal.device_id, saved.code_version)).decode()
        return {"recoveryCode": code, "recoveryCodeVersion": saved.code_version}
