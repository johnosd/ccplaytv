import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
from sqlalchemy import select

from app.db import get_session_factory
from app.models.catalog_item import CatalogItem, CatalogItemKind
from app.models.import_job import ImportJob, ImportJobStatus
from app.models.source import Source
from app.schemas.source import CreateSourceRequest, ProviderCredentialsIn
from app.services import importer as importer_module
from app.services import provider_connector
from app.services.classifier import ClassifiedEntry

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
    # Feature 004: fonte de provedor tenta o protocolo JSON primeiro. Aqui o
    # painel simulado não fala nenhuma das 3 ações (falha de conexão em
    # todas) — o conector cai no fallback M3U (FR-010), que é o caminho que
    # este teste sempre exerceu. O caminho JSON com sucesso tem teste
    # próprio em `test_provider_connector.py` e no cenário de
    # `test_create_provider_source_via_xtream_api_preserves_categories_and_ids`.
    async def fake_json_unavailable(url, **kwargs):
        raise httpx.ConnectError("painel simulado sem protocolo JSON", request=httpx.Request("GET", url))

    async def fake_fetch(url, **kwargs):
        assert url.startswith("http://provedor.test/get.php?username=usuario&password=")
        return SAMPLE_M3U

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json_unavailable)
    monkeypatch.setattr(provider_connector, "fetch_text_ssrf_safe", fake_fetch)

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
    # Feature 004: a validação primária de credencial agora vem do campo
    # `auth` da resposta JSON de status de conta (FR-005), não mais de
    # inspecionar o texto de uma resposta M3U.
    async def fake_json(url, **kwargs):
        return {"user_info": {"auth": 0}}

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

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
    # Painel completamente inalcançável nos dois protocolos — nem o JSON nem
    # o fallback M3U respondem (D-005: sem varredura, só as tentativas do
    # contrato + o fallback único).
    async def fake_fetch(url, **kwargs):
        raise httpx.ConnectError("recusado", request=httpx.Request("GET", url))

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_fetch)
    monkeypatch.setattr(provider_connector, "fetch_text_ssrf_safe", fake_fetch)

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
    # Feature 004: um 403 na consulta de status de conta (endpoint existe e
    # respondeu) vira ProviderAuthError direto, sem tentar o fallback M3U —
    # é justamente esse o ponto onde a senha embutida na URL não pode vazar.
    async def fake_json(url, **kwargs):
        assert "senha-secreta" in url  # confirma que a senha realmente estaria embutida na URL
        request = httpx.Request("GET", url)
        response = httpx.Response(403, request=request)
        raise httpx.HTTPStatusError("Forbidden", request=request, response=response)

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

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
    async def fake_json_unavailable(url, **kwargs):
        raise httpx.ConnectError("painel simulado sem protocolo JSON", request=httpx.Request("GET", url))

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json_unavailable)
    monkeypatch.setattr(provider_connector, "fetch_text_ssrf_safe", fake_fetch)

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


# --- Feature 004, Fase 2 (Foundational) — publicação em duas fases (D-002) ---
# Regressão do R-001: até 17/09/2026 a importação nunca removia o catálogo
# de um job anterior, então ressincronizar duplicava a fonte inteira.


async def test_resync_does_not_duplicate_catalog_items(client, monkeypatch):
    """T004 — a correção central: resync não pode mais dobrar a contagem."""

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte para resync sem duplicar",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    first = await client.get("/catalog-items", params={"source_id": source_id})
    first_count = len(first.json()["items"])
    assert first_count > 0

    resync_response = await client.post(f"/sources/{source_id}/resync")
    assert resync_response.status_code == 200
    resynced_job = await client.get(f"/import-jobs/{resync_response.json()['import_job_id']}")
    assert resynced_job.json()["status"] in ("completed", "completed_with_warnings")

    second = await client.get("/catalog-items", params={"source_id": source_id})
    second_count = len(second.json()["items"])

    assert second_count == first_count  # não dobrou — R-001 morto.


