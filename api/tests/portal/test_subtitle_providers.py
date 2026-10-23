"""090: adaptadores OpenSubtitles/SubDL, extração do ZIP e junção dos fornecedores — sem rede real e sem emulador.

Fornecedores por `httpx.MockTransport` com as fixtures sintéticas de `sdd/specs/090-legendas-externas/fixtures/`
(D-015: as mesmas amostras servem ao cliente direto da TV). Nenhuma resposta real nem texto real de legenda."""

import io
import json
import logging
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from app.portal.auth import AuthError
from app.portal.providers.opensubtitles import OpenSubtitlesProvider
from app.portal.providers.opensubtitles import search_params as os_params
from app.portal.providers.subdl import SubdlProvider
from app.portal.providers.subdl import search_params as sd_params
from app.portal.rate_limit import RateDecision
from app.portal.subtitle_files import (
    SearchQuery,
    SubtitleHit,
    SubtitleProviderError,
    decode_text,
    extract_subtitle,
)
from app.portal.subtitles import SubtitleService

FIXTURES = Path(__file__).resolve().parents[3] / "sdd" / "specs" / "090-legendas-externas" / "fixtures"
OS_KEY = "chave-padrao-opensubtitles-090"
SD_KEY = "chave-padrao-subdl-090"
SRT = "1\n00:00:01,000 --> 00:00:02,000\nOlá, ação!\n".encode()


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def zip_of(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buffer.getvalue()


async def no_sleep(_seconds: float) -> None:
    return None


def client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# --- arquivo e ZIP -------------------------------------------------------------------------------------------------

def test_decode_text_utf8_bom_cp1252_and_unreadable():
    assert decode_text("﻿Olá".encode()) == "Olá"
    assert decode_text("ação".encode("cp1252")) == "ação"
    with pytest.raises(SubtitleProviderError):
        decode_text(b"   ")
    with pytest.raises(SubtitleProviderError):
        decode_text(b"x" * (1024 * 1024 + 1))


def test_zip_movie_pack_and_refusals():
    assert extract_subtitle(zip_of({"pasta/filme.srt": SRT})) == SRT
    # Vários arquivos sem episódio pedido: o maior.
    assert extract_subtitle(zip_of({"a.srt": b"x", "b.srt": SRT})) == SRT
    pack = zip_of({f"Serie.S01E0{n}.srt": f"ep{n}".encode() for n in (1, 2, 3)} | {"leia.txt": b"x"})
    assert extract_subtitle(pack, season=1, episode=2) == b"ep2"
    assert extract_subtitle(zip_of({"Serie 1x03.vtt": b"e3", "Serie 1x13.vtt": b"e13"}), season=1, episode=3) == b"e3"
    for data, season, episode in (
        (pack, 1, 7),                                   # pacote sem o episódio
        (zip_of({"so.ass": b"x"}), None, None),          # só formato não aceito
        (b"isto nao e zip", None, None),
        (zip_of({f"{n}.srt": b"x" for n in range(60)}), None, None),  # entradas demais
        (zip_of({"grande.srt": b"0" * (1024 * 1024 + 10)}), None, None),  # bomba/arquivo grande demais
    ):
        with pytest.raises(SubtitleProviderError) as error:
            extract_subtitle(data, season=season, episode=episode)
        assert error.value.kind == "unreadable"
    # Caminho com `../` nunca é usado como caminho: só o nome-base conta, em memória.
    assert extract_subtitle(zip_of({"../../fora/evil.srt": SRT})) == SRT


# --- OpenSubtitles -------------------------------------------------------------------------------------------------

def test_opensubtitles_params_by_form():
    assert os_params(SearchQuery("pt-BR", tmdb_id=603)) == {"languages": "pt-br", "tmdb_id": "603"}
    assert os_params(SearchQuery("en", parent_tmdb_id=1396, season=1, episode=2)) == {
        "episode_number": "2", "languages": "en", "parent_tmdb_id": "1396", "season_number": "1"}
    assert list(os_params(SearchQuery("es", query="Matrix", year=1999))) == ["languages", "query", "year"]


async def test_opensubtitles_search_normalizes_orders_and_hides_the_key():
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, json=fixture("opensubtitles-search.json"))
    provider = OpenSubtitlesProvider(SecretStr(OS_KEY), client=client(handler), sleep=no_sleep)
    hits = await provider.search(SearchQuery("pt-BR", tmdb_id=1))
    assert [hit.id for hit in hits] == ["os:1002", "os:1001"]
    assert hits[0].release == "filme.1080p.srt" and hits[0].hearing_impaired and hits[0].downloads == 900
    assert seen[0].headers["Api-Key"] == OS_KEY and seen[0].url.host == "api.opensubtitles.com"
    assert all(OS_KEY not in json.dumps(hit.view()) for hit in hits)


