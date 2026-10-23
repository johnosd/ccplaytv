"""Chave BYOK digitada no portal e entregue à TV (feature 077, ADR-020, constitution 1.15.0 (j); estendida à chave de
legenda na feature 091, ADR-022, constitution 1.17.0 (m)).

Um documento por TV **e por tipo de chave** (`devices/{id}/integrations/{kind}`) com **uma** operação pendente. A chave só
existe em claro na requisição do navegador e na resposta à TV; no repouso fica cifrada com a mesma `PortalCrypto` das
configurações, com contexto `(device_id, "<rótulo da chave>", operation_id)`, e o envelope é apagado ao aplicar, recusar,
cancelar, substituir, expirar ou trocar a chave de acesso. Nada daqui entra em log, erro, resposta ao navegador ou índice.

`KeyIntegrationService` é a classe-base; `TmdbIntegrationService` (tmdb_integration.py) e `SubtitleKeyService`
(subtitle_keys.py) só dizem o que muda: o tipo de documento, o rótulo da cifra, o formato aceito e de onde sai o que a TV
informou no snapshot.
"""

import re
from collections.abc import Callable
from datetime import datetime, timedelta

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.crypto import CipherContext, CryptoError, PortalCrypto
from app.portal.models import (
    IntegrationsSnapshotDocument,
    SnapshotDocument,
    TmdbIntegrationDocument,
)
from app.portal.repositories.control import TransactionPlan, document_path

RETENTION = timedelta(days=7)
RETRY_REASONS = ("offline", "rate_limited")
REJECT_REASONS = ("refused", "invalid_format")


