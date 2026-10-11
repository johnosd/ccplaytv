"""Montado somente no serviço privado; IAM/OIDC do Cloud Run autoriza o ingresso."""

from dataclasses import asdict

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.portal.auth import AuthError
from app.portal.recovery_journal import JournalError
from app.portal.worker import create_worker

router = APIRouter()


@router.post("/internal/portal/jobs/tick")
async def tick(request: Request):
    if not hasattr(request.app.state, "portal_worker"):
        try:
            request.app.state.portal_worker = create_worker(request.app.state.portal_settings)
        except (JournalError, ValueError):
            raise AuthError("service_unavailable", 503) from None
    summary = await request.app.state.portal_worker.run_once()
    return JSONResponse(asdict(summary), status_code=503 if summary.failed or summary.timed_out else 200)
