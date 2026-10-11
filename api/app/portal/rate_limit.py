"""Contadores compartilhados entre instâncias; TTL não decide autorização."""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.portal.models import RateLimitDocument
from app.portal.repositories.control import ControlRepository, TransactionPlan, document_path


@dataclass(frozen=True)
class RateConstraint:
    key_hash: str
    limit: int
    window_seconds: int
    cooldown_seconds: int = 0

    def __post_init__(self):
        if (len(self.key_hash) != 64 or any(c not in "0123456789abcdef" for c in self.key_hash)
                or not 1 <= self.limit <= 10000 or not 1 <= self.window_seconds <= 86400
                or not 0 <= self.cooldown_seconds <= 86400):
            raise ValueError("invalid_rate_constraint")


@dataclass(frozen=True)
class RateDecision:
    allowed: bool
    retry_after: int = 0


class SharedRateLimiter:
    def __init__(self, repository: ControlRepository):
        self.repository = repository

    async def evaluate(
        self, constraints: tuple[RateConstraint, ...], now: datetime, *, consume: bool,
    ) -> RateDecision:
        if not 1 <= len(constraints) <= 8:
            raise ValueError("invalid_rate_constraint")
        scoped = {document_path("rateLimits", rule.key_hash): rule for rule in constraints}
        if len(scoped) != len(constraints):
            raise ValueError("invalid_rate_constraint")

        def decide(rows):
            puts = {}
            retry_after = 0
            for path, rule in scoped.items():
                saved = RateLimitDocument.model_validate(rows[path]) if rows[path] else None
                if saved and saved.blocked_until and saved.blocked_until > now:
                    retry_after = max(retry_after, math.ceil(
                        (saved.blocked_until - now).total_seconds()
                    ))
                    continue
                if saved is None or (
                    now - saved.window_started_at
                ).total_seconds() >= rule.window_seconds:
                    saved = RateLimitDocument(count=0, window_started_at=now,
                                              expires_at=now + timedelta(days=1))
                if saved.count >= rule.limit:
                    retry_after = max(retry_after, math.ceil((saved.window_started_at
                        + timedelta(seconds=rule.window_seconds) - now).total_seconds()), 1)
                    continue
                if consume:
                    count = saved.count + 1
                    blocked_until = max(
                        saved.window_started_at + timedelta(seconds=rule.window_seconds),
                        now + timedelta(seconds=rule.cooldown_seconds),
                    ) if count == rule.limit else None
                    puts[path] = saved.model_copy(update={
                        "count": count, "blocked_until": blocked_until,
                        "expires_at": now + timedelta(days=1),
                    })
            if retry_after:
                return TransactionPlan(RateDecision(False, retry_after))
            return TransactionPlan(RateDecision(True), puts)

        return await self.repository.transact(tuple(scoped), decide)
