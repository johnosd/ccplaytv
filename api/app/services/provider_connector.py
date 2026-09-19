"""Conector de provedor — protocolo JSON (`player_api.php`) para canais ao
vivo, com fallback para o caminho M3U quando o painel não fala o protocolo
(feature 004; ADR-004 §3; ADR-006 §4.3; `contracts/provider-protocol.md`).

Substitui a hipótese anterior (montar `get.php?...&type=m3u_plus` e reusar o
pipeline M3U para toda fonte de provedor), que descartava `stream_id`,
categoria e hierarquia que o provedor já declara — a razão de existir desta
feature. O fallback continua existindo, mas só quando o painel de fato não
responde ao protocolo (D-005: uma tentativa decide, nunca varredura).
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import quote, urlsplit, urlunsplit

import httpx

from app.models.catalog_item import CatalogItemKind
from app.models.source import ProviderImportMode, Source
from app.services.classifier import ClassifiedEntry, classify_entries
from app.services.m3u_parser import M3UParser
from app.services.ssrf_guard import SSRFValidationError, fetch_json_ssrf_safe, fetch_text_ssrf_safe

# TS é a preferência quando a conta permite mais de um formato — mesma
# escolha que o iptvnator faz, e o formato que reproduziu na TV de
# referência na feature 003 (contracts/provider-protocol.md §4).
_PREFERRED_FORMAT = "ts"

# Ordem de tentativa da consulta de status de conta — nem todo painel
# responde à primeira forma (contracts/provider-protocol.md §2).
_ACCOUNT_STATUS_ACTIONS: tuple[str | None, ...] = ("get_account_info", None, "get_profile")

_LEGACY_SUFFIXES = ("/player_api.php", "/panel_api.php", "/get.php")


class ProviderAuthError(ValueError):
    """Credenciais de provedor inválidas — o painel recusou (FR-005)."""


class ProviderExpiredError(ValueError):
    """Conta autorizada, mas fora da validade — distinto de credencial
    inválida (FR-005, US2)."""


class ProviderIncompatibleError(ValueError):
    """Endereço incompleto, ou painel que não fala o protocolo JSON depois
    das tentativas — o chamador cai no caminho M3U (FR-010)."""


@dataclass(frozen=True)
class AcquisitionResult:
    """Saída normalizada comum aos dois conectores (D-001) — `importer.py`
    não sabe, a partir daqui, se os dados vieram do protocolo JSON, do
    fallback M3U de um provedor, ou de uma fonte `m3u_url` direta."""

    classified: list[ClassifiedEntry]
    invalid_count: int
    # `None` para fonte `m3u_url` (não se aplica). Preenchido para toda
    # fonte `provider_credentials` que passou pela aquisição, nos dois
    # sub-casos (protocolo falado ou modo limitado) — D-008: modo limitado é
    # estado normal, não erro.
    provider_import_mode: ProviderImportMode | None
    provider_allowed_formats: list[str] | None


def normalize_server_address(raw: str) -> str:
    """Reduz qualquer forma comum — base, ou URL terminando em `get.php`,
    `player_api.php` ou `panel_api.php` — à base normalizada, preservando
    subpath (contracts/provider-protocol.md §1; FR-003).

    Credencial embutida no endereço (`http://user:senha@host`) é recusada:
    as credenciais vivem só nos campos próprios da fonte, nunca na URL
    armazenada.
    """
    value = raw.strip()
    if not value:
        raise ProviderIncompatibleError("Endereço do servidor vazio.")
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://", value):
        value = f"http://{value}"

    parsed = urlsplit(value)
    if parsed.username or parsed.password:
        raise ProviderIncompatibleError(
            "O endereço do servidor não deve conter usuário ou senha embutidos."
        )
    if not parsed.hostname:
        raise ProviderIncompatibleError("Endereço do servidor sem host.")

    path = parsed.path
    for suffix in _LEGACY_SUFFIXES:
        if path.endswith(suffix):
            path = path[: -len(suffix)]
            break
    path = path.rstrip("/")

    netloc = parsed.hostname
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    # Esquema preservado como o usuário informou — nunca forçamos HTTPS nem
    # desativamos validação de TLS (ADR-004 §8); se o painel só serve HTTP,
    # a limitação aparece no resultado, não é contornada aqui.
    return urlunsplit((parsed.scheme, netloc, path, "", ""))


def _player_api_url(
    base: str, username: str, password: str, params: dict[str, str] | None = None
) -> str:
    query = {"username": username, "password": password}
    if params:
        query.update(params)
    query_string = "&".join(f"{key}={quote(str(value), safe='')}" for key, value in query.items())
    return f"{base}/player_api.php?{query_string}"


def _interpret_auth(value: object) -> bool:
    """Painéis variam o tipo do indicador de autorização (número, texto,
    booleano). Variantes conhecidas viram `True`; qualquer coisa
    desconhecida vira `False` — nunca assume acesso por omissão."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int | float):
        return value == 1
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true")
    return False


