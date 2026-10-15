"""Feature 072: backup de uso (TV e painel) e reassociação pela própria TV. Nunca logam nem ecoam valores."""

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import Field, SecretStr

from app.portal.auth import AuthError
from app.portal.backup import MAX_PAYLOAD_BYTES, UsageBackupService
from app.portal.rate_limit import RateConstraint
from app.portal.routes.auth import Input, access_service, auth_service, enrollment_service, payload
from app.portal.routes.operations import browser_principal, tv_principal
from app.portal.self_relink import SelfRelinkService

router = APIRouter(prefix="/portal/v1")
NO_STORE = {"Cache-Control": "no-store"}


class BackupInput(Input):
    format: Literal[1]
    createdAt: int
    counts: dict[str, int]
    usage: dict[str, Any]
    secrets: dict[str, Any]
    # A TV já tinha backup: se ele foi apagado (TV/site), não recriar sozinho (404).
    expectExisting: bool = False


async def backups(request: Request) -> UsageBackupService:
    if not hasattr(request.app.state, "portal_backups"):
        enrollment = await enrollment_service(request)
        request.app.state.portal_backups = UsageBackupService(enrollment.auth, enrollment.crypto)
    return request.app.state.portal_backups


@router.put("/device/backup")
async def put_backup(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, BackupInput, limit=MAX_PAYLOAD_BYTES + 4096)
    auth = await auth_service(request)
    now = datetime.now(UTC)
    decision = await auth.limits.evaluate((RateConstraint(
        auth.tokens.digest("rate_limit", "backup/" + principal.device_id), 20, 3600,
    ),), now, consume=True)
    if not decision.allowed:
        raise AuthError("rate_limited", 429, decision.retry_after)
    view = await (await backups(request)).put(principal, body.model_dump(exclude={"expectExisting"}), now,
                                              expect_existing=body.expectExisting)
    if view is None:
        raise HTTPException(status_code=404)
    return JSONResponse({"createdAt": view["createdAt"], "counts": view["counts"]}, headers=NO_STORE)


@router.get("/device/backup/summary")
async def backup_summary(request: Request):
    principal = await tv_principal(request)
    return JSONResponse(await (await backups(request)).summary(principal), headers=NO_STORE)


@router.get("/device/backup")
async def get_backup(request: Request):
    principal = await tv_principal(request)
    content = await (await backups(request)).get(principal)
    if content is None:
        raise HTTPException(status_code=404)
    return JSONResponse(content, headers=NO_STORE)


@router.delete("/device/backup", status_code=204)
async def delete_backup(request: Request):
    principal = await tv_principal(request)
    await (await backups(request)).delete(principal)
    return Response(status_code=204, headers=NO_STORE)


@router.get("/backup")
async def site_backup(request: Request):
    """Painel: só data e contagens (constitution 1.12.0 (g)); nunca o conteúdo."""
    principal = await browser_principal(request)
    return JSONResponse(await (await backups(request)).summary(principal), headers=NO_STORE)


@router.delete("/backup", status_code=204)
async def site_delete_backup(request: Request):
    principal = await browser_principal(request, mutation=True)
    await (await backups(request)).delete(principal)
    return Response(status_code=204, headers=NO_STORE)


class SelfRelinkInput(Input):
    platformIdentity: SecretStr = Field(min_length=1, max_length=512, repr=False)
    nonce: SecretStr = Field(min_length=43, max_length=43, repr=False)
    recoveryCode: SecretStr = Field(min_length=1, max_length=128, repr=False)
    mac: str | None = Field(default=None, max_length=64)


@router.post("/devices/recovery/self")
async def self_relink(request: Request):
    """072/ADR-017: a TV desvinculada volta ao mesmo registro provando a posse com o código que ela guardava."""
    if request.headers.get("origin") not in {None, "null"}:
        raise AuthError("invalid_origin", 403)
    body = await payload(request, SelfRelinkInput)
    if not hasattr(request.app.state, "portal_self_relink"):
        request.app.state.portal_self_relink = SelfRelinkService(await access_service(request))
    issued = await request.app.state.portal_self_relink.relink(
        body.platformIdentity.get_secret_value(), body.nonce.get_secret_value(),
        body.recoveryCode.get_secret_value(), request.client.host if request.client else "unknown",
        datetime.now(UTC), body.mac)
    return JSONResponse(issued, headers=NO_STORE)