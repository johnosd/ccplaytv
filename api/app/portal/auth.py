"""Sessões/convites com consumo CAS e revalidação de epoch em cada acesso."""

import asyncio
import re
import weakref
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from google.api_core.exceptions import Aborted, Conflict, FailedPrecondition, NotFound

from app.portal.auth_tokens import AuthTokens, new_token, valid_token
from app.portal.display_id import display_claim_path, normalize_display_id, valid_device_key
from app.portal.models import DeviceDocument, InviteDocument, SessionDocument
from app.portal.rate_limit import RateConstraint, SharedRateLimiter
from app.portal.repositories.control import ControlRepository, TransactionPlan, document_path

AUTH_CODES = {"unauthorized", "invalid_origin", "try_again", "invalid_input",
              "invalid_credentials", "rate_limited", "invalid_csrf", "payload_too_large",
              "service_unavailable", "recovery_required", "not_escrowed", "pix_disabled", "pix_failed"}
# Requisições concorrentes da mesma sessão capturam `now` antes da transação e podem terminar fora de
# ordem (retries transacionais com jitter); relógio mais atrás que isso continua sendo recusado.
SESSION_CONCURRENCY_SKEW = timedelta(seconds=30)
# 081/T045: falhas por par ID+IP na entrada manual em 15 min (era 5; um celular com a chave antiga bloqueava rápido).
MANUAL_PAIR_ATTEMPTS = 10
# 073/R-014: fila de toques em `lastSeenAt` por sessão; some sozinha quando nenhuma requisição a usa.
_SESSION_TOUCH_LOCKS: "weakref.WeakValueDictionary[str, asyncio.Lock]" = weakref.WeakValueDictionary()


class AuthError(ValueError):
    def __init__(self, code="unauthorized", status=401, retry_after=0):
        if code not in AUTH_CODES:
            code, status, retry_after = "unauthorized", 401, 0
        super().__init__(code)
        self.code = code
        self.status = status
        self.retry_after = retry_after


@dataclass(frozen=True)
class Principal:
    device_id: str
    auth_epoch: int
    recovery_epoch: str


@dataclass(frozen=True, repr=False)
class SessionIssuance:
    token: str
    csrf: str
    principal: Principal
    expires_at: datetime


@dataclass(frozen=True, repr=False)
class InviteIssuance:
    token: str
    expires_at: datetime


