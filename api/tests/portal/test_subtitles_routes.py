"""090: rotas de legenda com autenticação, licença e limitador reais (constitution 1.16.0 (k)). Exige o emulador
Firestore (`PORTAL_TEST_FIRESTORE=1`). Fornecedores falsos: nenhuma rede real, nenhuma chave real."""

import logging
from datetime import timedelta

import httpx

from app.portal.application import create_app
from app.portal.licensing import LicensingService
from app.portal.recovery_journal import MemoryJournal
from app.portal.settings import PortalSettings
from app.portal.subtitle_files import SubtitleHit
from app.portal.subtitles import SubtitleService
from tests.portal.test_auth import ORIGIN, seeded
from tests.portal.test_crypto import make_crypto
from tests.portal.test_licensing import cleanup_licenses

MARKER = "titulo-pesquisado-090-marcador"


class Provider:
    def __init__(self, name):
        self.name = name
        self.queries = []

    async def search(self, query):
        self.queries.append(query)
        prefix = "os:1" if self.name == "opensubtitles" else "sd:1-2"
        return [SubtitleHit(id=prefix, provider=self.name, language=query.language, release="Versao",
                            hearing_impaired=False, downloads=3 if self.name == "opensubtitles" else None)]

    async def download(self, _provider_id, _query):
        return "1\n00:00:01,000 --> 00:00:02,000\nOlá\n"


def remember_limits(control, auth, device_id):
    control[1].extend("rateLimits/" + auth.tokens.digest("rate_limit", scope + "/" + device_id)
                      for scope in ("subtitles-search", "subtitles-download"))


async def test_search_and_download_need_tv_bearer_valid_access_and_stay_within_limits(control, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    auth, device, bearer, _, now = await seeded(control)
    principal = await auth.authenticate_tv(bearer)
    remember_limits(control, auth, device.device_id)
    licensing = LicensingService(auth, make_crypto(), MemoryJournal(environment="test"))
    providers = {"opensubtitles": Provider("opensubtitles"), "subdl": Provider("subdl")}
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_subtitles = SubtitleService(auth, licensing, providers, downloads_per_day=2, searches_per_hour=3)
    try:
        # A TV de teste nasce dentro do teste de 7 dias: tem acesso; a leitura não grava nada no dispositivo.
        assert await licensing.has_access(principal, now)
        assert not await licensing.has_access(principal, now + timedelta(days=8))
        row = (await control[0].client.document("devices/" + device.device_id).get()).to_dict()
        assert row.get("trialStartedAt") is None and row.get("entitlementGeneration", 0) == device.entitlement_generation

        tv = {"origin": "null", "authorization": "Bearer " + bearer}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
            search = "/portal/v1/device/subtitles/search"
            # Sem bearer, ou vindo do navegador: recusa.
            assert (await client.post(search, headers={"origin": "null"}, json={"language": "en", "tmdbId": 1})).status_code == 401
            assert (await client.post(search, headers={**tv, "origin": ORIGIN}, json={"language": "en", "tmdbId": 1})).status_code == 403
            # Forma fechada: mistura de formas, campo extra e dado IPTV são recusados.
            for body in ({"language": "en", "tmdbId": 1, "query": "x"}, {"language": "en", "parentTmdbId": 1},
                         {"language": "fr", "tmdbId": 1}, {"language": "en", "tmdbId": 1, "url": "http://iptv/x.ts"},
                         {"language": "en", "query": MARKER, "providers": ["subdl", "subdl"]}):
                assert (await client.post(search, headers=tv, json=body)).status_code == 422
            ok = await client.post(search, headers=tv, json={"language": "pt-BR", "query": MARKER, "year": 1999})
            assert ok.status_code == 200 and ok.headers["cache-control"] == "no-store"
            assert [row["id"] for row in ok.json()["results"]] == ["os:1", "sd:1-2"] and ok.json()["unavailable"] == []
            only = await client.post(search, headers=tv, json={"language": "en", "tmdbId": 5, "providers": ["subdl"]})
            assert [row["provider"] for row in only.json()["results"]] == ["subdl"]
            # Anti-abuso de busca (3/h neste teste).
            codes = [(await client.post(search, headers=tv, json={"language": "en", "tmdbId": 2})).status_code for _ in range(3)]
            assert 429 in codes

            download = "/portal/v1/device/subtitles/download"
            assert (await client.post(download, headers=tv, json={"id": "https://x", "language": "en"})).status_code == 422
            got = await client.post(download, headers=tv, json={"id": "sd:1-2", "language": "en", "season": 1, "episode": 2})
            assert got.status_code == 200 and "Olá" in got.json()["text"]
            assert (await client.post(download, headers=tv, json={"id": "os:1", "language": "en"})).status_code == 200
            limited = await client.post(download, headers=tv, json={"id": "os:1", "language": "en"})
            assert limited.status_code == 429 and limited.json()["code"] == "subtitles_device_limit"
            assert int(limited.headers["retry-after"]) > 0
        assert MARKER not in caplog.text
    finally:
        await cleanup_licenses(control, device.device_id)