class KeyIntegrationService:
    """`kind` = id do documento (`tmdb`, `subtitles-subdl`…); `cipher_label` entra no contexto da cifra; `reported`
    extrai do bloco `integrations` do snapshot o que a TV informou sobre esta chave (ou `None`)."""

    def __init__(self, auth: AuthService, crypto: PortalCrypto, *, kind: str, cipher_label: str, key_pattern: re.Pattern[str],
                 reported: Callable[[IntegrationsSnapshotDocument], str | None]):
        self.auth = auth
        self.repository = auth.repository
        self.crypto = crypto
        self.kind = kind
        self.cipher_label = cipher_label
        self.key_pattern = key_pattern
        self._reported = reported

    def _context(self, device_id: str, operation_id: str) -> CipherContext:
        return CipherContext(device_id, self.cipher_label, operation_id)

    def _paths(self, device_id: str) -> tuple[str, str, str]:
        return (document_path("devices", device_id), document_path("integrations", self.kind, device_id=device_id),
                document_path("snapshot", "current", device_id=device_id))

    @staticmethod
    def _live(item: TmdbIntegrationDocument | None, principal: Principal, now: datetime) -> bool:
        """Pendente, dentro dos 7 dias e criada na época de autenticação corrente."""
        return (item is not None and item.state == "pending" and now < item.expires_at
                and item.auth_epoch == principal.auth_epoch)

    @staticmethod
    def _closed(item: TmdbIntegrationDocument, state: str, now: datetime, **changes) -> TmdbIntegrationDocument:
        """Mesma operação sem envelope: encerra (cancelada/expirada/aplicada/recusada) preservando `last_*`."""
        return item.model_copy(update={"state": state, "envelope": None, "retry_reason": None,
                                       "updated_at": now, **changes})

    def _read(self, rows, principal: Principal, device_path: str, path: str) -> TmdbIntegrationDocument | None:
        self.auth._same_principal(rows[device_path], principal)
        return TmdbIntegrationDocument.model_validate(rows[path]) if rows[path] else None

    def _replace(self, previous: TmdbIntegrationDocument | None, principal: Principal, operation_id: str,
                 action: str, now: datetime, envelope) -> TmdbIntegrationDocument:
        carried = {}
        if previous is not None:
            carried = {key: getattr(previous, key) for key in ("last_action", "last_result", "last_reason", "last_at")}
        return TmdbIntegrationDocument(operation_id=operation_id, action=action, state="pending", envelope=envelope,
                                       auth_epoch=principal.auth_epoch, created_at=now, updated_at=now,
                                       expires_at=now + RETENTION, **carried)

    async def request(self, principal: Principal, operation_id: str, action: str, key: str | None,
                      now: datetime) -> dict:
        """`set` (com chave) ou `remove`. Uma nova operação substitui a pendente e apaga o envelope antigo."""
        if action == "set" and (key is None or not self.key_pattern.fullmatch(key)):
            raise AuthError("invalid_input", 422)
        if action == "remove" and key is not None:
            raise AuthError("invalid_input", 422)
        envelope = None
        if action == "set":
            envelope = self.crypto.encrypt(key.encode(), self._context(principal.device_id, operation_id))
        device_path, path, _ = self._paths(principal.device_id)

        def write(rows):
            previous = self._read(rows, principal, device_path, path)
            # Mesmo Idempotency-Key repetido (resposta perdida): não duplica nem troca o envelope.
            if previous is not None and previous.operation_id == operation_id:
                if previous.action != action:
                    raise AuthError("invalid_input", 422)
                return TransactionPlan(previous)
            document = self._replace(previous, principal, operation_id, action, now, envelope)
            return TransactionPlan(document, {path: document})

        saved = await self.repository.transact((device_path, path), write)
        return {"operationId": saved.operation_id, "action": saved.action, "state": "pending"}

    async def cancel(self, principal: Principal, now: datetime) -> None:
        device_path, path, _ = self._paths(principal.device_id)

        def write(rows):
            item = self._read(rows, principal, device_path, path)
            if item is None or item.state != "pending":
                return TransactionPlan(None)
            closed = self._closed(item, "cancelled", now)
            return TransactionPlan(None, {path: closed})

        await self.repository.transact((device_path, path), write)

    async def view(self, principal: Principal, now: datetime) -> dict:
        """Estado para o navegador: pendência, último resultado e o que a TV informou. Nunca a chave."""
        device_path, path, snapshot_path = self._paths(principal.device_id)

        def read(rows):
            item = self._read(rows, principal, device_path, path)
            snapshot = SnapshotDocument.model_validate(rows[snapshot_path]) if rows[snapshot_path] else None
            if snapshot is not None and (snapshot.auth_epoch != principal.auth_epoch
                                         or snapshot.recovery_epoch != principal.recovery_epoch):
                snapshot = None
            reported = self._reported(snapshot.integrations) if snapshot and snapshot.integrations else None
            puts = {}
            # Pendência vencida ou de outra época: some da vista e o envelope é apagado.
            if item is not None and item.state == "pending" and not self._live(item, principal, now):
                item = self._closed(item, "expired", now)
                puts[path] = item
            return TransactionPlan((item, reported), puts)

        item, reported = await self.repository.transact((device_path, path, snapshot_path), read)
        pending = None
        if item is not None and item.state == "pending":
            pending = {"action": item.action, "createdAt": item.created_at.isoformat()}
            if item.retry_reason:
                pending["retryReason"] = item.retry_reason
        last = None
        if item is not None and item.last_result is not None:
            last = {"action": item.last_action, "result": item.last_result, "at": item.last_at.isoformat()}
            if item.last_reason:
                last["reason"] = item.last_reason
        return {"pending": pending, "last": last, "tvReported": reported}

    async def pull(self, principal: Principal, now: datetime) -> dict:
        """Entrega a operação corrente só à própria TV. Reentrega até o ack terminal; stale vira inexistente."""
        device_path, path, _ = self._paths(principal.device_id)

        def read(rows):
            item = self._read(rows, principal, device_path, path)
            if item is None or item.state != "pending":
                return TransactionPlan(None)
            if not self._live(item, principal, now):
                return TransactionPlan(None, {path: self._closed(item, "expired", now)})
            return TransactionPlan(item)

        item = await self.repository.transact((device_path, path), read)
        if item is None:
            return {"operation": None}
        operation = {"operationId": item.operation_id, "action": item.action}
        if item.action == "set":
            try:
                operation["key"] = self.crypto.decrypt(item.envelope, self._context(principal.device_id,
                                                                                      item.operation_id)).decode()
            except CryptoError:
                # Envelope ilegível nunca é entregue; encerra a operação em vez de repeti-la para sempre.
                await self._expire_unreadable(principal, item.operation_id, now)
                return {"operation": None}
        return {"operation": operation}

    async def _expire_unreadable(self, principal: Principal, operation_id: str, now: datetime) -> None:
        device_path, path, _ = self._paths(principal.device_id)

        def write(rows):
            item = self._read(rows, principal, device_path, path)
            if item is None or item.operation_id != operation_id or item.state != "pending":
                return TransactionPlan(None)
            return TransactionPlan(None, {path: self._closed(item, "expired", now)})

        await self.repository.transact((device_path, path), write)

    async def ack(self, principal: Principal, operation_id: str, state: str, reason: str | None,
                  now: datetime) -> dict:
        """Resultado da TV. Ack de operação que não é a corrente é idempotente e não revela estado."""
        if state == "retry":
            if reason is None:
                reason = "offline"
            if reason not in RETRY_REASONS:
                raise AuthError("invalid_input", 422)
        elif state == "rejected":
            if reason is None:
                reason = "refused"
            if reason not in REJECT_REASONS:
                raise AuthError("invalid_input", 422)
        elif state == "applied":
            if reason is not None:
                raise AuthError("invalid_input", 422)
        else:
            raise AuthError("invalid_input", 422)
        device_path, path, _ = self._paths(principal.device_id)

        def write(rows):
            item = self._read(rows, principal, device_path, path)
            if item is None or item.operation_id != operation_id or not self._live(item, principal, now):
                return TransactionPlan(None)
            if state == "retry":
                return TransactionPlan(None, {path: item.model_copy(update={"retry_reason": reason, "updated_at": now})})
            closed = self._closed(item, state, now, last_action=item.action, last_result=state, last_at=now,
                                  last_reason=reason if state == "rejected" else None)
            return TransactionPlan(None, {path: closed})

        await self.repository.transact((device_path, path), write)
        return {"operationId": operation_id, "state": state}
