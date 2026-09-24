import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  db,
  type CategoryKind,
  type CatalogItemKind as StoredKind,
  type CatalogRecord,
  type UserStateRecord,
} from '../../lib/catalog/db'
import {
  countChannels,
  getChannel,
  listCategories,
  listChannels,
  listEpisodes,
  resolveFavorites,
  type CatalogCategory,
} from '../../lib/catalog/catalogRepository'
import { ensureCategory, type CategoryFetchOutcome } from '../../lib/catalog/categoryLoader'
import { ensureSeriesEpisodes, type SeriesFetchOutcome } from '../../lib/catalog/seriesLoader'
import { PlaybackUnavailableError, resolvePlaybackUrl } from '../../lib/catalog/playbackUrl'
import {
  buildStableId,
  getUserState,
  getUserStates,
  listFavorites,
  parseStableId,
  toggleFavorite,
} from '../../lib/catalog/userStateRepository'
import { UNGROUPED_LABEL } from '../live/groupChannels'

export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

export interface CatalogItemOut {
  id: string
  kind: CatalogItemKind
  name: string
  original_group: string | null
  published: boolean
  playable: boolean
  /**
   * Identidade estável (feature 011, retomada) — opcionais de propósito: as
   * grades (Filmes/Séries/Live) constroem `CatalogItemOut` em massa e nunca
   * precisam destes campos; só a tela de detalhe os consome, para montar a
   * chave de `userStateRepository.buildStableId` sem depender da URL.
   */
  source_id?: string
  provider_stream_id?: string | null
  original_name?: string
  /** Liga um episódio à série (feature 012). `undefined` fora do detalhe de série, como os demais campos de identidade. */
  series_id?: string | null
}

export interface CatalogItemPlayback {
  item_id: string
  kind: CatalogItemKind
  url: string
  container_hint: string | null
  /**
   * Identidade estável (feature 011, retomada) — `userStateRepository.
   * buildStableId` monta a chave de progresso a partir destes campos,
   * nunca da URL. `provider_stream_id` ausente é o caso normal de fonte M3U
   * (sem identificador de painel); `buildStableId` cai em `original_name`.
   */
  source_id: string
  provider_stream_id: string | null
  original_name: string
  /** Série, temporada e episódio (feature 012) — `null` para canal/filme. */
  series_id: string | null
  season_number: number | null
  episode_number: number | null
}

/** O que `stableIdOf` precisa — CatalogItemOut e CatalogItemPlayback satisfazem por tipagem estrutural. */
export interface StableIdSource {
  source_id?: string
  kind: CatalogItemKind
  provider_stream_id?: string | null
  series_id?: string | null
  season_number?: number | null
  episode_number?: number | null
  original_name?: string
}

/**
 * Identidade estável de reprodução (feature 012, D-006) — ponto único que
 * monta `buildStableId` a partir da forma que as telas recebem, incluindo
 * temporada/episódio. Antes desta feature, `PlayerLayer.computeIdentity` e
 * `MovieDetailScreen.computeIdentity` duplicavam essa montagem sem os
 * campos de série — todo episódio colidiria em `s0|e0` (R-001). Nunca
 * lança: sem identidade estável, `null` (D-010 da 011).
 */
