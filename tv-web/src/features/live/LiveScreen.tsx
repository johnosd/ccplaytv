import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  stableIdOf,
  useAggregatedItems,
  useCatalogItem,
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
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import type { HintItem } from '../shell/HintBar'
import type { TopbarItem } from '../../navigation/appNav'
import { SideCategoryNav, type SideCategoryNavEntry } from '../../components/SideCategoryNav'
import { ChannelRow } from '../../components/ChannelRow'
import { PosterArt } from '../../components/PosterArt'
import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { Chip } from '../../components/Chip'
import { Icon } from '../../components/Icon'
import { getComingSoon } from '../../lib/comingSoon'
import { channelNumberOf, knownCategoryCount } from './channelNumber'

/**
 * Altura de linha do painel de canais (feature 009) — soma da altura fixa
 * de `.live-channel-row` (`live.css`, feature 024) com o espaçamento entre
 * itens que a posição absoluta não herda mais do `gap` do flex column.
 */
const LIVE_ITEM_ROW_HEIGHT = 84
const LIVE_ITEM_OVERSCAN = 6

/** Ações do painel de preview, na ordem vertical (feature 024, D-005). */
const PREVIEW_ACTION_COUNT = 3

const LIVE_HINTS: HintItem[] = [
  { keyLabel: 'OK', action: 'Assistir' },
  { keyLabel: 'Segurar OK', action: 'Favoritar' },
  { keyLabel: 'RETURN', action: 'Voltar' },
]

/**
 * Moldura V14 da Live (feature 024, FR-001..FR-004): topbar persistente por
 * cima das colunas. Opcional — sem ela, a tela funciona sozinha como antes
 * (é assim que os testes de comportamento e o contrato travado da 018 a
 * montam). `logic/foco-live-shell.md` da 024.
 */
export interface LiveShellProps {
  /** Nome da lista ativa, para o indicador da topbar. */
  sourceName: string
  /** OK em "Início" na topbar. */
  onGoHome: () => void
  /** OK em Filmes/Séries na topbar — troca de destino sem empilhar a Live (D-004). */
  onSwitchTop: (destination: 'movies' | 'series') => void
  /** OK no indicador da lista ativa. */
  onOpenProfiles: () => void
  /**
   * OK na lupa/engrenagem da topbar (feature 026, D-001 — opcional: o
   * contrato travado da 024 monta este objeto com 4 campos, e o `tsc -b`
   * compila esse arquivo). Ausente = soft disabled.
   */
  onOpenSearch?: () => void
  onOpenSettings?: () => void
}

