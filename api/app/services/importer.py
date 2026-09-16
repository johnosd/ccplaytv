"""Orquestra o ciclo de vida de um ImportJob (FR-004 a FR-018).

acquiring -> parsing -> classifying -> publishing, em lotes coerentes
(FR-011): um lote só é gravado por inteiro, então cancelamento nunca deixa
itens parcialmente publicados (ver plan.md, Decisões Invariantes).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.catalog_item import CatalogItem, CatalogItemKind
from app.models.import_job import ImportJob, ImportJobStatus, ImportStep
from app.models.source import ConnectionState, Source, SourceType
from app.schemas.source import CreateSourceRequest
from app.services.classifier import ClassifiedEntry, classify_entries
from app.services.m3u_parser import (
    EmptyPlaylistError,
    HLSManifestDetectedError,
    InvalidPlaylistError,
    M3UParser,
)
from app.services.provider_connector import (
    ProviderAuthError,
    ProviderIncompatibleError,
    build_m3u_url,
)
from app.services.ssrf_guard import SSRFValidationError, fetch_text_ssrf_safe

# Catálogos IPTV reais observados chegam a centenas de milhares de entradas
# (310k #EXTINF num teste real) — um lote pequeno demais multiplica commits
# no banco desnecessariamente. 2000 ainda mantém "lote coerente" pequeno o
# bastante pra não perder muito progresso se um cancelamento chegar entre
# lotes (FR-010/FR-011).
_BATCH_SIZE = 2000


class NetworkAcquisitionError(RuntimeError):
    """Falha de rede/servidor ao obter a lista — recuperável via retry manual (FR-015)."""


async def create_source_and_job(
    session: AsyncSession, payload: CreateSourceRequest
) -> tuple[ImportJob, bool]:
    """Cria Source + ImportJob, idempotente por request_key (FR-018).

    Retorna (job, created) — created=False quando o request_key já havia
    sido processado (reenvio de rede), sem criar nada novo.
    """
    existing = (
        await session.execute(select(ImportJob).where(ImportJob.request_key == payload.request_key))
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False

    source = Source(
        id=uuid.uuid4(),
        type=SourceType(payload.type),
        display_name=payload.display_name,
        m3u_url=payload.m3u_url,
        provider_dns=payload.provider.dns if payload.provider else None,
        provider_username=payload.provider.username if payload.provider else None,
        provider_password=payload.provider.password if payload.provider else None,
    )
    session.add(source)
    # Sem relationship() ORM entre Source/ImportJob, o flush explícito
    # garante que a linha de sources exista antes do INSERT de import_jobs
    # (a FK não é ordenada automaticamente só por estar declarada na coluna).
    await session.flush()

    job = ImportJob(id=uuid.uuid4(), source_id=source.id, request_key=payload.request_key)
    session.add(job)
    await session.commit()
    return job, True


async def create_retry_job(session: AsyncSession, failed_job: ImportJob) -> ImportJob:
    """Nova tentativa manual para a mesma Source (FR-015) — nunca pede os
    dados de novo, nunca reprocessa automaticamente."""
    return await create_resync_job(session, failed_job.source_id, prefix="retry")


async def create_resync_job(
    session: AsyncSession, source_id: uuid.UUID, prefix: str = "resync"
) -> ImportJob:
    """Novo ImportJob pra uma Source já existente, sem pedir os dados de
    novo — usado tanto pelo retry de um job falho quanto pela
    ressincronização manual a partir da tela Home."""
    new_job = ImportJob(
        id=uuid.uuid4(),
        source_id=source_id,
        request_key=f"{prefix}:{uuid.uuid4()}",
    )
    session.add(new_job)
    await session.commit()
    return new_job


async def delete_source(session: AsyncSession, source_id: uuid.UUID) -> bool:
    """Remove uma Source e tudo que depende dela. Sem relationship() ORM/
    cascade no banco (ver plan.md, Cuidados para Retomada), então a ordem
    de exclusão é manual: CatalogItem -> ImportJob -> Source.

    Retorna False se a Source não existir (o router decide o 404).
    """
    source = await session.get(Source, source_id)
    if source is None:
        return False

    await session.execute(delete(CatalogItem).where(CatalogItem.source_id == source_id))
    await session.execute(delete(ImportJob).where(ImportJob.source_id == source_id))
    await session.delete(source)
    await session.commit()
    return True


async def run_import_job_by_id(job_id: uuid.UUID) -> None:
    from app.db import get_session_factory

    await run_import_job(get_session_factory(), job_id)


async def _acquire(source: Source) -> str:
    if source.type == SourceType.M3U_URL:
        if not source.m3u_url:
            raise InvalidPlaylistError("Fonte do tipo m3u_url sem URL configurada.")
        try:
            return await fetch_text_ssrf_safe(source.m3u_url)
        except httpx.TransportError as exc:
            # Nunca interpolar str(exc)/exc.request.url: httpx embute a URL
            # completa na mensagem de erros de rede/status, o que vazaria
            # credenciais eventualmente presentes na query string (FR-014).
            raise NetworkAcquisitionError(
                f"Falha de rede ao obter a lista ({type(exc).__name__})."
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise NetworkAcquisitionError(
                f"Servidor respondeu com erro ao obter a lista (status {exc.response.status_code})."
            ) from exc

    if source.type == SourceType.PROVIDER_CREDENTIALS:
        m3u_url = build_m3u_url(source)  # ProviderIncompatibleError propaga direto se faltar dado
        try:
            text = await fetch_text_ssrf_safe(m3u_url)
        except httpx.TransportError as exc:
            # Idem: nunca interpolar str(exc) aqui — m3u_url contém a senha
            # do provedor embutida na query string (FR-014).
            raise ProviderIncompatibleError(
                f"Não foi possível conectar ao servidor do provedor ({type(exc).__name__})."
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise ProviderAuthError(
                "Provedor respondeu com erro de autenticação/autorização "
                f"(status {exc.response.status_code})."
            ) from exc

        if not text.strip().startswith("#EXTM3U"):
            raise ProviderAuthError(
                "O provedor não retornou uma lista válida — verifique usuário e senha."
            )
        return text

    raise ValueError(f"Tipo de fonte desconhecido: {source.type}")


async def run_import_job(session_factory: async_sessionmaker[AsyncSession], job_id: uuid.UUID) -> None:
    async with session_factory() as session:
        job = await session.get(ImportJob, job_id)
        if job is None:
            return
        source = await session.get(Source, job.source_id)
        if source is None:
            return

        job.status = ImportJobStatus.RUNNING
        job.current_step = ImportStep.ACQUIRING
        await session.commit()

        try:
            text = await _acquire(source)
        except (
            SSRFValidationError,
            NetworkAcquisitionError,
            InvalidPlaylistError,
            ProviderAuthError,
            ProviderIncompatibleError,
        ) as exc:
            await _fail(session, job, str(exc))
            return

        job.current_step = ImportStep.PARSING
        await session.commit()

        try:
            parse_result = M3UParser().parse(text)
        except (HLSManifestDetectedError, EmptyPlaylistError, InvalidPlaylistError) as exc:
            await _fail(session, job, str(exc))
            return

        job.entries_read = len(parse_result.entries)
        job.invalid_count = parse_result.invalid_count
        job.current_step = ImportStep.CLASSIFYING
        await session.commit()

        classified = classify_entries(parse_result.entries)

        job.current_step = ImportStep.PUBLISHING
        await session.commit()

        await _publish_in_batches(session, job, source, classified)


async def _fail(session: AsyncSession, job: ImportJob, message: str) -> None:
    job.status = ImportJobStatus.FAILED
    job.warnings = [message]
    job.current_step = ImportStep.DONE
    job.finished_at = datetime.now(UTC)
    await session.commit()


async def _publish_in_batches(
    session: AsyncSession,
    job: ImportJob,
    source: Source,
    classified: list[ClassifiedEntry],
) -> None:
    series_ids: dict[str, uuid.UUID] = {}
    channel_count = movie_count = episode_count = unclassified_count = 0
    series_direct_count = 0
    series_keys: set[str] = set()
    was_cancelled = False

    for batch_start in range(0, len(classified), _BATCH_SIZE):
        await session.refresh(job)
        if job.cancel_requested_at is not None:
            was_cancelled = True
            break

        for entry in classified[batch_start : batch_start + _BATCH_SIZE]:
            await _persist_entry(session, job, source, entry, series_ids)
            if entry.kind == CatalogItemKind.CHANNEL:
                channel_count += 1
            elif entry.kind == CatalogItemKind.MOVIE:
                movie_count += 1
            elif entry.kind == CatalogItemKind.SERIES:
                # Grupo indicava série, mas o nome não bateu o padrão de
                # episódio (SxxExx) — vira uma Série avulsa, sem episódios
                # vinculados (research.md R5). Distinto de series_keys
                # abaixo, que são séries sintetizadas como pai de episódios.
                series_direct_count += 1
            elif entry.kind == CatalogItemKind.EPISODE:
                episode_count += 1
                if entry.series_key:
                    series_keys.add(entry.series_key)
            elif entry.kind == CatalogItemKind.UNCLASSIFIED:
                unclassified_count += 1

        job.channels_count = channel_count
        job.movies_count = movie_count
        # Total de itens Série distintos: os sintetizados como pai de
        # episódios (series_keys) + os classificados diretamente como Série
        # — ambos viram uma linha CatalogItem(kind=SERIES) de verdade.
        job.series_count = len(series_keys) + series_direct_count
        job.episodes_count = episode_count
        job.unclassified_count = unclassified_count
        await session.commit()

    if was_cancelled:
        job.status = ImportJobStatus.CANCELLED
        job.current_step = ImportStep.DONE
        job.finished_at = datetime.now(UTC)
        await session.commit()
        return

    job.status = ImportJobStatus.COMPLETED_WITH_WARNINGS if job.invalid_count else ImportJobStatus.COMPLETED
    job.current_step = ImportStep.DONE
    job.finished_at = datetime.now(UTC)
    source.connection_state = ConnectionState.SYNCED
    source.last_successful_sync_at = datetime.now(UTC)
    await session.commit()


async def _persist_entry(
    session: AsyncSession,
    job: ImportJob,
    source: Source,
    entry: ClassifiedEntry,
    series_ids: dict[str, uuid.UUID],
) -> None:
    if entry.kind == CatalogItemKind.EPISODE and entry.series_key:
        parent_id = series_ids.get(entry.series_key)
        if parent_id is None:
            series_item = CatalogItem(
                id=uuid.uuid4(),
                source_id=source.id,
                import_job_id=job.id,
                kind=CatalogItemKind.SERIES,
                name=entry.series_name or entry.series_key,
                original_name=entry.series_name or entry.series_key,
                original_group=entry.group,
                published=True,
            )
            session.add(series_item)
            # Mesma razão do flush em create_source_and_job: catalog_items
            # tem FK auto-referenciada (parent_id -> id) sem relationship()
            # ORM, então o pai precisa existir na tabela antes do filho.
            await session.flush()
            parent_id = series_item.id
            series_ids[entry.series_key] = parent_id

        episode_item = CatalogItem(
            id=uuid.uuid4(),
            source_id=source.id,
            import_job_id=job.id,
            kind=CatalogItemKind.EPISODE,
            parent_id=parent_id,
            name=entry.name,
            original_name=entry.original_name,
            original_group=entry.group,
            season_number=entry.season_number,
            episode_number=entry.episode_number,
            playback_url=entry.url,
            published=True,
        )
        session.add(episode_item)
        return

    session.add(
        CatalogItem(
            id=uuid.uuid4(),
            source_id=source.id,
            import_job_id=job.id,
            kind=entry.kind,
            name=entry.name,
            original_name=entry.original_name,
            original_group=entry.group,
            playback_url=entry.url,
            published=True,
        )
    )