async def test_opensubtitles_download_follows_only_provider_hosts_and_maps_limits():
    def handler(request: httpx.Request):
        if request.url.path.endswith("/download"):
            return httpx.Response(200, json={"link": "https://www.opensubtitles.com/download/abc/file.srt", "remaining": 0})
        if request.url.host == "www.opensubtitles.com":
            return httpx.Response(302, headers={"location": "https://dl.opensubtitles.org/x.srt"})
        return httpx.Response(200, content=SRT)
    provider = OpenSubtitlesProvider(SecretStr(OS_KEY), client=client(handler), sleep=no_sleep)
    # `remaining: 0` num sucesso não é limite.
    assert await provider.download("1001", SearchQuery("pt-BR")) == SRT.decode()

    def evil(request: httpx.Request):
        if request.url.path.endswith("/download"):
            return httpx.Response(200, json={"link": "https://evil.example/x.srt"})
        return httpx.Response(200, content=SRT)
    with pytest.raises(SubtitleProviderError) as error:
        await OpenSubtitlesProvider(SecretStr(OS_KEY), client=client(evil)).download("1", SearchQuery("en"))
    assert error.value.kind == "unavailable"

    calls = []

    def limited(request: httpx.Request):
        calls.append(request)
        return httpx.Response(406, json={"remaining": 0, "message": "quota"})
    with pytest.raises(SubtitleProviderError) as error:
        await OpenSubtitlesProvider(SecretStr(OS_KEY), client=client(limited)).download("1", SearchQuery("en"))
    assert error.value.kind == "limit"

    retried = []

    def busy(request: httpx.Request):
        retried.append(request)
        return httpx.Response(429, headers={"retry-after": "1"})
    with pytest.raises(SubtitleProviderError) as error:
        await OpenSubtitlesProvider(SecretStr(OS_KEY), client=client(busy), sleep=no_sleep).search(SearchQuery("en", tmdb_id=1))
    assert error.value.kind == "limit" and len(retried) == 2  # uma nova tentativa, só


# --- SubDL ---------------------------------------------------------------------------------------------------------

def test_subdl_params_by_form():
    assert sd_params(SearchQuery("pt-BR", tmdb_id=603)) == {
        "subs_per_page": "30", "languages": "BR_PT", "tmdb_id": "603", "type": "movie"}
    assert sd_params(SearchQuery("en", parent_tmdb_id=1396, season=1, episode=2)) == {
        "subs_per_page": "30", "languages": "EN", "tmdb_id": "1396", "type": "tv", "season_number": "1", "episode_number": "2"}
    assert sd_params(SearchQuery("es", query="Matrix", year=1999))["film_name"] == "Matrix"


async def test_subdl_episode_search_keeps_exact_then_packs_and_drops_the_key_url():
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, json=fixture("subdl-search-episode.json"))
    provider = SubdlProvider(SecretStr(SD_KEY), client=client(handler), sleep=no_sleep)
    hits = await provider.search(SearchQuery("en", parent_tmdb_id=99, season=1, episode=2))
    assert [(hit.id, hit.season_pack) for hit in hits] == [("sd:111-222", False), ("sd:333-444", True), ("sd:999-111", True)]
    assert seen[0].url.params["api_key"] == SD_KEY and seen[0].url.host == "api.subdl.com"
    serialized = json.dumps([hit.view() for hit in hits])
    assert "api_key" not in serialized and "CHAVE_FICTICIA" not in serialized and "http" not in serialized
    assert "downloads" not in serialized


async def test_subdl_status_false_not_found_is_empty_quota_is_limit():
    def not_found(_request):
        return httpx.Response(200, json={"status": False, "error": "can't find movie or tv"})
    assert await SubdlProvider(SecretStr(SD_KEY), client=client(not_found)).search(SearchQuery("en", tmdb_id=1)) == []

    def quota(_request):
        return httpx.Response(200, json={"status": False, "error": "Daily request quota exceeded."})
    with pytest.raises(SubtitleProviderError) as error:
        await SubdlProvider(SecretStr(SD_KEY), client=client(quota)).search(SearchQuery("en", tmdb_id=1))
    assert error.value.kind == "limit"


async def test_subdl_download_rebuilds_the_url_and_picks_the_episode_from_the_pack():
    seen = []
    pack = zip_of({"Serie.S01E01.srt": b"um", "Serie.S01E02.srt": SRT})

    def handler(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, content=pack, headers={"content-type": "application/zip"})
    provider = SubdlProvider(SecretStr(SD_KEY), client=client(handler), sleep=no_sleep)
    assert await provider.download("333-444", SearchQuery("en", season=1, episode=2)) == SRT.decode()
    assert seen[0].url.host == "dl.subdl.com" and seen[0].url.path == "/subtitle/333-444.zip"
    with pytest.raises(SubtitleProviderError):
        await provider.download("../../etc", SearchQuery("en"))


# --- junção no serviço (limitador e licença falsos) ------------------------------------------------------------------

class FakeLimits:
    def __init__(self, allowed: bool = True):
        self.allowed = allowed
        self.calls: list[bool] = []

    async def evaluate(self, _rules, _now, *, consume):
        self.calls.append(consume)
        return RateDecision(self.allowed, 0 if self.allowed else 600)


class FakeTokens:
    def digest(self, _purpose, value):
        return ("0" * 64 + str(abs(hash(value))))[-64:]