async def test_catalog_stays_readable_while_new_import_not_yet_published(client, monkeypatch):
    """T005 — o catálogo anterior (ADR-004 §6) continua sendo o que a leitura
    vê enquanto um job novo ainda não publicou (`published=False`). A
    garantia é estrutural (filtro por flag), não uma corrida de timing."""

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte com importacao em andamento",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = uuid.UUID(created.json()["source_id"])

    before = await client.get("/catalog-items", params={"source_id": str(source_id)})
    before_names = {item["name"] for item in before.json()["items"]}
    assert before_names

    # Simula um job "em andamento": persiste um item diretamente, sem passar
    # pelo caminho que publica (D-002) — equivalente a pausar a importação
    # no meio de um lote, sem depender de nenhum truque de concorrência.
    session_factory = get_session_factory()
    async with session_factory() as session:
        source = await session.get(Source, source_id)
        in_progress_job = await importer_module.create_resync_job(session, source_id)
        entry = ClassifiedEntry(
            kind=CatalogItemKind.CHANNEL,
            name="Canal em andamento",
            original_name="Canal em andamento",
            group=None,
            url="http://exemplo.test/em-andamento.ts",
        )
        await importer_module._persist_entry(session, in_progress_job, source, entry, {})
        await session.commit()

    during = await client.get("/catalog-items", params={"source_id": str(source_id)})
    during_names = {item["name"] for item in during.json()["items"]}

    assert during_names == before_names
    assert "Canal em andamento" not in during_names


async def test_failed_resync_preserves_previous_catalog_and_sync_mark(client, monkeypatch):
    """T006 — job que falha no meio preserva o catálogo anterior (FR-013),
    não avança `last_successful_sync_at` (FR-023), e não deixa lixo
    despublicado no banco — nunca catálogo parcial (FR-019)."""

    async def fake_fetch_ok(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch_ok)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte que falha no resync",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    before_items = (await client.get("/catalog-items", params={"source_id": source_id})).json()[
        "items"
    ]
    before_sync_at = next(
        s["last_successful_sync_at"]
        for s in (await client.get("/sources")).json()["sources"]
        if s["id"] == source_id
    )
    assert before_items
    assert before_sync_at is not None

    async def fake_fetch_fail(url, **kwargs):
        raise httpx.ConnectError("falha simulada", request=httpx.Request("GET", url))

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch_fail)

    resync_response = await client.post(f"/sources/{source_id}/resync")
    assert resync_response.status_code == 200
    failed_job_id = resync_response.json()["import_job_id"]
    failed_job = await client.get(f"/import-jobs/{failed_job_id}")
    assert failed_job.json()["status"] == "failed"

    after_items = (await client.get("/catalog-items", params={"source_id": source_id})).json()[
        "items"
    ]
    after_sync_at = next(
        s["last_successful_sync_at"]
        for s in (await client.get("/sources")).json()["sources"]
        if s["id"] == source_id
    )

    assert {i["id"] for i in after_items} == {i["id"] for i in before_items}
    assert after_sync_at == before_sync_at

    # Sem lixo despublicado do job falho: contagem TOTAL (sem filtro de
    # published) na tabela, para esta fonte, bate com o que está visível.
    session_factory = get_session_factory()
    async with session_factory() as session:
        total = (
            await session.execute(
                select(CatalogItem).where(CatalogItem.source_id == uuid.UUID(source_id))
            )
        ).scalars().all()
    assert len(total) == len(after_items)


# --- Feature 004, Fase 3 (US1) — conector fala o protocolo JSON do painel ---


