"""Classificação heurística Canal/Filme/Série+Episódio/Não Classificado
(FR-008; research.md R5; ADR-005 §2 — sem evidência, nunca inventar).

Agrupamento de episódios sob a série correta é expresso aqui por
`series_key`/`series_name`; a resolução para `parent_id` real (linkando ao
CatalogItem da série) é responsabilidade do importer (T024), que tem acesso
à sessão do banco.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.catalog_item import CatalogItemKind
from app.services.m3u_parser import ParsedEntry

_EPISODE_PATTERN = re.compile(
    r"^(?P<base>.*?)[\s._-]*S(?P<season>\d{1,2})\s*E(?P<episode>\d{1,3})\b.*$",
    re.IGNORECASE,
)

_MOVIE_KEYWORDS = {"filme", "filmes", "movie", "movies", "vod"}
_SERIES_KEYWORDS = {"série", "séries", "serie", "series", "seriado"}
_CHANNEL_KEYWORDS = {"canal", "canais", "channel", "channels", "ao vivo", "live", "tv"}


@dataclass(frozen=True)
class ClassifiedEntry:
    kind: CatalogItemKind
    name: str
    original_name: str
    group: str | None
    url: str
    series_key: str | None = None
    series_name: str | None = None
    season_number: int | None = None
    episode_number: int | None = None


def _group_keyword_kind(group: str | None) -> CatalogItemKind | None:
    if not group:
        return None
    lowered = group.lower()
    if any(keyword in lowered for keyword in _MOVIE_KEYWORDS):
        return CatalogItemKind.MOVIE
    if any(keyword in lowered for keyword in _SERIES_KEYWORDS):
        return CatalogItemKind.SERIES
    if any(keyword in lowered for keyword in _CHANNEL_KEYWORDS):
        return CatalogItemKind.CHANNEL
    return None


def classify_entry(entry: ParsedEntry) -> ClassifiedEntry:
    episode_match = _EPISODE_PATTERN.match(entry.name.strip())
    if episode_match:
        base = episode_match.group("base").strip(" -._") or entry.name
        return ClassifiedEntry(
            kind=CatalogItemKind.EPISODE,
            name=entry.name,
            original_name=entry.name,
            group=entry.group,
            url=entry.url,
            series_key=base.lower(),
            series_name=base,
            season_number=int(episode_match.group("season")),
            episode_number=int(episode_match.group("episode")),
        )

    group_kind = _group_keyword_kind(entry.group)
    if group_kind is not None:
        return ClassifiedEntry(
            kind=group_kind,
            name=entry.name,
            original_name=entry.name,
            group=entry.group,
            url=entry.url,
        )

    # Evidência insuficiente — Não Classificado, sem hierarquia inventada.
    return ClassifiedEntry(
        kind=CatalogItemKind.UNCLASSIFIED,
        name=entry.name,
        original_name=entry.name,
        group=entry.group,
        url=entry.url,
    )


def classify_entries(entries: list[ParsedEntry]) -> list[ClassifiedEntry]:
    return [classify_entry(entry) for entry in entries]
