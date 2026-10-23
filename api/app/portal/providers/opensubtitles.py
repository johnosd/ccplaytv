"""090: adaptador do OpenSubtitles (contrato servico-legendas.md §2/§3). A chave padrão só existe no cabeçalho da
chamada de saída; nada do fornecedor além dos campos normalizados volta ao serviço."""

import httpx
from pydantic import SecretStr

from app.portal.providers.subtitle_http import (
    USER_AGENT,
    Sleep,
    client_scope,
    default_sleep,
    fetch_limited,
    parse_json,
    retry_delay,
)
from app.portal.subtitle_files import (
    MAX_TEXT_BYTES,
    SearchQuery,
    SubtitleHit,
    SubtitleProviderError,
    decode_text,
)

API = "https://api.opensubtitles.com/api/v1"
API_HOSTS = ("api.opensubtitles.com",)
LINK_SUFFIXES = (".opensubtitles.com", ".opensubtitles.org")
LANGUAGES = {"pt-BR": "pt-br", "en": "en", "es": "es"}
MAX_RESULTS = 50


def search_params(query: SearchQuery) -> dict[str, str]:
    params = {"languages": LANGUAGES[query.language]}
    if query.tmdb_id is not None:
        params["tmdb_id"] = str(query.tmdb_id)
    elif query.parent_tmdb_id is not None:
        params["parent_tmdb_id"] = str(query.parent_tmdb_id)
        params["season_number"] = str(query.season)
        params["episode_number"] = str(query.episode)
    else:
        params["query"] = query.query or ""
        if query.year is not None:
            params["year"] = str(query.year)
        if query.season is not None:
            params["season_number"] = str(query.season)
        if query.episode is not None:
            params["episode_number"] = str(query.episode)
    # Boa prática do fornecedor: parâmetros em ordem alfabética.
    return dict(sorted(params.items()))


def normalize(payload: dict, language: str) -> list[SubtitleHit]:
    hits = []
    for row in payload.get("data") or []:
        attributes = row.get("attributes") if isinstance(row, dict) else None
        if not isinstance(attributes, dict):
            continue
        if str(attributes.get("language", "")).lower() != LANGUAGES[language]:
            continue
        files = attributes.get("files") or []
        file_id = files[0].get("file_id") if files and isinstance(files[0], dict) else None
        if type(file_id) is not int or not 0 < file_id < 10**12:
            continue
        release = attributes.get("release") or files[0].get("file_name") or ""
        downloads = attributes.get("download_count")
        hits.append(SubtitleHit(
            id=f"os:{file_id}", provider="opensubtitles", language=language, release=str(release)[:200],
            hearing_impaired=attributes.get("hearing_impaired") is True,
            downloads=downloads if type(downloads) is int and downloads >= 0 else 0,
        ))
    hits.sort(key=lambda hit: hit.downloads or 0, reverse=True)
    return hits[:MAX_RESULTS]


class OpenSubtitlesProvider:
    name = "opensubtitles"

    def __init__(self, api_key: SecretStr, *, client: httpx.AsyncClient | None = None, sleep: Sleep = default_sleep):
        self._key = api_key
        self._client = client
        self._sleep = sleep

    def _headers(self) -> dict[str, str]:
        return {"Api-Key": self._key.get_secret_value(), "User-Agent": USER_AGENT, "Accept": "application/json"}

    async def _call(self, client, method, url, **kwargs):
        for attempt in range(2):
            result = await fetch_limited(client, method, url, hosts=API_HOSTS, headers=self._headers(),
                                         max_bytes=MAX_TEXT_BYTES, **kwargs)
            if result.status == 429 and attempt == 0:
                await self._sleep(retry_delay(result.headers))
                continue
            return result
        return result

    @staticmethod
    def _check(status: int, payload: dict | None = None):
        if 200 <= status < 300:
            # `remaining: 0` num sucesso = este foi o último do dia; o link continua valendo.
            return
        if status in (406, 407, 429) or (payload or {}).get("remaining") == 0:
            raise SubtitleProviderError("limit")
        raise SubtitleProviderError("unavailable")

    async def search(self, query: SearchQuery) -> list[SubtitleHit]:
        async with client_scope(self._client) as client:
            result = await self._call(client, "GET", API + "/subtitles", params=search_params(query))
        self._check(result.status)
        return normalize(parse_json(result.body), query.language)

    async def download(self, provider_id: str, query: SearchQuery) -> str:
        file_id = int(provider_id)
        async with client_scope(self._client) as client:
            asked = await self._call(client, "POST", API + "/download", json={"file_id": file_id})
            payload = parse_json(asked.body) if asked.body else {}
            self._check(asked.status, payload)
            link = payload.get("link")
            if not isinstance(link, str):
                raise SubtitleProviderError("unavailable")
            # O link é temporário e do fornecedor: só https em host dele; nunca guardado, logado ou repassado.
            file = await fetch_limited(client, "GET", link, hosts=(), suffixes=LINK_SUFFIXES,
                                       headers={"User-Agent": USER_AGENT}, max_bytes=MAX_TEXT_BYTES)
        if not 200 <= file.status < 300:
            raise SubtitleProviderError("unavailable")
        return decode_text(file.body)
