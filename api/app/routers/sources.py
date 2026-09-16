import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.source import Source
from app.schemas.source import (
    CreateSourceRequest,
    CreateSourceResponse,
    ResyncSourceResponse,
    SourceListResponse,
    SourceOut,
)
from app.services.importer import (
    create_resync_job,
    create_source_and_job,
    delete_source,
    run_import_job_by_id,
)

router = APIRouter(prefix="/sources", tags=["sources"])


@router.post("", response_model=CreateSourceResponse)
async def create_source(
    payload: CreateSourceRequest,
    background_tasks: BackgroundTasks,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> CreateSourceResponse:
    job, created = await create_source_and_job(session, payload)
    response.status_code = 201 if created else 200
    if created:
        background_tasks.add_task(run_import_job_by_id, job.id)
    return CreateSourceResponse(source_id=job.source_id, import_job_id=job.id)


@router.get("", response_model=SourceListResponse)
async def list_sources(session: AsyncSession = Depends(get_session)) -> SourceListResponse:
    result = await session.execute(select(Source).order_by(Source.created_at))
    sources = result.scalars().all()
    return SourceListResponse(
        sources=[
            SourceOut(
                id=source.id,
                type=source.type.value,
                display_name=source.display_name,
                connection_state=source.connection_state.value,
                last_successful_sync_at=source.last_successful_sync_at,
            )
            for source in sources
        ]
    )


@router.delete("/{source_id}", status_code=204)
async def remove_source(
    source_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    deleted = await delete_source(session, source_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Fonte não encontrada.")


@router.post("/{source_id}/resync", response_model=ResyncSourceResponse)
async def resync_source(
    source_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> ResyncSourceResponse:
    source = await session.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Fonte não encontrada.")

    job = await create_resync_job(session, source_id)
    background_tasks.add_task(run_import_job_by_id, job.id)
    return ResyncSourceResponse(source_id=job.source_id, import_job_id=job.id)
