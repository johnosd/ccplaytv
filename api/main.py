import asyncio
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app import db as app_db
from app.routers import catalog_items, import_jobs, sources


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = Field(default=3000, ge=1, le=65535)
    database_url: str = "postgresql+psycopg://ccplaytv:ccplaytv_dev@127.0.0.1:5432/ccplaytv"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().with_name(".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
app_db.configure(settings.database_url)

app = FastAPI(
    title="Samsung Player API",
    version="0.1.0",
)

app.include_router(sources.router)
app.include_router(import_jobs.router)
app.include_router(catalog_items.router)

# Autoriza o frontend local a consultar a API pelo navegador.
# Novos métodos serão liberados conforme criarmos outras rotas.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # App Tizen empacotado carrega de file:// e envia Origin: null.
        "null",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "samsung-player-api",
    }


if __name__ == "__main__":
    if sys.platform == "win32":
        # psycopg (modo assíncrono) não funciona com o ProactorEventLoop
        # padrão do Windows — necessário trocar para SelectorEventLoop.
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # Recarregamento automático somente para desenvolvimento.
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )