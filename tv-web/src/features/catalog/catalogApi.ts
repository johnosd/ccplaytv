import { useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  db,
  type CategoryKind,
  type CatalogItemKind as StoredKind,
  type CatalogRecord,
} from '../../lib/catalog/db'
import {
  countChannels,
  getChannel,
  listCategories,
  listChannels,
  type CatalogCategory,
} from '../../lib/catalog/catalogRepository'
import { ensureCategory, type CategoryFetchOutcome } from '../../lib/catalog/categoryLoader'
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

/** Como o provedor declarou, normalizado — nunca um rótulo inventado. */
export function groupLabel(name: string | undefined): string {
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

// Re-exportado: telas falam só com `catalogApi`, nunca com
// `lib/catalog` direto — o mesmo motivo de D-001 para repositórios.
export type { CatalogCategory, CategoryFetchOutcome }

/**
 * A estrutura de uma seção — as categorias, na ordem declarada. Rápido e
 * sempre seguro de chamar: é leitura pura de `categories`, nunca toca rede
 * (feature 010, contrato `catalog-on-demand.md` §1).
 */
export function useCategoryList(sourceId: string | null, kind: StoredKind) {
  return useQuery({
    queryKey: ['categories', sourceId, kind],
    queryFn: () => (sourceId ? listCategories(sourceId, kind) : Promise.resolve([])),
    enabled: sourceId !== null,
  })
}

export interface CategoryContent {
  items: CatalogItemOut[]
  /** Contagem real, já depois de garantir a categoria — sempre o fato do disco, nunca a promessa da fonte. */
  totalCount: number
  outcome: CategoryFetchOutcome
}

/**
 * Garante e lê os itens de uma categoria — o corpo de `useCategoryContent`,
 * extraído para ser reusado por `prefetchCategoryContent` sem duplicar a
 * lógica.
 */
async function loadCategoryContent(sourceId: string, category: CatalogCategory): Promise<CategoryContent> {
  const result = await ensureCategory(sourceId, category)
  const records = await listChannels(sourceId, category.order, 0, CHANNELS_PER_GROUP_CAP, category.kind)
  const totalCount = await countChannels(sourceId, category.order, category.kind)
  return {
    items: records.map((record) => toItemOut(record, category.kind)),
    totalCount,
    outcome: result.outcome,
  }
}

function categoryContentKey(sourceId: string | null, categoryId: number | undefined) {
  return ['category-content', sourceId, categoryId] as const
}

/**
 * Garante e lê os itens de **uma** categoria.
 *
 * Só busca de fato quando `category` é informada. Quem alimenta essa
 * categoria é a tela: hoje é a categoria em que a pessoa **entrou**
 * (SELECT), não qualquer uma sobre a qual o cursor passou — mover o foco
 * nunca chama isto diretamente. A pré-busca por permanência do foco
 * (`prefetchCategoryContent`, abaixo) é o único outro jeito de a rede ser
 * tocada antes da entrada, e é deliberadamente separada e amortecida.
 */
export function useCategoryContent(sourceId: string | null, category: CatalogCategory | undefined) {
  return useQuery({
    queryKey: categoryContentKey(sourceId, category?.id),
    queryFn: async (): Promise<CategoryContent> => {
      if (!sourceId || !category) return { items: [], totalCount: 0, outcome: 'fresh' }
      return loadCategoryContent(sourceId, category)
    },
    enabled: sourceId !== null && category !== undefined,
  })
}

/**
 * Quanto o cursor precisa **parar** numa categoria antes de valer a pena
 * pré-buscá-la. Existe por causa do R-002 do plano da feature 010: sem
 * isto, passar o cursor rápido por uma trilha de centenas de categorias
 * dispararia uma consulta ao painel por categoria sobrevoada — o tipo de
 * rajada que faz um painel real limitar a taxa. Debounce, não intervalo
 * fixo: só a categoria onde o cursor de fato ficou é buscada.
 */
const CATEGORY_PREFETCH_DEBOUNCE_MS = 300

/**
 * Pré-busca uma categoria fora do ciclo normal de "entrar" — usada só pelo
 * amortecimento de `useCategoryFocusPrefetch`. Escreve no mesmo cache que
 * `useCategoryContent` lê (mesma `queryKey`), então quando a pessoa entra
 * de fato na categoria que acabou de ser pré-buscada, a tela mostra o
 * conteúdo na hora — sem outra ida à rede.
 */
export function prefetchCategoryContent(
  queryClient: QueryClient,
  sourceId: string,
  category: CatalogCategory,
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: categoryContentKey(sourceId, category.id),
    queryFn: () => loadCategoryContent(sourceId, category),
  })
}

