import uuid
from pathlib import Path

import httpx

from app.db import get_session_factory
from app.schemas.source import CreateSourceRequest
from app.services import importer as importer_module

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SAMPLE_M3U = (FIXTURES_DIR / "sample.m3u").read_text(encoding="utf-8")


async def test_network_failure_allows_manual_retry(client, monkeypatch):
    call_count = {"n": 0}

    async def flaky_fetch(url, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise httpx.ConnectError("falha de rede simulada", request=httpx.Request("GET", url))
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", flaky_fetch)

    create_response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte instavel",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = create_response.json()["import_job_id"]
    source_id = create_response.json()["source_id"]

    failed_job = await client.get(f"/import-jobs/{job_id}")
    assert failed_job.json()["status"] == "failed"

    retry_response = await client.post(f"/import-jobs/{job_id}/retry")
    assert retry_response.status_code == 202
    retry_body = retry_response.json()
    assert retry_body["source_id"] == source_id
    new_job_id = retry_body["id"]
    assert new_job_id != job_id

    new_job = await client.get(f"/import-jobs/{new_job_id}")
    assert new_job.json()["status"] in ("completed", "completed_with_warnings")


async def test_retry_rejected_for_non_failed_job(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    create_response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte concluida",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = create_response.json()["import_job_id"]

    retry_response = await client.post(f"/import-jobs/{job_id}/retry")
    assert retry_response.status_code == 409


async def test_get_unknown_job_returns_404(client):
    response = await client.get(f"/import-jobs/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_cancel_running_job(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    # Cria a fonte/job sem disparar o BackgroundTask (chamando o serviço
    # diretamente), pra poder cancelar um job ainda `queued` antes dele
    # rodar — o TestClient roda BackgroundTasks de forma síncrona, então
    # não há como "pegar" um job real em andamento via HTTP.
    session_factory = get_session_factory()
    async with session_factory() as session:
        payload = CreateSourceRequest(
            type="m3u_url",
            display_name="Fonte para cancelar",
            m3u_url="https://exemplo.test/lista.m3u",
            request_key=str(uuid.uuid4()),
        )
        job, created = await importer_module.create_source_and_job(session, payload)
        assert created
        job_id = job.id
        source_id = job.source_id

    cancel_response = await client.post(f"/import-jobs/{job_id}/cancel")
    assert cancel_response.status_code == 202
    cancel_body = cancel_response.json()
    assert cancel_body["cancel_requested_at"] is not None
    assert cancel_body["status"] == "queued"  # só o pedido foi registrado ainda (FR-010)

    # Agora "roda" o job (equivalente ao que o BackgroundTask faria) — como
    # cancel_requested_at já está setado, a publicação deve parar antes de
    # gravar qualquer CatalogItem.
    await importer_module.run_import_job(session_factory, job_id)

    job_response = await client.get(f"/import-jobs/{job_id}")
    assert job_response.json()["status"] == "cancelled"

    items_response = await client.get("/catalog-items", params={"source_id": str(source_id)})
    assert items_response.json()["items"] == []


async def test_cancel_terminal_job_conflict(client, monkeypatch):
    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    create_response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte ja concluida",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    job_id = create_response.json()["import_job_id"]

    job_response = await client.get(f"/import-jobs/{job_id}")
    assert job_response.json()["status"] in ("completed", "completed_with_warnings")

    cancel_response = await client.post(f"/import-jobs/{job_id}/cancel")
    assert cancel_response.status_code == 409
