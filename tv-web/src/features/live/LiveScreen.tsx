import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  stableIdOf,
  useAggregatedItems,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
  useFavoriteIds,
  useFavoritesContent,
  type CatalogCategory,
  type CatalogItemOut,
} from '../catalog/catalogApi'
import { normalizeForSearch, searchWithinItems, SEARCH_MIN_CHARS } from '../../lib/catalog/catalogSearch'
import { PlayerLayer } from '../../components/PlayerLayer'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { FavoriteHint, FavoritesEmptyState, FavoritesUnresolvedNote } from '../favorites/FavoritesState'

/**
 * Altura de linha do painel de canais (feature 009) — soma da altura fixa
 * de `.live-item` (72px, `screens.css`) com o espaçamento entre itens
 * (12px) que a posição absoluta não herda mais do `gap` do flex column.
 */
const LIVE_ITEM_ROW_HEIGHT = 84
const LIVE_ITEM_OVERSCAN = 6

export interface LiveScreenProps {
  sourceId: string
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo guardado de uma categoria sumiu do aparelho. */
  onResync: () => void
}

/**
 * A trilha de categorias (feature 013) é "★ Favoritos" seguida das
 * categorias declaradas pela fonte — Favoritos nunca é gravado nem conta
 * como categoria (D-004 do plan.md), então a identidade de cada entrada é
 * uma união: favorita não tem nome pra comparar, categoria compara por
 * `groupLabel` (mesma chave que a trilha já usava antes desta feature).
 * Isto também resolve o edge case de uma categoria da FONTE chamar-se
 * "Favoritos" — a virtual nunca é confundida com ela, porque o `kind`
 * distingue as duas mesmo com o mesmo texto exibido. "Todos" (feature 018,
 * D-001) segue o mesmo modelo — categoria virtual, nunca gravada.
 */
type TrailKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; name: string }

function sameTrailKey(a: TrailKey, b: TrailKey): boolean {
  if (a.kind === 'category') return b.kind === 'category' && b.name === a.name
  return a.kind === b.kind
}

interface TrailEntry {
  key: TrailKey
  category?: CatalogCategory
}

/**
 * Identidade do que está em foco — o que sobrevive a uma troca de catálogo
 * em segundo plano (feature 004) e a uma revalidação de categoria (feature
 * 010, FR-019). `categoryIdx`/`channelIdx` são sempre DERIVADOS dela a cada
 * render, nunca o contrário: não existe um frame em que o índice aponta
 * para dado antigo.
 */
interface FocusIdentity {
  trailKey: TrailKey | null
  channelId: string | null
}

/** Índice da identidade na lista, ou 0 se ela não existir mais — cai no início em vez de adivinhar. */
function locate<T>(items: T[], matches: (item: T) => boolean): number {
  const idx = items.findIndex(matches)
  return idx === -1 ? 0 : idx
}

/**
 * Qual entrada da trilha uma sessão SEM navegação prévia (recém-aberta)
 * começa focada. As entradas virtuais ("★ Favoritos", "Todos") ficam no
 * topo, mas o padrão continua sendo a primeira categoria REAL — a maioria
 * das pessoas não tem favorito nenhum ainda, e abrir Live TV direto numa
 * seção vazia seria pior experiência do que preservar o comportamento já
 * existente (entrar direto na primeira categoria declarada pela fonte).
 * `VIRTUAL_TRAIL_COUNT` é constante (feature 018, D-001/D-009) — sempre 2
 * ("★ Favoritos" + "Todos"), inclusive dentro do zapping: a busca deixou
 * de ser uma entrada de trilha, então não há mais nada a omitir ali (só o
 * ÍCONE de busca continua fora do zapping, FR-018, tratado no JSX).
 */
const VIRTUAL_TRAIL_COUNT = 2

function defaultTrailIdx(trail: TrailEntry[]): number {
  return Math.min(VIRTUAL_TRAIL_COUNT, trail.length - 1)
}

