import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CatalogItemKind(str, enum.Enum):
    CHANNEL = "channel"
    MOVIE = "movie"
    SERIES = "series"
    EPISODE = "episode"
    UNCLASSIFIED = "unclassified"


class CatalogItem(Base):
    """Item classificado resultante da importação (FR-008, FR-011).

    playback_url fica embutido aqui (sem entidade PlaybackOption separada)
    enquanto esta feature não lida com reconciliação multi-fonte — ver
    plan.md, Risco R-002.
    """

    __tablename__ = "catalog_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # index=True nas três FKs: sem elas, apagar ou publicar um lote força o
    # Postgres a fazer seq scan da tabela inteira por linha apagada — em
    # parent_id (auto-referenciada) isso é o check de FK em cada delete de
    # SERIES, e a tabela real passa de 300 mil linhas (achado na verificação
    # manual da feature 004 na TV física, 2026-09-18: um DELETE por source_id
    # ficou preso ~30 min nesse exato scan).
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id"), nullable=False, index=True)
    import_job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("import_jobs.id"), nullable=False, index=True
    )

    kind: Mapped[CatalogItemKind] = mapped_column(Enum(CatalogItemKind, native_enum=False), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("catalog_items.id"), nullable=True, index=True
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    original_name: Mapped[str] = mapped_column(String, nullable=False)
    original_group: Mapped[str | None] = mapped_column(String, nullable=True)

    season_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    episode_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Identidade e categoria como o provedor as declara (feature 004) — só
    # preenchidos para itens vindos do protocolo JSON (`ProviderImportMode.
    # XTREAM_API`); itens do caminho M3U (incl. modo limitado) ficam com
    # ambos None e continuam válidos. `original_group` já guarda o NOME da
    # categoria para os dois casos; `provider_category_id` é o id opaco do
    # provedor, quando existir, sem inventar vínculo (contracts/
    # provider-protocol.md §3).
    provider_stream_id: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_category_id: Mapped[str | None] = mapped_column(String, nullable=True)

    playback_url: Mapped[str | None] = mapped_column(String, nullable=True)

    published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
