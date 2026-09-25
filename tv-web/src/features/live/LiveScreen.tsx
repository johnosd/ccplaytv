import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  stableIdOf,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
  useFavoriteIds,
  useFavoritesContent,
  type CatalogCategory,
  type CatalogItemOut,
} from '../catalog/catalogApi'
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
 * distingue as duas mesmo com o mesmo texto exibido.
 */
type TrailKey = { kind: 'favorites' } | { kind: 'category'; name: string }

function sameTrailKey(a: TrailKey, b: TrailKey): boolean {
  return a.kind === 'favorites' ? b.kind === 'favorites' : b.kind === 'category' && b.name === a.name
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
 * começa focada. "★ Favoritos" fica no topo (posição 0 do array), mas o
 * padrão continua sendo a primeira categoria REAL (posição 1) — a maioria
 * das pessoas não tem favorito nenhum ainda, e abrir Live TV direto numa
 * seção vazia seria pior experiência do que preservar o comportamento já
 * existente (entrar direto na primeira categoria declarada pela fonte).
 */
function defaultTrailIdx(trail: TrailEntry[]): number {
  return Math.min(1, trail.length - 1)
}

/** O que entrou de fato na coluna de conteúdo — Favoritos ou uma categoria por id. */
type EnteredKey = { kind: 'favorites' } | { kind: 'category'; id: number }

export function LiveScreen({ sourceId, onBack, onResync }: LiveScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)
  const [playing, setPlaying] = useState<CatalogItemOut | null>(null)
  const { toastMessage, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // Estrutura: rápida, sempre segura de ler — nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'channel')
  const categories = categoriesQuery.data ?? []

  const trail: TrailEntry[] = [
    { key: { kind: 'favorites' } },
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
  // categoria REAL, não em "Favoritos" — perder o grupo que se olhava não
  // deveria arremessar o foco pra uma seção sem relação nenhuma com ele.
  // `locate()` (genérico, usado pela lista de canais) não serve aqui
  // porque o fallback dele é sempre o índice 0, que agora é "Favoritos".
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

  // Trilha de categorias não é virtualizada (D-004) e usa uma classe CSS
  // pra foco, não foco real de DOM — sem isto, o item focado descia pra
  // fora da área visível numa fonte com muitas categorias e ficava lá
  // (achado na TV física, feature 009, Cenário B).
  const focusedCategoryRef = useScrollFocusedIntoView<HTMLButtonElement>(categoryIdx)

  // Pré-busca a categoria em foco depois que o cursor para nela por um
  // instante (amortecido — ver `useCategoryFocusPrefetch`). Desvio
  // deliberado de FR-004, pedido pelo usuário em 23/09/2026 ao ver a
  // entrada sempre parecer "primeira vez" na TV física; registrado em
  // `plan.md` R-013. "Favoritos" nunca prefetcha — `focusedCategory` fica
  // `undefined` quando ela está em foco, e o hook já ignora `undefined`.
  useCategoryFocusPrefetch(sourceId, focusedCategory)

  /**
   * "Entrada" na categoria (ou em "Favoritos") — o que a pessoa
   * comprometeu-se a ver (coluna de canais) troca de coluna e exibe o
   * conteúdo. Quem decide se a exibição depende de categoria "entrada" ou
   * só "focada" é aqui, não o pré-fetch.
   */
  const [entered, setEntered] = useState<EnteredKey | null>(null)
  const enteredCategory = entered?.kind === 'category' ? categories.find((c) => c.id === entered.id) : undefined
  const enteredFavorites = entered?.kind === 'favorites'

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

  const items = enteredFavorites ? (favoritesContent.data?.items ?? []) : (content.data?.items ?? [])
  const contentIsLoading = enteredFavorites ? favoritesContent.isLoading : content.isLoading
  // `content.isError`/`favoritesContent.isError`: a consulta em si lançou
  // (ex.: erro de plataforma fora do controle de `categoryLoader`) — sem
  // isto, `items` cai em `[]` e a tela mostraria "grupo vazio"/"nenhum
  // favorito" escondendo uma falha de verdade.
  const contentFailed = enteredFavorites
    ? favoritesContent.isError
    : content.data?.outcome === 'failed' || content.isError
  // Feature 014, D-008: categoria `stored` sem nenhum bloco guardado — o
  // arquivo sumiu do aparelho. "Tentar de novo" não resolve isso, só
  // ressincronizar a fonte — por isso é um estado próprio, não uma variação
  // de `contentFailed`. Nunca se aplica a "Favoritos" (virtual, sem outcome).
  const contentMissing = !enteredFavorites && content.data?.outcome === 'source_missing'
  const contentUnavailable = contentFailed || contentMissing

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

  function enterCategory(category: CatalogCategory) {
    if (entered?.kind !== 'category' || entered.id !== category.id) {
      setEntered({ kind: 'category', id: category.id })
      // Trocar de categoria recomeça no primeiro canal — o item anterior de
      // OUTRA categoria/de Favoritos não é uma posição significativa.
      setFocusedIdentity({ trailKey: { kind: 'category', name: groupLabel(category.name) }, channelId: null })
    }
    setCol(1)
  }

  function enterFavorites() {
    if (entered?.kind !== 'favorites') {
      setEntered({ kind: 'favorites' })
      setFocusedIdentity({ trailKey: { kind: 'favorites' }, channelId: null })
    }
    setCol(1)
  }

  /** Entra no que está focado na trilha agora — Favoritos ou uma categoria. */
  function enterFocusedTrailItem() {
    if (isFavoritesFocused) enterFavorites()
    else if (focusedCategory) enterCategory(focusedCategory)
  }

  function retryContent() {
    if (enteredFavorites) void favoritesContent.refetch()
    else void content.refetch()
  }

  /**
   * Segurar OK favorita/desfavorita o canal focado (feature 013) — só
   * quando a coluna de conteúdo está em foco, há um canal ali e nada está
   * tocando; nos demais casos `onLongSelect` fica `undefined` e o OK volta
   * a agir no keydown, como sempre agiu (D-002 do plan.md — o modo é
   * decidido no instante do keydown, então isto nunca pode depender de um
   * cálculo feito DEPOIS).
   */
  const canToggleFavorite = col === 1 && !playing && activeChannel !== undefined

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
        ? (neighborId) => setFocusedIdentity((prev) => ({ ...prev, channelId: neighborId }))
        : undefined,
    })
  }

  // Quando a camada de reprodução está aberta, ela é dona do teclado
  // (`modal: true`), então esta tela ignora as teclas — nada de navegar a
  // lista por trás do player.
  useRemoteNav({
    onDirection: (dir) => {
      if (playing) return
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
      } else {
        const total = items.length
        if (dir === 'up' || dir === 'down') {
          const next = clamp(channelIdx + (dir === 'down' ? 1 : -1), 0, Math.max(0, total - 1))
          setFocusedIdentity((prev) => ({ ...prev, channelId: items[next]?.id ?? null }))
        }
      }
    },
    onSelect: () => {
      if (playing) return
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
      if (!activeChannel) return
      if (!activeChannel.playable) {
        // Canal existe no catálogo mas não tem fonte de reprodução: explica,
        // não tenta abrir o player (FR-012).
        showToast('Este canal não tem uma fonte de reprodução disponível.')
        return
      }
      setPlaying(activeChannel)
    },
    onLongSelect: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onFavoriteKey: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onBack: () => {
      if (playing) return
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
          {/* Todo estado precisa de saída focável, ou o controle fica preso
              (constitution, "Foco Visível e Sem Becos Sem Saída"). */}
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
            A importação pode não ter encontrado canais nesta fonte, ou ainda estar em
            andamento.
          </div>
          <button type="button" className="live-state-action tv-focus">
            Voltar
          </button>
        </div>
        <Toast message={toastMessage} />
      </div>
    )
  }

  const showingContent = col === 1
  const contentStale = !enteredFavorites && showingContent && content.data?.outcome === 'stale-served'
  /**
   * O que o provedor prometeu e o que ele de fato entregou são fatos
   * distintos (D-005) — quando os dois existem e divergem, a tela declara
   * a diferença em vez de escondê-la (FR-015). Hoje isso quase nunca
   * dispara contra um painel real (Xtream não declara contagem por
   * categoria), mas o campo existe pronto para quando algum declarar.
   * Não se aplica a "Favoritos", que não tem contagem declarada por
   * ninguém.
   */
  const declaredCount = focusedCategory?.declaredCount
  const realCount = content.data?.totalCount
  const countsDiverge =
    !enteredFavorites &&
    showingContent &&
    !content.isLoading &&
    declaredCount !== undefined &&
    realCount !== undefined &&
    declaredCount !== realCount
  const unresolvedFavorites = enteredFavorites ? (favoritesContent.data?.unresolved ?? 0) : 0

  return (
    <div className="screen screen-row">
      <div className="live-column live-column-groups">
        <div className="live-column-title">Grupos</div>
        <button
          key="favorites"
          ref={categoryIdx === 0 ? focusedCategoryRef : undefined}
          type="button"
          className={`live-item live-item-favorites${col === 0 && categoryIdx === 0 ? ' tv-focus' : ''}`}
        >
          <span aria-hidden="true">★</span>
          <span>Favoritos</span>
        </button>
        {categories.map((category, i) => (
          <button
            key={category.id}
            ref={categoryIdx === i + 1 ? focusedCategoryRef : undefined}
            type="button"
            className={`live-item${col === 0 && categoryIdx === i + 1 ? ' tv-focus' : ''}`}
          >
            {groupLabel(category.name)}
          </button>
        ))}
      </div>

      <div className="live-column live-column-channels">
        <div className="live-column-title">
          {isFavoritesFocused ? '★ Favoritos' : groupLabel(focusedCategory?.name)}
        </div>

        {!showingContent && (
          <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver os canais.</div>
        )}

        {showingContent && contentIsLoading && (
          <div className="live-state">
            <div className="live-state-copy">Carregando canais…</div>
            <button type="button" className="live-state-action tv-focus">
              Voltar
            </button>
          </div>
        )}

        {showingContent && !contentIsLoading && contentFailed && (
          <div className="live-state">
            <div className="live-state-title">Não foi possível carregar esta categoria</div>
            <button type="button" className="live-state-action tv-focus" onClick={retryContent}>
              Tentar de novo
            </button>
          </div>
        )}

        {showingContent && !contentIsLoading && contentMissing && (
          <div className="live-state">
            <div className="live-state-title">O conteúdo desta lista não está mais no aparelho</div>
            <button type="button" className="live-state-action tv-focus" onClick={onResync}>
              Ressincronizar lista
            </button>
          </div>
        )}

        {showingContent && !contentIsLoading && !contentUnavailable && enteredFavorites && items.length === 0 && (
          <FavoritesEmptyState kind="channel" focused onBack={() => setCol(0)} />
        )}

        {showingContent && !contentIsLoading && !contentUnavailable && !enteredFavorites && items.length === 0 && (
          <div className="live-state-copy">Este grupo está vazio.</div>
        )}

        {showingContent && !contentIsLoading && !contentUnavailable && contentStale && (
          <div className="live-truncated-note">
            Não foi possível atualizar agora — mostrando o que já estava salvo.
          </div>
        )}

        {countsDiverge && (
          <div className="live-truncated-note">
            O provedor declarou {declaredCount} canais nesta categoria, mas entregou {realCount}.
          </div>
        )}

        {showingContent && !contentIsLoading && !contentUnavailable && enteredFavorites && (
          <FavoritesUnresolvedNote unresolved={unresolvedFavorites} />
        )}

        {showingContent && !contentIsLoading && !contentUnavailable && items.length > 0 && (
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
                        col === 1 && channelIdx === virtualRow.index ? ' tv-focus' : ''
                      }${channel.playable ? '' : ' live-item-unavailable'}`}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <span className="live-item-logo" aria-hidden="true" />
                      <span className="live-item-name">{channel.name}</span>
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

        {showingContent && !contentIsLoading && !contentUnavailable && !enteredFavorites && content.data && (
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
        <div className="live-channel-meta">
          {isFavoritesFocused ? '★ Favoritos' : groupLabel(focusedCategory?.name)}
        </div>
        {/* Slot de EPG: nasce vazio e sem rótulo até existir fonte de dados
            (item 44 do backlog). Reservar a área evita o layout pular depois. */}
        <div className="live-channel-now" />
      </div>

      {playing && (
        <PlayerLayer
          itemId={playing.id}
          title={playing.name}
          onClose={() => setPlaying(null)}
          unavailableMessage="Este canal não tem uma fonte de reprodução disponível."
          genericErrorMessage="Não foi possível reproduzir este canal."
        />
      )}

      <Toast message={toastMessage} />
    </div>
  )
}
