"""Feature 091 (ADR-022): chave de legenda BYOK pedida pelo portal e aplicada pela TV. Nunca loga nem ecoa a chave."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import Field, SecretStr

from app.portal.auth import AuthError
from app.portal.configurations import request_time
from app.portal.routes.auth import Input, enrollment_service, payload
from app.portal.routes.integrations import EmptyInput, limit
from app.portal.routes.operations import browser_principal, tv_principal
from app.portal.subtitle_keys import PROVIDERS, SubtitleKeyService

router = APIRouter(prefix="/portal/v1")
NO_STORE = {"Cache-Control": "no-store"}


class SubtitleKeyInput(Input):
    # Só o formato amplo (8–200 de [A-Za-z0-9._-]); o teste no fornecedor é da TV antes de gravar.
    key: SecretStr = Field(min_length=8, max_length=200, repr=False)


class SubtitleKeyAckInput(Input):
    provider: Literal["opensubtitles", "subdl"]
    operationId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    state: Literal["applied", "rejected", "retry"]
    reason: Literal["refused", "invalid_format", "offline", "rate_limited"] | None = None


async def subtitle_keys(request: Request) -> SubtitleKeyService:
    if not hasattr(request.app.state, "portal_subtitle_keys"):
        enrollment = await enrollment_service(request)
        request.app.state.portal_subtitle_keys = SubtitleKeyService(enrollment.auth, enrollment.crypto)
    return request.app.state.portal_subtitle_keys


def known(provider: str) -> str:
    if provider not in PROVIDERS:
        raise AuthError("invalid_input", 422)
    return provider


@router.get("/integrations/subtitles")
async def subtitle_keys_status(request: Request):
    principal = await browser_principal(request)
    view = await (await subtitle_keys(request)).view(principal, datetime.now(UTC))
    return JSONResponse(view, headers=NO_STORE)


@router.put("/integrations/subtitles/{provider}")
async def subtitle_key_set(provider: str, request: Request):
    principal = await browser_principal(request, mutation=True)
    known(provider)
    body = await payload(request, SubtitleKeyInput)
    now = datetime.now(UTC)
    operation_id = request.headers.get("idempotency-key", "")
    request_time(operation_id, now)
    await limit(request, "subtitle-key", principal.device_id, 10, 3600, now)
    result = await (await subtitle_keys(request)).request(principal, provider, operation_id, "set",
                                                          body.key.get_secret_value(), now)
    return JSONResponse(result, status_code=202, headers=NO_STORE)


@router.post("/integrations/subtitles/{provider}/remove")
async def subtitle_key_remove(provider: str, request: Request):
    principal = await browser_principal(request, mutation=True)
    known(provider)
    await payload(request, EmptyInput)
    now = datetime.now(UTC)
    operation_id = request.headers.get("idempotency-key", "")
    request_time(operation_id, now)
    await limit(request, "subtitle-key", principal.device_id, 10, 3600, now)
    result = await (await subtitle_keys(request)).request(principal, provider, operation_id, "remove", None, now)
    return JSONResponse(result, status_code=202, headers=NO_STORE)


@router.get("/device/integrations/subtitles")
async def subtitle_keys_pull(request: Request):
    principal = await tv_principal(request)
    now = datetime.now(UTC)
    # Limite próprio (não o do TMDB nem o de `pull` das listas): o Atualizar faz os pedidos em sequência.
    await limit(request, "subtitle-pull", principal.device_id, 3, 10, now)
    return JSONResponse(await (await subtitle_keys(request)).pull(principal, now), headers=NO_STORE)


@router.post("/device/integrations/subtitles/ack")
async def subtitle_keys_ack(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, SubtitleKeyAckInput)
    now = datetime.now(UTC)
    await limit(request, "subtitle-ack", principal.device_id, 20, 60, now)
    result = await (await subtitle_keys(request)).ack(principal, body.provider, body.operationId, body.state,
                                                      body.reason, now)
    return JSONResponse(result, headers=NO_STORE)
