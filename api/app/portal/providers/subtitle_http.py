"""090: chamada HTTP a fornecedor de legenda com destino fixo (constitution (k)): segue redirect só para hosts
permitidos, corta o corpo, nunca põe URL, corpo ou chave numa exceção."""

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

from app.portal.subtitle_files import SubtitleProviderError

TIMEOUT_SECONDS = 8
USER_AGENT = "ccplayTv v1.0"
Sleep = Callable[[float], Awaitable[None]]
_KEY_IN_QUERY = re.compile(r"(api_key=)[^&\s\"']+", re.IGNORECASE)


class RedactKeyFilter(logging.Filter):
    """O `httpx` registra a URL de cada requisição em INFO, e a API v1 do SubDL exige a chave na query (`api_key=`):
    sem isto a chave padrão iria para o log (constitution (k), R-018). Mascara antes de o registro sair."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "api_key=" in message.lower():
            record.msg, record.args = _KEY_IN_QUERY.sub(r"\1<redacted>", message), ()
        return True


for _name in ("httpx", "httpcore"):
    _logger = logging.getLogger(_name)
    if not any(isinstance(item, RedactKeyFilter) for item in _logger.filters):
        _logger.addFilter(RedactKeyFilter())


@dataclass(frozen=True)
class FetchResult:
    status: int
    body: bytes
    headers: httpx.Headers


def host_allowed(url: str, hosts: tuple[str, ...], suffixes: tuple[str, ...] = ()) -> bool:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or parts.username or parts.password or not host:
        return False
    return host in hosts or any(host.endswith(suffix) for suffix in suffixes)


async def fetch_limited(client: httpx.AsyncClient, method: str, url: str, *, max_bytes: int,
                        hosts: tuple[str, ...], suffixes: tuple[str, ...] = (), headers: dict | None = None,
                        params: dict | None = None, json: dict | None = None, max_redirects: int = 3) -> FetchResult:
    current = url
    for _ in range(max_redirects + 1):
        if not host_allowed(current, hosts, suffixes):
            raise SubtitleProviderError("unavailable")
        try:
            async with client.stream(method, current, headers=headers, params=params, json=json,
                                     timeout=TIMEOUT_SECONDS, follow_redirects=False) as response:
                if 300 <= response.status_code < 400 and response.headers.get("location"):
                    current = urljoin(current, response.headers["location"])
                    # Redirect vira GET sem corpo; os parâmetros já estão na nova URL.
                    method, params, json = "GET", None, None
                    continue
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise SubtitleProviderError("unreadable")
                return FetchResult(response.status_code, bytes(body), response.headers)
        except SubtitleProviderError:
            raise
        except (httpx.HTTPError, OSError, ValueError):
            raise SubtitleProviderError("unavailable") from None
    raise SubtitleProviderError("unavailable")


def retry_delay(headers: httpx.Headers) -> float:
    """Espera curta antes da única nova tentativa depois de 429 (no máximo 2 s)."""
    for name in ("retry-after", "ratelimit-reset"):
        try:
            value = float(headers.get(name, ""))
        except ValueError:
            continue
        if value > 0:
            return min(value, 2.0)
    return 1.0


async def default_sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


class _Borrowed:
    """Cliente injetado (testes): não é fechado ao sair."""

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def __aenter__(self) -> httpx.AsyncClient:
        return self.client

    async def __aexit__(self, *_) -> bool:
        return False


def client_scope(client: httpx.AsyncClient | None):
    return _Borrowed(client) if client else httpx.AsyncClient()


def parse_json(body: bytes) -> dict:
    try:
        value = json.loads(body)
    except ValueError:
        raise SubtitleProviderError("unavailable") from None
    if not isinstance(value, dict):
        raise SubtitleProviderError("unavailable")
    return value
