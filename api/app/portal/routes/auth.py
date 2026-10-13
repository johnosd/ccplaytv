"""Transporte same-origin: segredos somente no corpo/cookie, nunca em URLs."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError, model_validator

from app.portal.access_rotation import AccessRotation
from app.portal.auth import AuthError, AuthService, SessionIssuance
from app.portal.auth_tokens import AuthTokens, valid_token
from app.portal.crypto import PortalCrypto
from app.portal.enrollment import EnrollmentService
from app.portal.firestore import create_firestore_client
from app.portal.models import IssuanceDocument
from app.portal.qr import invite_qr
from app.portal.recovery import RecoveryService
from app.portal.recovery_codes import RecoveryCodes
from app.portal.recovery_journal import CloudStorageJournal
from app.portal.repositories.control import ControlRepository, document_path

router = APIRouter(prefix="/portal/v1")
COOKIE = "ccplay_portal_session"
RECOVERY_COOKIE = "ccplay_portal_recovery"


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)


class ExchangeInput(Input):
    token: SecretStr = Field(min_length=43, max_length=43, repr=False)


class ManualInput(Input):
    # 070/D-005: ID exibido no formato MAC (aceita minúsculas/hífens) + chave numérica de 10 dígitos.
    displayId: str = Field(min_length=1, max_length=64)
    deviceKey: SecretStr = Field(max_length=64, repr=False)


class EnrollmentInput(Input):
    platformIdentity: SecretStr = Field(min_length=1, max_length=512, repr=False)
    nonce: SecretStr = Field(min_length=43, max_length=43, repr=False)
    # 070/D-002: MAC lido na TV (opcional); o servidor revalida e cai no ID gerado se for inútil.
    mac: str | None = Field(default=None, max_length=64)


class AckInput(Input):
    operationId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")


class RotationInput(Input):
    operationId: str = Field(min_length=43, max_length=43)
    claimSecret: SecretStr = Field(min_length=43, max_length=43, repr=False)
    confirmed: Literal[True]
    # 070/D-004: MAC opcional para o upgrade de dispositivo anterior à 070.
    mac: str | None = Field(default=None, max_length=64)


class ResultInput(Input):
    deviceId: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,128}$")
    operationId: str | None = Field(default=None, min_length=43, max_length=43)
    claimId: str | None = Field(default=None, pattern=r"^claim-[A-Za-z0-9_-]{1,128}$")

    @model_validator(mode="after")
    def destination(self):
        if self.claimId is not None:
            if self.deviceId is not None or self.operationId is not None:
                raise ValueError("invalid_input")
        elif self.deviceId is None or self.operationId is None:
            raise ValueError("invalid_input")
        return self


class RecoveryConfirmInput(Input):
    code: SecretStr = Field(min_length=1, max_length=64, repr=False)
    confirmedDeviceId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")


class InviteInput(Input):
    purpose: Literal["manage", "buy"]


async def payload(request: Request, model: type[Input]):
    if request.headers.get("content-type", "").split(";", 1)[0].strip() != "application/json":
        raise AuthError("invalid_input", 422)
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > 65536:
            raise AuthError("payload_too_large", 413)
        data.extend(chunk)
    try:
        return model.model_validate_json(data)
    except ValidationError:
        raise AuthError("invalid_input", 422) from None


async def auth_service(request: Request) -> AuthService:
    # Inicialização lazy: /health não precisa de segredos nem faz conexão com Firestore.
    if not hasattr(request.app.state, "portal_auth"):
        settings = request.app.state.portal_settings
        try:
            tokens = AuthTokens.from_settings(settings)
            if not valid_token(settings.service_recovery_epoch):
                raise ValueError("recovery_epoch_required")
            service = AuthService(ControlRepository(create_firestore_client(settings)), tokens,
                                  public_origin=settings.public_origin,
                                  recovery_epoch=settings.service_recovery_epoch)
        except ValueError:
            raise AuthError("service_unavailable", 503) from None
        request.app.state.portal_auth = service
    return request.app.state.portal_auth


def issuance_response(issuance: SessionIssuance, request: Request) -> JSONResponse:
    response = JSONResponse({"deviceId": issuance.principal.device_id,
                             "csrfToken": issuance.csrf,
                             "expiresAt": issuance.expires_at.isoformat()})
    settings = request.app.state.portal_settings
    response.set_cookie(COOKIE, issuance.token, httponly=True, samesite="strict",
                        secure=settings.environment in {"staging", "production"},
                        max_age=8 * 60 * 60, path="/portal/v1")
    return response


@router.post("/device/invites")
async def invite(request: Request):
    service = await auth_service(request)
    if request.headers.get("origin") not in {None, "null"}:
        raise AuthError("invalid_origin", 403)
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError()
    principal = await service.authenticate_tv(header[7:])
    body = await payload(request, InviteInput)
    issuance = await service.create_invite(principal, body.purpose, datetime.now(UTC))
    return {"token": issuance.token, "expiresAt": issuance.expires_at.isoformat(),
            "qrDataUrl": invite_qr(service.public_origin, issuance.token)}


@router.post("/sessions/exchange")
async def exchange(request: Request):
    service = await auth_service(request)
    service.browser_origin(request.headers.get("origin"), mutation=True)
    body = await payload(request, ExchangeInput)
    issuance = await service.exchange_invite(body.token.get_secret_value(),
                                              request.headers.get("origin"), datetime.now(UTC))
    return issuance_response(issuance, request)


@router.post("/sessions/manual")
async def manual(request: Request):
    service = await auth_service(request)
    service.browser_origin(request.headers.get("origin"), mutation=True)
    body = await payload(request, ManualInput)
    ip = request.client.host if request.client else "unknown"
    issuance = await service.manual_session(body.displayId, body.deviceKey.get_secret_value(), ip,
                                            request.headers.get("origin"), datetime.now(UTC))
    return issuance_response(issuance, request)


@router.delete("/session", status_code=204)
async def logout(request: Request):
    service = await auth_service(request)
    await service.logout(request.cookies.get(COOKIE, ""), request.headers.get("origin"),
                         request.headers.get("x-csrf-token", ""), datetime.now(UTC))
    response = Response(status_code=204)
    response.delete_cookie(COOKIE, path="/portal/v1", httponly=True, samesite="strict",
                           secure=request.app.state.portal_settings.environment
                           in {"staging", "production"})
    return response


async def enrollment_service(request: Request) -> EnrollmentService:
    if not hasattr(request.app.state, "portal_enrollment"):
        auth = await auth_service(request)
        settings = request.app.state.portal_settings
        try:
            request.app.state.portal_enrollment = EnrollmentService(
                auth, PortalCrypto.from_settings(settings), RecoveryCodes.from_settings(settings),
            )
        except ValueError:
            raise AuthError("service_unavailable", 503) from None
    return request.app.state.portal_enrollment


@router.post("/devices/enroll")
async def enroll(request: Request):
    if request.headers.get("origin") not in {None, "null"}:
        raise AuthError("invalid_origin", 403)
    body = await payload(request, EnrollmentInput)
    service = await enrollment_service(request)
    issued = await service.enroll(body.platformIdentity.get_secret_value(),
                                   body.nonce.get_secret_value(),
                                   request.client.host if request.client else "unknown",
                                   datetime.now(UTC), body.mac)
    return {"operationId": issued.operation_id, **issued.credentials}


@router.post("/devices/recovery/ack", status_code=204)
async def credential_ack(request: Request):
    if request.headers.get("origin") not in {None, "null"}:
        raise AuthError("invalid_origin", 403)
    service = await enrollment_service(request)
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError()
    principal = await service.auth.authenticate_tv(header[7:])
    body = await payload(request, AckInput)
    snapshot = await service.repository.client.document(
        document_path("recoveryResults", body.operationId)
    ).get()
    if not snapshot.exists:
        raise AuthError()
    result = IssuanceDocument.model_validate(snapshot.to_dict())
    if result.purpose == "enroll":
        await service.acknowledge(principal, body.operationId, datetime.now(UTC))
    else:
        await (await access_service(request)).acknowledge(principal, body.operationId, datetime.now(UTC))
    return Response(status_code=204)


async def access_service(request: Request) -> AccessRotation:
    if not hasattr(request.app.state, "portal_access"):
        enrollment = await enrollment_service(request)
        try:
            journal = CloudStorageJournal(request.app.state.portal_settings)
        except ValueError:
            raise AuthError("service_unavailable", 503) from None
        request.app.state.portal_access = AccessRotation(
            enrollment.auth, enrollment.crypto, enrollment.codes, journal,
        )
    return request.app.state.portal_access


async def rotate_access(request: Request, purpose: Literal["revoke", "rotate"]):
    if request.headers.get("origin") not in {None, "null"}:
        raise AuthError("invalid_origin", 403)
    service = await access_service(request)
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError()
    principal = await service.auth.authenticate_tv(header[7:])
    body = await payload(request, RotationInput)
    result = await service.begin(principal, body.operationId, body.claimSecret.get_secret_value(),
                                 purpose, datetime.now(UTC), body.mac)
    return JSONResponse({"operationId": result.operation_id, "state": result.state}, status_code=202)


@router.post("/device/revoke")
async def revoke(request: Request):
    return await rotate_access(request, "revoke")


@router.post("/device/recovery-code/rotate")
async def rotate_code(request: Request):
    return await rotate_access(request, "rotate")


@router.post("/devices/recovery/result")
async def credential_result(request: Request):
    if request.headers.get("origin") not in {None, "null"}:
        raise AuthError("invalid_origin", 403)
    service = await access_service(request)
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError()
    body = await payload(request, ResultInput)
    if body.claimId is not None:
        result = await (await recovery_service(request)).claim_result(
            body.claimId, header[7:], datetime.now(UTC),
        )
    else:
        result = await service.poll(body.deviceId, body.operationId, header[7:], datetime.now(UTC))
    return {"operationId": result.operation_id, "state": result.state,
            **({"credentials": result.credentials} if result.credentials is not None else {})}


async def recovery_service(request: Request) -> RecoveryService:
    if not hasattr(request.app.state, "portal_recovery"):
        request.app.state.portal_recovery = RecoveryService(await access_service(request))
    return request.app.state.portal_recovery


@router.post("/devices/recovery/challenges")
async def recovery_challenge(request: Request):
    if request.headers.get("origin") not in {None, "null"}:
        raise AuthError("invalid_origin", 403)
    body = await payload(request, EnrollmentInput)
    service = await recovery_service(request)
    challenge = await service.challenge(body.platformIdentity.get_secret_value(),
                                        body.nonce.get_secret_value(),
                                        request.client.host if request.client else "unknown",
                                        datetime.now(UTC))
    return {**challenge, "qrDataUrl": invite_qr(service.auth.public_origin, challenge["token"], "recovery")}


@router.post("/recoveries/exchange")
async def recovery_exchange(request: Request):
    service = await recovery_service(request)
    service.auth.browser_origin(request.headers.get("origin"), mutation=True)
    body = await payload(request, ExchangeInput)
    issued = await service.exchange(body.token.get_secret_value(), request.headers.get("origin"),
                                    datetime.now(UTC))
    response = JSONResponse({"claimId": issued.claim_id, "deviceId": issued.device_id,
                             "csrfToken": issued.csrf, "expiresAt": issued.expires_at.isoformat()})
    response.set_cookie(RECOVERY_COOKIE, issued.token, httponly=True, samesite="strict",
                        secure=request.app.state.portal_settings.environment in {"staging", "production"},
                        max_age=5 * 60, path="/portal/v1")
    return response


@router.post("/recoveries/confirm")
async def recovery_confirm(request: Request):
    service = await recovery_service(request)
    service.auth.browser_origin(request.headers.get("origin"), mutation=True)
    body = await payload(request, RecoveryConfirmInput)
    result = await service.confirm(
        request.cookies.get(RECOVERY_COOKIE, ""), request.headers.get("origin"),
        request.headers.get("x-csrf-token", ""), code=body.code.get_secret_value(),
        confirmed_device_id=body.confirmedDeviceId,
        request_id=request.headers.get("idempotency-key", ""),
        ip=request.client.host if request.client else "unknown", now=datetime.now(UTC),
    )
    return JSONResponse({"operationId": result.operation_id, "state": result.state}, status_code=202)
