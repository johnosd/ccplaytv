import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  db,
  type BlockItem,
  type CategoryBlockRecord,
  type CategoryKind,
  type CatalogItemKind as StoredKind,
  type CatalogRecord,
  type UserStateRecord,
} from '../../lib/catalog/db'
import {
  getActiveCategoryBlock,
  getChannel,
  kindSortFields,
  listAllEpisodes,
  listCategories,
  listChannels,
  listEpisodes,
  readKindPage,
  resolveContinueWatching,
  resolveFavorites,
  resolveStableIds,
  type CatalogCategory,
} from '../../lib/catalog/catalogRepository'
import { ensureCategory, type CategoryFetchOutcome } from '../../lib/catalog/categoryLoader'
import { markEntry } from '../../lib/perf/entryTiming'
import { prefetchScheduler } from '../../lib/catalog/prefetch'
import { ensureSeriesEpisodes, type SeriesFetchOutcome } from '../../lib/catalog/seriesLoader'
import { PlaybackUnavailableError, resolvePlaybackUrl } from '../../lib/catalog/playbackUrl'
import {
  buildStableId,
  getContinueWatching,
  getGlobalFavorites,
  getUserState,
  getUserStates,
  listFavorites,
  listWatched,
  parseStableId,
  setWatchedManually,
  toggleFavorite,
  type StableIdParts,
} from '../../lib/catalog/userStateRepository'
import { UNGROUPED_LABEL } from '../live/groupChannels'
import { summarizeSeriesWatched, type SeriesWatchedSummary } from '../series/seriesWatchedSummary'
import { isCovered, loadSearchIndex, type SearchableKind } from '../../lib/catalog/catalogSearch'
import { loadHistory, type HistoryKind } from '../../lib/catalog/history'
import { loadHomeHero, type HeroPrimary } from '../../lib/catalog/homeHero'
import { loadGlobalSearchIndex, searchGlobal } from '../../lib/catalog/globalSearch'
import { listProgramsForChannels } from '../../lib/epg/epgRepository'
import type { EpgLookup } from '../../lib/epg/types'
import { ensureTitleMetadata } from '../../lib/metadata/titleMetadata'
import { getTmdbStatus, removeTmdbKey, saveTmdbKey, testTmdbKey } from '../../lib/metadata/tmdbKeyRepository'
import type { KindCoverage, ResolvedTitle, SimilarTabView } from '../../lib/metadata/types'
import type { TmdbTitleRef } from '../../lib/catalog/db'
import { FILMOGRAPHY_SHOWN_MAX, loadPersonCredits } from '../../lib/metadata/tmdbPeople'
import { resolveTmdbTitles } from '../../lib/metadata/localTitleMatch'
import { similarTabStatus } from '../../lib/metadata/similarTab'

const EPG_READ_BEFORE_MS = 24 * 60 * 60 * 1000
const EPG_READ_AFTER_MS = 48 * 60 * 60 * 1000
const EPG_HOUR_MS = 60 * 60 * 1000

/**
 * Programação (feature 030) dos canais informados, lida **só do aparelho**
 * (FR-029): nunca rede, portanto seguro de chamar ao focar/rolar. Recebe os
 * ids de EPG (`epg_channel_id`) dos canais visíveis — repetidos e vazios são
 * ignorados; sem nenhum, a consulta nem roda.
 *
 * O deslocamento manual da fonte vem junto: quem exibe aplica em
 * `nowNextForChannel`. A leitura cobre `[agora − 24 h, agora + 48 h]` **já
 * descontado o deslocamento**, para o que aparece deslocado caber (D-013).
 * Uma sincronização que termina invalida `['epg']` (`App.tsx`).
 */
export function useEpgPrograms(sourceId: string | null, epgChannelIds: readonly (string | null | undefined)[]) {
  const keys = useMemo(
    () => [...new Set(epgChannelIds.filter((id): id is string => typeof id === 'string' && id !== ''))].sort(),
    [epgChannelIds],
  )
  return useQuery({
    queryKey: ['epg', sourceId, keys.join('\u0001')],
    enabled: sourceId !== null && keys.length > 0,
    staleTime: 5 * 60 * 1000,
    // Digitar na busca por categoria troca o conjunto de canais a cada
    // tecla; sem isto o "Agora" das linhas que continuam na tela piscaria.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EpgLookup> => {
      const now = Date.now()
      const source = await db.sources.get(sourceId as string)
      const offsetMs = (source?.epgOffsetHours ?? 0) * EPG_HOUR_MS
      const byKey = await listProgramsForChannels(
        sourceId as string,
        keys,
        { from: now - EPG_READ_BEFORE_MS - offsetMs, to: now + EPG_READ_AFTER_MS - offsetMs },
      )
      return { byKey, offsetMs }
    },
  })
}

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
  /** Capa/logo declarada pela fonte (feature 015, estendida a canal pela 024, R-003). `null` = fonte não declarou. */
  icon_url?: string | null
  /** Categoria local do item (feature 024) — base do número de exibição do canal (`channelNumber.ts`). */
  category_id?: number | null
  /** Posição 0-based do item dentro da categoria, na ordem da fonte (feature 024). `null` = gravado antes desta feature. */
  category_position?: number | null
  /**
   * Número que o próprio painel declara para o canal — nunca populado hoje:
   * o `num` de `get_live_streams` foi verificado (feature 024, T001,
   * `research.md` R1) e refutado como posição global, então não é
   * capturado. O campo existe só para `channelNumberOf` (que o usaria se um
   * dia um provedor confiável declarar algo assim), sempre `null` na
   * prática.
   */
  source_number?: number | null
  /** Ano declarado pela fonte (feature 025). `null` = não declarado. */
  year?: number | null
  /** Inclusão declarada pela fonte, epoch ms (feature 025). `null` = não declarada. */
  added_at?: number | null
  /**
   * Id de EPG que a fonte declara para o canal (feature 030, FR-006/FR-008):
   * `epg_channel_id` do Xtream, `tvg-id` do M3U. `null` = não declarado —
   * canal sem EPG, nunca casado por nome.
   */
  epg_channel_id?: string | null
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
  return itemOut(record, kind, record.sourceId, record.categoryId ?? null, record.categoryPosition ?? null)
}

