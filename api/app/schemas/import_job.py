from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.import_job import ImportJob, ImportJobStatus, ImportStep


class ImportJobCounts(BaseModel):
    entries_read: int
    channels: int
    movies: int
    series: int
    episodes: int
    unclassified: int
    invalid: int


class ImportJobResponse(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    status: ImportJobStatus
    current_step: ImportStep
    counts: ImportJobCounts
    warnings: list[str]
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None

    @classmethod
    def from_model(cls, job: ImportJob) -> ImportJobResponse:
        return cls(
            id=job.id,
            source_id=job.source_id,
            status=job.status,
            current_step=job.current_step,
            counts=ImportJobCounts(
                entries_read=job.entries_read,
                channels=job.channels_count,
                movies=job.movies_count,
                series=job.series_count,
                episodes=job.episodes_count,
                unclassified=job.unclassified_count,
                invalid=job.invalid_count,
            ),
            warnings=list(job.warnings or []),
            created_at=job.created_at,
            updated_at=job.updated_at,
            finished_at=job.finished_at,
        )


class CancelImportJobResponse(BaseModel):
    id: uuid.UUID
    status: ImportJobStatus
    cancel_requested_at: datetime | None


class RetryImportJobResponse(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    status: ImportJobStatus
