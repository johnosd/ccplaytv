import pytest

from app.models.catalog_item import CatalogItemKind
from app.services.classifier import classify_entries
from app.services.m3u_parser import HLSManifestDetectedError, M3UParser

SAMPLE_M3U = """#EXTM3U
#EXTINF:-1 group-title="Canais Esportes",ESPN Sintetico
http://exemplo.test/live/espn.m3u8
#EXTINF:-1 group-title="Filmes Acao",Matrix Sintetico
http://exemplo.test/vod/matrix.mp4
#EXTINF:-1 group-title="Series Comedia",Show Ficticio S01E01
http://exemplo.test/vod/show-s01e01.mp4
#EXTINF:-1 group-title="Series Comedia",Show Ficticio S01E02
http://exemplo.test/vod/show-s01e02.mp4
#EXTINF:-1,Item Sem Grupo Nem Padrao
http://exemplo.test/vod/misterioso.mp4
"""

HLS_MANIFEST = (
    "#EXTM3U\n"
    "#EXT-X-VERSION:3\n"
    "#EXT-X-TARGETDURATION:10\n"
    "#EXTINF:10.0,\n"
    "segment0.ts\n"
    "#EXTINF:10.0,\n"
    "segment1.ts\n"
    "#EXT-X-ENDLIST\n"
)

# Reproduz uma característica real observada num catálogo Xtream/XUI: a tag
# #EXT-X-SESSION-DATA de branding/versão do painel aparece logo após
# #EXTM3U, mas o resto do arquivo é um catálogo IPTV comum — não um
# manifesto de streaming. Ver correção de is_hls_manifest (falso positivo).
CATALOG_WITH_XUI_SESSION_DATA = (
    '#EXTM3U\n'
    '#EXT-X-SESSION-DATA:DATA-ID="com.xui.1_5_5r2"\n'
    '#EXTINF:-1 tvg-name="Canal Exemplo" group-title="Canais | Variedades",Canal Exemplo\n'
    "http://exemplo.test/live/canal-exemplo.ts\n"
)


def test_classify_entries_covers_all_kinds():
    entries = M3UParser().parse(SAMPLE_M3U).entries
    classified = classify_entries(entries)

    kinds = {c.kind for c in classified}
    assert kinds == {
        CatalogItemKind.CHANNEL,
        CatalogItemKind.MOVIE,
        CatalogItemKind.EPISODE,
        CatalogItemKind.UNCLASSIFIED,
    }


def test_episodes_share_the_same_series_key_and_are_not_duplicated_as_series():
    entries = M3UParser().parse(SAMPLE_M3U).entries
    classified = classify_entries(entries)
    episodes = [c for c in classified if c.kind == CatalogItemKind.EPISODE]

    assert len(episodes) == 2
    assert episodes[0].series_key == episodes[1].series_key
    assert {e.episode_number for e in episodes} == {1, 2}
    assert all(e.season_number == 1 for e in episodes)
    # Nenhum episódio deve ter sido classificado como CatalogItemKind.SERIES avulso.
    assert not any(c.kind == CatalogItemKind.SERIES for c in classified)


def test_ambiguous_entry_is_unclassified_not_inferred():
    entries = M3UParser().parse(SAMPLE_M3U).entries
    classified = classify_entries(entries)
    unclassified = [c for c in classified if c.kind == CatalogItemKind.UNCLASSIFIED]

    assert len(unclassified) == 1
    assert unclassified[0].name == "Item Sem Grupo Nem Padrao"


def test_hls_manifest_is_rejected_not_imported_as_channels():
    with pytest.raises(HLSManifestDetectedError):
        M3UParser().parse(HLS_MANIFEST)


def test_xui_session_data_tag_does_not_false_positive_as_hls():
    result = M3UParser().parse(CATALOG_WITH_XUI_SESSION_DATA)
    assert len(result.entries) == 1
    classified = classify_entries(result.entries)
    assert classified[0].kind == CatalogItemKind.CHANNEL


def test_series_group_without_episode_pattern_is_classified_as_series_directly():
    # Achado num catálogo real: grupo "Séries" mas nome sem padrão SxxExx —
    # deve virar uma Série avulsa (RF-008/research.md R5), nunca um episódio
    # inventado nem Não Classificado quando o grupo já é evidência de tipo.
    m3u = (
        "#EXTM3U\n"
        '#EXTINF:-1 group-title="Series Suspense",Serie Sem Padrao De Episodio\n'
        "http://exemplo.test/vod/serie-sem-padrao.mp4\n"
    )
    entries = M3UParser().parse(m3u).entries
    classified = classify_entries(entries)

    assert len(classified) == 1
    assert classified[0].kind == CatalogItemKind.SERIES
    assert classified[0].series_key is None
