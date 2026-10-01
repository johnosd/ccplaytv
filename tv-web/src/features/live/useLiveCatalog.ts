import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  groupLabel,
  stableIdOf,
  useAggregatedItems,
  useCatalogItem,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
  useEpgPrograms,
  useFavoriteIds,
  useFavoritesContent,
  type CatalogItemOut,
} from '../catalog/catalogApi'
import { usePrefetchHint } from '../catalog/prefetchApi'
import { nowNextForChannel } from '../../lib/epg/nowNext'
import { useNow } from '../../lib/useNow'
import { searchWithinItems } from '../../lib/catalog/catalogSearch'
import { locateOrNeighbor, type LastFocus } from '../../lib/focus/reconcileFocus'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import type { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { defaultTrailIdx, sameTrailKey, type EnteredKey, type FocusIdentity, type TrailEntry, type TrailKey } from './liveTrail'
import type { LiveSearch } from './useLiveSearch'

/**
 * Trilha e lista de canais da TV ao vivo (dados). Extraído da `LiveScreen`
 * na feature 040 sem mudar nada. São dois hooks porque, entre os efeitos da
 * trilha e os da lista, a tela sempre registrou o efeito de foco do campo de
 * busca (`useLiveSearch`) — a ordem dos efeitos é preservada
 * (`sdd/specs/040-dividir-player-live/logic/divisao.md` §1.2).
 */

export interface LiveTrailParams {
  sourceId: string
  startsInFavorites: boolean
  initialChannelId: string | null
}

export function useLiveTrail({ sourceId, startsInFavorites, initialChannelId }: LiveTrailParams) {
  // Estrutura: rápida, sempre segura de ler — nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'channel')
  const categories = categoriesQuery.data ?? []

  /**
   * Estado de topo da tela inteira — carregando/erro/vazio a estrutura, ou
   * "normal" (trilha + conteúdo). Cada um tem um foco próprio, mais simples
   * que a navegação normal (feature 024, T021/R-005: nenhum tinha SELECT
   * ligado antes desta feature, apesar da aparência de foco).
   */
  const topPhase: 'loading' | 'error' | 'empty' | 'normal' = categoriesQuery.isLoading
    ? 'loading'
    : categoriesQuery.isError
      ? 'error'
      : categories.length === 0
        ? 'empty'
        : 'normal'

  // "Todos" (feature 018, D-001) sempre presente, inclusive no zapping —
  // só o ÍCONE de busca fica fora dele (FR-018), tratado no JSX/navegação.
  const trail: TrailEntry[] = [
    { key: { kind: 'favorites' } as TrailKey },
    { key: { kind: 'all' } as TrailKey },
    ...categories.map((category) => ({
      key: { kind: 'category', name: groupLabel(category.name) } as TrailKey,
      category,
    })),
  ]

  const [focusedIdentity, setFocusedIdentity] = useState<FocusIdentity>(
    startsInFavorites
      ? { trailKey: { kind: 'favorites' }, channelId: initialChannelId }
      : { trailKey: null, channelId: null },
  )
  // Sem identidade ainda, OU identidade que sumiu de vez do catálogo novo
  // (ex.: categoria revalidada em segundo plano sem ela): cai na primeira
  // categoria REAL, não numa entrada virtual — perder o grupo que se olhava
  // não deveria arremessar o foco pra uma seção sem relação nenhuma com ele.
  const categoryIdx =
    focusedIdentity.trailKey === null
      ? defaultTrailIdx(trail)
      : (() => {
          const idx = trail.findIndex((entry) => sameTrailKey(entry.key, focusedIdentity.trailKey!))
          return idx === -1 ? defaultTrailIdx(trail) : idx
        })()
  const focusedTrailEntry = trail[categoryIdx]
  const focusedCategory = focusedTrailEntry?.category
  const isFavoritesFocused = focusedTrailEntry?.key.kind === 'favorites'
  const isAllFocused = focusedTrailEntry?.key.kind === 'all'

  // Trilha de categorias não é virtualizada (D-004) e usa uma classe CSS
  // pra foco, não foco real de DOM — sem isto, o item focado descia pra
  // fora da área visível numa fonte com muitas categorias e ficava lá
  // (achado na TV física, feature 009, Cenário B).
  const focusedCategoryRef = useScrollFocusedIntoView<HTMLButtonElement>(categoryIdx)

  /**
   * "Entrada" na categoria (ou em "Favoritos"/"Todos") — o que a pessoa
   * comprometeu-se a ver (coluna de canais) troca de coluna e exibe o
   * conteúdo. Quem decide se a exibição depende de categoria "entrada" ou
   * só "focada" é aqui, não o pré-fetch. Declarado antes do pré-fetch
   * (`useLiveChannels`), que precisa saber a categoria já entrada pra nunca
   * reler nem deixar um timer pendente (feature 015).
   */
  const [entered, setEntered] = useState<EnteredKey | null>(startsInFavorites ? { kind: 'favorites' } : null)
  const enteredCategory = entered?.kind === 'category' ? categories.find((c) => c.id === entered.id) : undefined
  const enteredFavorites = entered?.kind === 'favorites'
  const enteredAll = entered?.kind === 'all'

  return {
    categoriesQuery,
    categories,
    topPhase,
    trail,
    focusedIdentity,
    setFocusedIdentity,
    categoryIdx,
    focusedTrailEntry,
    focusedCategory,
    isFavoritesFocused,
    isAllFocused,
    focusedCategoryRef,
    entered,
    setEntered,
    enteredCategory,
    enteredFavorites,
    enteredAll,
  }
}

export type LiveTrail = ReturnType<typeof useLiveTrail>

export interface LiveChannelsParams {
  sourceId: string
  initialChannelCategoryLookup: string | null
  trail: LiveTrail
  search: LiveSearch
  col: 0 | 1 | 2
  setCol: Dispatch<SetStateAction<0 | 1 | 2>>
  playing: CatalogItemOut | null
  zapOpen: boolean
  favoriteToggle: ReturnType<typeof useFavoriteToggle>
}

export function useLiveChannels({
  sourceId,
  initialChannelCategoryLookup,
  trail,
  search,
  col,
  setCol,
  playing,
  zapOpen,
  favoriteToggle,
}: LiveChannelsParams) {
  const {
    categoriesQuery,
    categories,
    focusedCategory,
    entered,
    setEntered,
    setFocusedIdentity,
    focusedIdentity,
    enteredCategory,
    enteredFavorites,
    enteredAll,
  } = trail
  const { searchActive, belowMinimum, searchTerm, topFocused } = search

  // Pré-busca a categoria em foco depois que o cursor para nela por um
  // instante (amortecido — ver `useCategoryFocusPrefetch`). Desvio
  // deliberado de FR-004, pedido pelo usuário em 23/09/2026 ao ver a
  // entrada sempre parecer "primeira vez" na TV física; registrado em
  // `plan.md` R-013. "Favoritos"/"Todos" nunca prefetcham — `focusedCategory`
  // fica `undefined` quando uma delas está em foco, e o hook já ignora
  // `undefined`. Categoria já **entrada** nunca prefetcha nem deixa um timer
  // pendente disparar depois da entrada (feature 015 — sem isto, uma
  // categoria `stored` grande podia ter o conteúdo já lido sobrescrito por
  // `source_missing` ~300ms depois de entrar, sem o usuário fazer nada).
  useCategoryFocusPrefetch(
    sourceId,
    focusedCategory,
    entered?.kind === 'category' ? entered.id : undefined,
  )
  // Feature 038 (FR-005/FR-011): só reordena a fila da pré-carga — nenhuma consulta nasce do foco.
  usePrefetchHint('channel', focusedCategory?.id)

  // `initialChannel.entry === 'category'` (feature 026, `logic/navegacao.md`
  // §3): a categoria só se sabe depois de ler o registro do canal — ao
  // contrário de `entry: 'favorites'`/`openFavorites`, que já entram direto
  // no estado inicial (síncrono). `enteredCategoryOnceRef` garante que isto
  // roda uma única vez, mesmo que `categories`/a consulta do canal mudem de
  // novo depois (ex.: revalidação em segundo plano).
  const categoryLookupChannelId = initialChannelCategoryLookup
  const initialChannelRecordQuery = useCatalogItem(categoryLookupChannelId)
  const enteredCategoryOnceRef = useRef(false)
  useEffect(() => {
    if (!categoryLookupChannelId || enteredCategoryOnceRef.current) return
    if (categoriesQuery.isLoading || initialChannelRecordQuery.isLoading) return
    const record = initialChannelRecordQuery.data
    if (!record || record.category_id == null) {
      enteredCategoryOnceRef.current = true // canal não encontrado — fica na entrada padrão, sem erro inventado
      return
    }
    const category = categories.find((c) => c.id === record.category_id)
    if (!category) return // categorias ainda podem não ter chegado — tenta de novo no próximo render
    enteredCategoryOnceRef.current = true
    setEntered({ kind: 'category', id: category.id })
    setFocusedIdentity({ trailKey: { kind: 'category', name: groupLabel(category.name) }, channelId: categoryLookupChannelId })
    setCol(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mesmas dependências de antes da feature 040 (setters estáveis ficam de fora)
  }, [categoryLookupChannelId, categoriesQuery.isLoading, initialChannelRecordQuery.data, initialChannelRecordQuery.isLoading, categories])

  const content = useCategoryContent(sourceId, enteredCategory)
  // A estrela precisa do conjunto de favoritos mesmo numa categoria comum
  // (marcar quem já é favorito), não só dentro de "Favoritos" — por isso é
  // uma consulta separada, sempre ativa, nunca condicionada a `entered`.
  const favoriteIdsQuery = useFavoriteIds(sourceId, 'channel')
  const favoriteIds = favoriteIdsQuery.data ?? new Set<string>()
  // Só resolve favorito em registro do catálogo quando a pessoa ENTROU em
  // "Favoritos" — focar a entrada na trilha nunca chega a habilitar isto
  // (D-005 do plan.md: focar não gasta).
  const favoritesContent = useFavoritesContent(sourceId, 'channel', enteredFavorites)
  // "Todos" (feature 018, D-005) — todos os itens já cobertos, sem filtro;
  // o filtro por termo (quando a busca está ativa) é aplicado abaixo,
  // client-side, sobre este mesmo array.
  const aggregated = useAggregatedItems(sourceId, 'channel', enteredAll)

  const baseItems = enteredFavorites
    ? (favoritesContent.data?.items ?? [])
    : enteredAll
      ? aggregated.items
      : (content.data?.items ?? [])
  const contentIsLoading = enteredFavorites
    ? favoritesContent.isLoading
    : enteredAll
      ? aggregated.isLoading
      : content.isLoading
  // `content.isError`/`favoritesContent.isError`: a consulta em si lançou
  // (ex.: erro de plataforma fora do controle de `categoryLoader`) — sem
  // isto, `baseItems` cai em `[]` e a tela mostraria "grupo vazio"/"nenhum
  // favorito" escondendo uma falha de verdade. "Todos" nunca "falha" nesse
  // sentido (é leitura local síncrona) — tem seu próprio estado vazio.
  const contentFailed = enteredFavorites
    ? favoritesContent.isError
    : enteredAll
      ? false
      : content.data?.outcome === 'failed' || content.isError
  // Feature 014, D-008: categoria `stored` sem nenhum bloco guardado — o
  // arquivo sumiu do aparelho. "Tentar de novo" não resolve isso, só
  // ressincronizar a fonte — por isso é um estado próprio, não uma variação
  // de `contentFailed`. Nunca se aplica a "Favoritos"/"Todos" (sem outcome).
  const contentMissing = entered?.kind === 'category' && content.data?.outcome === 'source_missing'
  const contentUnavailable = contentFailed || contentMissing

  // Itens de fato exibidos (feature 018, D-004): sem busca ativa, a lista
  // normal; com busca ativa e termo curto, nada (mensagem própria); com
  // termo válido, o filtro client-side — nunca uma nova leitura de dados
  // (`logic/busca-por-categoria.md` §2).
  const items = useMemo(() => {
    if (!searchActive) return baseItems
    if (belowMinimum) return []
    return searchWithinItems(baseItems, searchTerm, (item) => item.name)
  }, [searchActive, belowMinimum, baseItems, searchTerm])

  // Feature 038 (FR-027): canal que a renovação em segundo plano tirou da
  // lista cede o foco ao vizinho (mesma posição), nunca ao topo.
  const lastChannelFocusRef = useRef<LastFocus | null>(null)
  const channelListKey = JSON.stringify(entered)
  const channelIdx = locateOrNeighbor(
    items,
    (c) => c.id === focusedIdentity.channelId,
    channelListKey,
    lastChannelFocusRef.current,
  )
  useEffect(() => {
    lastChannelFocusRef.current = { listKey: channelListKey, index: channelIdx }
  }, [channelListKey, channelIdx])
  const activeChannel = items[channelIdx]
  // Canal que sumiu com o preview aberto (feature 024, `logic/foco-live-
  // shell.md` §3): cai de volta pra coluna de canais em vez de deixar o
  // preview "órfão", sem foco algum sobre ele.
  const effectiveCol = col === 2 && !activeChannel ? 1 : col
  const activeChannelIsFavorite = activeChannel ? favoriteIds.has(stableIdOf(activeChannel) ?? '') : false

  // EPG (feature 030): programação lida só do aparelho (FR-029) para os
  // canais da lista exibida — inclusive a do zapping, que reaproveita
  // `renderLiveColumns` — e para o canal em reprodução (banda do player, US4).
  // `useNow` faz a barra andar e o programa virar sem sair da tela (FR-028).
  const epgNow = useNow()
  const epgChannelIds = useMemo(
    () => [...items.map((item) => item.epg_channel_id), playing?.epg_channel_id],
    [items, playing],
  )
  const epgLookup = useEpgPrograms(sourceId, epgChannelIds).data
  const activeNowNext = nowNextForChannel(epgLookup, activeChannel?.epg_channel_id, epgNow)
  const playingOnAir = nowNextForChannel(epgLookup, playing?.epg_channel_id, epgNow).now
  const playingNow = playingOnAir ? { title: playingOnAir.title, progress: playingOnAir.progress } : undefined

  function retryContent() {
    if (enteredFavorites) void favoritesContent.refetch()
    else void content.refetch()
  }

  /**
   * Segurar OK favorita/desfavorita o canal focado (feature 013) — só
   * quando a coluna de conteúdo está em foco, há um canal ali (não o
   * ícone/campo de busca, feature 018, nem o preview, feature 024 — D-005:
   * os gestos de segurar só valem na coluna de canais) e nada está tocando;
   * nos demais casos `onLongSelect` fica `undefined` e o OK volta a agir no
   * keydown, como sempre agiu (D-002 do plan.md original — o modo é
   * decidido no instante do keydown, então isto nunca pode depender de um
   * cálculo feito DEPOIS).
   */
  const canToggleFavorite = effectiveCol === 1 && !playing && !topFocused && activeChannel !== undefined

  /**
   * Mesma regra de `canToggleFavorite`, mas para DENTRO do zapping (feature
   * 016, edge case da spec) — `playing` está sempre presente aqui (é a
   * própria sessão que o zapping cobre), então não reaproveita a guarda
   * `!playing` acima. `topFocused` nunca é `true` dentro do zapping na
   * prática (FR-018/D-009), mas a guarda fica por segurança. Zapping nunca
   * alcança `col === 2` (D-009 da feature 024), então `effectiveCol` aqui é
   * sempre 0 ou 1 na prática.
   */
  const canToggleFavoriteInZap = zapOpen && effectiveCol === 1 && !topFocused && activeChannel !== undefined

  // Busca (feature 018): calculado ANTES de `handleTrailSelect`/`useRemoteNav`
  // — o closure de `onSelect` precisa enxergar esta variável já inicializada
  // mesmo que os guard clauses de carregamento/erro façam um early return no
  // MESMO render (o closure em si só é chamado depois, mas em resposta a um
  // evento de um render anterior onde tudo já existia).
  const searchNoResults = searchActive && !belowMinimum && items.length === 0
  // Cobertura só existe/aparece dentro de "Todos" (FR-010/FR-011) — nunca
  // numa categoria real ou Favoritos, onde a busca já cobre 100% do local.
  const searchCoveragePartial = enteredAll && aggregated.coveredCategories < aggregated.totalCategories
  const showResultsList = searchActive
    ? !belowMinimum && items.length > 0
    : !contentIsLoading && !contentUnavailable && items.length > 0
  // Estado "só existe um Voltar" (feature 024, T021/R-005): conteúdo vazio
  // sem outra ação — cobre Favoritos/Todos/categoria, cada um com seu texto
  // próprio no render, mas a mesma saída no teclado (volta à trilha).
  const contentEmptyNeedsBack =
    showResultsList === false &&
    !searchActive &&
    !contentIsLoading &&
    !contentUnavailable &&
    items.length === 0 &&
    (enteredFavorites || enteredAll || entered?.kind === 'category')

  /**
   * Alterna o favorito do canal focado — chamada tanto por segurar OK
   * (`onLongSelect`) quanto pela tecla amarela (`onFavoriteKey`, achado em
   * 24/09/2026 testando na TV física: um controle substituto não entregava
   * o mesmo padrão de segurar do navegador) quanto pelo botão "Favoritar"/
   * "Favorito" do preview (feature 024, FR-016) — as três são o MESMO
   * caminho de ação, nunca comportamentos diferentes.
   */
  function toggleFocusedFavorite() {
    if (!activeChannel) return
    void favoriteToggle.toggle(activeChannel, {
      // Só dentro de "Favoritos" desfavoritar precisa mover o foco pra
      // fora do item — numa categoria comum, o item continua lá.
      visibleItems: enteredFavorites ? items : undefined,
      onFocusNeighbor: enteredFavorites
        ? (neighborId) => setFocusedIdentity((prev) => ({ ...prev, channelId: neighborId ?? null }))
        : undefined,
    })
  }

  const showingContent = effectiveCol >= 1
  const contentStale = entered?.kind === 'category' && showingContent && content.data?.outcome === 'stale-served'
  const declaredCount = focusedCategory?.declaredCount
  const realCount = content.data?.totalCount
  const countsDiverge =
    entered?.kind === 'category' &&
    showingContent &&
    !content.isLoading &&
    declaredCount !== undefined &&
    realCount !== undefined &&
    declaredCount !== realCount
  const unresolvedFavorites = enteredFavorites ? (favoritesContent.data?.unresolved ?? 0) : 0

  return {
    content,
    favoriteIds,
    favoritesContent,
    aggregated,
    baseItems,
    contentIsLoading,
    contentFailed,
    contentMissing,
    contentUnavailable,
    items,
    channelIdx,
    activeChannel,
    effectiveCol,
    activeChannelIsFavorite,
    epgNow,
    epgLookup,
    activeNowNext,
    playingNow,
    retryContent,
    canToggleFavorite,
    canToggleFavoriteInZap,
    searchNoResults,
    searchCoveragePartial,
    showResultsList,
    contentEmptyNeedsBack,
    toggleFocusedFavorite,
    showingContent,
    contentStale,
    declaredCount,
    realCount,
    countsDiverge,
    unresolvedFavorites,
  }
}

export type LiveChannels = ReturnType<typeof useLiveChannels>
