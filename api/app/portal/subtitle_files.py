"""090: tipos comuns dos fornecedores de legenda, texto do arquivo e extração segura do ZIP (contrato §3).

Funções puras, sem rede nem banco: o serviço e os testes usam as mesmas regras (D-015). Nada aqui guarda em disco.
"""

import io
import re
import zipfile
from dataclasses import dataclass
from typing import Literal

Language = Literal["pt-BR", "en", "es"]
Provider = Literal["opensubtitles", "subdl"]

MAX_TEXT_BYTES = 1024 * 1024
MAX_ZIP_BYTES = 2 * 1024 * 1024
MAX_ZIP_ENTRIES = 50
MAX_ZIP_TOTAL = 4 * 1024 * 1024
SUBTITLE_EXTENSIONS = (".srt", ".vtt")


class SubtitleProviderError(Exception):
    """Falha de um fornecedor, sem texto do fornecedor, URL ou chave (nunca vai para log nem para a TV)."""

    def __init__(self, kind: Literal["limit", "unavailable", "unreadable"]):
        super().__init__(kind)
        self.kind = kind


@dataclass(frozen=True)
class SearchQuery:
    language: Language
    tmdb_id: int | None = None
    parent_tmdb_id: int | None = None
    season: int | None = None
    episode: int | None = None
    query: str | None = None
    year: int | None = None

    @property
    def wants_episode(self) -> bool:
        return self.parent_tmdb_id is not None or (self.query is not None and self.episode is not None)


@dataclass(frozen=True)
class SubtitleHit:
    id: str
    provider: Provider
    language: Language
    release: str
    hearing_impaired: bool
    downloads: int | None = None
    season_pack: bool = False
    exact_episode: bool = False

    def view(self) -> dict:
        body = {"id": self.id, "provider": self.provider, "language": self.language,
                "release": self.release[:200], "hearingImpaired": self.hearing_impaired}
        if self.downloads is not None:
            body["downloads"] = self.downloads
        if self.season_pack:
            body["seasonPack"] = True
        return body


def decode_text(raw: bytes) -> str:
    """UTF-8 (com ou sem BOM); senão cp1252; senão ilegível. Arquivo > 1 MiB também é ilegível."""
    if len(raw) > MAX_TEXT_BYTES or not raw.strip():
        raise SubtitleProviderError("unreadable")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise SubtitleProviderError("unreadable")


def episode_pattern(season: int, episode: int) -> re.Pattern[str]:
    """`S01E03`, `s1e3`, `1x03` — sem casar `S01E031` nem `11x03`."""
    return re.compile(rf"(?<!\d)(?:s0*{season}\s*[ex]0*{episode}|0*{season}x0*{episode})(?!\d)", re.IGNORECASE)


def extract_subtitle(data: bytes, *, season: int | None = None, episode: int | None = None) -> bytes:
    """O arquivo SRT/WebVTT do ZIP. Só o nome-base conta (caminhos `../` nunca são usados), em memória, com teto de
    entradas e de bytes lidos (anti-bomba). Com vários arquivos e um episódio pedido (pacote de temporada), exige
    exatamente um arquivo daquele episódio; sem episódio pedido, o maior."""
    if len(data) > MAX_ZIP_BYTES:
        raise SubtitleProviderError("unreadable")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        entries = archive.infolist()
    except (zipfile.BadZipFile, OSError, ValueError):
        raise SubtitleProviderError("unreadable") from None
    if len(entries) > MAX_ZIP_ENTRIES:
        raise SubtitleProviderError("unreadable")
    candidates = []
    for info in entries:
        name = info.filename.replace("\\", "/").rsplit("/", 1)[-1]
        if info.is_dir() or info.flag_bits & 0x1 or not name.lower().endswith(SUBTITLE_EXTENSIONS):
            continue
        candidates.append((name, info))
    if not candidates:
        raise SubtitleProviderError("unreadable")

    if len(candidates) > 1 and season is not None and episode is not None:
        pattern = episode_pattern(season, episode)
        matching = [item for item in candidates if pattern.search(item[0])]
        if len(matching) != 1:
            raise SubtitleProviderError("unreadable")
        candidates = matching
    chosen = max(candidates, key=lambda item: item[1].file_size)[1]
    return _read_limited(archive, chosen)


def _read_limited(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    """Lê com contador real: o tamanho declarado no ZIP pode mentir."""
    if info.file_size > MAX_TEXT_BYTES:
        raise SubtitleProviderError("unreadable")
    out = bytearray()
    try:
        with archive.open(info) as handle:
            while chunk := handle.read(64 * 1024):
                out.extend(chunk)
                if len(out) > min(MAX_TEXT_BYTES, MAX_ZIP_TOTAL):
                    raise SubtitleProviderError("unreadable")
    except (zipfile.BadZipFile, OSError, ValueError, NotImplementedError, RuntimeError):
        raise SubtitleProviderError("unreadable") from None
    return bytes(out)
