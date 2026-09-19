"""Testes unitários do conector de provedor (feature 004).

Sem rede real: `fetch_json_ssrf_safe` é monkeypatchada por URL, então cada
teste é determinístico e não depende de um painel de verdade — o painel real
só entra no `quickstart.md` (Cenários A-C).
"""

import uuid
from datetime import UTC, datetime

import pytest

from app.models.source import Source, SourceType
from app.services import provider_connector


def _fake_provider_source(*, dns: str = "painel.test", username: str = "usuario", password: str = "senha") -> Source:
    """Instância solta, sem tocar no banco — só os campos que o conector lê."""
    return Source(
        id=uuid.uuid4(),
        type=SourceType.PROVIDER_CREDENTIALS,
        display_name="Fonte de teste",
        provider_dns=dns,
        provider_username=username,
        provider_password=password,
    )


# --- T010 — normalização do endereço (contracts/provider-protocol.md §1) ---


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://painel.exemplo:8080", "http://painel.exemplo:8080"),
        ("painel.exemplo:8080", "http://painel.exemplo:8080"),
        ("http://painel.exemplo:8080/", "http://painel.exemplo:8080"),
        ("http://painel.exemplo:8080/get.php?type=m3u_plus", "http://painel.exemplo:8080"),
        ("http://painel.exemplo:8080/player_api.php", "http://painel.exemplo:8080"),
        ("http://painel.exemplo:8080/panel_api.php", "http://painel.exemplo:8080"),
        ("http://painel.exemplo:8080/iptv/player_api.php", "http://painel.exemplo:8080/iptv"),
        ("https://painel.exemplo", "https://painel.exemplo"),  # esquema preservado, não forçado
    ],
)
def test_normalize_server_address_forms(raw: str, expected: str) -> None:
    assert provider_connector.normalize_server_address(raw) == expected


def test_normalize_server_address_rejects_embedded_credentials() -> None:
    with pytest.raises(provider_connector.ProviderIncompatibleError):
        provider_connector.normalize_server_address("http://usuario:senha@painel.exemplo")


def test_normalize_server_address_rejects_empty() -> None:
    with pytest.raises(provider_connector.ProviderIncompatibleError):
        provider_connector.normalize_server_address("   ")


# --- T011 — mapeamento de categorias e canais, preservando identidade ---


async def test_acquire_xtream_api_preserves_provider_ids_and_category_names(monkeypatch) -> None:
    async def fake_json(url, **kwargs):
        if "action=get_account_info" in url:
            return {"user_info": {"auth": 1, "allowed_output_formats": ["ts"]}}
        if "action=get_live_categories" in url:
            return [
                {"category_id": "10", "category_name": "Esportes"},
                {"category_id": "20", "category_name": "Filmes 24h"},
            ]
        if "action=get_live_streams" in url:
            return [
                {"stream_id": 111, "name": "ESPN", "category_id": "10"},
                {"stream_id": 222, "name": "HBO", "category_id": "20"},
            ]
        raise AssertionError(f"URL inesperada no teste: {url}")

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    result = await provider_connector.acquire(_fake_provider_source())

    assert result.provider_import_mode == provider_connector.ProviderImportMode.XTREAM_API
    assert result.provider_allowed_formats == ["ts"]
    assert [e.name for e in result.classified] == ["ESPN", "HBO"]
    assert [e.provider_stream_id for e in result.classified] == ["111", "222"]
    assert [e.group for e in result.classified] == ["Esportes", "Filmes 24h"]
    assert all(e.url and e.url.endswith(".ts") for e in result.classified)


# --- T012 — casos que não podem inventar dado ---


async def test_acquire_xtream_api_empty_category_name_is_preserved(monkeypatch) -> None:
    async def fake_json(url, **kwargs):
        if "action=get_account_info" in url:
            return {"user_info": {"auth": 1, "allowed_output_formats": ["ts"]}}
        if "action=get_live_categories" in url:
            return [{"category_id": "1", "category_name": ""}]
        if "action=get_live_streams" in url:
            return [{"stream_id": 1, "name": "Canal 1", "category_id": "1"}]
        raise AssertionError(url)

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    result = await provider_connector.acquire(_fake_provider_source())

    # Preservado como a fonte declarou — nunca substituído por rótulo externo.
    assert result.classified[0].group == ""


async def test_acquire_xtream_api_channel_with_unknown_category_stays_accessible(
    monkeypatch,
) -> None:
    async def fake_json(url, **kwargs):
        if "action=get_account_info" in url:
            return {"user_info": {"auth": 1, "allowed_output_formats": ["ts"]}}
        if "action=get_live_categories" in url:
            return []  # a categoria referenciada abaixo não está aqui
        if "action=get_live_streams" in url:
            return [{"stream_id": 1, "name": "Canal sem categoria", "category_id": "99"}]
        raise AssertionError(url)

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    result = await provider_connector.acquire(_fake_provider_source())

    assert len(result.classified) == 1
    assert result.classified[0].group is None  # sem vínculo forjado
    assert result.classified[0].provider_category_id == "99"  # id preservado mesmo assim