export function stableIdOf(item: StableIdSource): string | null {
  try {
    return buildStableId({
      sourceId: item.source_id ?? '',
      kind: item.kind,
      providerStreamId: item.provider_stream_id ?? undefined,
      seriesId: item.series_id ?? undefined,
      seasonNumber: item.season_number ?? undefined,
      episodeNumber: item.episode_number ?? undefined,
      originalName: item.original_name ?? '',
    })
  } catch {
    return null
  }
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
    source_id: record.sourceId,
    provider_stream_id: record.providerStreamId ?? null,
    original_name: record.originalName,
    series_id: record.seriesId ?? null,
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
 * "Sem teto" para `listChannels` (feature 009, D-002 completo).
 *
 * **Não é** `Number.MAX_SAFE_INTEGER`: esse `limit` chega até
 * `IDBIndex.getAll(query, count)`, e o navegador exige `count` como
 * `unsigned long` do WebIDL — no máximo `2**32 - 1`. Um valor maior lança
 * `TypeError: ... is outside the 'unsigned long' value range`, descoberto
 * ao verificar esta feature na TV física em 23/09/2026: a categoria vinha
 * vazia (ou, dependendo do motor, com linhas sobrepostas por outro bug já
 * corrigido) porque a consulta nunca completava. `0xFFFFFFFF` é o teto
 * real do navegador — folgado o bastante para qualquer categoria real
 * (a fonte inteira de referência tem 311.367 entradas), sem arriscar essa
 * mesma armadilha nalgum motor mais recente que valide o argumento.
 */
const NO_LIMIT = 0xffffffff

/**
 * Garante e lê os itens de uma categoria — o corpo de `useCategoryContent`,
 * extraído para ser reusado por `prefetchCategoryContent` sem duplicar a
 * lógica.
 */
async function loadCategoryContent(sourceId: string, category: CatalogCategory): Promise<CategoryContent> {
  const result = await ensureCategory(sourceId, category)
  // As três seções buscam a categoria inteira, sem teto de leitura (feature
  // 009, D-002 completo) — painel de canais e grades de pôsteres agora
  // virtualizam o que renderizam, então não precisam mais de um corte
  // artificial pra não travar a TV.
  const records = await listChannels(sourceId, category.order, 0, NO_LIMIT, category.kind)
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
  channels: SectionCount
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
 * origem (FR-014). Canais passam pela mesma regra de filmes/séries
 * (`sectionCount`) — não pela contagem bruta do disco (`countChannels`) —
 * porque canal de provedor também nasce `on_demand` (feature 010, achado
 * C-001 do `sdd-converge`): mostrar o disco cru daria "0" logo após
 * sincronizar, exatamente o número mentiroso que FR-014 proíbe.
 */
export function useCatalogCounts(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-counts', sourceId],
    queryFn: async (): Promise<CatalogCounts> => {
      if (!sourceId) {
        return { channels: { categories: 0 }, movies: { categories: 0 }, series: { categories: 0 } }
      }
      const [channels, movies, series] = await Promise.all([
        sectionCount(sourceId, 'channel'),
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
      source_id: record?.sourceId ?? '',
      provider_stream_id: record?.providerStreamId ?? null,
      original_name: record?.originalName ?? '',
      series_id: record?.seriesId ?? null,
      season_number: record?.seasonNumber ?? null,
      episode_number: record?.episodeNumber ?? null,
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

/**
 * O estado do usuário (favorito/progresso) de um item, por identidade
 * estável — nunca pela URL (feature 011, retomada).
 *
 * `null` cobre dois casos que a tela trata igual: sem identidade estável
 * (`stableId` nulo) e identidade que nunca teve estado gravado. Os dois
 * significam a mesma coisa pra ação primária: "Assistir", sem retomada.
 */
export function useUserState(stableId: string | null) {
  return useQuery({
    queryKey: ['user-state', stableId],
    queryFn: async (): Promise<UserStateRecord | null> => {
      if (!stableId) return null
      const state = await getUserState(stableId, db)
      return state ?? null
    },
    enabled: stableId !== null,
  })
}

/**
 * Invalida a leitura de `useUserState` para um item.
 *
 * Exportada (não inline na tela) de propósito: a camada de reprodução é
 * **camada**, não rota — a tela de detalhe continua montada por baixo
 * enquanto o filme toca, com a leitura de quando montou. Sem invalidar ao
 * fechar a camada, "Retomar" continuaria mostrando a posição antiga (ou
 * "Assistir", como se nada tivesse sido gravado) — `logic/
 * reproducao-vod.md` §5.1. A tela de séries (feature seguinte) reusa esta
 * mesma função em vez de inventar outra chave.
 */
export function invalidateUserState(queryClient: QueryClient, stableId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['user-state', stableId] })
}

/**
 * Um episódio, pronto pra tela (feature 012, `data-model.md` §5). Mesmo
 * espírito de `CatalogItemOut`, mas só o que a lista de episódios precisa —
 * sem os campos de grade (grupo, categoria) que não fazem sentido aqui.
 */
export interface EpisodeOut {
  id: string
  name: string
  season_number: number | null
  episode_number: number | null
  playable: boolean
  source_id: string
  provider_stream_id: string | null
  series_id: string
  original_name: string
}

function toEpisodeOut(record: CatalogRecord): EpisodeOut {
  return {
    id: String(record.id ?? ''),
    name: record.name,
    season_number: record.seasonNumber ?? null,
    episode_number: record.episodeNumber ?? null,
    playable: Boolean(record.directUrl) || Boolean(record.providerStreamId),
    source_id: record.sourceId,
    provider_stream_id: record.providerStreamId ?? null,
    series_id: record.seriesId ?? '',
    original_name: record.originalName,
  }
}

export interface SeriesEpisodesContent {
  episodes: EpisodeOut[]
  outcome: SeriesFetchOutcome
}

/**
 * Garante (`seriesLoader.ensureSeriesEpisodes`) e lê os episódios de uma
 * série — o par de `useCategoryContent` (feature 010), mas por série em
 * vez de por categoria. `seriesItemId` é o id local do registro
 * `kind:'series'`, o mesmo que `useCatalogItem`/`fetchPlayback` recebem.
 */
export function useSeriesEpisodes(seriesItemId: string | null) {
  return useQuery({
    queryKey: ['series-episodes', seriesItemId],
    queryFn: async (): Promise<SeriesEpisodesContent> => {
      if (!seriesItemId) return { episodes: [], outcome: 'fresh' }
      const id = Number(seriesItemId)
      const series = await getChannel(id, db)
      if (!series || !series.seriesId) return { episodes: [], outcome: 'failed' }

      const result = await ensureSeriesEpisodes(id, { database: db })
      const records = await listEpisodes(series.sourceId, series.seriesId, db)
      return { episodes: records.map(toEpisodeOut), outcome: result.outcome }
    },
    enabled: seriesItemId !== null,
  })
}

/**
 * O estado do usuário de vários itens de uma vez, na mesma ordem pedida —
 * a lista de episódios não lê um por um (feature 012).
 */
export function useUserStates(stableIds: (string | null)[]) {
  return useQuery({
    queryKey: ['user-states', ...stableIds],
    queryFn: async (): Promise<(UserStateRecord | null)[]> => {
      const validIds = stableIds.filter((id): id is string => id !== null)
      const states = await getUserStates(validIds, db)
      const byId = new Map(validIds.map((id, index) => [id, states[index]]))
      return stableIds.map((id) => (id === null ? null : (byId.get(id) ?? null)))
    },
    enabled: stableIds.length > 0,
  })
}

/**
 * Invalida todas as leituras de `useUserStates` — prefixo de chave, não uma
 * lista específica: fechar o player não sabe (nem precisa saber) qual
 * conjunto de episódios cada tela tinha em cache.
 */
export function invalidateUserStates(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['user-states'] })
}

/**
 * Tipos que a categoria virtual "Favoritos" cobre (feature 013). Episódio
 * fica de fora de propósito — série é o nível de favorito (D-009 do
 * plan.md), então `SeriesDetailScreen`/lista de episódios nunca passam
 * `onLongSelect`.
 */
export type FavoritableKind = 'channel' | 'movie' | 'series'

/**
 * O conjunto de `stableId`s favoritos de uma fonte e tipo — alimenta só a
 * estrela do cartão/linha (FR-010). Nunca resolve nada em registro do
 * catálogo: mover o foco sobre um item, ou sobre a entrada "Favoritos" da
 * trilha, não consulta nada além disto (constitution, "Foco Visível e Sem
 * Becos Sem Saída" — focar nunca dispara consulta a serviço externo; aqui
 * nem chega a ser externo, mas o princípio de não gastar em foco vale
 * igual, D-005 do plan.md).
 */
export function useFavoriteIds(sourceId: string | null, kind: FavoritableKind) {
  return useQuery({
    queryKey: ['favorite-ids', sourceId, kind],
    queryFn: async (): Promise<Set<string>> => {
      if (!sourceId) return new Set()
      const favorites = await listFavorites(sourceId, kind, db)
      return new Set(favorites.map((favorite) => favorite.stableId))
    },
    enabled: sourceId !== null,
  })
}

export interface FavoritesContent {
  items: CatalogItemOut[]
  /**
   * Quantos favoritos gravados não resolveram em nenhum registro da
   * geração ativa (categoria ainda não obtida, ou item que saiu da fonte)
   * — nunca vira cartão inventado nem entra na contagem de `items`
   * (FR-009, princípio "Progresso e Capacidades São Reais").
   */
  unresolved: number
}

/**
 * Conteúdo da categoria virtual "Favoritos" de uma fonte e tipo.
 *
 * Só resolve favorito em registro do catálogo quando `enabled` — a pessoa
 * **entrou** na categoria (mesmo contrato de `useCategoryContent`, D-005):
 * focar a entrada "Favoritos" na trilha nunca chama isto habilitada.
 */
export function useFavoritesContent(sourceId: string | null, kind: FavoritableKind, enabled: boolean) {
  return useQuery({
    queryKey: ['favorites-content', sourceId, kind],
    queryFn: async (): Promise<FavoritesContent> => {
      if (!sourceId) return { items: [], unresolved: 0 }
      const favorites = await listFavorites(sourceId, kind, db)
      const parsed = favorites
        .map((favorite) => parseStableId(favorite.stableId))
        .filter((parts): parts is NonNullable<typeof parts> => parts !== null)
      const { records, unresolved } = await resolveFavorites(sourceId, kind, parsed, db)
      return { items: records.map((record) => toItemOut(record, kind)), unresolved }
    },
    enabled: enabled && sourceId !== null,
  })
}

/**
 * Alterna o favorito de um item (segurar OK — feature 013) e invalida
 * tudo que depende dele: a estrela em qualquer tela onde o item aparece,
 * a categoria "Favoritos" da fonte/tipo, e o estado do detalhe
 * (`useUserState`). Recusa episódio (D-009) e item sem identidade
 * estável, em vez de gravar uma chave inventada.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (item: CatalogItemOut): Promise<boolean> => {
      if (item.kind !== 'channel' && item.kind !== 'movie' && item.kind !== 'series') {
        throw new Error(`Tipo "${item.kind}" não é favoritável.`)
      }
      const stableId = stableIdOf(item)
      if (!stableId || !item.source_id) {
        throw new Error('Item sem identidade estável: não é possível favoritar.')
      }

      const current = await getUserState(stableId, db)
      const next = !(current?.isFavorite ?? false)
      await toggleFavorite(stableId, item.source_id, next, db)
      return next
    },
    onSuccess: (_isFavoriteNow, item) => {
      const stableId = stableIdOf(item)
      void queryClient.invalidateQueries({ queryKey: ['favorite-ids', item.source_id, item.kind] })
      void queryClient.invalidateQueries({ queryKey: ['favorites-content', item.source_id, item.kind] })
      if (stableId) void queryClient.invalidateQueries({ queryKey: ['user-state', stableId] })
    },
  })
}
