/**
 * Fixtures e normalizadores compartilhados entre o teste-referência de
 * paridade (Setup, T002) e o teste de paridade do caminho do arquivo
 * guardado (US3, T031) — `sdd/specs/014-m3u-sob-demanda`, SC-005.
 *
 * T002 grava a expectativa abaixo a partir do caminho integral **atual**
 * (antes de qualquer mudança desta feature). T031 lê a mesma fixture pelo
 * caminho novo (`scanToStored` + `categoryLoader`) e compara contra a
 * mesma expectativa, sem duplicar os dados. Nenhum dos dois testes deve
 * editar os valores esperados aqui.
 *
 * O que a expectativa NÃO compara, de propósito, porque muda entre os
 * dois caminhos por desenho (D-004/D-011 do plan.md): `fetchMode`,
 * `declaredCount`, `itemsFetchedAt`, `groupOrder`, `providerCategoryId`.
 */
import type { CatalogCategory } from './catalogRepository'
import type { CatalogItemKind, CatalogRecord } from './db'

/**
 * Lista M3U avulsa (sem painel Xtream por trás). Cobre: dois canais no
 * mesmo grupo, um canal em grupo diferente, um filme, uma série `SxxEyy`
 * com dois episódios, uma entrada sem `group-title` nenhum e uma entrada
 * cujo grupo não bate nenhuma palavra-chave — as duas últimas ficam
 * `unclassified` e descartadas.
 */
export const M3U_AVULSA_FIXTURE = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="Canais | Esportes",ESPN',
  'http://exemplo.test/live/1.ts',
  '#EXTINF:-1 group-title="Canais | Esportes",Fox Sports',
  'http://exemplo.test/live/2.ts',
  '#EXTINF:-1 group-title="Canais | Variedades",Canal Variedades',
  'http://exemplo.test/live/3.ts',
  '#EXTINF:-1 group-title="Filmes",Um Filme Qualquer',
  'http://exemplo.test/vod/1.mp4',
  '#EXTINF:-1 group-title="Series",Breaking Bad S01E01',
  'http://exemplo.test/vod/2.mp4',
  '#EXTINF:-1 group-title="Series",Breaking Bad S01E02',
  'http://exemplo.test/vod/3.mp4',
  '#EXTINF:-1,Sem Categoria Nenhuma',
  'http://exemplo.test/outro/1.mp4',
  '#EXTINF:-1 group-title="Aleatorio",Coisa Sem Tipo',
  'http://exemplo.test/outro/2.mp4',
].join('\n')

/**
 * Lista M3U de um provedor em "Modo limitado" (`legacy_m3u`) — o painel
 * autentica mas não fala o protocolo JSON. Cobre: canal e filme com o
 * segmento de tipo na URL (`/live/`, `/movie/`), um episódio SEM padrão
 * `SxxEyy` no nome, tipado só pela URL (`/series/`, D-012), e uma entrada
 * cuja URL não bate nenhum formato reconhecido — fica `unclassified`.
 */
export const M3U_LEGACY_FIXTURE = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="Canais",Canal Legado',
  'http://exemplo.test/live/usuario-teste/senha-teste/77.ts',
  '#EXTINF:-1 group-title="Filmes",Filme Legado',
  'http://exemplo.test/movie/usuario-teste/senha-teste/500.mkv',
  '#EXTINF:-1 group-title="Filmes e Séries",Um Episódio Qualquer',
  'http://exemplo.test/series/usuario-teste/senha-teste/900.mp4',
  '#EXTINF:-1 group-title="Aleatorio Limitado",Coisa Sem Tipo Legado',
  'http://exemplo.test/outro/usuario-teste/senha-teste/1.bin',
].join('\n')

export interface NormalizedCategory {
  kind: 'channel' | 'movie' | 'series'
  name: string | undefined
  order: number
  count: number
}

