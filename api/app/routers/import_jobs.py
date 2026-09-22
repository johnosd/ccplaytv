import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.import_job import ImportJob, ImportJobStatus
from app.schemas.import_job import (
    CancelImportJobResponse,
    ImportJobResponse,
    RetryImportJobResponse,
)
from app.services.importer import create_retry_job, run_import_job_by_id

router = APIRouter(prefix="/import-jobs", tags=["import-jobs"])

_TERMINAL_STATES = {
    ImportJobStatus.COMPLETED,
    ImportJobStatus.COMPLETED_WITH_WARNINGS,
    ImportJobStatus.FAILED,
    ImportJobStatus.CANCELLED,
}


@router.get("/{job_id}", response_model=ImportJobResponse)
async def get_import_job(
    job_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> ImportJobResponse:
    job = await session.get(ImportJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job de importação não encontrado.")
    return ImportJobResponse.from_model(job)


@router.post("/{job_id}/cancel", response_model=CancelImportJobResponse, status_code=202)
async def cancel_import_job(
    job_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> CancelImportJobResponse:
    job = await session.get(ImportJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job de importação não encontrado.")
    if job.status in _TERMINAL_STATES:
        raise HTTPException(status_code=409, detail="Job já está em estado terminal.")

    job.cancel_requested_at = datetime.now(UTC)
    await session.commit()
    return CancelImportJobResponse(
        id=job.id, status=job.status, cancel_requested_at=job.cancel_requested_at
    )


@router.post("/{job_id}/retry", response_model=RetryImportJobResponse, status_code=202)
async def retry_import_job(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> RetryImportJobResponse:
    job = await session.get(ImportJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job de importação não encontrado.")
    if job.status != ImportJobStatus.FAILED:
        raise HTTPException(
            status_code=409, detail="Só é possível pedir nova tentativa de um job que falhou."
        )

    new_job = await create_retry_job(session, job)
    background_tasks.add_task(run_import_job_by_id, new_job.id)
    return RetryImportJobResponse(id=new_job.id, source_id=new_job.source_id, status=new_job.status)