/**
 * Pré-busca a categoria em foco na trilha, com o amortecimento acima.
 *
 * **Desvio deliberado da leitura original de FR-004** ("obter só na
 * entrada, nunca no foco"), pedido pelo usuário depois de ver o
 * comportamento estrito na TV física em 23/09/2026: mover o cursor pela
 * trilha sem pré-busca deixava a entrada sempre parecendo primeira vez.
 * Categoria não é um item reproduzível — pré-buscar sua listagem ao
 * focar não inicia reprodução nem expõe nada que a entrada não exporia
 * um instante depois; é o mesmo tipo de antecipação que um app de TV faz
 * ao pré-carregar a miniatura do próximo cartão. Ver `plan.md` R-013 e o
 * `data-model`/contrato desta feature para o registro completo.
 */
export function useCategoryFocusPrefetch(sourceId: string | null, focusedCategory: CatalogCategory | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!sourceId || !focusedCategory) return

    const timer = setTimeout(() => {
      void prefetchCategoryContent(queryClient, sourceId, focusedCategory)
    }, CATEGORY_PREFETCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // `focusedCategory` inteira na lista de dependências, de propósito: o
    // React Query devolve referência estável de `data` enquanto a consulta
    // não refizer de verdade, então isto só rearma o temporizador quando a
    // categoria em foco muda de fato — não é preciso comparar por `id`
    // manualmente.
  }, [sourceId, focusedCategory, queryClient])
}

/**
 * Uma contagem de seção que não finge saber o que não sabe (feature 010).
 *
 * `items` só existe quando há um número **real** para mostrar: soma de
 * itens já gravados numa categoria `eager` (M3U — sempre completa), ou soma
 * do que o provedor **declarou** numa categoria `on_demand` que ainda não
 * foi aberta. As duas nunca se misturam por categoria (D-005) — cada
 * categoria contribui com o número que é dela por direito.
 *
 * `categories` é sempre conhecido depois da estrutura importada, mesmo
 * quando nenhum item foi obtido ainda — e é o que o hub mostra quando não
 * há `items` para mostrar, em vez de um "0" que mentiria dizendo que a
 * seção está vazia.
 */
export interface SectionCount {
  items?: number
  categories: number
}

export interface CatalogCounts {
  channels: number
  movies: SectionCount
  series: SectionCount
}

async function sectionCount(sourceId: string, kind: CategoryKind): Promise<SectionCount> {
  const categories = await listCategories(sourceId, kind)
  let items: number | undefined
  for (const category of categories) {
    // Eager: os itens já estão todos gravados — é a soma real, completa.
    // On_demand: só soma o que a fonte declarou; painel Xtream real não
    // declara isso hoje (xtreamConnector.ts), então isto fica pronto para
    // quando algum declarar, sem inventar nada enquanto isso não acontece.
    const contribution = category.fetchMode === 'eager' ? category.count : category.declaredCount
    if (contribution === undefined) continue
    items = (items ?? 0) + contribution
  }
  return { items, categories: categories.length }
}

/**
 * Quantos itens (ou, na falta deles, quantas categorias) cada seção da
 * geração publicada tem.
 *
 * Enquanto nada chega, quem chama mostra nada — nunca um número de outra
 * origem (FR-014).
 */
export function useCatalogCounts(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-counts', sourceId],
    queryFn: async (): Promise<CatalogCounts> => {
      if (!sourceId) return { channels: 0, movies: { categories: 0 }, series: { categories: 0 } }
      const [channels, movies, series] = await Promise.all([
        countChannels(sourceId, undefined, 'channel'),
        sectionCount(sourceId, 'movie'),
        sectionCount(sourceId, 'series'),
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