export interface NormalizedItem {
  kind: CatalogItemKind
  name: string
  originalName: string
  group: string | undefined
  /** `"<kind>:<nome>"` da categoria dona, ou `undefined` (episódio, item sem categoria navegável). */
  category: string | undefined
  seriesId: string | undefined
  seasonNumber: number | undefined
  episodeNumber: number | undefined
  providerStreamId: string | undefined
  streamExtension: string | undefined
  directUrl: string | undefined
}

function categoryKey(category: Pick<CatalogCategory, 'kind' | 'name'>): string {
  return `${category.kind}:${category.name ?? ''}`
}

/** Ordem estável, independente da ordem física de gravação/leitura. */
function itemSortKey(item: NormalizedItem): string {
  return [item.kind, item.group ?? '', item.name, item.seasonNumber ?? -1, item.episodeNumber ?? -1].join('|')
}

function sortItems(items: NormalizedItem[]): NormalizedItem[] {
  return items.slice().sort((a, b) => (itemSortKey(a) < itemSortKey(b) ? -1 : itemSortKey(a) > itemSortKey(b) ? 1 : 0))
}

export function normalizeCategories(categories: CatalogCategory[]): NormalizedCategory[] {
  return categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      kind: category.kind,
      name: category.name,
      order: category.order,
      count: category.count,
    }))
}

export function normalizeItems(records: CatalogRecord[], categories: CatalogCategory[]): NormalizedItem[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const normalized = records.map((record): NormalizedItem => {
    const category = record.categoryId !== undefined ? byId.get(record.categoryId) : undefined
    return {
      kind: record.kind,
      name: record.name,
      originalName: record.originalName,
      group: record.group,
      category: category ? categoryKey(category) : undefined,
      seriesId: record.seriesId,
      seasonNumber: record.seasonNumber,
      episodeNumber: record.episodeNumber,
      providerStreamId: record.providerStreamId,
      streamExtension: record.streamExtension,
      directUrl: record.directUrl,
    }
  })
  return sortItems(normalized)
}

/**
 * Expectativa gravada pela T002 a partir do caminho integral atual, com
 * `M3U_AVULSA_FIXTURE` importada por uma fonte `m3u_url`. NÃO EDITAR sem
 * revisitar SC-005 e a T031.
 */
export const EXPECTED_AVULSA: { categories: NormalizedCategory[]; items: NormalizedItem[] } = {
  categories: [
    { kind: 'channel', name: 'Canais | Esportes', order: 0, count: 2 },
    { kind: 'channel', name: 'Canais | Variedades', order: 1, count: 1 },
    { kind: 'movie', name: 'Filmes', order: 2, count: 1 },
    { kind: 'series', name: 'Series', order: 3, count: 1 },
  ],
  items: sortItems([
    {
      kind: 'channel',
      name: 'ESPN',
      originalName: 'ESPN',
      group: 'Canais | Esportes',
      category: 'channel:Canais | Esportes',
      seriesId: undefined,
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: undefined,
      streamExtension: undefined,
      directUrl: 'http://exemplo.test/live/1.ts',
    },
    {
      kind: 'channel',
      name: 'Fox Sports',
      originalName: 'Fox Sports',
      group: 'Canais | Esportes',
      category: 'channel:Canais | Esportes',
      seriesId: undefined,
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: undefined,
      streamExtension: undefined,
      directUrl: 'http://exemplo.test/live/2.ts',
    },
    {
      kind: 'channel',
      name: 'Canal Variedades',
      originalName: 'Canal Variedades',
      group: 'Canais | Variedades',
      category: 'channel:Canais | Variedades',
      seriesId: undefined,
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: undefined,
      streamExtension: undefined,
      directUrl: 'http://exemplo.test/live/3.ts',
    },
    {
      kind: 'movie',
      name: 'Um Filme Qualquer',
      originalName: 'Um Filme Qualquer',
      group: 'Filmes',
      category: 'movie:Filmes',
      seriesId: undefined,
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: undefined,
      streamExtension: undefined,
      directUrl: 'http://exemplo.test/vod/1.mp4',
    },
    {
      kind: 'series',
      name: 'Breaking Bad',
      originalName: 'Breaking Bad',
      group: 'Series',
      category: 'series:Series',
      seriesId: 'm3u:Series|breaking bad',
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: undefined,
      streamExtension: undefined,
      directUrl: undefined,
    },
    {
      kind: 'episode',
      name: 'Breaking Bad S01E01',
      originalName: 'Breaking Bad S01E01',
      group: 'Series',
      category: undefined,
      seriesId: 'm3u:Series|breaking bad',
      seasonNumber: 1,
      episodeNumber: 1,
      providerStreamId: undefined,
      streamExtension: undefined,
      directUrl: 'http://exemplo.test/vod/2.mp4',
    },
    {
      kind: 'episode',
      name: 'Breaking Bad S01E02',
      originalName: 'Breaking Bad S01E02',
      group: 'Series',
      category: undefined,
      seriesId: 'm3u:Series|breaking bad',
      seasonNumber: 1,
      episodeNumber: 2,
      providerStreamId: undefined,
      streamExtension: undefined,
      directUrl: 'http://exemplo.test/vod/3.mp4',
    },
  ]),
}