async def test_acquire_xtream_api_channel_without_stream_id_stays_accessible(monkeypatch) -> None:
    async def fake_json(url, **kwargs):
        if "action=get_account_info" in url:
            return {"user_info": {"auth": 1, "allowed_output_formats": ["ts"]}}
        if "action=get_live_categories" in url:
            return []
        if "action=get_live_streams" in url:
            return [{"name": "Canal sem id"}]  # sem stream_id
        raise AssertionError(url)

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    result = await provider_connector.acquire(_fake_provider_source())

    assert len(result.classified) == 1
    assert result.classified[0].provider_stream_id is None
    assert result.classified[0].url is None  # sem URL inventada sem id


async def test_acquire_xtream_api_empty_stream_list_is_not_a_failure(monkeypatch) -> None:
    async def fake_json(url, **kwargs):
        if "action=get_account_info" in url:
            return {"user_info": {"auth": 1, "allowed_output_formats": ["ts"]}}
        if "action=get_live_categories" in url:
            return []
        if "action=get_live_streams" in url:
            return []
        raise AssertionError(url)

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    result = await provider_connector.acquire(_fake_provider_source())

    assert result.classified == []
    assert result.provider_import_mode == provider_connector.ProviderImportMode.XTREAM_API


async def test_acquire_xtream_api_account_without_allowed_format_leaves_url_absent(
    monkeypatch,
) -> None:
    async def fake_json(url, **kwargs):
        if "action=get_account_info" in url:
            return {"user_info": {"auth": 1}}  # sem allowed_output_formats
        if "action=get_live_categories" in url:
            return []
        if "action=get_live_streams" in url:
            return [{"stream_id": 1, "name": "Canal", "category_id": None}]
        raise AssertionError(url)

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    result = await provider_connector.acquire(_fake_provider_source())

    assert result.provider_allowed_formats is None
    assert result.classified[0].url is None  # nenhum formato assumido (FR-008)


# --- T017 — sequência de tentativas de status de conta (FR-004) ---


async def test_resolve_account_status_falls_through_to_next_action(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_json(url, **kwargs):
        calls.append(url)
        if "action=get_account_info" in url:
            return {"unexpected": "shape"}  # sem user_info — tenta a próxima
        if "action=get_profile" in url:
            return {"user_info": {"auth": 1}}
        return {"unexpected": "shape"}  # tentativa "sem action" (a 2ª)

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    status = await provider_connector._resolve_account_status("http://painel.test", "u", "p")

    assert status.authorized is True
    assert len(calls) == 3  # as 3 formas do contrato, em ordem


async def test_resolve_account_status_incompatible_when_none_usable(monkeypatch) -> None:
    async def fake_json(url, **kwargs):
        return {"unexpected": "shape"}  # nunca tem user_info, nas 3 tentativas

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    with pytest.raises(provider_connector.ProviderIncompatibleError):
        await provider_connector._resolve_account_status("http://painel.test", "u", "p")


# --- T018 — interpretação do resultado: ativa, expirada, não autorizada ---


@pytest.mark.parametrize(
    ("auth_value", "expected"),
    [
        (1, True),
        (0, False),
        (True, True),
        (False, False),
        ("1", True),
        ("true", True),
        ("TRUE", True),
        ("0", False),
        ("false", False),
        (None, False),
        ("qualquer-coisa", False),  # desconhecido nunca vira acesso concedido
        (2, False),
        ([], False),
    ],
)
def test_interpret_auth_variants(auth_value, expected) -> None:
    assert provider_connector._interpret_auth(auth_value) is expected


def test_is_expired_absent_date_is_not_expired() -> None:
    assert provider_connector._is_expired(None) is False
    assert provider_connector._is_expired("") is False
    assert provider_connector._is_expired("0") is False
    assert provider_connector._is_expired(0) is False


def test_is_expired_past_and_future_timestamps() -> None:
    past = str(int(datetime.now(UTC).timestamp()) - 3600)
    future = str(int(datetime.now(UTC).timestamp()) + 3600)
    assert provider_connector._is_expired(past) is True
    assert provider_connector._is_expired(future) is False


def test_is_expired_malformed_value_is_not_expired() -> None:
    # Não trava a importação por um exp_date em formato inesperado — só não
    # trata como expirada sem evidência.
    assert provider_connector._is_expired("nao-e-uma-data") is False


async def test_resolve_account_status_detects_expired_account(monkeypatch) -> None:
    past = str(int(datetime.now(UTC).timestamp()) - 3600)

    async def fake_json(url, **kwargs):
        return {"user_info": {"auth": 1, "exp_date": past, "allowed_output_formats": ["ts"]}}

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    status = await provider_connector._resolve_account_status("http://painel.test", "u", "p")

    assert status.authorized is True
    assert status.expired is True
    assert status.allowed_formats == ["ts"]


async def test_resolve_account_status_detects_unauthorized(monkeypatch) -> None:
    async def fake_json(url, **kwargs):
        return {"user_info": {"auth": 0}}

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    status = await provider_connector._resolve_account_status("http://painel.test", "u", "p")

    assert status.authorized is False
    assert status.expired is False