async def test_create_provider_source_via_xtream_api_preserves_categories_and_ids(
    client, monkeypatch
):
    """T013-T016 ponta a ponta: categorias e identidade do provedor chegam
    ao catálogo, e a reprodução continua funcionando (SC-006) com o formato
    TS que a conta declarou permitir."""

    async def fake_json(url, **kwargs):
        if "action=get_account_info" in url:
            return {"user_info": {"auth": 1, "allowed_output_formats": ["hls", "ts"]}}
        if "action=get_live_categories" in url:
            return [
                {"category_id": "10", "category_name": "Esportes"},
                {"category_id": "20", "category_name": "Filmes 24h"},
            ]
        if "action=get_live_streams" in url:
            return [
                {"stream_id": 501, "name": "ESPN HD", "category_id": "10"},
                {"stream_id": 502, "name": "Telecine", "category_id": "20"},
            ]
        raise AssertionError(f"URL inesperada: {url}")

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    response = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor com protocolo JSON",
            "provider": {"dns": "painel.test", "username": "usuario", "password": "senha-teste"},
            "request_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 201
    source_id = response.json()["source_id"]
    job_id = response.json()["import_job_id"]

    job_body = (await client.get(f"/import-jobs/{job_id}")).json()
    assert job_body["status"] in ("completed", "completed_with_warnings")
    assert job_body["counts"]["channels"] == 2

    items = (await client.get("/catalog-items", params={"source_id": source_id})).json()["items"]
    # Categorias do provedor, não texto derivado de M3U (SC-001).
    assert [i["original_group"] for i in items] == ["Esportes", "Filmes 24h"]

    # Reprodução continua funcionando, com o formato TS preferido — nenhuma
    # regressão da feature 003 (SC-006).
    playback = await client.get(f"/catalog-items/{items[0]['id']}/playback")
    assert playback.status_code == 200
    assert playback.json()["url"].endswith(".ts")
    assert playback.json()["container_hint"] == "ts"

    # A fonte fica marcada como migrada e com os formatos que a conta
    # permite — base do que a Fase 6 (frescor) vai consumir.
    session_factory = get_session_factory()
    async with session_factory() as session:
        source = await session.get(Source, uuid.UUID(source_id))
    assert source.provider_import_mode.value == "xtream_api"
    assert source.provider_allowed_formats == ["hls", "ts"]
    assert source.provider_migrated_at is not None


# --- Feature 004, Fase 4 (US2) — estado da conta refletido na fonte ---


async def test_provider_auth_failure_sets_error_state_without_advancing_sync(client, monkeypatch):
    """T019 — FR-016: o app não pode exibir "sincronizada" para uma conta
    que acabou de ser recusada."""

    async def fake_json(url, **kwargs):
        return {"user_info": {"auth": 0}}

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)

    created = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor com credencial invalida (T019)",
            "provider": {"dns": "painel.test", "username": "usuario", "password": "senha-errada"},
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    sources = (await client.get("/sources")).json()["sources"]
    matching = next(s for s in sources if s["id"] == source_id)
    assert matching["connection_state"] == "error"
    assert matching["last_successful_sync_at"] is None


async def test_provider_error_messages_never_include_username_or_endpoint_path(
    client, monkeypatch
):
    """T020 — nenhuma mensagem de erro do caminho de provedor expõe usuário,
    senha, ou a URL interna do protocolo (FR-018, SC-007)."""

    async def fake_json(url, **kwargs):
        raise httpx.ConnectError("recusado", request=httpx.Request("GET", url))

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json)
    monkeypatch.setattr(provider_connector, "fetch_text_ssrf_safe", fake_json)

    response = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor para checar sanitizacao",
            "provider": {
                "dns": "painel-sigiloso.test",
                "username": "usuario-unico-de-teste",
                "password": "senha-unica-de-teste",
            },
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = response.json()["import_job_id"]

    job_body = (await client.get(f"/import-jobs/{job_id}")).json()
    assert job_body["status"] == "failed"
    body_text = str(job_body)
    assert "senha-unica-de-teste" not in body_text
    assert "usuario-unico-de-teste" not in body_text
    assert "player_api.php" not in body_text  # sem vestígio da URL construída


# --- Feature 004, Fase 5 (US3) — modo limitado ---


async def test_incompatible_panel_falls_back_and_is_marked_legacy_m3u(client, monkeypatch):
    """T023 — painel que não fala o protocolo cai no caminho M3U existente,
    e a fonte fica marcada como modo limitado (FR-010) — não como erro."""

    async def fake_json_unavailable(url, **kwargs):
        raise httpx.ConnectError("painel simulado sem protocolo JSON", request=httpx.Request("GET", url))

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json_unavailable)
    monkeypatch.setattr(provider_connector, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor em modo limitado (T023)",
            "provider": {"dns": "painel-limitado.test", "username": "u", "password": "p"},
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]
    job_id = created.json()["import_job_id"]

    job_body = (await client.get(f"/import-jobs/{job_id}")).json()
    assert job_body["status"] in ("completed", "completed_with_warnings")

    sources = (await client.get("/sources")).json()["sources"]
    matching = next(s for s in sources if s["id"] == source_id)
    assert matching["provider_import_mode"] == "legacy_m3u"
    assert matching["connection_state"] == "synced"  # modo limitado não é erro (D-008)