export interface LiveScreenProps {
  sourceId: string
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo guardado de uma categoria sumiu do aparelho. */
  onResync: () => void
  /** Feature 024. */
  shell?: LiveShellProps
  /**
   * Entra tocando este canal, uma única vez (feature 026, `logic/
   * navegacao.md` §3) — do Início (card de "Canais favoritos") ou da Busca
   * global (resultado de canal). `entry: 'favorites'` entra em
   * `★ Favoritos`; `entry: 'category'` lê a categoria do canal
   * (`useCatalogItem`) e entra nela. Canal não encontrado: fica na entrada
   * padrão, sem reprodução nem mensagem de erro inventada.
   */
  initialChannel?: { channelId: string; entry: 'favorites' | 'category' }
  /** Entra direto em `★ Favoritos`, sem canal específico ("Ver todos" do Início). */
  openFavorites?: boolean
  /** Remonta com a topbar ativa neste item — volta de Busca/Configurações (FR-034/FR-044). */
  initialTopbarItem?: TopbarItem
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

/** Chave de string estável de uma entrada da trilha — só para o `id` do `SideCategoryNav` (feature 024, componente burro, D-009 da 022). */
function trailEntryId(entry: TrailEntry): string {
  if (entry.key.kind === 'category') return `cat-${entry.category!.id}`
  return entry.key.kind
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

export function LiveScreen({
  sourceId,
  onBack,
  onResync,
  shell,
  initialChannel,
  openFavorites,
  initialTopbarItem,
}: LiveScreenProps) {
  // Entra direto em ★ Favoritos quando pedido pelo Início/Busca (feature
  // 026) — `openFavorites` ou qualquer `initialChannel` com `entry:
  // 'favorites'`; `entry: 'category'` precisa de um efeito (a categoria só
  // se sabe depois de ler o registro do canal), tratado abaixo.
  const startsInFavorites = openFavorites || initialChannel?.entry === 'favorites'
  const [col, setCol] = useState<0 | 1 | 2>(startsInFavorites ? 1 : 0)
  const [previewAction, setPreviewAction] = useState(0)
  const [playing, setPlaying] = useState<CatalogItemOut | null>(null)
  const [zapOpen, setZapOpen] = useState(false)
  const lastGoodChannelRef = useRef<CatalogItemOut | null>(null)
  /**
   * Vizinhança de canal do chrome (feature 027, D-008, `logic/chrome-player.md`
   * §7) — um SNAPSHOT da lista exibida no momento em que o canal começou a
   * tocar pela lista (inclusive a partir do zapping), nunca o `items`
   * corrente: `openZapping` troca `entered` para a categoria de
   * `original_group`, então ler `items` ao vivo mudaria a sequência debaixo
   * do pé de ↑/↓ no meio de uma sessão.
   */
  const zapSequenceRef = useRef<CatalogItemOut[]>([])
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // Composição de foco topbar ↔ conteúdo (feature 024, D-003 do plan.md —
  // `logic/foco-live-shell.md` §2), mesmo mecanismo da feature 023. Só
  // existe de fato com `shell`; sem ele, `zone` nunca sai de 'content'.
  // `initialTopbarItem` (feature 026, FR-034/FR-044) começa com a topbar já
  // ativa nesse item, em vez do conteúdo.
  const [zone, setZone] = useState<'topbar' | 'content'>(initialTopbarItem ? 'topbar' : 'content')
  const [topbarItem, setTopbarItem] = useState<TopbarItem>(initialTopbarItem ?? 'live')
  const contentActive = !shell || zone === 'content'

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
  // Alterna entre "Tentar de novo" (0) e "Voltar" (1) no estado de erro de
  // topo — os outros dois (loading/empty) têm uma ação só, sempre focada.
  const [topErrorActionIndex, setTopErrorActionIndex] = useState(0)

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
      ? { trailKey: { kind: 'favorites' }, channelId: initialChannel?.channelId ?? null }
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
   * abaixo, que precisa saber a categoria já entrada pra nunca reler nem
   * deixar um timer pendente (feature 015).
   */
  const [entered, setEntered] = useState<EnteredKey | null>(startsInFavorites ? { kind: 'favorites' } : null)
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

  // `initialChannel.entry === 'category'` (feature 026, `logic/navegacao.md`
  // §3): a categoria só se sabe depois de ler o registro do canal — ao
  // contrário de `entry: 'favorites'`/`openFavorites`, que já entram direto
  // no estado inicial (síncrono). `enteredCategoryOnceRef` garante que isto
  // roda uma única vez, mesmo que `categories`/a consulta do canal mudem de
  // novo depois (ex.: revalidação em segundo plano).
  const categoryLookupChannelId = initialChannel?.entry === 'category' ? initialChannel.channelId : null
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

  const channelIdx = locate(items, (c) => c.id === focusedIdentity.channelId)
  const activeChannel = items[channelIdx]
  // Canal que sumiu com o preview aberto (feature 024, `logic/foco-live-
  // shell.md` §3): cai de volta pra coluna de canais em vez de deixar o
  // preview "órfão", sem foco algum sobre ele.
  const effectiveCol = col === 2 && !activeChannel ? 1 : col
  const activeChannelIsFavorite = activeChannel ? favoriteIds.has(stableIdOf(activeChannel) ?? '') : false

  // Reproduz o canal pedido (feature 026, `logic/navegacao.md` §3) uma
  // única vez, assim que ele aparecer na lista exibida — nunca antes
  // (carregando ainda não tem `items`), nunca de novo (trocar de canal
  // depois é decisão da pessoa, não deste efeito). Mesmo caminho do OK
  // (`playActiveChannel`, abaixo) — inclusive o aviso de "sem fonte de
  // reprodução" se for o caso.
  const autoPlayedInitialChannelRef = useRef(false)
  useEffect(() => {
    if (!initialChannel || autoPlayedInitialChannelRef.current) return
    if (contentIsLoading) return
    if (!activeChannel || activeChannel.id !== initialChannel.channelId) return
    autoPlayedInitialChannelRef.current = true
    playActiveChannel()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `playActiveChannel` é recriada a cada render (lê refs/estado), mas o guard `autoPlayedInitialChannelRef` já impede qualquer segunda chamada
  }, [initialChannel, contentIsLoading, activeChannel])

  // Só o painel de conteúdo (col 1) é virtualizado — nunca a trilha de
  // categorias (D-004). Uma única lane: lista 1D de canais, sem `lanes`.
  const channelListRef = useRef<HTMLDivElement>(null)
  const channelVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => channelListRef.current,
    estimateSize: () => LIVE_ITEM_ROW_HEIGHT,
    overscan: LIVE_ITEM_OVERSCAN,
  })

