"""Orquestra o ciclo de vida de um ImportJob (FR-004 a FR-018).

acquiring -> parsing -> classifying -> publishing, em lotes coerentes
(FR-011): um lote só é gravado por inteiro, então cancelamento nunca deixa
itens parcialmente publicados (ver plan.md, Decisões Invariantes).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.catalog_item import CatalogItem, CatalogItemKind
from app.models.import_job import ImportJob, ImportJobStatus, ImportStep
from app.models.source import ConnectionState, ProviderImportMode, Source, SourceType
from app.schemas.source import CreateSourceRequest
from app.services import provider_connector
from app.services.classifier import ClassifiedEntry, classify_entries
from app.services.m3u_parser import (
    EmptyPlaylistError,
    HLSManifestDetectedError,
    InvalidPlaylistError,
    M3UParser,
)
from app.services.provider_connector import (
    AcquisitionResult,
    ProviderAuthError,
    ProviderExpiredError,
    ProviderIncompatibleError,
)
from app.services.ssrf_guard import SSRFValidationError, fetch_text_ssrf_safe

# Catálogos IPTV reais observados chegam a centenas de milhares de entradas
# (310k #EXTINF num teste real) — um lote pequeno demais multiplica commits
# no banco desnecessariamente. 2000 ainda mantém "lote coerente" pequeno o
# bastante pra não perder muito progresso se um cancelamento chegar entre
# lotes (FR-010/FR-011).
_BATCH_SIZE = 2000

# Prazo inicial acordado para a atualização por idade (FR-020) — valor de
# configuração nomeado, não literal espalhado pelo código. Mudar o prazo é
# ajuste de configuração; o comportamento ao redor dele não muda.
STALE_AFTER = timedelta(hours=24)


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


_ACTIVE_JOB_STATUSES = (ImportJobStatus.QUEUED, ImportJobStatus.RUNNING)


async def maybe_refresh_on_open(session: AsyncSession, source_id: uuid.UUID) -> ImportJob | None:
    """Decide o que abrir uma fonte dispara (D-004) — a TV só avisa "abri
    esta fonte"; toda a decisão mora aqui, nunca no cliente.

    Duas razões disparam uma reimportação em segundo plano:
    - **Migração única** (FR-012/FR-014): fonte de provedor que nunca passou
      pelo conector novo (`provider_migrated_at is None`).
    - **Atualização por idade** (FR-020): qualquer fonte — provedor ou M3U —
      cuja última sincronização bem-sucedida passou de `STALE_AFTER`.

    Fonte que nunca sincronizou não é "velha" — é pendente, sem idade a
    comparar (edge case da spec); não é este ponto de entrada que resolve
    isso. Nunca dispara uma segunda importação com uma já em andamento
    (FR-017) — o resync explícito (FR-021) é o único caminho que ignora essa
    decisão de propósito, chamando `create_resync_job` direto.

    Devolve o `ImportJob` dispando, ou `None` se nada foi disparado.
    """
    source = await session.get(Source, source_id)
    if source is None:
        return None

    active = (
        await session.execute(
            select(ImportJob).where(
                ImportJob.source_id == source_id,
                ImportJob.status.in_(_ACTIVE_JOB_STATUSES),
            )
        )
    ).scalars().first()
    if active is not None:
        return None

    needs_migration = (
        source.type == SourceType.PROVIDER_CREDENTIALS and source.provider_migrated_at is None
    )
    is_stale = (
        source.last_successful_sync_at is not None
        and datetime.now(UTC) - source.last_successful_sync_at > STALE_AFTER
    )
    if not (needs_migration or is_stale):
        return None

    return await create_resync_job(session, source_id, prefix="auto")


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


async def _fetch_m3u_url_text(url: str) -> str:
    try:
        return await fetch_text_ssrf_safe(url)
    except httpx.TransportError as exc:
        # Nunca interpolar str(exc)/exc.request.url: httpx embute a URL
        # completa na mensagem de erros de rede/status, o que vazaria
        # credenciais eventualmente presentes na query string (FR-018).
        raise NetworkAcquisitionError(
            f"Falha de rede ao obter a lista ({type(exc).__name__})."
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise NetworkAcquisitionError(
            f"Servidor respondeu com erro ao obter a lista (status {exc.response.status_code})."
        ) from exc


async def _acquire(source: Source) -> AcquisitionResult:
    """Saída normalizada comum aos dois conectores (D-001): quem chama não
    sabe, a partir daqui, se os dados vieram de M3U direto, do protocolo
    JSON do provedor, ou do fallback M3U de um provedor incompatível."""
    if source.type == SourceType.M3U_URL:
        if not source.m3u_url:
            raise InvalidPlaylistError("Fonte do tipo m3u_url sem URL configurada.")
        text = await _fetch_m3u_url_text(source.m3u_url)
        parse_result = M3UParser().parse(text)  # HLS/vazio/inválido propaga (FR-016)
        return AcquisitionResult(
            classified=classify_entries(parse_result.entries),
            invalid_count=parse_result.invalid_count,
            provider_import_mode=None,
            provider_allowed_formats=None,
        )

    if source.type == SourceType.PROVIDER_CREDENTIALS:
        return await provider_connector.acquire(source)

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
            acquisition = await _acquire(source)
        except (ProviderAuthError, ProviderExpiredError) as exc:
            # FR-005/FR-016: o estado de conta que o painel resolveu (credencial
            # recusada ou assinatura expirada) fica registrado na fonte — não
            # pode continuar parecendo "sincronizada" depois de uma consulta
            # que a recusou. Falhas de rede/protocolo genéricas (abaixo) não
            # degradam o estado: podem ser transitórias, e é o mesmo cuidado
            # que a atualização por idade vai exigir (FR-023).
            source.connection_state = ConnectionState.ERROR
            await _fail(session, job, str(exc))
            return
        except (
            SSRFValidationError,
            NetworkAcquisitionError,
            InvalidPlaylistError,
            HLSManifestDetectedError,
            EmptyPlaylistError,
            ProviderIncompatibleError,
        ) as exc:
            await _fail(session, job, str(exc))
            return

        # A aquisição já entrega itens classificados (D-001) — para uma
        # resposta JSON estruturada não existe um passo de "parsing"
        # separado como no M3U. PARSING/CLASSIFYING seguem existindo como
        # marcos do job (observabilidade, item 1 do backlog), só que sem
        # trabalho extra entre eles.
        job.current_step = ImportStep.PARSING
        await session.commit()

        job.entries_read = len(acquisition.classified)
        job.invalid_count = acquisition.invalid_count
        job.current_step = ImportStep.CLASSIFYING
        await session.commit()

        if acquisition.provider_import_mode is not None:
            # FR-012/FR-014: marca a fonte como migrada — abrir de novo não
            # dispara requisição por causa disso; só idade (FR-020) ou
            # resync explícito (FR-021) re-baixam depois disso.
            source.provider_import_mode = acquisition.provider_import_mode
            source.provider_allowed_formats = acquisition.provider_allowed_formats
            source.provider_migrated_at = datetime.now(UTC)
            await session.commit()

        job.current_step = ImportStep.PUBLISHING
        await session.commit()

        await _publish_in_batches(
            session, job, source, acquisition.classified, acquisition.provider_import_mode
        )


async def _fail(session: AsyncSession, job: ImportJob, message: str) -> None:
    job.status = ImportJobStatus.FAILED
    job.warnings = [message]
    job.current_step = ImportStep.DONE
    job.finished_at = datetime.now(UTC)
    # Este job nunca chegou a publicar nada (D-002): qualquer item que ele
    # tenha gravado está com published=False e nunca foi visível — descarta
    # em vez de deixar lixo órfão no banco. Sem efeito se nada foi gravado
    # ainda (falha na aquisição/parsing, antes de qualquer CatalogItem).
    await session.execute(delete(CatalogItem).where(CatalogItem.import_job_id == job.id))
    await session.commit()


async def _publish_in_batches(
    session: AsyncSession,
    job: ImportJob,
    source: Source,
    classified: list[ClassifiedEntry],
    provider_import_mode: ProviderImportMode | None,
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
        # Idem a `_fail`: nada deste job foi publicado, descarta o que ele
        # já gravou (D-002; FR-013/FR-019 — nunca um catálogo parcial).
        await session.execute(delete(CatalogItem).where(CatalogItem.import_job_id == job.id))
        await session.commit()
        return

    job.status = ImportJobStatus.COMPLETED_WITH_WARNINGS if job.invalid_count else ImportJobStatus.COMPLETED
    job.current_step = ImportStep.DONE
    job.finished_at = datetime.now(UTC)
    source.connection_state = ConnectionState.SYNCED
    source.last_successful_sync_at = datetime.now(UTC)
    # D-002 — publicação em duas fases: os itens deste job foram gravados
    # com published=False (ver `_persist_entry`) enquanto o catálogo anterior
    # seguia servindo a TV (ADR-004 §6). Agora, na mesma transação: publica
    # os novos e remove os de qualquer job anterior desta fonte. Corrige o
    # R-001 — antes, a importação nunca removia o catálogo anterior, e um
    # resync duplicava a fonte inteira.
    #
    # As duas instruções são DML de conjunto (Core `update`/`delete`, sem
    # carregar linha por linha em memória Python) — mesmo padrão que
    # `delete_source` já usa nesta tabela. Não precisa da lotização que o
    # laço de inserção acima usa: aquela existe para progresso/cancelamento
    # cooperativo, que não se aplica aqui (o job já terminou com sucesso).
    await session.execute(
        update(CatalogItem).where(CatalogItem.import_job_id == job.id).values(published=True)
    )
    cleanup_stmt = delete(CatalogItem).where(
        CatalogItem.source_id == source.id,
        CatalogItem.import_job_id != job.id,
    )
    if provider_import_mode == ProviderImportMode.XTREAM_API:
        # O conector novo (protocolo JSON) só fala canais ao vivo nesta
        # fatia (spec.md, Key Entities) — VOD/série ficam para a fatia
        # seguinte. Sem essa restrição, migrar uma fonte pro protocolo novo
        # apagaria silenciosamente filme/série/episódio que o caminho M3U
        # antigo já tinha importado, mesmo sem o job novo ter tocado neles
        # (achado na verificação manual na TV física, 2026-09-18). O
        # caminho M3U (fonte m3u_url ou provider em modo limitado) continua
        # substituindo o catálogo inteiro — ele fala todos os tipos, e é
        # esse replace completo que corrige o R-001.
        cleanup_stmt = cleanup_stmt.where(CatalogItem.kind == CatalogItemKind.CHANNEL)
    await session.execute(cleanup_stmt)
    await session.commit()


async def _persist_entry(
    session: AsyncSession,
    job: ImportJob,
    source: Source,
    entry: ClassifiedEntry,
    series_ids: dict[str, uuid.UUID],
) -> None:
    # D-002 — publicação em duas fases: todo item deste job nasce
    # published=False. O catálogo anterior (published=True, de outro job)
    # segue servindo a TV até `_publish_in_batches` publicar este job por
    # inteiro ao concluir — nunca um catálogo pela metade visível (FR-019).
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
                published=False,
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
            published=False,
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
            # `None` para itens vindos do M3U parser — só o ProviderConnector
            # preenche, quando o painel fala o protocolo JSON (FR-006, FR-007).
            provider_stream_id=entry.provider_stream_id,
            provider_category_id=entry.provider_category_id,
            playback_url=entry.url,
            published=False,
        )
    )