def _is_expired(exp_raw: object) -> bool:
    """`exp_date` costuma vir como epoch em string. Ausente/zero = sem prazo
    declarado, não é "expirada"."""
    if exp_raw in (None, "", "0", 0):
        return False
    try:
        exp_ts = int(exp_raw)
    except (TypeError, ValueError):
        return False
    return exp_ts < int(datetime.now(UTC).timestamp())


@dataclass(frozen=True)
class _AccountStatus:
    authorized: bool
    expired: bool
    allowed_formats: list[str] | None


async def _resolve_account_status(base: str, username: str, password: str) -> _AccountStatus:
    """Tenta as formas da tabela do contrato, em ordem; devolve a primeira
    resposta utilizável (FR-004).

    Duas famílias de falha por tentativa recebem tratamento diferente:
    - `SSRFValidationError`/`httpx.TransportError` (conexão recusada, host
      bloqueado, DNS): o endpoint pode simplesmente não existir nesta forma
      — tenta a próxima ação, e se todas falharem assim, o painel é tratado
      como incompatível (`ProviderIncompatibleError`), e quem chama decide
      o fallback M3U.
    - `httpx.HTTPStatusError` (ex.: 401/403): o endpoint existe e respondeu
      recusando — é sinal de credencial, não de protocolo ausente. Guardado
      e, se nenhuma tentativa resolver de outra forma, vira
      `ProviderAuthError` direto, sem cair no fallback M3U à toa (FR-018: é
      também aqui que a senha embutida na URL não pode vazar).
    """
    last_status_error: httpx.HTTPStatusError | None = None
    for action in _ACCOUNT_STATUS_ACTIONS:
        params = {"action": action} if action else None
        url = _player_api_url(base, username, password, params)
        try:
            payload = await fetch_json_ssrf_safe(url)
        except httpx.HTTPStatusError as exc:
            last_status_error = exc
            continue
        except (SSRFValidationError, httpx.HTTPError):
            continue

        user_info = payload.get("user_info") if isinstance(payload, dict) else None
        if not isinstance(user_info, dict):
            continue  # resposta não tem o formato esperado — tenta a próxima ação

        formats = user_info.get("allowed_output_formats")
        allowed_formats = [str(f) for f in formats] if isinstance(formats, list) else None
        return _AccountStatus(
            authorized=_interpret_auth(user_info.get("auth")),
            expired=_is_expired(user_info.get("exp_date")),
            allowed_formats=allowed_formats,
        )

    if last_status_error is not None:
        raise ProviderAuthError(
            "Provedor respondeu com erro de autenticação/autorização "
            f"(status {last_status_error.response.status_code})."
        ) from last_status_error
    raise ProviderIncompatibleError("Painel não respondeu ao protocolo esperado.")


def _preferred_format(allowed: list[str] | None) -> str | None:
    """TS se a conta permitir; senão o primeiro formato permitido; `None`
    se a conta não declarou nenhum — nunca assumido (FR-008, FR-009)."""
    if not allowed:
        return None
    normalized = [str(f).strip().lower() for f in allowed if str(f).strip()]
    if not normalized:
        return None
    return _PREFERRED_FORMAT if _PREFERRED_FORMAT in normalized else normalized[0]


async def _fetch_live_categories(base: str, username: str, password: str) -> list[dict]:
    url = _player_api_url(base, username, password, {"action": "get_live_categories"})
    payload = await fetch_json_ssrf_safe(url)
    return payload if isinstance(payload, list) else []


async def _fetch_live_streams(base: str, username: str, password: str) -> list[dict]:
    url = _player_api_url(base, username, password, {"action": "get_live_streams"})
    payload = await fetch_json_ssrf_safe(url)
    return payload if isinstance(payload, list) else []


