import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.catalog_item import CatalogItem, CatalogItemKind
from app.schemas.catalog_item import (
    CatalogItemListResponse,
    CatalogItemOut,
    CatalogItemPlaybackOut,
)

router = APIRouter(prefix="/catalog-items", tags=["catalog-items"])

# Contêineres que conseguimos afirmar a partir da extensão da URL. Qualquer
# outra coisa vira `None` — uma pista errada faria o player escolher uma
# configuração inadequada, e isso é pior que não ter pista nenhuma.
_CONTAINER_BY_SUFFIX = {
    ".ts": "ts",
    ".m3u8": "m3u8",
    ".mp4": "mp4",
    ".mkv": "mkv",
}


def derive_container_hint(url: str) -> str | None:
    """Pista de contêiner a partir do caminho da URL, ou `None`.

    Só olha o caminho — query string e fragmento não entram, para o
    `output=m3u8` de um provedor Xtream não ser confundido com a extensão do
    recurso em si.
    """
    path = urlsplit(url).path.lower()
    for suffix, container in _CONTAINER_BY_SUFFIX.items():
        if path.endswith(suffix):
            return container
    return None


@router.get("", response_model=CatalogItemListResponse)
async def list_catalog_items(
    source_id: uuid.UUID,
    kind: CatalogItemKind | None = None,
    parent_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
) -> CatalogItemListResponse:
    stmt = select(CatalogItem).where(
        CatalogItem.source_id == source_id, CatalogItem.published.is_(True)
    )
    if kind is not None:
        stmt = stmt.where(CatalogItem.kind == kind)
    if parent_id is not None:
        stmt = stmt.where(CatalogItem.parent_id == parent_id)

    result = await session.execute(stmt)
    items = result.scalars().all()
    return CatalogItemListResponse(
        items=[
            CatalogItemOut(
                id=item.id,
                kind=item.kind,
                name=item.name,
                original_group=item.original_group,
                published=item.published,
                playable=item.playback_url is not None,
            )
            for item in items
        ]
    )


@router.get("/{item_id}/playback", response_model=CatalogItemPlaybackOut)
async def get_catalog_item_playback(
    item_id: uuid.UUID,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> CatalogItemPlaybackOut:
    """Informação de reprodução de um item, consultada no momento do play.

    Existe separado da listagem porque a URL pode conter credenciais do
    provedor: a ADR-004 §7 proíbe devolvê-las "em respostas comuns do
    catálogo" e, ao mesmo tempo, permite fornecê-las à TV em tempo de
    execução, que é o que o Direct Play exige.

    Nenhuma mensagem de erro daqui inclui a URL — nem por interpolação de
    exceção (constitution, "Segredos Fora dos Clientes e dos Logs").
    """
    stmt = select(CatalogItem).where(
        CatalogItem.id == item_id, CatalogItem.published.is_(True)
    )
    item = (await session.execute(stmt)).scalar_one_or_none()

    if item is None:
        raise HTTPException(status_code=404, detail="Item de catálogo não encontrado.")

    if item.playback_url is None:
        # Deliberadamente distinto de 404: o item existe e aparece na lista,
        # apenas não é reproduzível (ex.: o item pai de uma série). O cliente
        # usa essa diferença para explicar em vez de mostrar erro genérico.
        raise HTTPException(
            status_code=409, detail="Item sem URL de reprodução disponível."
        )

    # Sem cache em nenhum ponto do caminho: a URL é sensível e pode expirar.
    response.headers["Cache-Control"] = "no-store"

    return CatalogItemPlaybackOut(
        item_id=item.id,
        kind=item.kind,
        url=item.playback_url,
        container_hint=derive_container_hint(item.playback_url),
    )
