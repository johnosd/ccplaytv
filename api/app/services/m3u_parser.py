"""Interface M3UParser sobre ipytv (m3u-ipytv) — troca de biblioteca não
deve afetar o resto do importador (research.md R1).

Também detecta manifesto HLS (RFC 8216) antes de classificar, para nunca
importar segmentos de streaming como se fossem canais de catálogo (FR-009;
ADR-005 §2).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ipytv import playlist as ipytv_playlist

# Tags que só existem em manifestos HLS de segmentos/variantes de verdade
# (RFC 8216): TARGETDURATION/MEDIA-SEQUENCE/ENDLIST são obrigatórias/típicas
# de uma media playlist; STREAM-INF/I-FRAME-STREAM-INF marcam uma master
# playlist. Deliberadamente NÃO inclui #EXT-X-SESSION-DATA sozinha — vários
# painéis Xtream/XUI injetam essa tag de branding/versão (ex.:
# "com.xui.1_5_5r2") em catálogos M3U comuns, sem o arquivo ser um manifesto
# de streaming; tratar qualquer "#EXT-X-*" como HLS gerava falso positivo
# rejeitando catálogos reais inteiros.
_HLS_TAG_PATTERN = re.compile(
    r"^#EXT-X-(STREAM-INF|I-FRAME-STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE|"
    r"ENDLIST|DISCONTINUITY|KEY|MAP|BYTERANGE|PLAYLIST-TYPE)\b",
    re.MULTILINE,
)


class HLSManifestDetectedError(ValueError):
    """O conteúdo é um manifesto de streaming (HLS), não uma playlist de catálogo."""


class EmptyPlaylistError(ValueError):
    """A lista M3U é sintaticamente válida mas não tem nenhuma entrada."""


class InvalidPlaylistError(ValueError):
    """O conteúdo não é reconhecível como M3U (ex.: HTML de erro, arquivo truncado)."""


@dataclass(frozen=True)
class ParsedEntry:
    name: str
    url: str
    group: str | None
    attributes: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ParseResult:
    entries: list[ParsedEntry]
    invalid_count: int


def is_hls_manifest(text: str) -> bool:
    """HLS reaproveita a tag #EXTM3U, mas só as tags de segmento/variante
    (TARGETDURATION, STREAM-INF, etc. — RFC 8216 seção 4) indicam de fato um
    manifesto de streaming, não um catálogo IPTV comum."""
    return bool(_HLS_TAG_PATTERN.search(text))


class M3UParser:
    def parse(self, text: str) -> ParseResult:
        stripped = text.strip()
        if not stripped:
            raise EmptyPlaylistError("Conteúdo vazio.")
        if not stripped.startswith("#EXTM3U"):
            raise InvalidPlaylistError(
                "Conteúdo não começa com #EXTM3U — não parece uma lista M3U."
            )
        if is_hls_manifest(text):
            raise HLSManifestDetectedError(
                "Conteúdo é um manifesto de streaming (HLS), não uma playlist de catálogo."
            )

        try:
            parsed = ipytv_playlist.loads(text)
        except Exception as exc:  # ipytv levanta exceções próprias (MalformedPlaylistException etc.)
            raise InvalidPlaylistError(f"Falha ao interpretar a lista M3U: {exc}") from exc

        entries: list[ParsedEntry] = []
        invalid_count = 0
        for channel in parsed.get_channels():
            if not channel.url:
                invalid_count += 1
                continue
            group = channel.attributes.get("group-title") or None
            entries.append(
                ParsedEntry(
                    name=channel.name or channel.url,
                    url=channel.url,
                    group=group,
                    attributes=dict(channel.attributes),
                )
            )

        if not entries:
            raise EmptyPlaylistError("Lista M3U sem nenhuma entrada válida.")
        return ParseResult(entries=entries, invalid_count=invalid_count)
