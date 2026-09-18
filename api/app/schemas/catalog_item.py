from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.models.catalog_item import CatalogItemKind


class CatalogItemOut(BaseModel):
    id: uuid.UUID
    kind: CatalogItemKind
    name: str
    original_group: str | None
    published: bool
    # Derivado de `playback_url IS NOT NULL`. É um booleano de propósito: a URL
    # de reprodução pode conter credenciais do provedor (Xtream embute
    # usuário/senha no caminho) e NÃO pode aparecer em listagem comum de
    # catálogo — ADR-004 §7. Ver contracts/playback-api.md da spec 003.
    playable: bool


class CatalogItemListResponse(BaseModel):
    items: list[CatalogItemOut]
    next_cursor: str | None = None


class CatalogItemPlaybackOut(BaseModel):
    """Informação de reprodução de um item, entregue só no momento do play.

    Sensível: `url` pode carregar credenciais. Não é cacheável, não vai para
    log, e o cliente a mantém apenas na memória da sessão de reprodução
    (ADR-002 §5 — retenção mínima).
    """

    item_id: uuid.UUID
    kind: CatalogItemKind
    url: str
    # `None` quando não dá para identificar pela URL — nunca um palpite
    # apresentado como certeza (constitution, "IA e Classificação Nunca
    # Inventam Dados").
    container_hint: str | None
