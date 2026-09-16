import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.catalog_item import CatalogItem, CatalogItemKind
from app.schemas.catalog_item import CatalogItemListResponse, CatalogItemOut

router = APIRouter(prefix="/catalog-items", tags=["catalog-items"])


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
            )
            for item in items
        ]
    )