def _map_live_entry(
    raw: dict,
    category_names: dict[str, str],
    playback_url_for: Callable[[str], str | None],
) -> ClassifiedEntry | None:
    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        return None  # sem nome utilizável — não inventa (contracts §3)

    stream_id = raw.get("stream_id")
    stream_id_str = str(stream_id) if stream_id is not None else None

    category_id = raw.get("category_id")
    category_id_str = str(category_id) if category_id is not None else None
    # Categoria cujo id não está na lista de categorias: canal continua
    # acessível, sem vínculo forjado (contracts/provider-protocol.md §3).
    group_name = category_names.get(category_id_str) if category_id_str else None

    playback_url = playback_url_for(stream_id_str) if stream_id_str else None

    return ClassifiedEntry(
        kind=CatalogItemKind.CHANNEL,
        name=name,
        original_name=name,
        group=group_name,
        url=playback_url,
        provider_stream_id=stream_id_str,
        provider_category_id=category_id_str,
    )


async def _acquire_xtream_api(
    base: str, username: str, password: str, status: _AccountStatus
) -> AcquisitionResult:
    categories = await _fetch_live_categories(base, username, password)
    streams = await _fetch_live_streams(base, username, password)

    category_names: dict[str, str] = {}
    for category in categories:
        if not isinstance(category, dict):
            continue
        category_id = category.get("category_id")
        if category_id is None:
            continue
        # Nome vazio é preservado como o provedor declarou, nunca
        # substituído por rótulo externo (contracts/provider-protocol.md §3).
        category_names[str(category_id)] = category.get("category_name", "") or ""

    format_pref = _preferred_format(status.allowed_formats)

    def playback_url_for(stream_id: str) -> str | None:
        if format_pref is None:
            return None
        return (
            f"{base}/live/{quote(username, safe='')}/{quote(password, safe='')}"
            f"/{stream_id}.{format_pref}"
        )

    classified: list[ClassifiedEntry] = []
    for raw in streams:
        if not isinstance(raw, dict):
            continue
        entry = _map_live_entry(raw, category_names, playback_url_for)
        if entry is not None:
            classified.append(entry)

    return AcquisitionResult(
        classified=classified,
        invalid_count=0,
        provider_import_mode=ProviderImportMode.XTREAM_API,
        provider_allowed_formats=status.allowed_formats,
    )


def _legacy_m3u_url(base: str, username: str, password: str) -> str:
    username_q = quote(username, safe="")
    password_q = quote(password, safe="")
    return f"{base}/get.php?username={username_q}&password={password_q}&type=m3u_plus&output=m3u8"


async def _acquire_legacy_m3u(base: str, username: str, password: str) -> AcquisitionResult:
    """Painel não fala o protocolo JSON — importa pelo caminho M3U
    existente, com a fonte marcada como modo limitado (FR-010, D-008)."""
    m3u_url = _legacy_m3u_url(base, username, password)
    try:
        text = await fetch_text_ssrf_safe(m3u_url)
    except httpx.TransportError as exc:
        # Nunca interpolar str(exc)/exc.request.url: httpx embute a URL
        # completa, que carrega a senha na query string (FR-018).
        raise ProviderIncompatibleError(
            f"Não foi possível conectar ao servidor do provedor ({type(exc).__name__})."
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise ProviderAuthError(
            "Provedor respondeu com erro de autenticação/autorização "
            f"(status {exc.response.status_code})."
        ) from exc

    if not text.strip().startswith("#EXTM3U"):
        raise ProviderAuthError(
            "O provedor não retornou uma lista válida — verifique usuário e senha."
        )

    parse_result = M3UParser().parse(text)
    return AcquisitionResult(
        classified=classify_entries(parse_result.entries),
        invalid_count=parse_result.invalid_count,
        provider_import_mode=ProviderImportMode.LEGACY_M3U,
        provider_allowed_formats=None,
    )


async def acquire(source: Source) -> AcquisitionResult:
    """Ponto de entrada único do conector de provedor — `importer.py` não
    sabe, a partir daqui, se o resultado veio do protocolo JSON ou do
    fallback M3U (D-001)."""
    if not source.provider_dns or not source.provider_username or not source.provider_password:
        raise ProviderIncompatibleError("Dados do provedor incompletos.")

    base = normalize_server_address(source.provider_dns)
    username = source.provider_username
    password = source.provider_password

    try:
        status = await _resolve_account_status(base, username, password)
    except ProviderIncompatibleError:
        return await _acquire_legacy_m3u(base, username, password)

    if not status.authorized:
        raise ProviderAuthError("Provedor não aceitou as credenciais informadas.")
    if status.expired:
        raise ProviderExpiredError("A assinatura deste provedor está expirada.")

    return await _acquire_xtream_api(base, username, password, status)