async def test_incompatible_panel_detection_does_not_scan_paths(client, monkeypatch):
    """T024 — uma tentativa decide (D-005; ADR-004 §3): as 3 ações de status
    + o fallback M3U, nada além disso."""
    calls: list[str] = []

    async def fake_json_unavailable(url, **kwargs):
        calls.append(url)
        raise httpx.ConnectError("recusado", request=httpx.Request("GET", url))

    async def fake_fetch(url, **kwargs):
        calls.append(url)
        return SAMPLE_M3U

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json_unavailable)
    monkeypatch.setattr(provider_connector, "fetch_text_ssrf_safe", fake_fetch)

    await client.post(
        "/sources",
        json={
            "type": "provider_credentials",
            "display_name": "Provedor para checar ausencia de varredura",
            "provider": {"dns": "painel-sem-varredura.test", "username": "u", "password": "p"},
            "request_key": str(uuid.uuid4()),
        },
    )

    # 3 tentativas de status de conta (get_account_info / sem action /
    # get_profile) + 1 requisição do fallback M3U — nunca mais que isso.
    assert len(calls) == 4


# --- Feature 004, Fase 6 (US4/US5) — migração única e atualização por idade ---


async def test_open_migrates_provider_source_once(client, monkeypatch):
    """T029 — abrir fonte de provedor não migrada dispara a migração; abrir
    de novo (já migrada, fresca) não dispara nada (FR-012, FR-014, SC-009)."""

    async def fake_json_unavailable(url, **kwargs):
        raise httpx.ConnectError("sem protocolo json", request=httpx.Request("GET", url))

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(provider_connector, "fetch_json_ssrf_safe", fake_json_unavailable)
    monkeypatch.setattr(provider_connector, "fetch_text_ssrf_safe", fake_fetch)

    # Cria a fonte sem rodar a importação inicial — equivalente a uma fonte
    # antiga, de antes desta feature, com provider_migrated_at nulo (é
    # exatamente o estado das 72 fontes reais no banco de desenvolvimento).
    session_factory = get_session_factory()
    async with session_factory() as session:
        payload = CreateSourceRequest(
            type="provider_credentials",
            display_name="Fonte antiga nao migrada",
            provider=ProviderCredentialsIn(dns="painel.test", username="u", password="p"),
            request_key=str(uuid.uuid4()),
        )
        job, created = await importer_module.create_source_and_job(session, payload)
        assert created
        source_id = job.source_id
        # O job inicial nunca rodou (chamamos o serviço direto, sem o
        # BackgroundTask que o router dispara) — fica QUEUED pra sempre e
        # seria lido como "importação em andamento" pelo guard de FR-017,
        # mascarando o que este teste quer provar. Marca como terminal,
        # como uma fonte real teria depois do próprio ciclo de vida dela.
        job.status = ImportJobStatus.FAILED
        await session.commit()

    first_open = await client.post(f"/sources/{source_id}/open")
    assert first_open.status_code == 200
    body = first_open.json()
    assert body["triggered"] is True
    assert body["import_job_id"] is not None

    job_response = await client.get(f"/import-jobs/{body['import_job_id']}")
    assert job_response.json()["status"] in ("completed", "completed_with_warnings")

    second_open = await client.post(f"/sources/{source_id}/open")
    assert second_open.json() == {"triggered": False, "import_job_id": None}


