"""Contrato de catálogo e de informação de reprodução (spec 003).

A regra central verificada aqui: a URL de reprodução pode conter credenciais
do provedor, então NÃO aparece em listagem comum de catálogo — só no endpoint
dedicado, consultado no momento do play (ADR-004 §7;
sdd/specs/003-live-tv-avplay/contracts/playback-api.md).
"""

import uuid
from pathlib import Path

from app.models.catalog_item import CatalogItemKind
from app.routers.catalog_items import derive_container_hint
from app.services import importer as importer_module

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SAMPLE_M3U = (FIXTURES_DIR / "sample.m3u").read_text(encoding="utf-8")


async def _import_sample_source(client, monkeypatch) -> str:
    """Cria uma fonte a partir da fixture e devolve o `source_id`.

    Mesmo padrão dos testes de importação já existentes: a aquisição de rede é
    trocada por um retorno fixo, o resto do pipeline roda de verdade.
    """

    async def fake_fetch(url, **kwargs):
        return SAMPLE_M3U

    monkeypatch.setattr(importer_module, "fetch_text_ssrf_safe", fake_fetch)

    response = await client.post(
        "/sources",
        json={
            "type": "m3u_url",
            "display_name": "Fonte de catalogo",
            "m3u_url": "https://exemplo.test/lista.m3u",
            "request_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 201
    return response.json()["source_id"]


async def _get_items(client, source_id: str, kind: str | None = None) -> list[dict]:
    params = {"source_id": source_id}
    if kind is not None:
        params["kind"] = kind
    response = await client.get("/catalog-items", params=params)
    assert response.status_code == 200
    return response.json()["items"]


# --- T003: a listagem não vaza URL, mas informa se dá para reproduzir ---


async def test_listagem_expoe_playable_e_nunca_a_url(client, monkeypatch):
    source_id = await _import_sample_source(client, monkeypatch)

    items = await _get_items(client, source_id)
    assert items, "a fixture deveria produzir itens publicados"

    for item in items:
        assert "playable" in item
        assert isinstance(item["playable"], bool)
        # O ponto do teste: nenhum campo de URL, sob qualquer nome.
        assert "playback_url" not in item
        assert "url" not in item

    # E nada de URL em lugar nenhum do corpo bruto, nem por acidente.
    response = await client.get("/catalog-items", params={"source_id": source_id})
    assert "exemplo.test" not in response.text


async def test_playable_distingue_item_com_url_de_item_sem_url(client, monkeypatch):
    source_id = await _import_sample_source(client, monkeypatch)

    channels = await _get_items(client, source_id, kind=CatalogItemKind.CHANNEL.value)
    assert channels, "a fixture tem um canal em 'Canais Esportes'"
    assert all(item["playable"] for item in channels)

    # O item pai de série é criado pelo importer sem playback_url — é o caso
    # real de "existe no catálogo, mas não é reproduzível".
    series = await _get_items(client, source_id, kind=CatalogItemKind.SERIES.value)
    assert series, "a fixture tem episódios S01E01/E02, logo uma série pai"
    assert all(item["playable"] is False for item in series)


# --- T004: o endpoint dedicado entrega a URL no momento do play ---


async def test_playback_devolve_url_e_container_hint(client, monkeypatch):
    source_id = await _import_sample_source(client, monkeypatch)
    channel = (await _get_items(client, source_id, kind=CatalogItemKind.CHANNEL.value))[0]

    response = await client.get(f"/catalog-items/{channel['id']}/playback")
    assert response.status_code == 200

    body = response.json()
    assert body["item_id"] == channel["id"]
    assert body["kind"] == CatalogItemKind.CHANNEL.value
    assert body["url"] == "http://exemplo.test/live/espn.m3u8"
    assert body["container_hint"] == "m3u8"
    # Sensível: nunca cacheável.
    assert response.headers["cache-control"] == "no-store"


# --- T005: os dois caminhos de recusa são distinguíveis ---


async def test_playback_404_para_item_inexistente(client):
    response = await client.get(f"/catalog-items/{uuid.uuid4()}/playback")
    assert response.status_code == 404


async def test_playback_409_para_item_publicado_sem_url(client, monkeypatch):
    source_id = await _import_sample_source(client, monkeypatch)
    series = (await _get_items(client, source_id, kind=CatalogItemKind.SERIES.value))[0]

    response = await client.get(f"/catalog-items/{series['id']}/playback")
    # 409, não 404: o item existe e está publicado — só não é reproduzível.
    assert response.status_code == 409
    assert "exemplo.test" not in response.text


# --- Pista de contêiner: pura, testável sem banco ---


def test_container_hint_ignora_query_string():
    # `output=m3u8` na query de um provedor Xtream não torna o recurso um
    # manifesto HLS — a pista vem do caminho, não dos parâmetros.
    assert derive_container_hint("http://host/live/u/p/1.ts?output=m3u8") == "ts"
    assert derive_container_hint("http://host/live/u/p/1.m3u8") == "m3u8"
    assert derive_container_hint("http://host/movie/u/p/9.mp4") == "mp4"


def test_container_hint_sem_evidencia_e_none():
    assert derive_container_hint("http://host/live/stream") is None
    assert derive_container_hint("http://host/play.php?id=7") is None