/** `entriesRead`/`discardedByType`/`channelsStored` do `ImportRunRecord`. */
export const EXPECTED_AVULSA_TALLY = {
  entriesRead: 8,
  discardedByType: 2,
  channelsStored: 7,
}

/**
 * Expectativa gravada pela T002 a partir do caminho integral atual, com
 * `M3U_LEGACY_FIXTURE` importada por uma fonte de provedor cujo painel cai
 * no "Modo limitado". NÃO EDITAR sem revisitar SC-005 e a T031.
 */
export const EXPECTED_LEGACY: { categories: NormalizedCategory[]; items: NormalizedItem[] } = {
  categories: [
    { kind: 'channel', name: 'Canais', order: 0, count: 1 },
    { kind: 'movie', name: 'Filmes', order: 1, count: 1 },
    { kind: 'series', name: 'Filmes e Séries', order: 2, count: 1 },
  ],
  items: sortItems([
    {
      kind: 'channel',
      name: 'Canal Legado',
      originalName: 'Canal Legado',
      group: 'Canais',
      category: 'channel:Canais',
      seriesId: undefined,
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: '77',
      streamExtension: 'ts',
      directUrl: undefined,
    },
    {
      kind: 'movie',
      name: 'Filme Legado',
      originalName: 'Filme Legado',
      group: 'Filmes',
      category: 'movie:Filmes',
      seriesId: undefined,
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: '500',
      streamExtension: 'mkv',
      directUrl: undefined,
    },
    {
      kind: 'series',
      name: 'Um Episódio Qualquer',
      originalName: 'Um Episódio Qualquer',
      group: 'Filmes e Séries',
      category: 'series:Filmes e Séries',
      seriesId: 'm3u:Filmes e Séries|um episódio qualquer',
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: undefined,
      streamExtension: undefined,
      directUrl: undefined,
    },
    {
      kind: 'episode',
      name: 'Um Episódio Qualquer',
      originalName: 'Um Episódio Qualquer',
      group: 'Filmes e Séries',
      category: undefined,
      seriesId: 'm3u:Filmes e Séries|um episódio qualquer',
      seasonNumber: undefined,
      episodeNumber: undefined,
      providerStreamId: '900',
      streamExtension: 'mp4',
      directUrl: undefined,
    },
  ]),
}

/** `entriesRead`/`discardedByType`/`channelsStored` do `ImportRunRecord`. */
export const EXPECTED_LEGACY_TALLY = {
  entriesRead: 4,
  discardedByType: 1,
  channelsStored: 4,
}