  const channelsNavigable = effectiveCol === 1 && !contentIsLoading && !contentUnavailable && items.length > 0
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
    setPreviewAction(0)
  }

  function enterFavorites() {
    if (entered?.kind !== 'favorites') {
      setEntered({ kind: 'favorites' })
      setFocusedIdentity({ trailKey: { kind: 'favorites' }, channelId: null })
    }
    resetSearchState()
    setCol(1)
    setPreviewAction(0)
  }

  /** Entra em "Todos" (feature 018, D-001) — mesmo padrão de `enterFavorites`. */
  function enterAll() {
    if (entered?.kind !== 'all') {
      setEntered({ kind: 'all' })
      setFocusedIdentity({ trailKey: { kind: 'all' }, channelId: null })
    }
    resetSearchState()
    setCol(1)
    setPreviewAction(0)
  }

  /** Entra numa entrada específica da trilha — Favoritos, Todos ou uma categoria. */
  function enterTrailEntry(entry: TrailEntry) {
    if (entry.key.kind === 'favorites') enterFavorites()
    else if (entry.key.kind === 'all') enterAll()
    else if (entry.category) enterCategory(entry.category)
  }

  /** Entra no que está focado na trilha agora — Favoritos, Todos ou uma categoria. */
  function enterFocusedTrailItem() {
    if (focusedTrailEntry) enterTrailEntry(focusedTrailEntry)
  }

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

  /** OK/Assistir sobre o canal focado — mesmo caminho a partir da lista ou do preview (feature 024). */
  function playActiveChannel() {
    if (!activeChannel) return
    if (!activeChannel.playable) {
      // Canal existe no catálogo mas não tem fonte de reprodução: explica,
      // não tenta abrir o player (FR-012/FR-019).
      showToast('Este canal não tem uma fonte de reprodução disponível.')
      return
    }

    if (zapOpen) {
      if (activeChannel.id === playing?.id) {
        setZapOpen(false) // D-007: mesmo canal — só fecha, sem trocar
        return
      }
      // feature 027, D-008: novo início pela lista — recaptura a vizinhança.
      zapSequenceRef.current = items
      lastGoodChannelRef.current = playing // D-008: guarda ANTES da troca
      setPlaying(activeChannel) // troca a sessão — topLayer continua aberto
      return
    }

    zapSequenceRef.current = items // feature 027, D-008
    setPlaying(activeChannel)
  }

  /**
   * ↑/↓ e CH± do chrome (feature 027, US2, `logic/chrome-player.md` §7):
   * troca para o canal anterior/seguinte REPRODUZÍVEL da vizinhança
   * capturada, sem voltar nas pontas (FR-011). Devolve `false` no limite —
   * `PlayerLayer` avisa e não altera a sessão.
   */
  function stepChannel(direction: 'previous' | 'next'): boolean {
    if (!playing) return false
    const seq = zapSequenceRef.current
    let i = seq.findIndex((c) => c.id === playing.id)
    if (i === -1) return false
    const delta = direction === 'next' ? 1 : -1
    do {
      i += delta
    } while (seq[i] && !seq[i].playable)
    const target = seq[i]
    if (!target) return false
    lastGoodChannelRef.current = playing // D-008: mesmo fallback de erro da 016
    setPlaying(target)
    setFocusedIdentity((prev) => ({ ...prev, channelId: target.id })) // FR-014
    return true
  }

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
    const hasTop = effectiveCol === 1 && !zapOpen && items.length > 0
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
      if (effectiveCol === 2) {
        setCol(1) // preview → o mesmo canal de onde saiu (D-005)
        return
      }
      setCol(0)
      return
    }
    if (dir === 'right') {
      if (effectiveCol === 0) {
        enterFocusedTrailItem()
        return
      }
      // → do canal focado pro preview (feature 024, FR-014) — nunca dentro
      // do zapping, que não tem preview (D-009): mantém o comportamento
      // antigo (sem efeito) lá.
      if (effectiveCol === 1 && !zapOpen && !topFocused && activeChannel) {
        setCol(2)
        setPreviewAction(0)
      }
      return
    }

    if (effectiveCol === 0) {
      // Sobe da trilha para a topbar (feature 024, D-003) — só fora do
      // zapping (que não tem topbar) e só no topo real da trilha.
      if (dir === 'up' && categoryIdx === 0 && shell && !zapOpen) {
        setTopbarItem('live')
        setZone('topbar')
        return
      }
      if (dir === 'up' || dir === 'down') {
        const next = clamp(categoryIdx + (dir === 'down' ? 1 : -1), 0, trail.length - 1)
        if (next !== categoryIdx) {
          setFocusedIdentity({ trailKey: trail[next]?.key ?? { kind: 'favorites' }, channelId: null })
        }
      }
    } else if (effectiveCol === 2) {
      if (dir === 'up' || dir === 'down') {
        setPreviewAction((prev) => clamp(prev + (dir === 'down' ? 1 : -1), 0, PREVIEW_ACTION_COUNT - 1))
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
    if (effectiveCol === 0) {
      enterFocusedTrailItem()
      return
    }

    if (effectiveCol === 2) {
      if (previewAction === 0) {
        playActiveChannel()
        return
      }
      if (previewAction === 1) {
        toggleFocusedFavorite()
        return
      }
      // "Guia completo" — mock "Em breve" (feature 024, FR-017, item 42).
      showToast(`Em breve — ${getComingSoon('epg-guide').message}`)
      return
    }

    // Estados só com "Voltar" (feature 024, T021/R-005): carregando o
    // conteúdo, ou conteúdo vazio sem outra ação (Favoritos/Todos/categoria
    // vazios) — nos três, o único elemento acionável é "Voltar", que devolve
    // o foco à trilha. Sem isto, os botões apareciam com aparência de foco
    // sem SELECT fazer nada (constitution, "Foco Visível e Sem Becos Sem
    // Saída").
    if (showingContent && !searchActive && contentIsLoading) {
      setCol(0)
      return
    }
    if (contentEmptyNeedsBack) {
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
    playActiveChannel()
  }

  // Quando a camada de reprodução está aberta, ela é dona do teclado
  // (`modal: true`), então esta tela ignora as teclas — nada de navegar a
  // lista por trás do player. Com `shell`, só o escopo ATIVO (topbar ou
  // conteúdo) recebe handlers — o outro ganha `{}` (mesmo padrão de
  // `TopBar`/`logic/foco-live-shell.md` §2 da feature 024).
  useRemoteNav(
    contentActive
      ? {
          onDirection: (dir) => {
            if (playing) return
            if (topPhase === 'error') {
              if (dir === 'left' || dir === 'right') setTopErrorActionIndex((i) => (i === 0 ? 1 : 0))
              return
            }
            if (topPhase !== 'normal') return // loading/empty: uma ação só, nada pra mover
            handleTrailDirection(dir)
          },
          onSelect: () => {
            if (playing) return
            if (topPhase === 'loading' || topPhase === 'empty') {
              onBack()
              return
            }
            if (topPhase === 'error') {
              if (topErrorActionIndex === 0) void categoriesQuery.refetch()
              else onBack()
              return
            }
            handleTrailSelect()
          },
          onLongSelect: topPhase === 'normal' && canToggleFavorite ? toggleFocusedFavorite : undefined,
          onFavoriteKey: topPhase === 'normal' && canToggleFavorite ? toggleFocusedFavorite : undefined,
          onBack: () => {
            if (playing) return
            if (topPhase !== 'normal') {
              onBack()
              return
            }
            // Preview (feature 024): volta ao mesmo canal, nunca à trilha
            // direto (D-005).
            if (effectiveCol === 2) {
              setCol(1)
              return
            }
            // Busca (feature 018): RETURN só ganha uma camada extra quando a
            // busca está ATIVA — resultado focado volta ao campo; campo focado
            // FECHA a busca (volta ao ícone, sem sair da categoria). Fora da
            // busca (item normal OU ícone parado), RETURN vai direto pra trilha,
            // igual à navegação normal — nunca força passar pelo ícone.
            // RETURN físico (10009/Escape/XF86Back) nunca é interceptado pela
            // guarda de alvo editável do useRemoteNav, então chega aqui
            // normalmente mesmo com o campo focado.
            if (effectiveCol === 1 && searchActive && !topFocused) {
              setTopFocused(true)
              return
            }
            if (effectiveCol === 1 && searchActive && topFocused) {
              setSearchActive(false)
              setSearchTerm('')
              return
            }
            if (effectiveCol === 1) {
              setCol(0)
              return
            }
            onBack()
          },
        }
      : {},
  )

  /**
   * Envolve `children` na moldura V14 (feature 024, D-002) quando `shell`
   * existe — topbar persistente, com "TV ao vivo" como destino atual (D-004).
   * Sem `shell`, devolve `children` sozinho: é assim que a tela funciona
   * quando ninguém a monta com moldura (contrato travado da 018, testes de
   * comportamento existentes).
   */
  function withShell(children: ReactNode): ReactNode {
    if (!shell) return children
    return (
      <AppShell
        hints={LIVE_HINTS}
        topBar={
          <TopBar
            sourceName={shell.sourceName}
            active={zone === 'topbar'}
            focusedItem={topbarItem}
            currentItem="live"
            onFocusItem={setTopbarItem}
            onExitDown={() => setZone('content')}
            onNavigate={(destination) => {
              if (destination === 'movies' || destination === 'series') shell.onSwitchTop(destination)
            }}
            onGoHome={shell.onGoHome}
            onOpenProfiles={shell.onOpenProfiles}
            onOpenSearch={shell.onOpenSearch}
            onOpenSettings={shell.onOpenSettings}
            onBack={onBack}
          />
        }
      >
        {children}
      </AppShell>
    )
  }

  if (topPhase === 'loading') {
    return withShell(
      <div className="screen live-screen">
        <div className="live-state-wrapper">
          <Spinner size={48} />
          <EmptyState title="Carregando canais…" action={{ label: 'Voltar', onSelect: onBack }} focused />
        </div>
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (topPhase === 'error') {
    return withShell(
      <div className="screen live-screen">
        <ErrorState
          title="Não foi possível carregar os canais"
          description="Verifique a conexão com o servidor e tente novamente."
          actions={[
            { label: 'Tentar de novo', onSelect: () => void categoriesQuery.refetch() },
            { label: 'Voltar', onSelect: onBack },
          ]}
          focusedActionIndex={topErrorActionIndex}
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (topPhase === 'empty') {
    return withShell(
      <div className="screen live-screen">
        <EmptyState
          title="Nenhum canal nesta lista"
          description="A importação pode não ter encontrado canais nesta fonte, ou ainda estar em andamento."
          action={{ label: 'Voltar', onSelect: onBack }}
          focused
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  function renderColumns(withPreview: boolean) {
    // Rótulo da entrada atualmente focada/entrada — Favoritos, Todos ou o
    // nome da categoria real (feature 018).
    const entryLabel = isAllFocused || enteredAll
      ? 'Todos'
      : isFavoritesFocused || enteredFavorites
        ? '★ Favoritos'
        : groupLabel(focusedCategory?.name)

    const sideEntries: SideCategoryNavEntry[] = trail.map((entry) => {
      if (entry.key.kind === 'favorites') {
        return {
          id: trailEntryId(entry),
          label: 'Favoritos',
          icon: 'favorite',
          count: favoriteIds.size,
          pinned: true,
          pinnedBadge: false,
        }
      }
      if (entry.key.kind === 'all') {
        return { id: trailEntryId(entry), label: 'Todos', pinned: true, pinnedBadge: false }
      }
      return {
        id: trailEntryId(entry),
        label: groupLabel(entry.category?.name),
        count: entry.category ? knownCategoryCount(entry.category) : undefined,
      }
    })
    const selectedTrailId = entered
      ? entered.kind === 'category'
        ? `cat-${entered.id}`
        : entered.kind
      : ''
    // Sem foco visual na trilha enquanto a topbar estiver ativa (feature
    // 024, D-003) — o estado interno (`categoryIdx`) continua o mesmo, só
    // a marcação `.tv-focus` some, exatamente como a topbar da 023 faz com
    // o conteúdo do Início.
    const focusedTrailId = contentActive && effectiveCol === 0 && focusedTrailEntry ? trailEntryId(focusedTrailEntry) : undefined

    return (
      <>
        <div className="live-column live-column-groups">
          <SideCategoryNav
            entries={sideEntries}
            selectedId={selectedTrailId}
            focusedId={focusedTrailId}
            focusedRef={focusedCategoryRef}
            onSelect={(id) => {
              const target = trail.find((entry) => trailEntryId(entry) === id)
              if (target) enterTrailEntry(target)
            }}
          />
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
                (achado durante o gate final da feature 018, T029). */}
            {!zapOpen && !searchActive && !contentUnavailable && baseItems.length > 0 && (
              <button
                type="button"
                className={`search-icon-button${effectiveCol === 1 && topFocused ? ' tv-focus' : ''}`}
                aria-label="Buscar"
              >
                <Icon name="search" />
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
                // Achado real (feature 028, FR-015): sem aria-label nem <label>, o campo não tinha nome acessível.
                aria-label="Pesquisar nesta categoria"
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
            <div className="live-state-wrapper">
              <Spinner size={32} />
              <EmptyState title="Carregando canais…" action={{ label: 'Voltar', onSelect: () => setCol(0) }} focused />
            </div>
          )}

          {showingContent && !searchActive && !contentIsLoading && contentFailed && (
            <ErrorState
              title="Não foi possível carregar esta categoria"
              actions={[{ label: 'Tentar de novo', onSelect: retryContent }]}
              focusedActionIndex={0}
            />
          )}

          {showingContent && !searchActive && !contentIsLoading && contentMissing && (
            <ErrorState
              title="O conteúdo desta lista não está mais no aparelho"
              actions={[{ label: 'Ressincronizar lista', onSelect: onResync }]}
              focusedActionIndex={0}
            />
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && items.length === 0 && (
            <FavoritesEmptyState kind="channel" focused onBack={() => setCol(0)} />
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredAll && items.length === 0 && (
            <EmptyState
              title="Nenhuma categoria foi obtida ainda"
              description='Entre numa categoria para trazê-la para "Todos".'
              action={{ label: 'Voltar', onSelect: () => setCol(0) }}
              focused
            />
          )}

          {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && entered?.kind === 'category' && items.length === 0 && (
            <EmptyState title="Este grupo está vazio." action={{ label: 'Voltar', onSelect: () => setCol(0) }} focused />
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
              {/* Achado real (feature 028, FR-006): rolava com a barra nativa visível. */}
              <div ref={channelListRef} className="live-channel-list no-scrollbar">
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
                        className={`live-channel-row${
                          effectiveCol === 1 && !topFocused && channelIdx === virtualRow.index ? ' tv-focus' : ''
                        }`}
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <ChannelRow
                          number={channelNumberOf(channel, categories) ?? undefined}
                          logoUrl={channel.icon_url ?? undefined}
                          name={channel.name}
                          nameClassName="live-item-name"
                          favorite={isFavorite}
                          unavailable={!channel.playable}
                        />
                        {enteredAll && (
                          <span className="live-item-group">{groupLabel(channel.original_group ?? undefined)}</span>
                        )}
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

        {withPreview && (
          <div className="live-preview-panel">
            {activeChannel ? (
              <>
                <PosterArt url={activeChannel.icon_url ?? undefined} title={activeChannel.name} variant="logo" />
                <div className="live-channel-name">{activeChannel.name}</div>
                {channelNumberOf(activeChannel, categories) && (
                  <div className="live-channel-number">{channelNumberOf(activeChannel, categories)}</div>
                )}
                <div className="live-channel-meta">{groupLabel(activeChannel.original_group ?? undefined)}</div>
                {/* Slot de EPG: nasce vazio e sem rótulo até existir fonte de
                    dados (item 42 do backlog). Reservar a área evita o
                    layout pular depois. */}
                <div className="live-channel-now" />
                <div className="live-preview-actions">
                  <button
                    type="button"
                    className={`live-preview-action${effectiveCol === 2 && previewAction === 0 ? ' tv-focus' : ''}${
                      !activeChannel.playable ? ' is-soft-disabled' : ''
                    }`}
                    // Achado real (feature 028, FR-016): sem sinal estático da indisponibilidade quando o canal não é reproduzível.
                    aria-disabled={!activeChannel.playable ? 'true' : undefined}
                  >
                    Assistir
                  </button>
                  <button
                    type="button"
                    className={`live-preview-action${effectiveCol === 2 && previewAction === 1 ? ' tv-focus' : ''}`}
                  >
                    {activeChannelIsFavorite ? 'Favorito' : 'Favoritar'}
                  </button>
                  <button
                    type="button"
                    className={`live-preview-action is-soft-disabled${
                      effectiveCol === 2 && previewAction === 2 ? ' tv-focus' : ''
                    }`}
                    // Achado real (feature 028, FR-016): sempre "Em breve" (item 42), mas sem sinal estático.
                    aria-disabled="true"
                  >
                    Guia completo
                  </button>
                </div>
              </>
            ) : (
              <div className="live-preview-empty">
                {showingContent ? 'Selecione um canal' : 'Nenhum canal selecionado.'}
              </div>
            )}
          </div>
        )}
      </>
    )
  }

  // Contagem conhecida da entrada exibida no cabeçalho (FR-006) — a mesma
  // regra do trilho (FR-008): nunca inventada, ausente quando desconhecida.
  const headerCount = isFavoritesFocused || enteredFavorites
    ? favoriteIds.size
    : focusedCategory
      ? knownCategoryCount(focusedCategory)
      : undefined
  const headerLabel = isAllFocused || enteredAll
    ? 'Todos'
    : isFavoritesFocused || enteredFavorites
      ? '★ Favoritos'
      : groupLabel(focusedCategory?.name)

  return (
    <>
      {!playing &&
        withShell(
          <div className="screen live-screen">
            <div className="live-header">
              <h1 className="screen-title">TV ao vivo</h1>
              <div className="live-header-chips">
                <Chip selected={false}>{headerLabel}</Chip>
                {headerCount !== undefined && <Chip selected={false}>{headerCount} canais</Chip>}
              </div>
            </div>
            <div className="live-body">{renderColumns(true)}</div>
          </div>,
        )}

      {playing && (
        <PlayerLayer
          itemId={playing.id}
          title={playing.name}
          identity={{
            title: playing.name,
            channelNumber: channelNumberOf(playing, categories),
            logoUrl: playing.icon_url ?? undefined,
          }}
          onChannelStep={stepChannel}
          onClose={() => setPlaying(null)}
          onIdleSelect={openZapping}
          onEnteredPlaying={() => setZapOpen(false)}
          onSessionError={() => {
            const fallback = lastGoodChannelRef.current
            if (!fallback) return
            lastGoodChannelRef.current = null
            setPlaying(fallback)
            showToast(`Não foi possível trocar de canal. Voltando para ${fallback.name}.`)
          }}
          topLayer={
            zapOpen
              ? {
                  content: <div className="player-zap-columns">{renderColumns(false)}</div>,
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
