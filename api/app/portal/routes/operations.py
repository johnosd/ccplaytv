"""Controle same-origin e entrega exclusiva ao bearer da TV de destino."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, Field

from app.portal.auth import AuthError
from app.portal.configuration_delivery import ConfigurationDelivery
from app.portal.configuration_input import ConfigurationPatch
from app.portal.configurations import ConfigurationService, operation_view, request_time
from app.portal.device_uploads import DeviceSourceUploads
from app.portal.models import (
    ImportSnapshotDocument,
    IntegrationsSnapshotDocument,
    OperationDocument,
    SnapshotDocument,
    SourceRevisionDocument,
    SourceSnapshotDocument,
)
from app.portal.operations import DeletionService
from app.portal.rate_limit import RateConstraint
from app.portal.repositories.configuration_repository import ConfigurationRepository
from app.portal.repositories.control import TransactionPlan, document_path
from app.portal.routes.auth import (
    COOKIE,
    Input,
    access_service,
    auth_service,
    enrollment_service,
    payload,
)

router = APIRouter(prefix="/portal/v1")


class OperationInput(Input):
    action: Literal["source.create", "source.update", "source.delete"]
    sourceId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    expectedRevision: int = Field(ge=0)
    input: ConfigurationPatch | None = None


class RemoveInput(Input):
    expectedRevision: int = Field(ge=0)


class AckInput(Input):
    state: Literal["applied", "conflict", "awaiting_confirmation", "error"]
    revision: int = Field(ge=0)
    importState: Literal["queued", "running", "completed", "error"] | None = None


class SnapshotInput(Input):
    capturedAt: AwareDatetime
    # 077: o que a TV informa sobre integrações (opcional: TV antiga não manda).
    integrations: IntegrationsSnapshotDocument | None = None
    sources: list[SourceSnapshotDocument] = Field(max_length=50)
    revisions: list[SourceRevisionDocument] = Field(max_length=50)
    imports: list[ImportSnapshotDocument] = Field(max_length=50)


class DeletionInput(Input):
    deletionId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    sourceId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    revision: int = Field(ge=0)
    createdAt: AwareDatetime


class DeletionsInput(Input):
    deletions: list[DeletionInput] = Field(min_length=1, max_length=20)


class SourceUploadItem(Input):
    sourceId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    revision: int = Field(ge=0, le=2_147_483_647)
    input: ConfigurationPatch


class SourceUploadsInput(Input):
    sources: list[SourceUploadItem] = Field(min_length=1, max_length=10)


async def configurations(request: Request):
    if not hasattr(request.app.state, "portal_configurations"):
        enrollment = await enrollment_service(request)
        request.app.state.portal_configurations = ConfigurationService(enrollment.auth, enrollment.crypto)
    return request.app.state.portal_configurations


async def tv_principal(request: Request):
    if request.headers.get("origin") not in {None, "null"}:
        raise AuthError("invalid_origin", 403)
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError()
    return await (await auth_service(request)).authenticate_tv(header[7:])


async def browser_principal(request: Request, *, mutation=False):
    return await (await auth_service(request)).authenticate_session(
        request.cookies.get(COOKIE, ""), request.headers.get("origin"), datetime.now(UTC),
        csrf=request.headers.get("x-csrf-token"), mutation=mutation,
    )


async def deletions(request: Request):
    access = await access_service(request)
    return DeletionService(access.repository, access.journal)


@router.get("/configurations")
async def saved_configurations(request: Request):
    principal = await browser_principal(request)
    rows = await ConfigurationDelivery(await configurations(request)).public_rows(
        principal, "configurations", after=request.query_params.get("after"),
    )
    return {"configurations": rows, "nextAfter": rows[-1]["sourceId"] if len(rows) == 99 else None}


@router.get("/configurations/{source_id}/values")
async def configuration_values(source_id: str, request: Request):
    """Valores salvos da lista, só para a sessão `manage` da própria TV (070/D-006). Nunca em log."""
    principal = await browser_principal(request)
    values = await ConfigurationDelivery(await configurations(request)).values(principal, source_id)
    if values is None:
        return JSONResponse({"code": "not_found", "retryable": False}, status_code=404)
    return values


@router.get("/operations")
async def operations(request: Request):
    principal = await browser_principal(request)
    rows = await ConfigurationDelivery(await configurations(request)).public_rows(
        principal, "operations", after=request.query_params.get("after"),
    )
    return {"operations": rows, "nextAfter": rows[-1]["operationId"] if len(rows) == 99 else None}


@router.post("/operations")
async def create_operation(request: Request):
    principal = await browser_principal(request, mutation=True)
    body = await payload(request, OperationInput)
    now = datetime.now(UTC)
    operation_id = request.headers.get("idempotency-key", "")
    request_time(operation_id, now)
    if body.action == "source.delete":
        if body.input is not None:
            raise AuthError("invalid_input", 422)
        result = await (await deletions(request)).request_delete(
            device_id=principal.device_id, auth_epoch=principal.auth_epoch,
            deletion_id=operation_id, source_id=body.sourceId, revision=body.expectedRevision,
            origin="portal", now=now,
        )
        return JSONResponse({"operationId": result.deletion_id, "sourceId": result.source_id,
            "serviceState": "pending" if result.state in {"pending_journal", "pending_cleanup"} else "deleted",
            "deviceState": "applied" if result.can_ack_tv else "pending",
            "state": result.state}, status_code=202)
    if body.input is None:
        raise AuthError("invalid_input", 422)
    item = await (await configurations(request)).submit(
        principal, operation_id=operation_id, source_id=body.sourceId,
        action=body.action.removeprefix("source."), expected_revision=body.expectedRevision,
        patch=body.input, now=now,
    )
    return JSONResponse(operation_view(item), status_code=202)


@router.delete("/operations/{operation_id}")
async def cancel_operation(operation_id: str, request: Request):
    principal = await browser_principal(request, mutation=True)
    item = await (await configurations(request)).transition(
        principal, operation_id, state="cancelled", revision=None, import_state=None, now=datetime.now(UTC),
    )
    return operation_view(item)


@router.get("/device/operations")
async def pull(request: Request):
    principal = await tv_principal(request)
    auth = await auth_service(request)
    now = datetime.now(UTC)
    decision = await auth.limits.evaluate((RateConstraint(
        auth.tokens.digest("rate_limit", "pull/" + principal.device_id), 1, 10,
    ),), now, consume=True)
    if not decision.allowed:
        raise AuthError("rate_limited", 429, decision.retry_after)
    return {"operations": await ConfigurationDelivery(await configurations(request)).pull(principal, now)}


@router.post("/device/deletions")
async def local_deletions(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, DeletionsInput)
    service = await deletions(request)
    acks = []
    for item in body.deletions:
        result = await service.request_delete(device_id=principal.device_id, auth_epoch=principal.auth_epoch,
            deletion_id=item.deletionId, source_id=item.sourceId, revision=item.revision,
            origin="tv", now=datetime.now(UTC))
        if result.can_ack_tv:
            acks.append(item.deletionId)
    return {"acks": acks}


@router.post("/device/sources")
async def device_sources(request: Request):
    """Envio TV → site (071/D-009): lote de até 10 listas; resposta por item, nunca ecoa valores nem os loga."""
    principal = await tv_principal(request)
    body = await payload(request, SourceUploadsInput)
    if len({item.sourceId for item in body.sources}) != len(body.sources):
        raise AuthError("invalid_input", 422)
    auth = await auth_service(request)
    now = datetime.now(UTC)
    decision = await auth.limits.evaluate((RateConstraint(
        auth.tokens.digest("rate_limit", "upload/" + principal.device_id), 20, 60,
    ),), now, consume=True)
    if not decision.allowed:
        raise AuthError("rate_limited", 429, decision.retry_after)
    uploads = DeviceSourceUploads(await configurations(request))
    results = []
    for item in body.sources:
        try:
            state = await uploads.upload(principal, source_id=item.sourceId, revision=item.revision,
                                         patch=item.input, now=now)
        except AuthError as error:
            if error.status != 409:
                raise
            state = "conflict"
        results.append({"sourceId": item.sourceId, "state": state})
    return JSONResponse({"results": results}, headers={"Cache-Control": "no-store"})


@router.post("/device/operations/{operation_id}/ack")
async def acknowledge(operation_id: str, request: Request):
    principal = await tv_principal(request)
    body = await payload(request, AckInput)
    service = await configurations(request)
    path = document_path("operations", operation_id, device_id=principal.device_id)
    saved = await service.repository.client.document(path).get(timeout=5, retry=None)
    if not saved.exists:
        raise AuthError("try_again", 404)
    if saved.to_dict()["action"] == "delete":
        if body.state in {"awaiting_confirmation", "conflict"} and body.importState is None:
            device_path = document_path("devices", principal.device_id)

            def wait(rows):
                service.auth._same_principal(rows[device_path], principal)
                item = OperationDocument.model_validate(rows[path])
                if item.action != "delete":
                    raise AuthError("try_again", 409)
                if item.state == "applied":
                    return TransactionPlan(item)
                if item.state not in {"pending", "received", "awaiting_confirmation", "conflict"}:
                    raise AuthError("try_again", 409)
                updated = item.model_copy(update={"state": body.state})
                return TransactionPlan(updated, {path: updated})

            return operation_view(await service.repository.transact((device_path, path), wait))
        if body.state != "applied" or body.importState is not None:
            raise AuthError("invalid_input", 422)
        await (await deletions(request)).acknowledge_delete(device_id=principal.device_id,
            auth_epoch=principal.auth_epoch, deletion_id=operation_id, revision=body.revision, now=datetime.now(UTC))
        return {"operationId": operation_id, "state": "applied"}
    item = await service.transition(principal, operation_id, state=body.state,
        revision=body.revision, import_state=body.importState, now=datetime.now(UTC))
    return operation_view(item)


@router.put("/device/snapshot")
async def publish_snapshot(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, SnapshotInput)
    now = datetime.now(UTC)
    # Relógio da TV pode adiantar até um minuto.
    if (body.capturedAt - now).total_seconds() > 60:
        raise AuthError("invalid_input", 422)
    snapshot = SnapshotDocument(auth_epoch=principal.auth_epoch, recovery_epoch=principal.recovery_epoch,
        captured_at=body.capturedAt, received_at=now, snapshot_revision=0,
        sources=body.sources, revisions=body.revisions, imports=body.imports, integrations=body.integrations)
    saved = await (await configurations(request)).save_snapshot(principal, snapshot)
    return {"snapshotRevision": saved.snapshot_revision}


@router.get("/snapshot")
async def snapshot(request: Request):
    principal = await browser_principal(request)
    service = await configurations(request)
    device_path = document_path("devices", principal.device_id)
    path = document_path("snapshot", "current", device_id=principal.device_id)

    def read(rows):
        service.auth._same_principal(rows[device_path], principal)
        if rows[path] is None:
            return TransactionPlan(None)
        saved = SnapshotDocument.model_validate(rows[path])
        if saved.auth_epoch != principal.auth_epoch or saved.recovery_epoch != principal.recovery_epoch:
            return TransactionPlan(None)
        return TransactionPlan(saved)

    saved = await service.repository.transact((device_path, path), read)
    return {"snapshot": saved.model_dump(mode="json", by_alias=True) if saved else None,
            "stale": saved is None or (datetime.now(UTC) - saved.received_at).total_seconds() >= 86400}


@router.delete("/configurations/{source_id}")
async def delete_configuration(source_id: str, request: Request):
    principal = await browser_principal(request, mutation=True)
    body = await payload(request, RemoveInput)
    now = datetime.now(UTC)
    operation_id = request.headers.get("idempotency-key", "")
    request_time(operation_id, now)
    # document_path valida o ID antes de qualquer acesso ao banco.
    document_path("configurations", source_id, device_id=principal.device_id)
    result = await (await deletions(request)).request_delete(device_id=principal.device_id,
        auth_epoch=principal.auth_epoch, deletion_id=operation_id, source_id=source_id,
        revision=body.expectedRevision, origin="portal", now=now)
    return JSONResponse({"operationId": result.deletion_id, "sourceId": result.source_id,
        "serviceState": "pending" if result.state in {"pending_journal", "pending_cleanup"} else "deleted",
        "deviceState": "applied" if result.can_ack_tv else "pending", "state": result.state}, status_code=202)


@router.post("/configurations/{source_id}/resend")
async def resend_configuration(source_id: str, request: Request):
    principal = await browser_principal(request, mutation=True)
    body = await payload(request, RemoveInput)
    item = await ConfigurationRepository(await configurations(request)).resend(principal,
        source_id=source_id, operation_id=request.headers.get("idempotency-key", ""),
        expected_revision=body.expectedRevision, now=datetime.now(UTC))
    return JSONResponse(operation_view(item), status_code=202)
