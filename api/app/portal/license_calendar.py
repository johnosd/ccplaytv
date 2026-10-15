"""Calendário UTC determinístico; refund remove somente a compra correspondente."""
from calendar import monthrange
from datetime import UTC, datetime

from app.portal.commercial_models import GrantDocument


def add_months(value: datetime, months: int = 12) -> datetime:
    if value.tzinfo is None or months < 1:
        raise ValueError("invalid_calendar_interval")
    value = value.astimezone(UTC)
    total = value.year * 12 + value.month - 1 + months
    year, month = divmod(total, 12)
    month += 1
    return value.replace(year=year, month=month, day=min(value.day, monthrange(year, month)[1]))


def schedule_grants(grants: list[GrantDocument]) -> list[GrantDocument]:
    result = []
    previous_end = None
    for grant in sorted(grants, key=lambda item: (item.confirmed_at, item.order_id)):
        if grant.status != "valid":
            result.append(grant)
            continue
        start = max(grant.confirmed_at, previous_end) if previous_end else grant.confirmed_at
        end = add_months(start)
        result.append(grant.model_copy(update={"starts_at": start, "expires_at": end}))
        previous_end = end
    return result