/**
 * Item de bloco direto para a tela (feature 039, R-009): o que o bloco diz
 * uma vez só (fonte, categoria) vem do bloco; a posição é o índice (o bloco
 * está na ordem da fonte). Mesmo resultado de `toItemOut(blockRecord(...))`
 * sem criar o registro intermediário.
 */
function blockItemOut(block: CategoryBlockRecord, item: BlockItem, index: number, kind: CatalogItemKind): CatalogItemOut {
  return itemOut(item, kind, block.sourceId, block.categoryId, index)
}

function itemOut(
  record: Omit<BlockItem, 'id'> & { id?: number },
  kind: CatalogItemKind,
  sourceId: string,
  categoryId: number | null,
  categoryPosition: number | null,
): CatalogItemOut {
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
    source_id: sourceId,
    provider_stream_id: record.providerStreamId ?? null,
    original_name: record.originalName,
    series_id: record.seriesId ?? null,
    icon_url: record.iconUrl ?? null,
    category_id: categoryId,
    category_position: categoryPosition,
    // Nunca capturado (T001 refutou `num` como posição global — ver o comentário do campo).
    source_number: null,
    year: record.year ?? null,
    added_at: record.addedAt ?? null,
    epg_channel_id: record.epgChannelId ?? null,
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
async function loadCategoryContent(
  sourceId: string,
  category: CatalogCategory,
  signal?: AbortSignal,
): Promise<CategoryContent> {
  // Só passa `{ signal }` quando há um sinal de verdade (prefetch) — a
  // entrada real (`useCategoryContent`, sem `signal`) nunca é abortável e
  // mantém a mesma chamada de sempre (bug
  // `prefetch-concorrente-categoria-sem-cancelamento-requisicao`).
  // Feature 038 (D-007/FR-026): com itens no aparelho, uma categoria vencida
  // (ou com renovação pendente depois de uma atualização) abre na hora com o
  // que tem; a renovação vai para a frente da fila da pré-carga.
  // Servir do disco de propósito não é falha: a nota "Não foi possível
  // atualizar agora" das telas só vale para `stale-served` de verdade (a
  // busca falhou), então aqui o resultado sai como `fresh`.
  if (!signal) markEntry(category.id, category.kind, 'start')
  let renewalQueued = false
  const serveStale = (categoryId: number) => {
    renewalQueued = true
    prefetchScheduler.prioritize(categoryId)
  }
  const ensured = signal
    ? await ensureCategory(sourceId, category, { signal, serveStale })
    : await ensureCategory(sourceId, category, { serveStale })
  const result = renewalQueued ? { ...ensured, outcome: 'fresh' as const } : ensured
  if (!signal) markEntry(category.id, category.kind, 'ensured')
  // As três seções buscam a categoria inteira, sem teto de leitura (feature
  // 009, D-002 completo) — painel de canais e grades de pôsteres agora
  // virtualizam o que renderizam, então não precisam mais de um corte
  // artificial pra não travar a TV.
  //
  // Feature 039 (R-009): com bloco, uma leitura pela chave e uma conversão por
  // item; sem bloco (formato antigo ainda não convertido), as linhas.
  const block = await getActiveCategoryBlock(sourceId, category.id)
  const records = block ? undefined : await listChannels(sourceId, category.order, 0, NO_LIMIT, category.kind)
  // Feature 039: a leitura sem teto já é a categoria inteira — contar de novo
  // seria uma segunda leitura do mesmo bloco.
  const totalCount = block ? block.items.length : (records?.length ?? 0)
  // Feature 038 (FR-012): medição desligada por padrão, só números.
  if (!signal) markEntry(category.id, category.kind, 'read', totalCount)
  const items = block
    ? block.items.map((item, index) => blockItemOut(block, item, index, category.kind))
    : (records ?? []).map((record) => toItemOut(record, category.kind))
  if (!signal) markEntry(category.id, category.kind, 'itemsOut')
  return { items, totalCount, outcome: result.outcome }
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
  const query = useQuery({
    queryKey: categoryContentKey(sourceId, category?.id),
    queryFn: async (): Promise<CategoryContent> => {
      if (!sourceId || !category) return { items: [], totalCount: 0, outcome: 'fresh' }
      return loadCategoryContent(sourceId, category)
    },
    enabled: sourceId !== null && category !== undefined,
  })
  // Feature 038 (FR-012): fecha a medição da entrada no primeiro quadro com
  // itens — efeito roda depois do commit, o `requestAnimationFrame` depois da
  // pintura. Sem `ccplaytv:perf`, `markEntry` não faz nada.
  const paintedId = query.data && query.data.items.length > 0 ? category?.id : undefined
  const paintedKind = category?.kind
  useEffect(() => {
    if (paintedId === undefined || paintedKind === undefined) return
    const frame = requestAnimationFrame(() => markEntry(paintedId, paintedKind, 'firstPaint'))
    return () => cancelAnimationFrame(frame)
  }, [paintedId, paintedKind])
  return query
}

/**
 * Campos de ordenação que o tipo inteiro declara (feature 039, T033) — para o
 * modal "Ordenar" de "Todos" aos poucos não esconder "Ano"/"Recém-adicionados"
 * que só aparecem em categorias ainda não lidas. `enabled` só com o modal
 * aberto: entrar em "Todos" não paga essa varredura.
 */
export function useKindSortFields(sourceId: string | null, kind: FavoritableKind, enabled: boolean) {
  return useQuery({
    queryKey: ['kind-sort-fields', sourceId, kind],
    queryFn: () => kindSortFields(sourceId as string, kind),
    enabled: enabled && sourceId !== null,
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
  signal?: AbortSignal,
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: categoryContentKey(sourceId, category.id),
    queryFn: () => loadCategoryContent(sourceId, category, signal),
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
 *
 * `enteredCategoryId`: a categoria que a pessoa já **entrou** (coluna de
 * conteúdo), se houver. Quando ela é a mesma que está em foco na trilha,
 * o prefetch nunca dispara nem fica pendente — achado na feature 015
 * (2026-09-24): sem isto, um timer já agendado antes da entrada dispara
 * ~300ms depois mesmo já dentro da categoria, usando o snapshot de
 * `focusedCategory` capturado no foco (sem `itemsFetchedAt`, porque a
 * lista de categorias de `useCategoryList` nunca é invalidada pela
 * leitura real). Para categoria `stored` (feature 014), isso repete
 * `ensureCategory` depois que a entrada real já consumiu os blocos de
 * `storedEntries` — a releitura acha vazio, devolve `source_missing`, e
 * `prefetchCategoryContent` escreve isso por cima do cache que
 * `useCategoryContent` já tinha populado com o conteúdo certo: a tela
 * mostra "conteúdo não está mais no aparelho" sem o usuário ter feito
 * nada. Cancelar o timer pendente ao entrar (via este parâmetro na lista
 * de dependências do efeito) fecha a corrida na raiz, sem precisar
 * invalidar a query de categorias nem tornar `ensureCategory` ciente de
 * cache alheio.
 *
 * **Bug `prefetch-concorrente-categoria-sem-cancelamento-requisicao`
 * (2026-09-25)**: até aqui, o `clearTimeout` do cleanup só cancelava um
 * timer que ainda não tinha disparado — uma vez que a busca de rede
 * começava, nada a interrompia, mesmo que o cursor já tivesse saído
 * daquela categoria há muito. Numa trilha longa (dezenas de categorias),
 * navegação humana normal deixava várias dessas buscas "esquecidas"
 * correndo ao mesmo tempo, competindo por banda/conexões contra a mesma
 * origem — achado na TV física contra uma fonte real, onde a categoria em
 * que a pessoa de fato queria entrar podia demorar mais de um minuto por
 * estar na fila atrás delas. Agora cada busca carrega um `AbortController`
 * próprio, guardado em `inFlightRef`; iniciar a busca seguinte aborta a
 * anterior — **exceto** quando essa anterior é a categoria já **entrada**
 * (`enteredCategoryId`): essa busca passou a ser compartilhada com a
 * entrada real via `dedup` do `categoryLoader`, e abortá-la quebraria a
 * entrada também.
 */
export function useCategoryFocusPrefetch(
  sourceId: string | null,
  focusedCategory: CatalogCategory | undefined,
  enteredCategoryId?: number,
) {
  const queryClient = useQueryClient()
  const inFlightRef = useRef<{ categoryId: number; controller: AbortController } | null>(null)

  useEffect(() => {
    if (!sourceId || !focusedCategory) return
    if (focusedCategory.id === enteredCategoryId) return

    const timer = setTimeout(() => {
      const previous = inFlightRef.current
      if (previous && previous.categoryId !== focusedCategory.id && previous.categoryId !== enteredCategoryId) {
        previous.controller.abort()
      }
      const controller = new AbortController()
      inFlightRef.current = { categoryId: focusedCategory.id, controller }
      void prefetchCategoryContent(queryClient, sourceId, focusedCategory, controller.signal)
    }, CATEGORY_PREFETCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // `focusedCategory` inteira na lista de dependências, de propósito: o
    // React Query devolve referência estável de `data` enquanto a consulta
    // não refizer de verdade, então isto só rearma o temporizador quando a
    // categoria em foco muda de fato — não é preciso comparar por `id`
    // manualmente. `enteredCategoryId` também entra: mudar de "focada" pra
    // "entrada" precisa cancelar um timer já agendado, não só bloquear um
    // novo.
  }, [sourceId, focusedCategory, enteredCategoryId, queryClient])
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
    // Stored (feature 014): a varredura sempre sabe a contagem real desde
    // a importação (`declaredCount`, D-011) — mas depois que a categoria é
    // lida, `count` passa a ser o fato do disco, e é ele que conta (mesma
    // regra de `eager`, nunca os dois somados).
    const contribution =
      category.fetchMode === 'eager'
        ? category.count
        : category.fetchMode === 'stored' && category.itemsFetchedAt !== undefined
          ? category.count
          : category.declaredCount
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

/**
 * O id atual de um item no aparelho, ou `null` se ele não existe mais (saiu
 * numa renovação). Um id de linha antiga já convertida em bloco (feature 039)
 * devolve o id novo. Lê só o bloco daquele item — nunca o tipo inteiro.
 */
export async function resolveCatalogItemId(itemId: string): Promise<string | null> {
  const record = await getChannel(Number(itemId))
  return record?.id === undefined ? null : String(record.id)
}

/**
 * Metadata descritiva de filme/série para o detalhe (feature 032, US1/US3).
 * Só a tela de detalhe chama — abrir o detalhe é a ação explícita que
 * autoriza a consulta externa (FR-002); nunca usar numa grade ou por foco.
 * Não bloqueia a tela: quem usa renderiza sem `data` e completa quando
 * chegar (FR-005).
 */
export function useTitleMetadata(itemId: string | null) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['title-metadata', itemId],
    queryFn: async () => {
      const view = await ensureTitleMetadata(Number(itemId))
      // A consulta pode ter mudado o estado do TMDB (chave recusada, sem
      // conexão, limite de uso — FR-024): Integrações e o dock releem, sem
      // aviso no detalhe.
      void queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
      return view
    },
    enabled: itemId !== null,
  })
}

/**
 * Aba Semelhantes (feature 035, US1/US2 — `logic/aba-semelhantes.md`): deriva
 * o estado da aba da metadata JÁ obtida ao abrir o detalhe (nenhuma consulta
 * externa nova, FR-003/SC-005) e cruza os títulos com o catálogo guardado
 * (`resolveTmdbTitles`, só IndexedDB). `enabled` só com a aba ativa.
 */
export function useSimilarTitles(itemId: string | null, enabled: boolean): SimilarTabView {
  const item = useCatalogItem(itemId).data
  // Mesma chave da consulta que o detalhe já montou: o react-query a compartilha, nada novo é pedido.
  const metadata = useTitleMetadata(itemId).data
  const tmdbState = useTmdbStatus().data?.state
  const kind = item?.kind === 'movie' || item?.kind === 'series' ? item.kind : undefined
  const sourceId = item?.source_id
  const similar = metadata?.tmdbMatch === 'matched' ? metadata.similar : undefined

  const resolution = useQuery({
    queryKey: ['similar-titles', itemId],
    queryFn: () => resolveTmdbTitles(sourceId as string, similar ?? [], [kind as 'movie' | 'series']),
    enabled: enabled && kind !== undefined && !!sourceId && similar !== undefined && similar.length > 0,
    // Categorias abertas desde a última vez entram (mesmo padrão de "Todos").
    staleTime: 0,
  })

  const resolving = enabled && similar !== undefined && similar.length > 0 && resolution.data === undefined
  const status = similarTabStatus({ tmdbState, metadata, resolving })
  return {
    status,
    titles: status === 'ready' ? (resolution.data?.titles ?? []) : [],
    coverage: kind !== undefined ? resolution.data?.coverage[kind] : undefined,
  }
}

/**
 * Filmografia de uma pessoa do elenco (feature 035, US4). Só a página de ator
 * chama — a consulta nasce do OK na pessoa, nunca de foco. O resultado de erro
 * é dado (`status: 'error'`), não exceção: nada de falha é guardado no banco, e
 * "Tentar de novo" só refaz esta consulta.
 */
export function usePersonCredits(personId: number | null) {
  return useQuery({
    queryKey: ['person-credits', personId],
    queryFn: () => loadPersonCredits(personId as number),
    enabled: personId !== null,
    retry: false,
  })
}

export interface PersonTitlesView {
  /** Encontrados primeiro; no máximo `FILMOGRAPHY_SHOWN_MAX`. */
  titles: ResolvedTitle[]
  coverage: { movie?: KindCoverage; series?: KindCoverage }
}

/** Filmografia cruzada com o catálogo guardado (só IndexedDB; `staleTime: 0` pega categorias abertas desde a última vez). */
export function usePersonTitles(personId: number | null, sourceId: string | null, credits: TmdbTitleRef[] | undefined) {
  return useQuery({
    queryKey: ['person-titles', personId, sourceId],
    queryFn: async (): Promise<PersonTitlesView> => {
      const resolution = await resolveTmdbTitles(sourceId as string, credits ?? [], ['movie', 'series'])
      return { titles: resolution.titles.slice(0, FILMOGRAPHY_SHOWN_MAX), coverage: resolution.coverage }
    },
    enabled: personId !== null && sourceId !== null && credits !== undefined,
    staleTime: 0,
  })
}

/**
 * Estado do TMDB (feature 032, US2): lê **só o IndexedDB**, nunca a rede —
 * seguro de chamar ao focar (o dock da Home o usa). Nunca carrega a chave
 * inteira, só a mascarada (FR-013).
 */
export function useTmdbStatus() {
  return useQuery({ queryKey: ['tmdb-status'], queryFn: () => getTmdbStatus() })
}

/** O estado do TMDB e a metadata já aberta dependem da chave: tudo é relido depois de mudá-la. */
function invalidateTmdb(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
  void queryClient.invalidateQueries({ queryKey: ['title-metadata'] })
}

/** Testa a chave contra o TMDB e só grava se aceita (FR-012). */
export function useSaveTmdbKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rawKey: string) => saveTmdbKey(rawKey),
    // A chave digitada é a `variables` da mutação: sem isto ela ficaria no
    // cache de mutações (em memória) por minutos depois de gravada.
    gcTime: 0,
    onSuccess: () => invalidateTmdb(queryClient),
  })
}