class AuthService:
    def __init__(self, repository: ControlRepository, tokens: AuthTokens, *,
                 public_origin: str, recovery_epoch: str):
        if not valid_token(recovery_epoch):
            raise ValueError("recovery_epoch_required")
        self.repository = repository
        self.tokens = tokens
        self.public_origin = public_origin.rstrip("/")
        self.recovery_epoch = recovery_epoch
        self.limits = SharedRateLimiter(repository)

    def browser_origin(self, origin: str | None, *, mutation: bool):
        if origin != self.public_origin and (mutation or origin is not None):
            raise AuthError("invalid_origin", 403)

    def _device(self, row: dict | None) -> DeviceDocument:
        if row is None:
            raise AuthError()
        device = DeviceDocument.model_validate(row)
        if device.recovery_epoch != self.recovery_epoch or device.access_fence is not None:
            raise AuthError()
        return device

    def _device_for_fence(self, row: dict | None, fence: str) -> DeviceDocument:
        if row is None:
            raise AuthError()
        device = DeviceDocument.model_validate(row)
        if device.recovery_epoch != self.recovery_epoch or device.access_fence != fence:
            raise AuthError()
        return device

    @staticmethod
    def _principal(device: DeviceDocument) -> Principal:
        return Principal(device.device_id, device.auth_epoch, device.recovery_epoch)

    def _same_principal(self, row: dict | None, principal: Principal) -> DeviceDocument:
        device = self._device(row)
        if self._principal(device) != principal:
            raise AuthError()
        return device

    async def authenticate_tv(self, bearer: str) -> Principal:
        parts = bearer.split(".") if isinstance(bearer, str) else []
        if (len(parts) != 2 or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", parts[0])
                or not valid_token(parts[1])):
            raise AuthError()
        path = document_path("devices", parts[0])

        def decide(rows):
            device = self._device(rows[path])
            if not self.tokens.matches("tv_bearer", bearer, device.tv_bearer_hash):
                raise AuthError()
            return TransactionPlan(self._principal(device))

        return await self.repository.transact((path,), decide)

    async def create_invite(self, principal: Principal, purpose: Literal["manage", "buy"],
                            now: datetime) -> InviteIssuance:
        if purpose not in {"manage", "buy"}:
            raise AuthError("invalid_input", 422)
        token = new_token()
        path = document_path("invites", self.tokens.digest("invite", token))
        device_path = document_path("devices", principal.device_id)
        invite = InviteDocument(device_id=principal.device_id, purpose=purpose,
                                auth_epoch=principal.auth_epoch,
                                recovery_epoch=principal.recovery_epoch,
                                created_at=now, expires_at=now + timedelta(minutes=5))

        def decide(rows):
            self._same_principal(rows[device_path], principal)
            if rows[path] is not None:
                raise AuthError("try_again", 409)
            return TransactionPlan(InviteIssuance(token, invite.expires_at), {path: invite})

        return await self.repository.transact((path, device_path), decide)

    def _session(self, device: DeviceDocument, now: datetime):
        token, csrf = new_token(), new_token()
        path = document_path("sessions", self.tokens.digest("session", token))
        session = SessionDocument(device_id=device.device_id, auth_epoch=device.auth_epoch,
                                  recovery_epoch=device.recovery_epoch,
                                  csrf_hash=self.tokens.digest("csrf", csrf),
                                  created_at=now, last_seen_at=now)
        return path, session, SessionIssuance(token, csrf, self._principal(device),
                                            now + timedelta(hours=8))

    def _paths(self, collection: str, purpose, token: str) -> tuple[str, ...]:
        if not valid_token(token):
            raise AuthError()
        return tuple(document_path(collection, digest)
                     for digest in self.tokens.candidates(purpose, token))

    @staticmethod
    def _found(rows, paths):
        found = [(path, rows[path]) for path in paths if rows[path] is not None]
        if len(found) != 1:
            raise AuthError()
        return found[0]

    async def _lookup(self, paths):
        # Leitura preliminar só localiza o destino; CAS revalida todas as linhas.
        rows = {}
        async for snapshot in self.repository.client.get_all(
            [self.repository.client.document(path) for path in paths]
        ):
            rows[snapshot.reference.path] = snapshot.to_dict() if snapshot.exists else None
        return self._found(rows, paths)

    async def exchange_invite(self, token: str, origin: str | None,
                              now: datetime) -> SessionIssuance:
        self.browser_origin(origin, mutation=True)
        paths = self._paths("invites", "invite", token)
        _, row = await self._lookup(paths)
        invite = InviteDocument.model_validate(row)
        device_path = document_path("devices", invite.device_id)
        # Preparar random fora do callback; nada é emitido antes de consumo CAS.
        device = self._device((await self.repository.client.document(device_path).get()).to_dict())
        session_path, session, issuance = self._session(device, now)

        def decide(rows):
            invite_path, row = self._found(rows, paths)
            saved = InviteDocument.model_validate(row)
            current = self._same_principal(rows[device_path], issuance.principal)
            if (saved.purpose not in {"manage", "buy"} or saved.device_id != current.device_id
                    or saved.auth_epoch != current.auth_epoch
                    or saved.recovery_epoch != self.recovery_epoch or saved.consumed_at is not None
                    or saved.expires_at <= now or saved.created_at > now):
                raise AuthError()
            if rows[session_path] is not None:
                raise AuthError("try_again", 409)
            return TransactionPlan(issuance, {
                invite_path: saved.model_copy(update={"consumed_at": now}), session_path: session,
            })

        return await self.repository.transact((*paths, device_path, session_path), decide)

    def _manual_limits(self, display_scope: str, ip: str):
        # IP e ID só participam de HMAC; nunca persistir endereço, ID ou device key nos contadores.
        return tuple(RateConstraint(self.tokens.digest("rate_limit", scope), limit, 900, 900)
                     for scope, limit in (
                         ("manual-pair/" + display_scope + "/" + ip, MANUAL_PAIR_ATTEMPTS),
                         ("manual-device/" + display_scope, 25),
                         ("manual-ip/" + ip, 25), ("manual-global", 100),
                     ))

    async def manual_session(self, display_id: str, device_key: str, ip: str,
                             origin: str | None, now: datetime) -> SessionIssuance:
        """070/D-005: ID exibido (formato MAC) + chave de 10 dígitos; toda recusa é a mesma 401."""
        self.browser_origin(origin, mutation=True)
        if not isinstance(ip, str) or not 1 <= len(ip) <= 128:
            raise AuthError("invalid_credentials")
        normalized = normalize_display_id(display_id)
        rules = self._manual_limits(self.tokens.digest("display_id", normalized) if normalized else "invalid", ip)
        decision = await self.limits.evaluate(rules, now, consume=False)
        if not decision.allowed:
            raise AuthError("rate_limited", 429, decision.retry_after)
        device, claim_path = None, None
        if normalized and valid_device_key(device_key):
            claim_path = display_claim_path(self.tokens, normalized)
            claim = (await self.repository.client.document(claim_path).get()).to_dict()
            if claim is not None:
                row = (await self.repository.client.document(
                    document_path("devices", claim["deviceId"])).get()).to_dict()
                if row is not None:
                    candidate = DeviceDocument.model_validate(row)
                    if (candidate.display_id == normalized and candidate.recovery_epoch == self.recovery_epoch
                            and candidate.access_fence is None
                            and self.tokens.matches("device_key", device_key, candidate.device_key_hash)):
                        device = candidate
        if device is None:
            decision = await self.limits.evaluate(rules, now, consume=True)
            if not decision.allowed:
                raise AuthError("rate_limited", 429, decision.retry_after)
            raise AuthError("invalid_credentials")
        path = document_path("devices", device.device_id)
        session_path, session, issuance = self._session(device, now)

        def decide(rows):
            current = self._same_principal(rows[path], issuance.principal)
            owner = rows[claim_path]
            if (owner is None or owner.get("deviceId") != current.device_id or current.display_id != normalized
                    or not self.tokens.matches("device_key", device_key, current.device_key_hash)):
                raise AuthError("invalid_credentials")
            if rows[session_path] is not None:
                raise AuthError("try_again", 409)
            return TransactionPlan(issuance, {session_path: session})

        return await self.repository.transact((path, claim_path, session_path), decide)

    async def authenticate_session(self, token: str, origin: str | None, now: datetime,
                                   *, csrf: str | None = None, mutation=False) -> Principal:
        self.browser_origin(origin, mutation=mutation)
        paths = self._paths("sessions", "session", token)
        client = self.repository.client
        # 073/R-014: sem transação de leitura+escrita. O portal dispara vários GETs juntos; com cada um lendo e depois
        # gravando a mesma sessão numa transação, o Firestore (emulador e produção) segura travas cruzadas até
        # "Transaction lock timeout". A validação lê sessão e dispositivo como antes (a requisição segue depois da
        # leitura de qualquer forma); o toque em `lastSeenAt` é uma escrita otimista que desiste se outra já tocou.
        snapshots = {}
        async for snapshot in client.get_all([client.document(path) for path in paths]):
            snapshots[snapshot.reference.path] = snapshot
        path, row = self._found({key: value.to_dict() if value.exists else None for key, value in snapshots.items()}, paths)
        saved = SessionDocument.model_validate(row)
        device_snapshot = await client.document(document_path("devices", saved.device_id)).get(timeout=5, retry=None)
        device = self._device(device_snapshot.to_dict() if device_snapshot.exists else None)
        if (saved.purpose != "manage" or saved.device_id != device.device_id
                or saved.auth_epoch != device.auth_epoch
                or saved.recovery_epoch != self.recovery_epoch
                or now + SESSION_CONCURRENCY_SKEW < saved.last_seen_at or now < saved.created_at
                or now - saved.last_seen_at >= timedelta(minutes=30)
                or now - saved.created_at >= timedelta(hours=8)):
            raise AuthError()
        if mutation and (not valid_token(csrf)
                         or not self.tokens.matches("csrf", csrf, saved.csrf_hash)):
            raise AuthError("invalid_csrf", 403)
        # Requisições concorrentes capturam `now` antes e podem chegar fora de ordem: last_seen_at nunca retrocede
        # (o prazo ocioso é contado do uso mais recente). Se outra requisição gravou primeiro, a pré-condição falha
        # e este toque é dispensado — a diferença é de milissegundos.
        if now > saved.last_seen_at:
            # Um toque por sessão de cada vez neste processo: commits simultâneos no mesmo documento esperam a trava
            # e abortam (~2 s no emulador com 8 de uma vez); em fila, os seguintes falham a pré-condição na hora.
            lock = _SESSION_TOUCH_LOCKS.get(path)
            if lock is None:
                lock = _SESSION_TOUCH_LOCKS[path] = asyncio.Lock()
            async with lock:
                try:
                    await client.document(path).update(
                        {"lastSeenAt": now}, option=client.write_option(last_update_time=snapshots[path].update_time),
                        timeout=5, retry=None)
                except (FailedPrecondition, NotFound, Aborted, Conflict):
                    pass
        principal = self._principal(device)
        if mutation:
            rule = RateConstraint(self.tokens.digest("rate_limit", "forms/" + token), 30, 60)
            decision = await self.limits.evaluate((rule,), now, consume=True)
            if not decision.allowed:
                raise AuthError("rate_limited", 429, decision.retry_after)
        return principal

    async def logout(self, token: str, origin: str | None, csrf: str, now: datetime):
        await self.authenticate_session(token, origin, now, csrf=csrf, mutation=True)
        paths = self._paths("sessions", "session", token)
        return await self.repository.transact(paths, lambda _: TransactionPlan(None, deletes=paths))