/** O que entrou de fato na coluna de conteúdo — Favoritos, Todos, ou uma categoria por id. */
type EnteredKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; id: number }

export function LiveScreen({ sourceId, onBack, onResync }: LiveScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)
  const [playing, setPlaying] = useState<CatalogItemOut | null>(null)
  const [zapOpen, setZapOpen] = useState(false)
  const lastGoodChannelRef = useRef<CatalogItemOut | null>(null)
  const { toastMessage, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // Estrutura: rápida, sempre segura de ler — nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'channel')
  const categories = categoriesQuery.data ?? []

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

  const [focusedIdentity, setFocusedIdentity] = useState<FocusIdentity>({
    trailKey: null,
    channelId: null,
  })
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
   * abaixo, que precisa saber a categoria já entrada pra nunca reler nem
   * deixar um timer pendente (feature 015).
   */
  const [entered, setEntered] = useState<EnteredKey | null>(null)
  const enteredCategory = entered?.kind === 'category' ? categories.find((c) => c.id === entered.id) : undefined
  const enteredFavorites = entered?.kind === 'favorites'
  const enteredAll = entered?.kind === 'all'

  /**
   * Busca por categoria (feature 018) — sub-estado de qualquer entrada já
   * aberta (D-002), nunca uma entrada própria. `topFocused` generaliza o
   * antigo `searchFieldFocused` (feature 017): o foco visual, dentro da
   * coluna de conteúdo, está no elemento do topo — o ícone quando a busca
   * está inativa, o campo (foco DOM real) quando ativa — em vez de num
   * item/resultado (`logic/busca-por-categoria.md` §1/§3).
   */
  const [searchActive, setSearchActive] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [topFocused, setTopFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const belowMinimum = normalizeForSearch(searchTerm).length < SEARCH_MIN_CHARS

  useEffect(() => {
    if (searchActive && topFocused) searchInputRef.current?.focus()
    else searchInputRef.current?.blur()
  }, [searchActive, topFocused])

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

  const channelIdx = locate(items, (c) => c.id === focusedIdentity.channelId)
  const activeChannel = items[channelIdx]

  // Só o painel de conteúdo (col 1) é virtualizado — nunca a trilha de
  // categorias (D-004). Uma única lane: lista 1D de canais, sem `lanes`.
  const channelListRef = useRef<HTMLDivElement>(null)
  const channelVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => channelListRef.current,
    estimateSize: () => LIVE_ITEM_ROW_HEIGHT,
    overscan: LIVE_ITEM_OVERSCAN,
  })

  const channelsNavigable = col === 1 && !contentIsLoading && !contentUnavailable && items.length > 0
  useVirtualFocusSync({
    focusedIndex: channelIdx,
    scrollToIndex: channelVirtualizer.scrollToIndex,
    enabled: channelsNavigable,
  })

  /** Reseta a busca (feature 018, D-002/FR-008) — sempre que a coluna de conteúdo troca de entrada. */
  function resetSearchState() {
    setSearchActive(false)
    setSearchTerm('')
    setTopFocused(false)
  }

  function enterCategory(category: CatalogCategory) {
    if (entered?.kind !== 'category' || entered.id !== category.id) {
      setEntered({ kind: 'category', id: category.id })
      // Trocar de categoria recomeça no primeiro canal — o item anterior de
      // OUTRA categoria/de Favoritos/Todos não é uma posição significativa.
      setFocusedIdentity({ trailKey: { kind: 'category', name: groupLabel(category.name) }, channelId: null })
    }
    resetSearchState()
    setCol(1)
  }

  function enterFavorites() {
    if (entered?.kind !== 'favorites') {
      setEntered({ kind: 'favorites' })
      setFocusedIdentity({ trailKey: { kind: 'favorites' }, channelId: null })
    }
    resetSearchState()
    setCol(1)
  }

  /** Entra em "Todos" (feature 018, D-001) — mesmo padrão de `enterFavorites`. */
  function enterAll() {
    if (entered?.kind !== 'all') {
      setEntered({ kind: 'all' })
      setFocusedIdentity({ trailKey: { kind: 'all' }, channelId: null })
    }
    resetSearchState()
    setCol(1)
  }

  /** Entra no que está focado na trilha agora — Favoritos, Todos ou uma categoria. */
  function enterFocusedTrailItem() {
    if (isFavoritesFocused) enterFavorites()
    else if (isAllFocused) enterAll()
    else if (focusedCategory) enterCategory(focusedCategory)
  }

  function retryContent() {
    if (enteredFavorites) void favoritesContent.refetch()
    else void content.refetch()
  }

  /**
   * Segurar OK favorita/desfavorita o canal focado (feature 013) — só
   * quando a coluna de conteúdo está em foco, há um canal ali (não o
   * ícone/campo de busca, feature 018) e nada está tocando; nos demais
   * casos `onLongSelect` fica `undefined` e o OK volta a agir no keydown,
   * como sempre agiu (D-002 do plan.md — o modo é decidido no instante do
   * keydown, então isto nunca pode depender de um cálculo feito DEPOIS).
   */
  const canToggleFavorite = col === 1 && !playing && !topFocused && activeChannel !== undefined

  /**
   * Mesma regra de `canToggleFavorite`, mas para DENTRO do zapping (feature
   * 016, edge case da spec) — `playing` está sempre presente aqui (é a
   * própria sessão que o zapping cobre), então não reaproveita a guarda
   * `!playing` acima. `topFocused` nunca é `true` dentro do zapping na
   * prática (FR-018/D-009), mas a guarda fica por segurança.
   */
  const canToggleFavoriteInZap = zapOpen && col === 1 && !topFocused && activeChannel !== undefined

  // Busca (feature 018): declarado ANTES de `handleTrailSelect`/`useRemoteNav`
  // — o closure de `onSelect` precisa enxergar esta variável já inicializada
  // mesmo que os guard clauses de carregamento/erro abaixo façam um early
  // return no MESMO render (o closure em si só é chamado depois, mas em
  // resposta a um evento de um render anterior onde tudo já existia).
  const searchNoResults = searchActive && !belowMinimum && items.length === 0
  // Cobertura só existe/aparece dentro de "Todos" (FR-010/FR-011) — nunca
  // numa categoria real ou Favoritos, onde a busca já cobre 100% do local.
  const searchCoveragePartial = enteredAll && aggregated.coveredCategories < aggregated.totalCategories
  const showResultsList = searchActive
    ? !belowMinimum && items.length > 0
    : !contentIsLoading && !contentUnavailable && items.length > 0

  /**
   * Alterna o favorito do canal focado — chamada tanto por segurar OK
   * (`onLongSelect`) quanto pela tecla amarela (`onFavoriteKey`, achado em
   * 24/09/2026 testando na TV física: um controle substituto não entregava
   * o mesmo padrão de segurar do navegador). As duas são o MESMO caminho
   * de ação, nunca dois comportamentos diferentes — só dois jeitos de
   * chegar nele.
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

  const showingContent = col === 1
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

  function openZapping() {
    if (!playing) return
    const targetName = groupLabel(playing.original_group ?? undefined)
    const targetCategory = categories.find((c) => groupLabel(c.name) === targetName)
    if (targetCategory && (entered?.kind !== 'category' || entered.id !== targetCategory.id)) {
      setEntered({ kind: 'category', id: targetCategory.id })
    }
    setFocusedIdentity({
      trailKey: targetCategory ? { kind: 'category', name: targetName } : (focusedIdentity.trailKey ?? { kind: 'favorites' }),
      channelId: playing.id,
    })
    setCol(1)
    setZapOpen(true)
    // O zapping nunca mostra ícone/campo de busca (feature 018, FR-018) —
    // reseta caso a busca tivesse ficado aberta antes de abrir o zap.
    resetSearchState()
  }

  function handleTrailDirection(dir: 'up' | 'down' | 'left' | 'right') {
    // Ícone/campo no topo da coluna de conteúdo (feature 018, D-003):
    // qualquer entrada com itens tem esse topo — nunca dentro do zapping
    // (FR-018). ↓ do topo vai pro 1º item; ↑ no 1º item volta ao topo.
    // ←/→ no campo já foram capturados pela guarda de alvo editável do
    // useRemoteNav antes de chegar aqui — o que sobra de ←/→ (ícone
    // focado, sem foco DOM) precisa continuar pro fluxo padrão abaixo, por
    // isso só ↑/↓ retornam cedo aqui, nunca ← nem →.
    const hasTop = col === 1 && !zapOpen && items.length > 0
    if (hasTop && topFocused) {
      if (dir === 'down') {
        setTopFocused(false)
        setFocusedIdentity((prev) => ({ ...prev, channelId: items[0].id }))
      }
      if (dir === 'up' || dir === 'down') return
    }
    if (hasTop && !topFocused && dir === 'up' && channelIdx === 0) {
      setTopFocused(true)
      return
    }

    if (dir === 'left') {
      setCol(0)
      return
    }
    if (dir === 'right') {
      enterFocusedTrailItem()
      return
    }

    if (col === 0) {
      if (dir === 'up' || dir === 'down') {
        const next = clamp(categoryIdx + (dir === 'down' ? 1 : -1), 0, trail.length - 1)
        if (next !== categoryIdx) {
          setFocusedIdentity({ trailKey: trail[next]?.key ?? { kind: 'favorites' }, channelId: null })
        }
      }
    } else if (!topFocused) {
      const total = items.length
      if (dir === 'up' || dir === 'down') {
        const next = clamp(channelIdx + (dir === 'down' ? 1 : -1), 0, Math.max(0, total - 1))
        setFocusedIdentity((prev) => ({ ...prev, channelId: items[next]?.id ?? null }))
      }
    }
  }

  function handleTrailSelect() {
    if (col === 0) {
      enterFocusedTrailItem()
      return
    }
    // "Favoritos" vazia (FR-008): o único elemento acionável da tela é o
    // botão "Voltar" do `FavoritesEmptyState` — sem isto, OK não faz
    // nada aqui (o botão só tem `onClick`, e o `onSelect` deste hook é
    // quem de fato responde ao controle remoto, não o clique de mouse).
    if (enteredFavorites && !contentIsLoading && !contentFailed && items.length === 0) {
      setCol(0)
      return
    }
    // Feature 014 (T039) — e achado no caminho: o mesmo estado de
    // "Tentar de novo" já existia sem isto, então SELECT não ativava o
    // botão apesar da aparência de foco (constitution, "Foco Visível e
    // Sem Becos Sem Saída") — corrigido junto, mesmo sendo pré-existente.
    if (!contentIsLoading && contentMissing) {
      onResync()
      return
    }
    if (!contentIsLoading && contentFailed) {
      retryContent()
      return
    }
    // Ícone de busca (feature 018): SELECT nele abre o campo. Só é
    // alcançado com `!searchActive` — quando o campo já tem foco DOM real
    // (`searchActive && topFocused`), a guarda de alvo editável do
    // useRemoteNav intercepta Enter antes de chegar aqui.
    if (topFocused) {
      setSearchActive(true)
      setSearchTerm('')
      return
    }
    if (!activeChannel) return
    if (!activeChannel.playable) {
      // Canal existe no catálogo mas não tem fonte de reprodução: explica,
      // não tenta abrir o player (FR-012).
      showToast('Este canal não tem uma fonte de reprodução disponível.')
      return
    }

    if (zapOpen) {
      if (activeChannel.id === playing?.id) {
        setZapOpen(false)              // D-007: mesmo canal — só fecha, sem trocar
        return
      }
      lastGoodChannelRef.current = playing   // D-008: guarda ANTES da troca
      setPlaying(activeChannel)              // troca a sessão — topLayer continua aberto
      return
    }

    setPlaying(activeChannel)
  }

  // Quando a camada de reprodução está aberta, ela é dona do teclado
  // (`modal: true`), então esta tela ignora as teclas — nada de navegar a
  // lista por trás do player.
  useRemoteNav({
    onDirection: (dir) => {
      if (playing) return
      handleTrailDirection(dir)
    },
    onSelect: () => {
      if (playing) return
      handleTrailSelect()
    },
    onLongSelect: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onFavoriteKey: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onBack: () => {
      if (playing) return
      // Busca (feature 018): RETURN só ganha uma camada extra quando a
      // busca está ATIVA — resultado focado volta ao campo; campo focado
      // FECHA a busca (volta ao ícone, sem sair da categoria). Fora da
      // busca (item normal OU ícone parado), RETURN vai direto pra trilha,
      // igual à navegação normal — nunca força passar pelo ícone.
      // RETURN físico (10009/Escape/XF86Back) nunca é interceptado pela
      // guarda de alvo editável do useRemoteNav, então chega aqui
      // normalmente mesmo com o campo focado.
      if (col === 1 && searchActive && !topFocused) {
        setTopFocused(true)
        return
      }
      if (col === 1 && searchActive && topFocused) {
        setSearchActive(false)
        setSearchTerm('')
        return
      }
      if (col === 1) {
        setCol(0)
        return
      }
      onBack()
    },
  })

  if (categoriesQuery.isLoading) {
    return (
      <div className="screen">
        <div className="screen-title">Live TV</div>
        <div className="live-state">
          <div className="live-state-copy">Carregando canais…</div>
          <button type="button" className="live-state-action tv-focus">
            Voltar
          </button>
        </div>
        <Toast message={toastMessage} />
      </div>
    )
  }

  if (categoriesQuery.isError) {
    return (
      <div className="screen">
        <div className="screen-title">Live TV</div>
        <div className="live-state">
          <div className="live-state-title">Não foi possível carregar os canais</div>
          <div className="live-state-copy">
            Verifique a conexão com o servidor e tente novamente.
          </div>
          <div className="live-state-actions">
            <button
              type="button"
              className="live-state-action tv-focus"
              onClick={() => void categoriesQuery.refetch()}
            >
              Tentar de novo
            </button>
            <button type="button" className="live-state-action">
              Voltar
            </button>
          </div>
        </div>
        <Toast message={toastMessage} />
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="screen">
        <div className="screen-title">Live TV</div>
        <div className="live-state">
          <div className="live-state-title">Nenhum canal nesta lista</div>
          <div className="live-state-copy">
            A importação pode não ter encontrado canais nesta fonte, ou ainda estar em andamento.
          </div>
          <button type="button" className="live-state-action tv-focus">
            Voltar
          </button>
        </div>
        <Toast message={toastMessage} />
      </div>
    )
  }

  function renderColumns() {
    // Rótulo da entrada atualmente focada/entrada — Favoritos, Todos ou o
    // nome da categoria real (feature 018).
    const entryLabel = isAllFocused || enteredAll
      ? 'Todos'
      : isFavoritesFocused || enteredFavorites
        ? '★ Favoritos'
        : groupLabel(focusedCategory?.name)

    return (
      <>
        <div className="live-column live-column-groups">
          <div className="live-column-title">Grupos</div>
          {trail.map((entry, i) => (
            <button
              key={entry.key.kind === 'category' ? `cat-${entry.category!.id}` : entry.key.kind}
              ref={categoryIdx === i ? focusedCategoryRef : undefined}
              type="button"
              className={`live-item${entry.key.kind === 'all' ? ' live-item-all' : ''}${
                entry.key.kind === 'favorites' ? ' live-item-favorites' : ''
              }${col === 0 && categoryIdx === i ? ' tv-focus' : ''}`}
            >
              {entry.key.kind === 'all' && <span>Todos</span>}
              {entry.key.kind === 'favorites' && (
                <>
                  <span aria-hidden="true">★</span>
                  <span>Favoritos</span>
                </>
              )}
              {entry.key.kind === 'category' && groupLabel(entry.category?.name)}
            </button>
          ))}
        </div>

        <div className="live-column live-column-channels">
          <div className="category-title-row">
            <div className="live-column-title">{entryLabel}</div>
            {/* Ícone de busca (feature 018, FR-001): só quando há itens
                carregados (D-006) e nunca dentro do zapping (FR-018).
                `!contentUnavailable` evita o ícone aparecer sobre um
                `baseItems` obsoleto — `loadCategoryContent` sempre lê
                `channels`, que pode reter registros de uma geração
                anterior mesmo com outcome `source_missing`/`failed`
                (achado durante o gate final desta feature, T029). */}
            {!zapOpen && !searchActive && !contentUnavailable && baseItems.length > 0 && (
              <button
                type="button"
                className={`search-icon-button${col === 1 && topFocused ? ' tv-focus' : ''}`}
                aria-label="Buscar"
              >
                🔍
              </button>
            )}
          </div>

          {!showingContent && (
            <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver os canais.</div>
          )}

          {searchActive && (
            <div className="search-field-row">
              <input
                ref={searchInputRef}
                type="text"
                className="search-field field-box"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  // Tecla "Done" do teclado do sistema da TV — mesmo efeito
                  // de ↓ a partir do campo (`logic/busca-por-categoria.md` §3).
                  if (event.keyCode !== 65376) return
                  event.preventDefault()
                  if (items.length > 0) {
                    setTopFocused(false)
                    setFocusedIdentity((prev) => ({ ...prev, channelId: items[0].id }))
                  }
                }}
                placeholder="Buscar canais"
              />
              <div className="search-status">
                {belowMinimum && <span>Digite pelo menos 3 letras</span>}
                {!belowMinimum && <span>{items.length === 1 ? '1 resultado' : `${items.length} resultados`}</span>}
                {searchCoveragePartial && (
                  <span className="search-coverage">
                    Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
                  </span>
                )}
              </div>
            </div>
          )}

          {searchNoResults && (
            // Sem botão "ação" aqui de propósito: o campo continua com foco
            // DOM real neste estado (só se sai dele quando há resultado pra
            // focar), então RETURN já garante saída — nenhum beco sem saída
            // (constitution). Um botão redundante mostraria dois elementos
            // com aparência de foco ao mesmo tempo.
            <div className="live-state">
              <div className="live-state-title">Nenhum resultado para "{searchTerm}"</div>
              {searchCoveragePartial && (
                <div className="live-state-copy">
                  Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
                </div>
              )}
            </div>
          )}

          {enteredAll && !searchActive && searchCoveragePartial && (
            <div className="live-truncated-note">
              Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
            </div>
          )}

          {showingContent && !searchActive && contentIsLoading && (
            <div className="live-state">
              <div className="live-state-copy">Carregando canais…</div>
              <button type="button" className="live-state-action tv-focus">
                Voltar
              </button>
            </div>
          )}

          {showingContent && !searchActive && !contentIsLoading && contentFailed && (
            <div className="live-state">
              <div className="live-state-title">Não foi possível carregar esta categoria</div>
              <button type="button" className="live-state-action tv-focus" onClick={retryContent}>
                Tentar de novo
              </button>
            </div>
          )}

          {showingContent && !searchActive && !contentIsLoading && contentMissing && (
            <div className="live-state">
              <div className="live-state-title">O conteúdo desta lista não está mais no aparelho</div>
              <button type="button" className="live-state-action tv-focus" onClick={onResync}>
                Ressincronizar lista
              </button>
            </div>
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && items.length === 0 && (
            <FavoritesEmptyState kind="channel" focused onBack={() => setCol(0)} />
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredAll && items.length === 0 && (
            <div className="live-state-copy">Nenhuma categoria foi obtida ainda — entre numa categoria para trazê-la para "Todos".</div>
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && entered?.kind === 'category' && items.length === 0 && (
            <div className="live-state-copy">Este grupo está vazio.</div>
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && contentStale && (
            <div className="live-truncated-note">
              Não foi possível atualizar agora — mostrando o que já estava salvo.
            </div>
          )}

          {countsDiverge && (
            <div className="live-truncated-note">
              O provedor declarou {declaredCount} canais nesta categoria, mas entregou {realCount}.
            </div>
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && (
            <FavoritesUnresolvedNote unresolved={unresolvedFavorites} />
          )}

          {showResultsList && (
            <>
              <FavoriteHint />
              <div ref={channelListRef} className="live-channel-list">
                <div
                  className="live-channel-list-inner"
                  style={{ height: channelVirtualizer.getTotalSize() }}
                >
                  {channelVirtualizer.getVirtualItems().map((virtualRow) => {
                    const channel = items[virtualRow.index]
                    if (!channel) return null
                    const isFavorite = favoriteIds.has(stableIdOf(channel) ?? '')
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        className={`live-item${
                          col === 1 && !topFocused && channelIdx === virtualRow.index ? ' tv-focus' : ''
                        }${channel.playable ? '' : ' live-item-unavailable'}`}
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <span className="live-item-logo" aria-hidden="true" />
                        <span className="live-item-name">{channel.name}</span>
                        {enteredAll && (
                          <span className="live-item-group">{groupLabel(channel.original_group ?? undefined)}</span>
                        )}
                        {isFavorite && (
                          <span className="fav-star" aria-hidden="true">
                            ★
                          </span>
                        )}
                        {!channel.playable && <span className="live-item-badge">Indisponível</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && entered?.kind === 'category' && content.data && (
            // Fala do limite de exibição, não do tamanho da fonte — a distinção
            // importa porque o catálogo publicado pode ser parcial (FR-016).
            content.data.totalCount > items.length && (
              <div className="live-truncated-note">
                Mostrando os primeiros {items.length} de {content.data.totalCount} canais deste grupo.
              </div>
            )
          )}
        </div>

        <div className="live-preview-panel">
          <div className="live-preview-box">
            <div className="live-preview-logo" aria-hidden="true" />
          </div>
          <div className="live-channel-name">{activeChannel?.name ?? 'Selecione um canal'}</div>
          <div className="live-channel-meta">{entryLabel}</div>
          {/* Slot de EPG: nasce vazio e sem rótulo até existir fonte de dados
              (item 44 do backlog). Reservar a área evita o layout pular depois. */}
          <div className="live-channel-now" />
        </div>
      </>
    )
  }

  return (
    <>
      {!playing && (
        <div className="screen screen-row">
          {renderColumns()}
        </div>
      )}

      {playing && (
        <PlayerLayer
          itemId={playing.id}
          title={playing.name}
          onClose={() => setPlaying(null)}
          onIdleSelect={openZapping}
          onEnteredPlaying={() => setZapOpen(false)}
          onSessionError={() => {
            const fallback = lastGoodChannelRef.current
            if (!fallback) return
            lastGoodChannelRef.current = null;
            setPlaying(fallback)
            showToast(`Não foi possível trocar de canal. Voltando para ${fallback.name}.`)
          }}
          topLayer={
            zapOpen
              ? {
                  content: <div className="player-zap-columns">{renderColumns()}</div>,
                  onDirection: handleTrailDirection,
                  onSelect: handleTrailSelect,
                  onBack: () => setZapOpen(false),
                  onLongSelect: canToggleFavoriteInZap ? toggleFocusedFavorite : undefined,
                  onFavoriteKey: canToggleFavoriteInZap ? toggleFocusedFavorite : undefined,
                }
              : null
          }
          unavailableMessage="Este canal não tem uma fonte de reprodução disponível."
          genericErrorMessage="Não foi possível reproduzir este canal."
        />
      )}

      <Toast message={toastMessage} />
    </>
  )
}
