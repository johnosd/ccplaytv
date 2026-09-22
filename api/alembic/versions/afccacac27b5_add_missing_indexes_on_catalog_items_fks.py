"""add missing indexes on catalog_items fks

Revision ID: afccacac27b5
Revises: 307ba52e3904
Create Date: 2026-09-18 14:19:20.745096

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'afccacac27b5'
down_revision: str | Sequence[str] | None = '307ba52e3904'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(op.f('ix_catalog_items_import_job_id'), 'catalog_items', ['import_job_id'], unique=False)
    op.create_index(op.f('ix_catalog_items_parent_id'), 'catalog_items', ['parent_id'], unique=False)
    op.create_index(op.f('ix_catalog_items_source_id'), 'catalog_items', ['source_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_catalog_items_source_id'), table_name='catalog_items')
    op.drop_index(op.f('ix_catalog_items_parent_id'), table_name='catalog_items')
    op.drop_index(op.f('ix_catalog_items_import_job_id'), table_name='catalog_items')