async def test_open_triggers_update_when_stale_not_when_fresh(client, monkeypatch):
    """T030 — fonte fora do prazo atualiza ao abrir; dentro do prazo, não
    (FR-020, SC-011)."""

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte para checar idade",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    fresh_open = await client.post(f"/sources/{source_id}/open")
    assert fresh_open.json()["triggered"] is False

    # Envelhece a marca de sincronização manualmente — não dá pra esperar
    # 24h num teste.
    session_factory = get_session_factory()
    async with session_factory() as session:
        source = await session.get(Source, uuid.UUID(source_id))
        source.last_successful_sync_at = datetime.now(UTC) - timedelta(hours=25)
        await session.commit()

    stale_open = await client.post(f"/sources/{source_id}/open")
    body = stale_open.json()
    assert body["triggered"] is True

    job_response = await client.get(f"/import-jobs/{body['import_job_id']}")
    assert job_response.json()["status"] in ("completed", "completed_with_warnings")


async def test_open_does_not_create_two_jobs_for_concurrent_calls(client, monkeypatch):
    """T031 — nunca duas importações simultâneas para a mesma fonte
    (FR-017). O TestClient roda o BackgroundTask até o fim antes do
    controle voltar (mesmo cuidado da Fase 2), então a única forma de
    simular "já tem um job em andamento" é gravar um diretamente."""

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte para checar dedup de abertura",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    session_factory = get_session_factory()
    async with session_factory() as session:
        source = await session.get(Source, uuid.UUID(source_id))
        source.last_successful_sync_at = datetime.now(UTC) - timedelta(hours=25)
        stuck_job = ImportJob(
            id=uuid.uuid4(),
            source_id=source.id,
            status=ImportJobStatus.RUNNING,
            request_key=f"auto:{uuid.uuid4()}",
        )
        session.add(stuck_job)
        await session.commit()

    open_response = await client.post(f"/sources/{source_id}/open")
    assert open_response.json() == {"triggered": False, "import_job_id": None}


async def test_open_triggered_failure_does_not_advance_or_degrade(client, monkeypatch):
    """T032 — atualização por idade que falha não avança
    `last_successful_sync_at` nem degrada o estado da fonte (FR-023)."""

    async def fake_fetch_ok(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch_ok)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte que falha na atualizacao por idade",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    session_factory = get_session_factory()
    async with session_factory() as session:
        source = await session.get(Source, uuid.UUID(source_id))
        # Envelhece pra forçar a atualização por idade — este é o valor que
        # NÃO pode avançar quando o job falhar (capturado antes do open).
        source.last_successful_sync_at = datetime.now(UTC) - timedelta(hours=25)
        await session.commit()

    async def fake_fetch_fail(url, **kwargs):
        raise httpx.ConnectError("falha simulada", request=httpx.Request("GET", url))

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch_fail)

    open_response = await client.post(f"/sources/{source_id}/open")
    assert open_response.json()["triggered"] is True

    after = next(
        s for s in (await client.get("/sources")).json()["sources"] if s["id"] == source_id
    )
    # Um job falho não pode "consertar" a idade: se tivesse avançado, o
    # valor estaria a poucos segundos de agora, não a ~25h.
    after_sync_at = datetime.fromisoformat(after["last_successful_sync_at"])
    assert datetime.now(UTC) - after_sync_at > timedelta(hours=20)
    assert after["connection_state"] == "synced"  # não degradado


async def test_explicit_resync_ignores_migration_and_age_gate(client, monkeypatch):
    """T033 — regressão: `POST /sources/{id}/resync` continua disparando na
    hora, independente do que `/open` decidiria (FR-021)."""

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    created = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte fresca para checar resync explicito",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    source_id = created.json()["source_id"]

    # Confirma que /open não dispararia nada agora — a fonte está fresca.
    open_response = await client.post(f"/sources/{source_id}/open")
    assert open_response.json()["triggered"] is False

    resync_response = await client.post(f"/sources/{source_id}/resync")
    assert resync_response.status_code == 200
    assert resync_response.json()["import_job_id"] is not None

    job_response = await client.get(f"/import-jobs/{resync_response.json()['import_job_id']}")
    assert job_response.json()["status"] in ("completed", "completed_with_warnings")


async def test_open_unknown_source_returns_404(client):
    response = await client.post(f"/sources/{uuid.uuid4()}/open")
    assert response.status_code == 404
