import uuid
from pathlib import Path

import httpx

from app.services import importer as importer_module

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SAMPLE_M3U = (FIXTURES_DIR / "sample.m3u").read_text(encoding="utf-8")


async def test_create_source_by_url_and_job_completes(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        assert url == "https://exemplo.test/lista.m3u"
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Minha lista de teste",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 201
    body = response.json()
    source_id = body["source_id"]
    job_id = body["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    assert job_response.status_code == 200
    job_body = job_response.json()
    assert job_body["status"] in ("completed", "completed_with_warnings")
    assert job_body["current_step"] == "done"
    assert job_body["counts"]["entries_read"] == 5
    assert job_body["counts"]["channels"] == 1
    assert job_body["counts"]["movies"] == 1
    assert job_body["counts"]["episodes"] == 2
    assert job_body["counts"]["unclassified"] == 1
    # Nenhuma entrada desaparece silenciosamente (SC-003). `series` não entra
    # na soma: é um agregado (quantas séries distintas), não uma entrada lida.
    counts = job_body["counts"]
    assert (
        counts["channels"] + counts["movies"] + counts["episodes"] + counts["unclassified"]
        == counts["entries_read"]
    )

    items_response = await client.get("/catalog-items", params={"source_id": source_id})
    assert items_response.status_code == 200
    items = items_response.json()["items"]
    assert all(item["published"] for item in items)
    kinds = {item["kind"] for item in items}
    assert kinds == {"channel", "movie", "series", "episode", "unclassified"}


async def test_series_classified_directly_counts_toward_series_total(client, monkeypatch):
    # Achado num catálogo real (310k entradas): grupo "Séries" mas nome sem
    # padrão SxxExx vira Série avulsa — precisa contar em `series` junto com
    # as séries sintetizadas como pai de episódio, não só estas últimas.
    m3u_with_direct_series = (
        "#EXTM3U\n"
        '#EXTINF:-1 group-title="Filmes Acao",Filme Exemplo\n'
        "http://exemplo.test/vod/filme.mp4\n"
        '#EXTINF:-1 group-title="Series Suspense",Serie Sem Padrao De Episodio\n'
        "http://exemplo.test/vod/serie-sem-padrao.mp4\n"
        '#EXTINF:-1 group-title="Series Suspense",Outra Serie S01E01\n'
        "http://exemplo.test/vod/outra-s01e01.mp4\n"
    )

    async def fake_fetch(url, **kwargs):
        return m3u_with_direct_series

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte com serie direta",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = response.json()["import_job_id"]
    source_id = response.json()["source_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    counts = job_response.json()["counts"]
    assert counts["entries_read"] == 3
    assert counts["movies"] == 1
    assert counts["episodes"] == 1
    # 2 series distintas: 1 sintetizada como pai do episodio + 1
    # classificada diretamente (grupo "series", nome sem padrao SxxExx).
    assert counts["series"] == 2

    items_response = await client.get(
        "/catalog-items", params={"source_id": source_id, "kind": "series"}
    )
    assert len(items_response.json()["items"]) == 2


async def test_reusing_request_key_does_not_duplicate(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    request_key = str(uuid.uuid4())
    payload = {
        "type": "m3u_url",
        "display_name": "Fonte reenviada",
        "m3u_url": "https://exemplo.test/lista.m3u",
        "request_key": request_key,
    }

    first = await client.post("/sources", json=payload)
    assert first.status_code == 201

    second = await client.post("/sources", json=payload)
    assert second.status_code == 200
    assert second.json() == first.json()


async def test_invalid_url_never_reports_success(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return "<html><body>erro do provedor</body></html>"

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte invalida",
            "m3u_url": "https://exemplo.test/erro.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 201
    job_id = response.json()["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    job_body = job_response.json()
    assert job_body["status"] == "failed"
    assert job_body["status"] != "completed"
    assert job_body["warnings"]


async def test_empty_playlist_reported_not_as_success(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return "#EXTM3U\n"

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte vazia",
            "m3u_url": "https://exemplo.test/vazia.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = response.json()["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    assert job_response.json()["status"] == "failed"


async def test_missing_display_name_rejected(client):
    response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "   ",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 422


async def test_missing_m3u_url_for_type_rejected(client):
    response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Sem URL",
            "request_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 422


async def test_missing_display_name_rejected_for_provider(client):
    response = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "   ",
            "provider": {"dns": "provedor.test", "username": "usuario", "password": "senha"},
            "request_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 422


async def test_source_failure_does_not_affect_other_source(client, monkeypatch):
    async def fetch_by_url(url, **kwargs):
        if "quebrada" in url:
            raise httpx.ConnectError("falha simulada", request=httpx.Request("GET", url))
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fetch_by_url)

    broken = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte quebrada",
            "m3u_url": "https://exemplo.test/quebrada.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    working = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte saudavel",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )

    broken_job = await client.get(f"/import-jobs/{broken.json()['import_job_id']}")
    assert broken_job.json()["status"] == "failed"

    working_job = await client.get(f"/import-jobs/{working.json()['import_job_id']}")
    assert working_job.json()["status"] in ("completed", "completed_with_warnings")

    working_items = await client.get(
        "/catalog-items", params={"source_id": working.json()["source_id"]}
    )
    assert len(working_items.json()["items"]) > 0


async def test_create_source_by_provider_and_job_completes(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        assert url.startswith("http://provedor.test/get.php?username=usuario&password=")
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor de teste",
            "provider": {"dns": "provedor.test", "username": "usuario", "password": "senha-teste"},
            "request_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 201
    job_id = response.json()["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    job_body = job_response.json()
    assert job_body["status"] in ("completed", "completed_with_warnings")
    assert job_body["counts"]["entries_read"] == 5


async def test_invalid_provider_credentials_specific_error(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return "Invalid username or password"

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor com senha errada",
            "provider": {
                "dns": "provedor.test",
                "username": "usuario",
                "password": "senha-errada",
            },
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = response.json()["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    job_body = job_response.json()
    assert job_body["status"] == "failed"
    assert job_body["warnings"]
    # A senha nunca aparece em nenhuma resposta (FR-014).
    assert "senha-errada" not in str(job_body)


async def test_incompatible_provider_protocol(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        raise httpx.ConnectError("recusado", request=httpx.Request("GET", url))

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor incompativel",
            "provider": {
                "dns": "provedor-incompativel.test",
                "username": "x",
                "password": "y",
            },
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = response.json()["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    job_body = job_response.json()
    assert job_body["status"] == "failed"
    assert job_body["warnings"]


async def test_provider_http_error_does_not_leak_password_in_url(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        assert "senha-secreta" in url  # confirma que a senha realmente estaria embutida na URL
        request = httpx.Request("GET", url)
        response = httpx.Response(403, request=request)
        raise httpx.HTTPStatusError("Forbidden", request=request, response=response)

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor bloqueado",
            "provider": {
                "dns": "provedor.test",
                "username": "usuario",
                "password": "senha-secreta",
            },
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = response.json()["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    job_body = job_response.json()
    assert job_body["status"] == "failed"
    # httpx.HTTPStatusError embute a URL completa na mensagem — a senha não
    # pode vazar pra warnings/resposta HTTP mesmo assim (FR-014).
    assert "senha-secreta" not in str(job_body)


async def test_list_sources_returns_valid_shape(client):
    # Banco de teste não é isolado por caso (ver outros testes deste arquivo,
    # todos filtram pelo id retornado) — não dá pra assumir lista vazia aqui.
    response = await client.get("/sources")
    assert response.status_code == 200
    assert isinstance(response.json()["sources"], list)


async def test_list_sources_returns_created_source_without_secrets(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Lista da Home",
            "provider": {"dns": "provedor.test", "username": "usuario", "password": "senha-oculta"},
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    response = await client.get("/sources")
    assert response.status_code == 200
    sources = response.json()["sources"]
    matching = [s for s in sources if s["id"] == source_id]
    assert len(matching) == 1
    assert matching[0]["display_name"] == "Lista da Home"
    assert matching[0]["connection_state"] == "synced"
    assert matching[0]["last_successful_sync_at"] is not None
    assert "senha-oculta" not in str(sources)


async def test_delete_source_removes_it_and_its_catalog_items(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte a remover",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    delete_response = await client.delete(f"/sources/{source_id}")
    assert delete_response.status_code == 204

    items_response = await client.get("/catalog-items", params={"source_id": source_id})
    assert items_response.json()["items"] == []

    sources_response = await client.get("/sources")
    remaining_ids = {s["id"] for s in sources_response.json()["sources"]}
    assert source_id not in remaining_ids


async def test_delete_unknown_source_returns_404(client):
    response = await client.delete(f"/sources/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_resync_source_creates_new_job_and_updates_catalog(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte a ressincronizar",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]
    first_job_id = created.json()["import_job_id"]

    resync_response = await client.post(f"/sources/{source_id}/resync")
    assert resync_response.status_code == 200
    body = resync_response.json()
    assert body["source_id"] == source_id
    assert body["import_job_id"] != first_job_id

    job_response = await client.get(f"/import-jobs/{body['import_job_id']}")
    assert job_response.json()["status"] in ("completed", "completed_with_warnings")


async def test_resync_unknown_source_returns_404(client):
    response = await client.post(f"/sources/{uuid.uuid4()}/resync")
    assert response.status_code == 404


async def test_m3u_url_http_error_does_not_leak_credentials_in_url(client, monkeypatch):
    secret_url = "https://exemplo.test/get.php?username=usuario&password=senha-secreta"

    async def fake_fetch(url, **kwargs):
        request = httpx.Request("GET", url)
        response = httpx.Response(404, request=request)
        raise httpx.HTTPStatusError("Not Found", request=request, response=response)

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte com credenciais na URL",
            "m3u_url": secret_url,
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = response.json()["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    job_body = job_response.json()
    assert job_body["status"] == "failed"
    assert "senha-secreta" not in str(job_body)
