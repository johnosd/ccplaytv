"""090 (ADR-021, constitution 1.16.0 (k)): legendas externas com as chaves padrão do ccplayTv, só no servidor.

Busca nos fornecedores em paralelo e junta numa lista; baixa pelo fornecedor do id opaco. Só TV com licença/teste
vigente, com limite por TV. Nunca registra termo, ID da obra, URL de fornecedor ou chave."""

import asyncio
from collections.abc import Mapping
from datetime import datetime
from typing import Protocol

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.rate_limit import RateConstraint
from app.portal.subtitle_files import SearchQuery, SubtitleHit, SubtitleProviderError

# Um pouco acima do timeout por chamada (8 s): um fornecedor lento não segura o outro além disso.
PROVIDER_DEADLINE_SECONDS = 9
PREFIXES = {"os": "opensubtitles", "sd": "subdl"}
ORDER = ("opensubtitles", "subdl")


class SubtitleProvider(Protocol):
    name: str

    async def search(self, query: SearchQuery) -> list[SubtitleHit]: ...

    async def download(self, provider_id: str, query: SearchQuery) -> str: ...


class AccessCheck(Protocol):
    async def has_access(self, principal: Principal, now: datetime) -> bool: ...


class SubtitleService:
    def __init__(self, auth: AuthService, licensing: AccessCheck, providers: Mapping[str, SubtitleProvider], *,
                 downloads_per_day: int, searches_per_hour: int):
        self.auth = auth
        self.licensing = licensing
        self.providers = dict(providers)
        self.downloads_per_day = downloads_per_day
        self.searches_per_hour = searches_per_hour

    def _rule(self, scope: str, device_id: str, limit: int, seconds: int) -> RateConstraint:
        return RateConstraint(self.auth.tokens.digest("rate_limit", scope + "/" + device_id), limit, seconds)

    async def _require_access(self, principal: Principal, now: datetime) -> None:
        if not self.providers:
            raise AuthError("service_unavailable", 503)
        if not await self.licensing.has_access(principal, now):
            raise AuthError("subtitles_not_entitled", 409)

    async def search(self, principal: Principal, query: SearchQuery, wanted: set[str] | None,
                     now: datetime) -> dict:
        await self._require_access(principal, now)
        rule = self._rule("subtitles-search", principal.device_id, self.searches_per_hour, 3600)
        decision = await self.auth.limits.evaluate((rule,), now, consume=True)
        if not decision.allowed:
            raise AuthError("rate_limited", 429, decision.retry_after)
        names = [name for name in ORDER if name in self.providers and (wanted is None or name in wanted)]
        if not names:
            raise AuthError("service_unavailable", 503)
        outcomes = await asyncio.gather(
            *(asyncio.wait_for(self.providers[name].search(query), PROVIDER_DEADLINE_SECONDS) for name in names),
            return_exceptions=True,
        )
        results: list[dict] = []
        unavailable: list[str] = []
        limited = False
        for name, outcome in zip(names, outcomes, strict=True):
            if isinstance(outcome, BaseException):
                unavailable.append(name)
                limited = limited or (isinstance(outcome, SubtitleProviderError) and outcome.kind == "limit")
                continue
            results.extend(hit.view() for hit in outcome)
        if len(unavailable) == len(names):
            raise AuthError("subtitles_provider_limit" if limited else "service_unavailable", 503)
        return {"results": results, "unavailable": unavailable}

    async def download(self, principal: Principal, result_id: str, query: SearchQuery, now: datetime) -> str:
        await self._require_access(principal, now)
        prefix, _, provider_id = result_id.partition(":")
        provider = self.providers.get(PREFIXES.get(prefix, ""))
        if provider is None:
            raise AuthError("service_unavailable", 503)
        rule = self._rule("subtitles-download", principal.device_id, self.downloads_per_day, 86400)
        # Confere antes e só consome depois do sucesso: falha do fornecedor não gasta a cota da pessoa.
        decision = await self.auth.limits.evaluate((rule,), now, consume=False)
        if not decision.allowed:
            raise AuthError("subtitles_device_limit", 429, decision.retry_after)
        try:
            text = await asyncio.wait_for(provider.download(provider_id, query), PROVIDER_DEADLINE_SECONDS)
        except SubtitleProviderError as error:
            if error.kind == "limit":
                raise AuthError("subtitles_provider_limit", 503) from None
            if error.kind == "unreadable":
                raise AuthError("subtitles_unreadable", 409) from None
            raise AuthError("service_unavailable", 503) from None
        except TimeoutError:
            raise AuthError("service_unavailable", 503) from None
        consumed = await self.auth.limits.evaluate((rule,), now, consume=True)
        if not consumed.allowed:
            # Outra requisição da mesma TV levou a última vaga enquanto esta baixava.
            raise AuthError("subtitles_device_limit", 429, consumed.retry_after)
        return text
