import { useQuery } from '@tanstack/react-query'
import { db, type CatalogItemKind as StoredKind, type CatalogRecord } from '../../lib/catalog/db'
import {
  countChannels,
  getChannel,
  listCategories,
  listChannels,
} from '../../lib/catalog/catalogRepository'
import { PlaybackUnavailableError, resolvePlaybackUrl } from '../../lib/catalog/playbackUrl'
import { CHANNELS_PER_GROUP_CAP, UNGROUPED_LABEL } from '../live/groupChannels'

export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

export interface CatalogItemOut {
  id: string
  kind: CatalogItemKind
  name: string
  original_group: string | null
  published: boolean
  playable: boolean
}

export interface CatalogItemListResponse {
  items: CatalogItemOut[]
  /** Ordem da próxima categoria a carregar, ou `null` quando acabou. */
  next_cursor: string | null
  /** Quantos itens deste tipo existem na geração publicada, antes de qualquer teto. */
  total_count: number
  /** Total real por categoria — o teto de leitura não pode fazer a contagem mentir. */
  group_totals: Record<string, number>
}

export interface CatalogItemPlayback {
  item_id: string
  kind: CatalogItemKind
  url: string
  container_hint: string | null
}

export class CatalogApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Teto de itens lidos numa consulta de tela.
 *
 * O repositório é paginado por contrato (FR-005) justamente porque a fonte
 * real já importada tem 311.367 entradas: pedir tudo devolve um vetor de
 * centenas de milhares de objetos e trava a TV antes de qualquer desenho.
 * O teto por categoria é o mesmo que a tela já aplica ao renderizar, então
 * nada que seria exibido deixa de ser lido; o teto total existe para o caso
 * de uma fonte com centenas de categorias cheias.
 *
 * **Salvaguarda, não regra de produto** — some quando a virtualização com
 * carga por categoria entrar (feature 009).
 */
const ITEM_BUDGET = 5000

function groupLabel(name: string | undefined): string {
  return name?.trim() ? name.trim() : UNGROUPED_LABEL
}

function toItemOut(record: CatalogRecord, kind: CatalogItemKind): CatalogItemOut {
  return {
    id: String(record.id ?? ''),
    kind,
    name: record.name,
    original_group: record.group ?? null,
    published: true,
    // Série é agrupador: o que se reproduz é um episódio dela, então ela
    // nunca se anuncia como reproduzível.
    playable:
      kind === 'series'
        ? false
        : Boolean(record.directUrl) || Boolean(record.providerStreamId),
  }
}

/**
 * Percorre as categorias da geração ativa na ordem declarada pela fonte,
 * lendo uma página de cada uma até o orçamento acabar.
 */
async function listByKind(
  sourceId: string,
  kind: StoredKind,
  outKind: CatalogItemKind,
): Promise<CatalogItemListResponse> {
  const categories = await listCategories(sourceId, kind)
  const items: CatalogItemOut[] = []
  const groupTotals: Record<string, number> = {}
  let total = 0
  let nextCursor: string | null = null

  for (const category of categories) {
    total += category.count
    groupTotals[groupLabel(category.name)] = category.count

    if (items.length >= ITEM_BUDGET) {
      // Primeira categoria que não coube: é daqui que uma próxima página
      // continuaria. Continuar o laço só para somar `total_count` mantém a
      // contagem honesta sem ler mais nada.
      nextCursor ??= String(category.order)
      continue
    }

    const page = await listChannels(
      sourceId,
      category.order,
      0,
      Math.min(category.count, CHANNELS_PER_GROUP_CAP, ITEM_BUDGET - items.length),
      kind,
    )
    for (const record of page) items.push(toItemOut(record, outKind))
  }

  return { items, next_cursor: nextCursor, total_count: total, group_totals: groupTotals }
}

export function useChannels(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-items', sourceId, 'channel'],
    queryFn: async () =>
      sourceId
        ? listByKind(sourceId, 'channel', 'channel')
        : ({
            items: [],
            next_cursor: null,
            total_count: 0,
            group_totals: {},
          } satisfies CatalogItemListResponse),
    enabled: sourceId !== null,
  })
}

export function useMovies(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-items', sourceId, 'movie'],
    queryFn: async () =>
      sourceId
        ? listByKind(sourceId, 'movie', 'movie')
        : ({
            items: [],
            next_cursor: null,
            total_count: 0,
            group_totals: {},
          } satisfies CatalogItemListResponse),
    enabled: sourceId !== null,
  })
}

export function useSeries(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-items', sourceId, 'series'],
    queryFn: async () =>
      sourceId
        ? listByKind(sourceId, 'series', 'series')
        : ({
            items: [],
            next_cursor: null,
            total_count: 0,
            group_totals: {},
          } satisfies CatalogItemListResponse),
    enabled: sourceId !== null,
  })
}

export interface CatalogCounts {
  channels: number
  movies: number
  series: number
}

/**
 * Quantos itens de cada tipo a geração publicada tem.
 *
 * Conta pelo índice, sem trazer registro nenhum: é o que permite o hub de
 * uma lista anunciar um número **real**. Enquanto a contagem não chega,
 * quem chama mostra nada — nunca um número de outra origem.
 */
export function useCatalogCounts(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-counts', sourceId],
    queryFn: async (): Promise<CatalogCounts> => {
      if (!sourceId) return { channels: 0, movies: 0, series: 0 }
      const [channels, movies, series] = await Promise.all([
        countChannels(sourceId, undefined, 'channel'),
        countChannels(sourceId, undefined, 'movie'),
        countChannels(sourceId, undefined, 'series'),
      ])
      return { channels, movies, series }
    },
    enabled: sourceId !== null,
  })
}

/**
 * Um item pelo seu id, direto pela chave primária.
 *
 * As telas de detalhe existiam lendo a lista inteira e procurando dentro
 * dela — o que, além de custar o catálogo todo para mostrar um item, deixa
 * de encontrar qualquer coisa que tenha ficado além do teto de leitura.
 */
export function useCatalogItem(itemId: string | null) {
  return useQuery({
    queryKey: ['catalog-item', itemId],
    queryFn: async () => {
      if (!itemId) return null
      const record = await getChannel(Number(itemId))
      return record ? toItemOut(record, record.kind) : null
    },
    enabled: itemId !== null,
  })
}

export async function fetchPlayback(itemId: string): Promise<CatalogItemPlayback> {
  const id = Number(itemId)
  const record = await getChannel(id, db)

  try {
    const url = await resolvePlaybackUrl(id, db)
    return {
      item_id: itemId,
      // O tipo real do item, não um valor fixo: é ele que decide o caminho
      // da URL no painel e o que a camada de reprodução pode oferecer.
      kind: record?.kind ?? 'channel',
      url,
      container_hint: record?.streamExtension ?? null,
    }
  } catch (error) {
    // Item existe no catálogo mas não dá para montar a URL dele. É a mesma
    // situação que o backend sinalizava com 409: não adianta tentar de novo,
    // e a camada de reprodução já sabe dizer isso sem expor o motivo cru.
    if (error instanceof PlaybackUnavailableError) {
      throw new CatalogApiError(409, 'Item sem fonte de reprodução disponível.')
    }
    throw error
  }
}
