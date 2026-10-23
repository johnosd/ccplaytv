"""090: adaptador do SubDL (contrato servico-legendas.md §2/§3, prova em evidencias/subdl-prova-pc.json).

A resposta de busca do SubDL traz a URL de download com a chave embutida (`?api_key=`, R-012): daqui só sai o par
`<a>-<b>`; a URL é descartada e o download é remontado. A chave padrão só existe na query da chamada de saída."""

import re

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
    MAX_ZIP_BYTES,
    SearchQuery,
    SubtitleHit,
    SubtitleProviderError,
    decode_text,
    extract_subtitle,
)

API = "https://api.subdl.com/api/v1/subtitles"
API_HOSTS = ("api.subdl.com",)
DOWNLOAD = "https://dl.subdl.com/subtitle/{pair}.zip"
DOWNLOAD_HOSTS = ("dl.subdl.com",)
LANGUAGES = {"pt-BR": "BR_PT", "en": "EN", "es": "ES"}
URL_PAIR = re.compile(r"^/subtitle/(\d{1,12}-\d{1,12})\.zip(?:\?|$)")
PAIR = re.compile(r"^\d{1,12}-\d{1,12}$")
MAX_RESULTS = 50


def search_params(query: SearchQuery) -> dict[str, str]:
    params = {"subs_per_page": "30", "languages": LANGUAGES[query.language]}
    if query.tmdb_id is not None:
        params.update(tmdb_id=str(query.tmdb_id), type="movie")
    elif query.parent_tmdb_id is not None:
        params.update(tmdb_id=str(query.parent_tmdb_id), type="tv", season_number=str(query.season),
                      episode_number=str(query.episode))
    else:
        params["film_name"] = query.query or ""
        if query.year is not None:
            params["year"] = str(query.year)
        if query.season is not None:
            params.update(type="tv", season_number=str(query.season))
        if query.episode is not None:
            params["episode_number"] = str(query.episode)
    return params


def _int(value) -> int | None:
    return value if type(value) is int else None


def normalize(payload: dict, query: SearchQuery) -> list[SubtitleHit]:
    exact, packs = [], []
    for row in payload.get("subtitles") or []:
        if not isinstance(row, dict) or str(row.get("language", "")).upper() != LANGUAGES[query.language]:
            continue
        match = URL_PAIR.match(str(row.get("url", "")))
        if not match:
            continue
        hit = {"id": "sd:" + match.group(1), "provider": "subdl", "language": query.language,
               "release": str(row.get("release_name") or row.get("name") or "")[:200],
               "hearing_impaired": row.get("hi") is True}
        if not query.wants_episode:
            exact.append(SubtitleHit(**hit))
            continue
        season, episode = _int(row.get("season")), _int(row.get("episode"))
        if season not in (None, 0) and query.season is not None and season != query.season:
            continue
        if episode is not None and episode == query.episode:
            exact.append(SubtitleHit(**hit, exact_episode=True))
            continue
        start, end = _int(row.get("episode_from")), _int(row.get("episode_end"))
        in_range = start is not None and end is not None and start <= (query.episode or 0) <= end
        if row.get("full_season") is True or episode is None or in_range:
            packs.append(SubtitleHit(**hit, season_pack=True))
    return (exact + packs)[:MAX_RESULTS]


def _limit_error(payload: dict) -> SubtitleProviderError | None:
    """`status: false` do SubDL: cota → limite; chave recusada → indisponível; "não achei" → nenhum resultado."""
    if payload.get("status") is not False:
        return None
    message = str(payload.get("error", "")).lower()
    if "quota" in message or "limit" in message:
        return SubtitleProviderError("limit")
    if "api" in message and "key" in message:
        return SubtitleProviderError("unavailable")
    return None


class SubdlProvider:
    name = "subdl"

    def __init__(self, api_key: SecretStr, *, client: httpx.AsyncClient | None = None, sleep: Sleep = default_sleep):
        self._key = api_key
        self._client = client
        self._sleep = sleep

    async def _get(self, client, url, *, hosts, params, max_bytes):
        for attempt in range(2):
            result = await fetch_limited(client, "GET", url, hosts=hosts, headers={"User-Agent": USER_AGENT},
                                         params={**params, "api_key": self._key.get_secret_value()},
                                         max_bytes=max_bytes)
            if result.status == 429 and attempt == 0:
                await self._sleep(retry_delay(result.headers))
                continue
            return result
        return result

    async def search(self, query: SearchQuery) -> list[SubtitleHit]:
        async with client_scope(self._client) as client:
            result = await self._get(client, API, hosts=API_HOSTS, params=search_params(query),
                                     max_bytes=MAX_TEXT_BYTES)
        if result.status == 429:
            raise SubtitleProviderError("limit")
        if result.status in (401, 403) or not 200 <= result.status < 500:
            raise SubtitleProviderError("unavailable")
        payload = parse_json(result.body)
        error = _limit_error(payload)
        if error:
            raise error
        if payload.get("status") is False or not 200 <= result.status < 300:
            return []
        return normalize(payload, query)

    async def download(self, provider_id: str, query: SearchQuery) -> str:
        if not PAIR.match(provider_id):
            raise SubtitleProviderError("unavailable")
        async with client_scope(self._client) as client:
            result = await self._get(client, DOWNLOAD.format(pair=provider_id), hosts=DOWNLOAD_HOSTS, params={},
                                     max_bytes=MAX_ZIP_BYTES)
        if result.status == 429:
            raise SubtitleProviderError("limit")
        if not 200 <= result.status < 300:
            raise SubtitleProviderError("unavailable")
        return decode_text(extract_subtitle(result.body, season=query.season, episode=query.episode))
