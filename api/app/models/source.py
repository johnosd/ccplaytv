import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SourceType(str, enum.Enum):
    M3U_URL = "m3u_url"
    PROVIDER_CREDENTIALS = "provider_credentials"


class ConnectionState(str, enum.Enum):
    NEVER_SYNCED = "never_synced"
    SYNCED = "synced"
    ERROR = "error"


class ProviderImportMode(str, enum.Enum):
    """Como uma fonte `provider_credentials` foi de fato importada (feature 004).

    `None` no campo da Source = não se aplica (fonte `m3u_url`, ou fonte de
    provedor ainda não migrada/importada por este conector).
    """

    XTREAM_API = "xtream_api"  # painel respondeu ao protocolo JSON (player_api.php)
    # Painel não falou o protocolo — caiu no caminho M3U existente
    # (contracts/provider-protocol.md §2; ADR-004 §3, "sem varredura").
    LEGACY_M3U = "legacy_m3u"


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

    # --- feature 004 (conector Xtream JSON) ---
    provider_import_mode: Mapped[ProviderImportMode | None] = mapped_column(
        Enum(ProviderImportMode, native_enum=False), nullable=True
    )
    # Formatos de saída que a CONTA do provedor permite (ex.: ["ts", "m3u8"]),
    # nunca assumidos (FR-008). `None` = ainda não consultado; lista vazia =
    # consultado e a conta não declarou nenhum formato (edge case da spec).
    provider_allowed_formats: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    # `None` = fonte de provedor ainda não passou pelo conector novo.
    # Não-nulo = já migrada; abrir a fonte não dispara nova importação por
    # causa disso (FR-012, FR-014) — só idade (FR-020) ou resync explícito.
    provider_migrated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_successful_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
