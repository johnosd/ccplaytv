import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SourceType(str, enum.Enum):
    M3U_URL = "m3u_url"
    PROVIDER_CREDENTIALS = "provider_credentials"


class ConnectionState(str, enum.Enum):
    NEVER_SYNCED = "never_synced"
    SYNCED = "synced"
    ERROR = "error"


class Source(Base):
    """Fonte de conteúdo adicionada pela pessoa (FR-001, FR-002).

    provider_password fica em texto plano nesta fase do projeto — a
    proteção exigida por FR-014/constitution é feita na camada de
    serialização (schemas Pydantic nunca a incluem em resposta), não por
    criptografia em repouso.
    """

    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    type: Mapped[SourceType] = mapped_column(Enum(SourceType, native_enum=False), nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)

    m3u_url: Mapped[str | None] = mapped_column(String, nullable=True)

    provider_dns: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_username: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_password: Mapped[str | None] = mapped_column(String, nullable=True)

    connection_state: Mapped[ConnectionState] = mapped_column(
        Enum(ConnectionState, native_enum=False),
        nullable=False,
        default=ConnectionState.NEVER_SYNCED,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_successful_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