/** "Testar": refaz a autenticação com a chave guardada e atualiza o estado. */
export function useTestTmdbKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => testTmdbKey(),
    onSuccess: () => invalidateTmdb(queryClient),
  })
}

/**
 * Remove a chave e a metadata que veio do TMDB (FR-014). O banco já foi
 * limpo; aqui o cache em memória também é DESCARTADO (não só invalidado):
 * invalidar deixaria a sinopse do TMDB aparecer por um instante na próxima
 * abertura do detalhe, até a releitura terminar.
 */
export function useRemoveTmdbKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => removeTmdbKey(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['title-metadata'] })
      queryClient.removeQueries({ queryKey: ['similar-titles'] })
      // Filmografias também vieram do TMDB: só invalidar mostraria o dado velho por um instante (FR-021).
      queryClient.removeQueries({ queryKey: ['person-credits'] })
      queryClient.removeQueries({ queryKey: ['person-titles'] })
      void queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
    },
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
  // Feature 025: a contagem/conteúdo de "↺ Histórico" também depende do
  // que acabou de ser gravado (`lastWatched`/`completedAt`).
  void queryClient.invalidateQueries({ queryKey: ['history-content'] })
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
  /** Imagem do episódio declarada pela fonte (feature 025). */
  icon_url?: string | null
  /** Duração declarada pela fonte, em segundos (feature 025) — denominador da barra de progresso. */
  duration_seconds?: number | null
  /** Sinopse do episódio declarada pelo provedor (feature 032, FR-028). `null` = não declarada. */
  synopsis?: string | null
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
    icon_url: record.iconUrl ?? null,
    duration_seconds: record.durationSeconds ?? null,
    synopsis: record.synopsis ?? null,
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
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['series-episodes', seriesItemId],
    queryFn: async (): Promise<SeriesEpisodesContent> => {
      if (!seriesItemId) return { episodes: [], outcome: 'fresh' }
      const id = Number(seriesItemId)
      const series = await getChannel(id, db)
      if (!series || !series.seriesId) return { episodes: [], outcome: 'failed' }

      const result = await ensureSeriesEpisodes(id, { database: db })
      // Feature 032 (D-009): a mesma resposta que trouxe os episódios gravou a
      // metadata da série. `useTitleMetadata` não pergunta ao provedor enquanto
      // os episódios ainda vão ser buscados (senão seriam duas requisições
      // idênticas a cada série aberta) — então relê aqui, ao fim.
      if (result.outcome === 'fetched') {
        void queryClient.invalidateQueries({ queryKey: ['title-metadata', seriesItemId] })
      }
      const records = await listEpisodes(series.sourceId, series.seriesId, db)
      return { episodes: records.map(toEpisodeOut), outcome: result.outcome }
    },
    enabled: seriesItemId !== null,
  })
}

