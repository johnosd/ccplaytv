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


class CatalogItemListResponse(BaseModel):
    items: list[CatalogItemOut]
    next_cursor: str | None = None
