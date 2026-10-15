"""Entrypoint público/privado sem importar o runtime SQL."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app.portal.auth import AuthError
from app.portal.repositories.control import RepositoryConflict
from app.portal.routes.auth import router as auth_router
from app.portal.routes.backup import router as backup_router
from app.portal.routes.jobs import router as jobs_router
from app.portal.routes.licensing import router as licensing_router
from app.portal.routes.operations import router as operations_router
from app.portal.settings import PortalSettings


def create_app(settings: PortalSettings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            yield
        finally:
            for name in ("portal_auth", "portal_worker"):
                service = getattr(app.state, name, None)
                if service is not None:
                    service.repository.client.close()

    app = FastAPI(
        title="CCPlayTV Portal", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )
    app.state.portal_settings = settings

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001 - fronteira HTTP sanitiza erro antes do logger
            # Não deixar Uvicorn registrar exceção contendo corpo/URL/credencial.
            response = JSONResponse(
                {"code": "internal_error", "retryable": True}, status_code=500
            )
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        )
        if settings.environment in {"staging", "production"}:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_input(_request: Request, _error: RequestValidationError):
        return JSONResponse({"code": "invalid_input", "retryable": False}, status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, error: HTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(error.status_code, "request_error")
        return JSONResponse({"code": code, "retryable": False}, status_code=error.status_code)

    @app.exception_handler(Exception)
    async def internal_error(_request: Request, _error: Exception):
        return JSONResponse({"code": "internal_error", "retryable": True}, status_code=500)

    @app.exception_handler(AuthError)
    async def auth_error(_request: Request, error: AuthError):
        headers = {"Retry-After": str(error.retry_after)} if error.retry_after else None
        return JSONResponse({"code": error.code, "retryable": error.status in {429, 503}},
                            status_code=error.status, headers=headers)

    @app.exception_handler(RepositoryConflict)
    async def repository_error(_request: Request, error: RepositoryConflict):
        unavailable = str(error) == "transaction_unavailable"
        return JSONResponse({"code": "service_unavailable" if unavailable else "conflict",
                             "retryable": unavailable}, status_code=503 if unavailable else 409)

    if settings.service_role == "public":
        app.include_router(auth_router)
        app.include_router(operations_router)
        app.include_router(backup_router)
        app.include_router(licensing_router)
    else:
        app.include_router(jobs_router)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    # Reservar prefixos antes do StaticFiles: SPA nunca captura API/internal/webhook.
    @app.api_route("/portal/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    @app.api_route("/internal/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    async def unavailable(path: str):
        del path
        return JSONResponse({"code": "not_found", "retryable": False}, status_code=404)

    if settings.service_role == "public" and settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="portal")
    return app