/**
 * Estado agregado "Em dia" por série (feature 019, D-008,
 * `logic/agregacao-serie.md`). Lê, numa única consulta local, TODOS os
 * episódios já conhecidos da fonte (`listAllEpisodes` — nunca chama
 * `ensureSeriesEpisodes`/rede, constitution "Comandos Locais Independem de
 * Rede"), agrupa por `seriesId`, lê os `UserStateRecord` correspondentes em
 * lote e aplica `summarizeSeriesWatched` por grupo.
 */
export function useSeriesWatchedSummary(sourceId: string | null) {
  return useQuery({
    queryKey: ['series-watched-summary', sourceId],
    queryFn: async (): Promise<Map<string, SeriesWatchedSummary>> => {
      if (!sourceId) return new Map()
      const episodes = await listAllEpisodes(sourceId, db)

      const stableIdBySeriesId = new Map<string, string[]>()
      for (const episode of episodes) {
        if (!episode.seriesId) continue
        let stableId: string
        try {
          stableId = buildStableId({
            sourceId,
            kind: 'episode',
            providerStreamId: episode.providerStreamId,
            seriesId: episode.seriesId,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            originalName: episode.originalName,
          })
        } catch {
          continue // D-010: episódio sem identidade estável não entra na agregação
        }
        const list = stableIdBySeriesId.get(episode.seriesId)
        if (list) list.push(stableId)
        else stableIdBySeriesId.set(episode.seriesId, [stableId])
      }

      const allStableIds = [...stableIdBySeriesId.values()].flat()
      const allStates = await getUserStates(allStableIds, db)
      const stateByStableId = new Map(allStableIds.map((id, i) => [id, allStates[i]]))

      const summaryBySeriesId = new Map<string, SeriesWatchedSummary>()
      for (const [seriesId, stableIds] of stableIdBySeriesId) {
        const episodeStates = stableIds.map((id) => ({ completedAt: stateByStableId.get(id)?.completedAt }))
        summaryBySeriesId.set(seriesId, summarizeSeriesWatched(episodeStates))
      }
      return summaryBySeriesId
    },
    enabled: sourceId !== null,
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
  // Feature 025: idem `invalidateUserState`, para o fechamento de episódio.
  void queryClient.invalidateQueries({ queryKey: ['history-content'] })
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

/**
 * O conjunto de `stableId`s assistidos de uma fonte e tipo (feature 019,
 * D-006) — mesmo padrão de `useFavoriteIds`: uma leitura local por
 * fonte/tipo, nunca uma consulta por card. Alimenta o selo "Assistido" na
 * grade de Filmes (SC-001).
 */
export function useWatchedIds(sourceId: string | null, kind: FavoritableKind) {
  return useQuery({
    queryKey: ['watched-ids', sourceId, kind],
    queryFn: async (): Promise<Set<string>> => {
      if (!sourceId) return new Set()
      const watched = await listWatched(sourceId, kind, db)
      return new Set(watched.map((state) => state.stableId))
    },
    enabled: sourceId !== null,
  })
}

/**
 * "↺ Histórico" de Filmes ou Séries (feature 025, FR-007, FR-009..FR-015,
 * `logic/historico.md` §5) — leitura local do que foi reproduzido
 * (`lastWatched`), agregada por série quando `kind === 'series'`.
 *
 * `enabled` reflete a regra da contagem na side nav: a consulta só liga
 * quando a pessoa já entrou em "↺ Histórico" nesta sessão
 * (`isHistoryKnown`, `vodSessionMemory.ts`) — nada é resolvido só por abrir
 * a tela. `gcTime: Infinity`: a contagem, uma vez conhecida, vale pela
 * sessão inteira; invalidações explícitas (`invalidateUserState`/
 * `invalidateUserStates`/`useToggleWatched`) é que a atualizam.
 */
export interface HistoryContent {
  items: CatalogItemOut[]
  /** Reproduções que não resolveram em nenhum registro exibível (FR-012). */
  unresolved: number
}

export function useHistoryContent(sourceId: string | null, kind: HistoryKind, enabled: boolean) {
  return useQuery({
    queryKey: ['history-content', sourceId, kind],
    queryFn: async (): Promise<HistoryContent> => {
      if (!sourceId) return { items: [], unresolved: 0 }
      const { records, unresolved } = await loadHistory(sourceId, kind, db)
      return { items: records.map((record) => toItemOut(record, record.kind)), unresolved }
    },
    enabled: sourceId !== null && enabled,
    gcTime: Infinity,
  })
}

/**
 * Posição de retomada por `stableId`, de uma fonte e tipo — uma leitura só,
 * nunca por card (feature 025, D-014, mesma forma de `useWatchedIds`).
 * Alimenta a hero band ("Continuar de mm:ss") sem disparar nada ao mudar o
 * foco.
 */
export function useResumePositions(sourceId: string | null, kind: FavoritableKind) {
  return useQuery({
    queryKey: ['resume-positions', sourceId, kind],
    queryFn: async (): Promise<Map<string, number>> => {
      if (!sourceId) return new Map()
      const prefix = `${sourceId}|${kind}|`
      const states = await getContinueWatching(sourceId, db)
      const positions = new Map<string, number>()
      for (const state of states) {
        if (state.stableId.startsWith(prefix) && state.progressSeconds) {
          positions.set(state.stableId, state.progressSeconds)
        }
      }
      return positions
    },
    enabled: sourceId !== null,
  })
}

/**
 * Itens (filme/episódio) com progresso de retomada nesta fonte, mais
 * recente primeiro (feature 019, D-009, FR-012/FR-013). `getContinueWatching`
 * já filtra por `progressSeconds > 0` — um item concluído (sem retomada)
 * nunca chega aqui. Itens sem correspondência no catálogo atual (fonte/
 * categoria removida) são omitidos por `resolveContinueWatching`, nunca
 * quebram a lista inteira (D-016/FR-016).
 */
export function useContinueWatchingContent(sourceId: string | null) {
  return useQuery({
    queryKey: ['continue-watching', sourceId],
    queryFn: async (): Promise<CatalogItemOut[]> => {
      if (!sourceId) return []
      const states = await getContinueWatching(sourceId, db)
      const records = await resolveContinueWatching(sourceId, states, db)
      return records.map((record) => toItemOut(record, record.kind))
    },
    enabled: sourceId !== null,
  })
}

/**
 * Hero do Início pronto para a tela (feature 026, FR-002..FR-006) — o
 * `HomeHero` de `lib/catalog/homeHero.ts` com o registro já convertido em
 * `CatalogItemOut`.
 */
export type HomeHeroOut =
  | { kind: 'continue' | 'favorite'; item: CatalogItemOut; primary: HeroPrimary }
  | { kind: 'welcome' }

/**
 * Leitura local do hero (`loadHomeHero`). Chave `['home-hero', sourceId]` —
 * invalidada junto de "Continuar assistindo"/favoritos (`logic/hero-home.md`
 * §5).
 */
export function useHomeHero(sourceId: string | null) {
  return useQuery({
    queryKey: ['home-hero', sourceId],
    queryFn: async (): Promise<HomeHeroOut> => {
      if (!sourceId) return { kind: 'welcome' }
      const hero = await loadHomeHero(sourceId, db)
      if (hero.kind === 'welcome') return hero
      return { kind: hero.kind, item: toItemOut(hero.record, hero.record.kind), primary: hero.primary }
    },
    enabled: sourceId !== null,
  })
}

export interface MyListContent {
  items: CatalogItemOut[]
  /** Contagem real de favoritos de filme RESOLVIDOS (FR-014) — nunca a bruta gravada. */
  movieCount: number
  /** Idem, de série. */
  seriesCount: number
}

/**
 * "Minha Lista" do Início (feature 026, `logic/foco-home.md` §6): favoritos
 * de filme E série da fonte, misturados por `favoritedAt` desc (mais recente
 * primeiro, entre os dois tipos). Resolve item a item, como
 * `resolveContinueWatching` — a lista de favoritos é pequena (dezenas a
 * centenas), nunca o catálogo inteiro.
 */
export function useMyListContent(sourceId: string | null) {
  return useQuery({
    queryKey: ['my-list-content', sourceId],
    queryFn: async (): Promise<MyListContent> => {
      if (!sourceId) return { items: [], movieCount: 0, seriesCount: 0 }
      const favorites = await getGlobalFavorites(db)

      const all = favorites
        .filter((favorite) => favorite.sourceId === sourceId)
        .map((favorite) => parseStableId(favorite.stableId))
        .filter((parts): parts is StableIdParts => parts?.kind === 'movie' || parts?.kind === 'series')
      // Uma resolução por tipo (uma passada pelos blocos), nunca uma por
      // favorito — um favorito que não resolve custaria uma varredura inteira.
      const resolved = new Map<StableIdParts, CatalogRecord>()
      for (const kind of ['movie', 'series'] as const) {
        const group = all.filter((parts) => parts.kind === kind)
        if (group.length === 0) continue
        for (const [parts, record] of await resolveStableIds(sourceId, kind, group, db)) resolved.set(parts, record)
      }

      const items: CatalogItemOut[] = []
      let movieCount = 0
      let seriesCount = 0
      for (const parts of all) {
        const record = resolved.get(parts)
        if (!record) continue

        items.push(toItemOut(record, record.kind))
        if (record.kind === 'movie') movieCount += 1
        else if (record.kind === 'series') seriesCount += 1
      }
      return { items, movieCount, seriesCount }
    },
    enabled: sourceId !== null,
  })
}

/**
 * Índice da busca global (feature 026, `logic/busca-global.md` §2) — os três
 * tipos de uma vez. `staleTime: 0` + `refetchOnMount: 'always'`: mesmo
 * padrão de `useAggregatedItems` — categorias abertas desde a última vez
 * entram na próxima busca.
 */
export function useGlobalSearchIndex(sourceId: string | null) {
  return useQuery({
    queryKey: ['global-search-index', sourceId],
    queryFn: () => loadGlobalSearchIndex(sourceId as string, db),
    enabled: sourceId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

export interface GlobalSearchResultOut {
  channels: CatalogItemOut[]
  movies: CatalogItemOut[]
  series: CatalogItemOut[]
  /** "Busca em X de Y categorias" (FR-038) — soma dos três tipos, sempre presente, mesmo com termo curto. */
  coveredCategories: number
  totalCategories: number
}

const EMPTY_GLOBAL_SEARCH_RESULT: GlobalSearchResultOut = {
  channels: [],
  movies: [],
  series: [],
  coveredCategories: 0,
  totalCategories: 0,
}

/**
 * `searchGlobal` (puro, `lib/catalog/globalSearch.ts`) já convertido em
 * `CatalogItemOut` — a tela de Busca (feature 026, US3) nunca fala com
 * `CatalogRecord` direto (mesmo motivo de D-001: telas só falam com
 * `catalogApi`). Sem debounce (FR-039, clarificação) — recalcula a cada
 * tecla, client-side, sobre o índice já carregado.
 */
export function useGlobalSearchResult(
  sourceId: string | null,
  term: string,
): { data: GlobalSearchResultOut; isLoading: boolean } {
  const indexQuery = useGlobalSearchIndex(sourceId)

  const data = useMemo(() => {
    if (!indexQuery.data) return EMPTY_GLOBAL_SEARCH_RESULT
    const result = searchGlobal(indexQuery.data, term)
    return {
      channels: result.channels.map((record) => toItemOut(record, 'channel')),
      movies: result.movies.map((record) => toItemOut(record, 'movie')),
      series: result.series.map((record) => toItemOut(record, 'series')),
      coveredCategories: result.coveredCategories,
      totalCategories: result.totalCategories,
    }
  }, [indexQuery.data, term])

  return { data, isLoading: indexQuery.isLoading }
}

export interface AggregatedItems {
  /** Todos os itens do tipo já lidos no aparelho, de todas as categorias já cobertas — sem filtro. */
  items: CatalogItemOut[]
  /** Categorias do tipo com conteúdo já no aparelho (FR-010/FR-014 da feature 018). */
  coveredCategories: number
  /** Todas as categorias do tipo na geração ativa. */
  totalCategories: number
  isLoading: boolean
  /**
   * Só no modo `progressive` (feature 039, T022): há mais categorias a ler
   * depois de `items`. Ausente = a lista já é o tipo inteiro.
   */
  hasMore?: boolean
  /** Lê a próxima página (sem efeito se já está lendo ou acabou). */
  loadMore?: () => void
}

/**
 * Tamanho mínimo de uma página de "Todos" aos poucos (feature 039, T022): uma
 * página junta categorias inteiras até passar disto — ~40 fileiras da grade.
 */
const ALL_PAGE_MIN_ITEMS = 240

/**
 * Itens da categoria virtual "Todos" (feature 018, D-005) — reaproveita o
 * mesmo índice agregado de `useCatalogSearch`/`loadSearchIndex`, mas SEM
 * aplicar filtro de termo: quem quiser filtrar chama `searchWithinItems`
 * (catalogSearch.ts) por cima do array devolvido aqui, client-side. `enabled`
 * só é verdadeiro com "Todos" entrada — fora dela, nada é lido.
 */
export function useAggregatedItems(
  sourceId: string | null,
  kind: FavoritableKind,
  enabled: boolean,
  options: { progressive?: boolean } = {},
): AggregatedItems {
  const progressive = options.progressive === true
  // `refetchOnMount: 'always'` + `staleTime: 0`: cada entrada em "Todos" relê
  // o índice — categorias abertas desde a última vez entram na lista e na
  // cobertura (mesmo padrão de `useCatalogSearch`, D-005 do plan.md).
  const indexQuery = useQuery({
    queryKey: ['catalog-search-index', sourceId, kind],
    queryFn: () => loadSearchIndex(sourceId as string, kind as SearchableKind),
    enabled: enabled && !progressive && sourceId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // Feature 039 (T022): "Todos" na ordem da fonte lê aos poucos — só as
  // categorias até onde a pessoa desceu ficam na memória; a grade virtualizada
  // pede a próxima página perto do fim (`loadMore`). Ordenar e buscar precisam
  // do tipo inteiro e continuam no índice acima.
  const pagesQuery = useInfiniteQuery({
    queryKey: ['catalog-all-pages', sourceId, kind],
    queryFn: async ({ pageParam }) => {
      const [page, categories] = await Promise.all([
        readKindPage(sourceId as string, kind, pageParam, ALL_PAGE_MIN_ITEMS),
        pageParam === 0 ? listCategories(sourceId as string, kind) : Promise.resolve(undefined),
      ])
      const items = page.chunks.flatMap((chunk) =>
        'block' in chunk
          ? chunk.block.items.map((item, index) => blockItemOut(chunk.block, item, index, kind))
          : chunk.rows.map((record) => toItemOut(record, kind)),
      )
      const coverage = categories
        ? { coveredCategories: categories.filter(isCovered).length, totalCategories: categories.length }
        : undefined
      return { items, next: page.next, coverage }
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.next,
    enabled: enabled && progressive && sourceId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const indexItems = useMemo(() => {
    if (!indexQuery.data) return []
    return indexQuery.data.entries.map((entry) => toItemOut(entry.record, kind))
  }, [indexQuery.data, kind])
  const pageItems = useMemo(() => pagesQuery.data?.pages.flatMap((page) => page.items) ?? [], [pagesQuery.data])

  const { hasNextPage, isFetching, fetchNextPage } = pagesQuery
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching) void fetchNextPage()
  }, [hasNextPage, isFetching, fetchNextPage])

  if (progressive) {
    const coverage = pagesQuery.data?.pages[0]?.coverage
    return {
      items: pageItems,
      coveredCategories: coverage?.coveredCategories ?? 0,
      totalCategories: coverage?.totalCategories ?? 0,
      isLoading: pagesQuery.isLoading,
      hasMore: hasNextPage,
      loadMore,
    }
  }
  return {
    items: indexItems,
    coveredCategories: indexQuery.data?.coveredCategories ?? 0,
    totalCategories: indexQuery.data?.totalCategories ?? 0,
    isLoading: indexQuery.isLoading,
  }
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
      // Feature 026: o hero e a rail "Minha Lista" do Início dependem do
      // mesmo favorito (`logic/hero-home.md` §6).
      void queryClient.invalidateQueries({ queryKey: ['home-hero'] })
      void queryClient.invalidateQueries({ queryKey: ['my-list-content'] })
    },
  })
}

/**
 * Correção manual de "assistido" (feature 019, D-004) — recebe a
 * identidade já calculada pela tela (`MovieDetailScreen`, mesmo par
 * `stableId`/`sourceId` que `progressRecorder`/`useUserState` usam), não
 * um `CatalogItemOut`: diferente de favorito, "assistido" não depende do
 * `kind` do item pra decidir se é aplicável.
 */
export function useToggleWatched() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { stableId: string; sourceId: string; watched: boolean }): Promise<void> => {
      await setWatchedManually(params.stableId, params.sourceId, params.watched, db)
    },
    onSuccess: (_result, params) => {
      void queryClient.invalidateQueries({ queryKey: ['user-state', params.stableId] })
      // Prefixo, não uma combinação sourceId/kind específica — mesmo padrão
      // de `invalidateUserStates`: o card na grade (D-006) não precisa saber
      // qual tela disparou o toggle.
      void queryClient.invalidateQueries({ queryKey: ['watched-ids'] })
      // Marcar manualmente como assistido apaga o progresso de retomada
      // (D-004) — sem isto, o hub continuaria mostrando o item em
      // "Continuar assistindo" até uma navegação nova forçar releitura
      // (achado real durante o E2E desta feature, T023).
      void queryClient.invalidateQueries({ queryKey: ['continue-watching', params.sourceId] })
      // Feature 025: o selo de assistido no Histórico e o denominador da
      // hero band de retomada dependem do mesmo `UserStateRecord`.
      void queryClient.invalidateQueries({ queryKey: ['history-content'] })
      void queryClient.invalidateQueries({ queryKey: ['resume-positions'] })
      // Feature 026: marcar assistido pode tirar o item de "Continuar
      // assistindo" e mudar o hero (`logic/hero-home.md` §6).
      void queryClient.invalidateQueries({ queryKey: ['home-hero'] })
    },
  })
}
