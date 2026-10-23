"""090: rotas de legenda chamadas só pela TV, por ação da pessoa (constitution 1.16.0 (k)).

Corpo fechado (`extra=forbid`): só idioma, IDs da obra ou nome limpo/ano, temporada/episódio e o id opaco do
resultado — nunca dado IPTV. Resposta sem URL de fornecedor nem chave; `no-store`."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import Field, model_validator

from app.portal.providers.opensubtitles import OpenSubtitlesProvider
from app.portal.providers.subdl import SubdlProvider
from app.portal.routes.auth import Input, auth_service, payload
from app.portal.routes.licensing import licensing_service
from app.portal.routes.operations import tv_principal
from app.portal.subtitle_files import SearchQuery
from app.portal.subtitles import SubtitleService

router = APIRouter(prefix="/portal/v1")
NO_STORE = {"Cache-Control": "no-store"}
Language = Literal["pt-BR", "en", "es"]
QUERY = r"^[^\x00-\x1f\x7f]{1,200}$"


class SearchInput(Input):
    language: Language
    tmdbId: int | None = Field(default=None, ge=1, le=10**9)
    parentTmdbId: int | None = Field(default=None, ge=1, le=10**9)
    season: int | None = Field(default=None, ge=0, le=10000)
    episode: int | None = Field(default=None, ge=0, le=10000)
    query: str | None = Field(default=None, pattern=QUERY)
    year: int | None = Field(default=None, ge=1888, le=2100)
    providers: list[Literal["opensubtitles", "subdl"]] | None = Field(default=None, min_length=1, max_length=2)

    @model_validator(mode="after")
    def one_form(self) -> "SearchInput":
        """Exatamente uma das formas de `buildSearchRequest` (contrato §2)."""
        if self.providers is not None and len(set(self.providers)) != len(self.providers):
            raise ValueError("providers")
        by_movie = self.tmdbId is not None
        by_episode = self.parentTmdbId is not None
        by_name = self.query is not None
        if by_movie + by_episode + by_name != 1:
            raise ValueError("form")
        if by_movie and (self.season, self.episode, self.year) != (None, None, None):
            raise ValueError("form")
        if by_episode and (self.season is None or self.episode is None or self.year is not None):
            raise ValueError("form")
        if by_name and self.query.strip() == "":
            raise ValueError("form")
        return self

    def to_query(self) -> SearchQuery:
        return SearchQuery(language=self.language, tmdb_id=self.tmdbId, parent_tmdb_id=self.parentTmdbId,
                           season=self.season, episode=self.episode, query=self.query, year=self.year)


class DownloadInput(Input):
    id: str = Field(pattern=r"^(os:\d{1,12}|sd:\d{1,12}-\d{1,12})$")
    language: Language
    # Episódio pedido (só para achar o arquivo num pacote de temporada do SubDL).
    season: int | None = Field(default=None, ge=0, le=10000)
    episode: int | None = Field(default=None, ge=0, le=10000)


async def subtitles(request: Request) -> SubtitleService:
    if not hasattr(request.app.state, "portal_subtitles"):
        settings = request.app.state.portal_settings
        providers = {}
        if settings.opensubtitles_api_key is not None:
            providers["opensubtitles"] = OpenSubtitlesProvider(settings.opensubtitles_api_key)
        if settings.subdl_api_key is not None:
            providers["subdl"] = SubdlProvider(settings.subdl_api_key)
        request.app.state.portal_subtitles = SubtitleService(
            await auth_service(request), await licensing_service(request), providers,
            downloads_per_day=settings.subtitles_downloads_per_day,
            searches_per_hour=settings.subtitles_searches_per_hour,
        )
    return request.app.state.portal_subtitles


@router.post("/device/subtitles/search")
async def search(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, SearchInput, limit=4096)
    service = await subtitles(request)
    result = await service.search(principal, body.to_query(), set(body.providers) if body.providers else None,
                                  datetime.now(UTC))
    return JSONResponse(result, headers=NO_STORE)


@router.post("/device/subtitles/download")
async def download(request: Request):
    principal = await tv_principal(request)
    body = await payload(request, DownloadInput, limit=1024)
    service = await subtitles(request)
    query = SearchQuery(language=body.language, season=body.season, episode=body.episode)
    text = await service.download(principal, body.id, query, datetime.now(UTC))
    return JSONResponse({"text": text}, headers=NO_STORE)
