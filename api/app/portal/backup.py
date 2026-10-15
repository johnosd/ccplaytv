"""Backup dos dados de uso de uma TV (feature 072, ADR-017, constitution 1.12.0 (g)).

Um documento por TV (`devices/{id}/backups/current`), só a última versão. O payload inteiro — inclusive `secrets`
(chave TMDB) — vai cifrado com a mesma `PortalCrypto` das configurações; só as contagens e as datas ficam em claro
para o painel. Nada daqui entra em log, erro ou cache; só a mesma TV (bearer) lê o conteúdo.
"""

import json
from datetime import UTC, datetime

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.crypto import CipherContext, PortalCrypto, canonical_json
from app.portal.models import UsageBackupDocument
from app.portal.repositories.control import TransactionPlan, document_path

MAX_PAYLOAD_BYTES = 512 * 1024
COUNT_KEYS = ("favorites", "history", "progress", "categoryPreferences", "listPins")


class UsageBackupService:
    def __init__(self, auth: AuthService, crypto: PortalCrypto):
        self.auth = auth
        self.repository = auth.repository
        self.crypto = crypto

    @staticmethod
    def _context(device_id: str) -> CipherContext:
        return CipherContext(device_id, "usage-backup", "v1")

    @staticmethod
    def _path(device_id: str) -> str:
        return document_path("backups", "current", device_id=device_id)

    @staticmethod
    def _counts(raw: object) -> dict[str, int]:
        if not isinstance(raw, dict) or set(raw) != set(COUNT_KEYS):
            raise AuthError("invalid_input", 422)
        counts = {}
        for key in COUNT_KEYS:
            value = raw[key]
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 10_000_000:
                raise AuthError("invalid_input", 422)
            counts[key] = value
        return counts

    async def put(self, principal: Principal, body: dict, now: datetime, *,
                  expect_existing: bool = False) -> dict | None:
        """Grava a última versão. `expect_existing`: a TV já tinha backup; se a pessoa o apagou (TV ou site), não
        recria e devolve None — o backup só volta por ação explícita (SC-006)."""
        if not isinstance(body, dict) or body.get("format") != 1 or not isinstance(body.get("usage"), dict) \
                or not isinstance(body.get("secrets"), dict):
            raise AuthError("invalid_input", 422)
        created = body.get("createdAt")
        if isinstance(created, bool) or not isinstance(created, int) or created <= 0:
            raise AuthError("invalid_input", 422)
        try:
            client_created_at = datetime.fromtimestamp(created / 1000, UTC)
        except (OverflowError, OSError, ValueError):
            raise AuthError("invalid_input", 422) from None
        counts = self._counts(body.get("counts"))
        plaintext = canonical_json(body)
        if len(plaintext) > MAX_PAYLOAD_BYTES:
            raise AuthError("payload_too_large", 413)
        envelope = self.crypto.encrypt(plaintext, self._context(principal.device_id))
        document = UsageBackupDocument(format=1, created_at=now, client_created_at=client_created_at,
                                       counts=counts, envelope=envelope)
        device_path = document_path("devices", principal.device_id)
        path = self._path(principal.device_id)

        def write(rows):
            self.auth._same_principal(rows[device_path], principal)
            if expect_existing and rows[path] is None:
                return TransactionPlan(False)
            return TransactionPlan(True, {path: document})

        if not await self.repository.transact((device_path, path), write):
            return None
        return self.view(document)

    @staticmethod
    def view(document: UsageBackupDocument | None) -> dict:
        if document is None:
            return {"exists": False}
        return {"exists": True, "createdAt": int(document.client_created_at.timestamp() * 1000),
                "counts": dict(document.counts)}

    async def _read(self, principal: Principal) -> UsageBackupDocument | None:
        device_path = document_path("devices", principal.device_id)
        path = self._path(principal.device_id)

        def read(rows):
            self.auth._same_principal(rows[device_path], principal)
            return TransactionPlan(UsageBackupDocument.model_validate(rows[path]) if rows[path] else None)

        return await self.repository.transact((device_path, path), read)

    async def summary(self, principal: Principal) -> dict:
        return self.view(await self._read(principal))

    async def get(self, principal: Principal) -> dict | None:
        document = await self._read(principal)
        if document is None:
            return None
        return json.loads(self.crypto.decrypt(document.envelope, self._context(principal.device_id)))

    async def delete(self, principal: Principal) -> None:
        device_path = document_path("devices", principal.device_id)
        path = self._path(principal.device_id)

        def remove(rows):
            self.auth._same_principal(rows[device_path], principal)
            return TransactionPlan(True, {}, (path,) if rows[path] else ())

        await self.repository.transact((device_path, path), remove)
