import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ImportJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    COMPLETED_WITH_WARNINGS = "completed_with_warnings"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ImportStep(str, enum.Enum):
    ACQUIRING = "acquiring"
    PARSING = "parsing"
    CLASSIFYING = "classifying"
    PUBLISHING = "publishing"
    DONE = "done"


class ImportJob(Base):
    """Trabalho de importação associado a uma Source (FR-004, FR-005, FR-010)."""

    __tablename__ = "import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id"), nullable=False)

    status: Mapped[ImportJobStatus] = mapped_column(
        Enum(ImportJobStatus, native_enum=False), nullable=False, default=ImportJobStatus.QUEUED
    )
    current_step: Mapped[ImportStep] = mapped_column(
        Enum(ImportStep, native_enum=False), nullable=False, default=ImportStep.ACQUIRING
    )

    entries_read: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    channels_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    movies_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    series_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    episodes_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unclassified_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    invalid_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Avisos sanitizados (FR-013/FR-014) — nunca contém segredo.
    warnings: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # Identifica a submissão de origem; evita duplicar fonte/job em reenvio de rede (FR-018).
    request_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
