"""Feature 077 (ADR-020): chave TMDB BYOK pedida pelo portal e aplicada pela TV. Nunca loga nem ecoa a chave."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import Field, SecretStr

from app.portal.auth import AuthError
from app.portal.configurations import request_time
from app.portal.rate_limit import RateConstraint
from app.portal.routes.auth import Input, auth_service, enrollment_service, payload
from app.portal.routes.operations import browser_principal, tv_principal
from app.portal.tmdb_integration import TmdbIntegrationService

router = APIRouter(prefix="/portal/v1")
NO_STORE = {"Cache-Control": "no-store"}


class TmdbKeyInput(Input):
    # Só o formato amplo (16–600 de [A-Za-z0-9._-]); v3/v4 é validado pela TV antes de gravar.
    key: SecretStr = Field(min_length=16, max_length=600, repr=False)


class EmptyInput(Input):
    pass


class TmdbAckInput(Input):
    operationId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    state: Literal["applied", "rejected", "retry"]
    reason: Literal["refused", "invalid_format", "offline", "rate_limited"] | None = None


async def tmdb(request: Request) -> TmdbIntegrationService:
    if not hasattr(request.app.state, "portal_tmdb"):
        enrollment = await enrollment_service(request)
        request.app.state.portal_tmdb = TmdbIntegrationService(enrollment.auth, enrollment.crypto)
    return request.app.state.portal_tmdb


async def limit(request: Request, scope: str, device_id: str, count: int, seconds: int, now: datetime):
    auth = await auth_service(request)
    decision = await auth.limits.evaluate((RateConstraint(
        auth.tokens.digest("rate_limit", scope + "/" + device_id), count, seconds,
    ),), now, consume=True)
    if not decision.allowed:
        raise AuthError("rate_limited", 429, decision.retry_after)


@router.get("/integrations/tmdb")
async def tmdb_status(request: Request):
    principal = await browser_principal(request)
    view = await (await tmdb(request)).view(principal, datetime.now(UTC))
    return JSONResponse(view, headers=NO_STORE)


@router.put("/integrations/tmdb")
async def tmdb_set(request: Request):
    principal = await browser_principal(request, mutation=True)
    body = await payload(request, TmdbKeyInput)
    now = datetime.now(UTC)
    operation_id = request.headers.get("idempotency-key", "")
    request_time(operation_id, now)
    await limit(request, "tmdb", principal.device_id, 10, 3600, now)
    result = await (await tmdb(request)).request(principal, operation_id, "set", body.key.get_secret_value(), now)
    return JSONResponse(result, status_code=202, headers=NO_STORE)


@router.post("/integrations/tmdb/remove")
async def tmdb_remove(request: Request):
    principal = await browser_principal(request, mutation=True)
    await payload(request, EmptyInput)
    now = datetime.now(UTC)
    operation_id = request.headers.get("idempotency-key", "")
    request_time(operation_id, now)
    await limit(request, "tmdb", principal.device_id, 10, 3600, now)
    result = await (await tmdb(request)).request(principal, operation_id, "remove", None, now)
    return JSONResponse(result, status_code=202, headers=NO_STORE)


@router.delete("/integrations/tmdb/pending", status_code=204)
async def tmdb_cancel(request: Request):
    principal = await browser_principal(request, mutation=True)
    await limit(request, "tmdb", principal.device_id, 10, 3600, datetime.now(UTC))
    await (await tmdb(request)).cancel(principal, datetime.now(UTC))
    return Response(status_code=204, headers=NO_STORE)


@router.get("/device/integrations/tmdb")
async def tmdb_pull(request: Request):
    principal = await tv_principal(request)
    now = datetime.now(UTC)
    # Limite próprio (não o de `pull` das listas): o Atualizar faz os dois pedidos em sequência.
    await limit(request, "tmdb-pull", principal.device_id, 3, 10, now)
    return JSONResponse(await (await tmdb(request)).pull(principal, now), headers=NO_STORE)


@router.post("/device/integrations/tmdb/ack")
async def tmdb_ack(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, TmdbAckInput)
    now = datetime.now(UTC)
    await limit(request, "tmdb-ack", principal.device_id, 20, 60, now)
    result = await (await tmdb(request)).ack(principal, body.operationId, body.state, body.reason, now)
    return JSONResponse(result, headers=NO_STORE)