class FakeAuth:
    def __init__(self, limits: FakeLimits):
        self.limits = limits
        self.tokens = FakeTokens()


class FakeAccess:
    def __init__(self, allowed=True):
        self.allowed = allowed

    async def has_access(self, _principal, _now):
        return self.allowed


class FakeProvider:
    def __init__(self, name, hits=None, error=None, text="SRT"):
        self.name, self.hits, self.error, self.text = name, hits or [], error, text
        self.downloads = 0

    async def search(self, _query):
        if self.error:
            raise self.error
        return self.hits

    async def download(self, _provider_id, _query):
        self.downloads += 1
        if self.error:
            raise self.error
        return self.text


class Principal:
    device_id = "tv-1"


def hit(id_, provider, downloads=None):
    return SubtitleHit(id=id_, provider=provider, language="en", release=id_, hearing_impaired=False, downloads=downloads)


def service(providers, *, access=True, limits=None):
    return SubtitleService(FakeAuth(limits or FakeLimits()), FakeAccess(access), {p.name: p for p in providers},
                           downloads_per_day=10, searches_per_hour=60)


NOW = datetime(2026, 10, 22, tzinfo=UTC)


async def test_merge_order_partial_and_total_failure():
    os_ = FakeProvider("opensubtitles", [hit("os:2", "opensubtitles", 5), hit("os:1", "opensubtitles", 1)])
    sd = FakeProvider("subdl", [hit("sd:1-2", "subdl")])
    result = await service([sd, os_]).search(Principal(), SearchQuery("en", tmdb_id=1), None, NOW)
    assert [row["id"] for row in result["results"]] == ["os:2", "os:1", "sd:1-2"] and result["unavailable"] == []

    down = FakeProvider("subdl", error=SubtitleProviderError("unavailable"))
    partial = await service([os_, down]).search(Principal(), SearchQuery("en", tmdb_id=1), None, NOW)
    assert partial["unavailable"] == ["subdl"] and len(partial["results"]) == 2

    only_subdl = await service([os_, sd]).search(Principal(), SearchQuery("en", tmdb_id=1), {"subdl"}, NOW)
    assert [row["provider"] for row in only_subdl["results"]] == ["subdl"]

    limited = FakeProvider("opensubtitles", error=SubtitleProviderError("limit"))
    with pytest.raises(AuthError) as error:
        await service([limited, down]).search(Principal(), SearchQuery("en", tmdb_id=1), None, NOW)
    assert (error.value.code, error.value.status) == ("subtitles_provider_limit", 503)


async def test_access_and_limits():
    provider = FakeProvider("opensubtitles", [hit("os:1", "opensubtitles", 1)])
    with pytest.raises(AuthError) as error:
        await service([provider], access=False).search(Principal(), SearchQuery("en", tmdb_id=1), None, NOW)
    assert (error.value.code, error.value.status) == ("subtitles_not_entitled", 409)

    with pytest.raises(AuthError) as error:
        await service([provider], limits=FakeLimits(False)).search(Principal(), SearchQuery("en", tmdb_id=1), None, NOW)
    assert (error.value.code, error.value.status, error.value.retry_after) == ("rate_limited", 429, 600)

    with pytest.raises(AuthError) as error:
        await service([provider], limits=FakeLimits(False)).download(Principal(), "os:1", SearchQuery("en"), NOW)
    assert error.value.code == "subtitles_device_limit" and provider.downloads == 0

    # Falha do fornecedor não consome a cota: só a conferência (consume=False) acontece.
    limits = FakeLimits()
    broken = FakeProvider("subdl", error=SubtitleProviderError("unreadable"))
    with pytest.raises(AuthError) as error:
        await service([broken], limits=limits).download(Principal(), "sd:1-2", SearchQuery("en"), NOW)
    assert error.value.code == "subtitles_unreadable" and limits.calls == [False]

    limits = FakeLimits()
    assert await service([provider], limits=limits).download(Principal(), "os:1", SearchQuery("en"), NOW) == "SRT"
    assert limits.calls == [False, True]

    with pytest.raises(AuthError) as error:
        await service([provider]).download(Principal(), "sd:1-2", SearchQuery("en"), NOW)  # fornecedor sem chave
    assert error.value.code == "service_unavailable"


async def test_no_key_or_url_in_logs(caplog):
    caplog.set_level(logging.DEBUG)

    def handler(_request):
        return httpx.Response(200, json=fixture("subdl-search-episode.json"))
    await SubdlProvider(SecretStr(SD_KEY), client=client(handler)).search(SearchQuery("en", parent_tmdb_id=99, season=1, episode=2))
    with pytest.raises(SubtitleProviderError):
        await OpenSubtitlesProvider(SecretStr(OS_KEY), client=client(lambda _r: httpx.Response(500))).search(
            SearchQuery("en", tmdb_id=1))
    # O httpx registra a URL (com a chave do SubDL na query): o filtro mascara antes de sair (R-018).
    assert "api_key=<redacted>" in caplog.text
    assert SD_KEY not in caplog.text and OS_KEY not in caplog.text and "CHAVE_FICTICIA" not in caplog.text
