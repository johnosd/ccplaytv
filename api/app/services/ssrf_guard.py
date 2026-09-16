"""Validação SSRF da URL informada (FR-017; research.md R3; ADR-004 §7)."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

ALLOWED_SCHEMES = {"http", "https"}
# Catálogos IPTV reais (canais + VOD + séries num único m3u_plus) podem
# passar de dezenas de MB — 20 MB se mostrou baixo demais contra um painel
# real. Continua limitado (proteção SSRF real, FR-017/ADR-004 §7), só que
# num teto mais realista; não removido.
MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024  # 150 MB
TIMEOUT_SECONDS = 90.0
MAX_REDIRECTS = 5
_METADATA_IP = "169.254.169.254"

# Muitos painéis Xtream/IPTV bloqueiam com 403 qualquer cliente HTTP que não
# se identifique como um player conhecido (o padrão do httpx é algo como
# "python-httpx/0.28.1", que cai nesse bloqueio). VLC é o cliente mais
# universalmente liberado por esses painéis, já que o ecossistema IPTV é
# construído em torno de compatibilidade com ele.
_DEFAULT_HEADERS = {"User-Agent": "VLC/3.0.20 LibVLC/3.0.20"}


class SSRFValidationError(ValueError):
    """URL/host bloqueado pela política de segurança do importador."""


def _is_blocked_ip(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    if ip == _METADATA_IP:
        return True
    return bool(
        addr.is_loopback
        or addr.is_link_local
        or addr.is_private
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def validate_host(hostname: str) -> None:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise SSRFValidationError(f"Não foi possível resolver o host: {hostname!r}") from exc
    if not infos:
        raise SSRFValidationError(f"Não foi possível resolver o host: {hostname!r}")
    for info in infos:
        ip = info[4][0]
        if _is_blocked_ip(ip):
            raise SSRFValidationError(
                f"Destino bloqueado por política de segurança: {hostname!r} resolve para {ip!r}"
            )


def validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise SSRFValidationError(f"Esquema não permitido: {parsed.scheme!r}")
    if not parsed.hostname:
        raise SSRFValidationError("URL sem host.")
    validate_host(parsed.hostname)


async def fetch_text_ssrf_safe(
    url: str,
    *,
    max_bytes: int = MAX_DOWNLOAD_BYTES,
    timeout: float = TIMEOUT_SECONDS,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Baixa `url` com streaming, validando SSRF na URL inicial e em cada
    redirecionamento seguido, sem carregar a resposta inteira antes de
    checar o tamanho (research.md R3)."""
    validate_url(url)
    current_url = url

    owns_client = client is None
    http_client = client or httpx.AsyncClient(
        follow_redirects=False, timeout=timeout, headers=_DEFAULT_HEADERS
    )
    try:
        for _ in range(MAX_REDIRECTS):
            async with http_client.stream("GET", current_url) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise SSRFValidationError("Redirecionamento sem cabeçalho Location.")
                    next_url = str(httpx.URL(current_url).join(location))
                    validate_url(next_url)
                    current_url = next_url
                    continue

                response.raise_for_status()
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > max_bytes:
                        raise SSRFValidationError(
                            "Resposta excede o limite de tamanho permitido."
                        )
                return bytes(chunks).decode("utf-8", errors="replace")
        raise SSRFValidationError("Excesso de redirecionamentos.")
    finally:
        if owns_client:
            await http_client.aclose()
