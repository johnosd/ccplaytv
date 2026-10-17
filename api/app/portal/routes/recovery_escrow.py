"""Feature 073 (US3): cópia cifrada do código de recuperação — TV envia, painel da mesma TV revela por ação explícita."""
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import Field, SecretStr

from app.portal.recovery_escrow import RecoveryEscrowService
from app.portal.routes.auth import Input, enrollment_service, payload
from app.portal.routes.operations import browser_principal, tv_principal

router = APIRouter(prefix="/portal/v1")
NO_STORE = {"Cache-Control": "no-store"}


class EscrowInput(Input):
    recoveryCode: SecretStr = Field(min_length=1, max_length=64, repr=False)
    recoveryCodeVersion: int = Field(ge=1)


class EmptyInput(Input):
    pass


async def escrow_service(request: Request) -> RecoveryEscrowService:
    if not hasattr(request.app.state, "portal_recovery_escrow"):
        enrollment = await enrollment_service(request)
        request.app.state.portal_recovery_escrow = RecoveryEscrowService(enrollment.auth, enrollment.crypto, enrollment.codes)
    return request.app.state.portal_recovery_escrow


@router.put("/device/recovery-code/escrow", status_code=204)
async def put_escrow(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, EscrowInput)
    await (await escrow_service(request)).put(principal, body.recoveryCode.get_secret_value(),
                                              body.recoveryCodeVersion, datetime.now(UTC))
    return Response(status_code=204, headers=NO_STORE)


@router.post("/session/recovery-code")
async def reveal_code(request: Request):
    """POST (não GET): ação explícita com CSRF, nunca pré-carregada nem guardada em cache."""
    principal = await browser_principal(request, mutation=True)
    await payload(request, EmptyInput)
    return JSONResponse(await (await escrow_service(request)).reveal(principal, datetime.now(UTC)), headers=NO_STORE)
