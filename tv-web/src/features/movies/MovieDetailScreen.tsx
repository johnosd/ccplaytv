import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCatalogItem,
  useTitleMetadata,
  useSimilarTitles,
  useTmdbStatus,
  useUserState,
  invalidateUserState,
  useToggleWatched,
  useRemoveFromHistory,
  groupLabel,
} from '../catalog/catalogApi'
import { isInHistory, type HistoryRemovalMode } from '../../lib/catalog/historyRemoval'
import { HistoryRemovalModal } from '../history/HistoryRemovalModal'
import {
  CastPanel,
  CastPeoplePanel,
  DetailBackdrop,
  MetadataFacts,
  SynopsisBlock,
  SynopsisModal,
  personFocusKey,
} from '../vod/DetailMetadata'
import { isSynopsisTruncated, metadataFactRows } from '../vod/detailMetadataFormat'
import { useRemoteNav, clamp } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { PlayerLayer } from '../../components/PlayerLayer'
import { TrailerLayer } from '../../components/TrailerLayer'
import { PosterArt } from '../../components/PosterArt'
import { Tabs, type TabItem } from '../../components/Tabs'
import { buildStableId } from '../../lib/catalog/userStateRepository'
import { isResumable } from '../../lib/player/resumePolicy'
import { formatTime } from '../../lib/player/formatTime'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import type { DetailSnapshot, OpenPersonTarget, OpenTitleTarget } from '../vod/detailSnapshot'
import { SimilarPanel } from '../vod/SimilarPanel'
import { useEnterSimilarPanel } from '../vod/useEnterSimilarPanel'
import { TitleSummaryModal } from '../vod/TitleSummaryModal'
import type { ResolvedTitle } from '../../lib/metadata/types'
import {
  trailerActionLabel,
  trailerActionSoftDisabled,
  trailerActionState,
  trailerActionToast,
} from '../vod/trailerAction'

export interface MovieDetailScreenProps {
  movieId: string
  onBack: () => void
  /** Feature 035: volta de Semelhantes/Elenco/Configurações com a aba e o item focado (por identidade). */
  restore?: DetailSnapshot
  /** Feature 035: OK num cartão "encontrado" de Semelhantes. `from` = onde o foco estava. */
  onOpenTitle?: (target: OpenTitleTarget, from: DetailSnapshot) => void
  /** Feature 035: OK numa pessoa do elenco com identidade TMDB. */
  onOpenPerson?: (person: OpenPersonTarget, from: DetailSnapshot) => void
  /** Feature 035: "Configurar TMDB" da aba Semelhantes sem chave — abre Configurações › Integrações & BYOK. */
  onOpenTmdbSettings?: (from: DetailSnapshot) => void
  /** Feature 042: "Editar lista" do erro de fonte no player (credencial recusada/conta expirada). */
  onEditSource?: (sourceId: string) => void
}

type MovieAction =
  | { id: 'watch' }
  | { id: 'resume'; progressSeconds: number }
  | { id: 'restart' }
  | { id: 'favorite'; isFavorite: boolean }
  | { id: 'trailer' }
  | { id: 'similar' }
  | { id: 'toggle-watched'; watched: boolean }
  | { id: 'remove-history' }

type DetailTab = 'details' | 'cast' | 'similar'

const TABS: TabItem[] = [
  { id: 'details', label: 'Detalhes' },
  { id: 'cast', label: 'Elenco' },
  { id: 'similar', label: 'Semelhantes' },
]

const CONFIGURE_KEY = 'configure'

/**
 * As ações do detalhe, na ordem de foco (feature 025, `logic/detalhe-vod.md`
 * §3, FR-033): `[Continuar|Assistir] [Reiniciar?] [Minha Lista] [Trailer]
 * [Semelhantes] [Marcar assistido]`. A ação PRIMÁRIA é sempre o índice 0 — diferente da
 * versão anterior à 025, que usava o índice 1 porque "Trailer" vinha
 * primeiro; "Trailer" virou soft-disabled e saiu do topo. "Remover do
 * histórico" (feature 036, FR-004/FR-005) só existe com o filme no
 * "↺ Histórico" e vem sempre por último — nunca desloca o índice 0.
 */
function buildActions(
  progressSeconds: number | undefined,
  watched: boolean,
  isFavorite: boolean,
  inHistory: boolean,
): MovieAction[] {
  const primary: MovieAction[] = isResumable(progressSeconds)
    ? [{ id: 'resume', progressSeconds: progressSeconds as number }, { id: 'restart' }]
    : [{ id: 'watch' }]
  return [
    ...primary,
    { id: 'favorite', isFavorite },
    { id: 'trailer' },
    { id: 'similar' },
    { id: 'toggle-watched', watched },
    ...(inHistory ? [{ id: 'remove-history' } as const] : []),
  ]
}

function actionLabel(action: MovieAction): string {
  switch (action.id) {
    case 'watch':
      return '▶ Assistir'
    case 'resume':
      return `▶ Continuar de ${formatTime(action.progressSeconds * 1000)}`
    case 'restart':
      return '↺ Reiniciar'
    case 'favorite':
      return action.isFavorite ? '✓ Na Minha Lista' : '+ Minha Lista'
    case 'trailer':
      return '▶ Trailer'
    case 'similar':
      return '☰ Semelhantes'
    case 'toggle-watched':
      return action.watched ? '✗ Desmarcar assistido' : '✓ Marcar como assistido'
    case 'remove-history':
      return 'Remover do histórico'
  }
}

/**
 * "23/09/2024" — nunca hora, só a data (§4 do `logic/detalhe-vod.md`).
 *
 * `timeZone: 'UTC'` é deliberado (bug pré-existente achado durante a feature
 * 026, corrigido como desvio pequeno aprovado): `added_at` é uma DATA
 * declarada pela fonte, sem componente de hora — formatá-la no fuso local
 * fazia a exibição recuar um dia inteiro em qualquer fuso atrás de UTC
 * (ex.: America/Sao_Paulo, UTC-3).
 */
function formatShortDate(epochMs: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(epochMs))
}

interface MovieIdentity {
  stableId: string
  sourceId: string
}

/**
 * A mesma identidade que `PlayerLayer`/`progressRecorder` usam pra gravar —
 * calculada aqui a partir dos mesmos três campos (`source_id`,
 * `provider_stream_id`, `original_name`), pro `stableId` bater exatamente
 * com o que fica gravado no `userStateRepository`. Nunca lança até a tela:
 * item sem identidade estável simplesmente não oferece retomada (D-010).
 */
function computeIdentity(movie: {
  source_id?: string
  provider_stream_id?: string | null
  original_name?: string
}): MovieIdentity {
  const stableId = buildStableId({
    sourceId: movie.source_id ?? '',
    kind: 'movie',
    providerStreamId: movie.provider_stream_id ?? undefined,
    originalName: movie.original_name ?? '',
  })
  return { stableId, sourceId: movie.source_id ?? '' }
}

/**
 * Detalhe de filme no layout V14 (feature 025, US5): hero com capa real,
 * meta só com o que a fonte declarou, ações em pill e abas
 * Detalhes/Elenco/Semelhantes (`logic/detalhe-vod.md`). Sem topbar
 * (FR-004) — raiz `.screen`, coberta pela regra de transparência do plano
 * de hardware.
 */
export function MovieDetailScreen({
  movieId,
  onBack,
  restore,
  onOpenTitle,
  onOpenPerson,
  onOpenTmdbSettings,
  onEditSource,
}: MovieDetailScreenProps) {
  const queryClient = useQueryClient()
  // Pelo id, direto na chave primária. Carregar a lista de filmes inteira só
  // para procurar um item dentro dela custava o catálogo todo — e deixava de
  // encontrar qualquer filme além do teto de leitura da listagem.
  const query = useCatalogItem(movieId)
  const movie = query.data ?? undefined

  let identity: MovieIdentity | null = null
  if (movie) {
    try {
      identity = computeIdentity(movie)
    } catch {
      identity = null // D-010/R-010: sem identificador nem nome — sem retomada, mas sem quebrar a tela
    }
  }

  const userStateQuery = useUserState(identity?.stableId ?? null)
  const watched = userStateQuery.data?.completedAt != null
  const isFavorite = userStateQuery.data?.isFavorite ?? false
  const actions = buildActions(
    userStateQuery.data?.progressSeconds ?? undefined,
    watched,
    isFavorite,
    isInHistory(userStateQuery.data),
  )
  const toggleWatched = useToggleWatched()
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // "Remover do histórico" (feature 036, §9): o `Modal` intercepta o teclado
  // enquanto aberto, então o `onSelect` desta tela não reabre nada (T020).
  const removeFromHistory = useRemoveFromHistory()
  const [removal, setRemoval] = useState<{ error: boolean } | null>(null)

  function confirmHistoryRemoval(mode: HistoryRemovalMode) {
    if (!identity || removeFromHistory.isPending) return
    removeFromHistory.mutate(
      { target: { kind: 'movie', ...identity }, mode },
      {
        onSuccess: () => {
          // A ação some na releitura; `safeActionFocus` cai na anterior.
          setRemoval(null)
          showToast('Removido do histórico')
        },
        onError: () => setRemoval({ error: true }),
      },
    )
  }

  // Metadata descritiva (feature 032): nunca bloqueia a tela nem a ação
  // primária (FR-005) — sem `data`, tudo abaixo simplesmente não aparece.
  const metadataQuery = useTitleMetadata(movie ? movieId : null)
  const metadata = metadataQuery.data
  const synopsis = metadata?.synopsis
  const hasMore = synopsis !== undefined && isSynopsisTruncated(synopsis.value)

  // Trailer (feature 033): os candidatos vêm da MESMA consulta da metadata —
  // nada é buscado ao focar o botão (FR-002). `useTmdbStatus` só lê o IndexedDB.
  const tmdbStatusQuery = useTmdbStatus()
  const trailerState = trailerActionState({
    metadata,
    checking: metadataQuery.isFetching || metadataQuery.data === undefined,
    tmdbState: tmdbStatusQuery.data?.state,
  })
  const [trailerOpen, setTrailerOpen] = useState(false)

  // Voltando de Semelhantes/Configurações (feature 035): aba e item por identidade.
  const restoredTab: DetailTab = restore?.tab === 'cast' || restore?.tab === 'similar' ? restore.tab : 'details'

  // `more` = o botão "Ver mais" da sinopse, uma linha acima das ações;
  // `panel` = o conteúdo focável da aba ativa (feature 035).
  const [rawRow, setRow] = useState<'more' | 'actions' | 'tabs' | 'panel'>(
    restore?.focusKey !== undefined ? 'panel' : restore !== undefined ? 'tabs' : 'actions',
  )
  const [panelFocusKey, setPanelFocusKey] = useState<string | undefined>(restore?.focusKey)
  const [summaryTitle, setSummaryTitle] = useState<ResolvedTitle | null>(null)
  const [synopsisOpen, setSynopsisOpen] = useState(false)
  const [actionFocus, setActionFocus] = useState(0) // ação primária — sempre índice 0
  const safeActionFocus = clamp(actionFocus, 0, actions.length - 1)
  const [activeTab, setActiveTab] = useState<DetailTab>(restoredTab)
  const [focusedTabId, setFocusedTabId] = useState<string>(restoredTab)

  // Semelhantes: só resolve com a aba ativa; nenhuma requisição externa nasce aqui (FR-003/SC-005).
  const similar = useSimilarTitles(movieId, activeTab === 'similar')
  const castPeople = metadata?.castPeople ?? []
  const panelKeys: string[] =
    activeTab === 'cast'
      ? castPeople.map((person) => personFocusKey(person.personId))
      : activeTab !== 'similar'
        ? []
        : similar.status === 'ready'
          ? similar.titles.map((title) => title.key)
          : similar.status === 'no_key'
            ? [CONFIGURE_KEY]
            : []

  // Ação "Semelhantes" do hero: ativa a aba, rola até o painel e foca o 1º cartão.
  const enterSimilar = useEnterSimilarPanel({
    keys: panelKeys,
    enter: (firstKey) => {
      setPanelFocusKey(firstKey)
      setRow('panel')
    },
  })

  // A sinopse pode chegar (ou sumir) depois de o foco já estar aqui: sem o
  // botão, a linha `more` não existe e o foco cai nas ações — nunca em nada.
  // Da mesma forma, a chave do painel pode deixar de existir (a lista mudou):
  // o foco cai na aba ativa, nunca num item invisível (D-008).
  const row =
    rawRow === 'more' && !hasMore
      ? 'actions'
      : rawRow === 'panel' && (panelFocusKey === undefined || !panelKeys.includes(panelFocusKey))
        ? 'tabs'
        : rawRow
  const effectiveTabId = rawRow === 'panel' && row === 'tabs' ? activeTab : focusedTabId

  function snapshot(focusKey?: string): DetailSnapshot {
    return focusKey === undefined ? { tab: activeTab } : { tab: activeTab, focusKey }
  }

  function selectPanelKey(key: string) {
    if (key === CONFIGURE_KEY) {
      onOpenTmdbSettings?.({ tab: 'similar' })
      return
    }
    if (activeTab === 'cast') {
      const person = castPeople.find((candidate) => personFocusKey(candidate.personId) === key)
      if (person) onOpenPerson?.({ personId: person.personId, name: person.name }, snapshot(key))
      return
    }
    const title = similar.titles.find((candidate) => candidate.key === key)
    if (!title) return
    if (title.localItemId !== undefined) {
      onOpenTitle?.({ kind: title.kind, itemId: title.localItemId }, snapshot(key))
    } else {
      setSummaryTitle(title)
    }
  }

  // Guarda de sessão única (FR-010): `{playing && <PlayerLayer/>}` já impede
  // duas camadas montadas ao mesmo tempo, e o `if (playing) return` abaixo
  // cobre o instante entre um SELECT repetido e o re-render que monta a
  // camada (mesmo padrão de `LiveScreen.tsx`).
  const [playing, setPlaying] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | undefined>(undefined)

  function openPlayer(action: MovieAction) {
    if (playing) return
    // `undefined` (motor decide) e `0` (força o início) não são a mesma
    // coisa — "Reiniciar" precisa do zero explícito (`logic/
    // reproducao-vod.md` §5).
    if (action.id === 'resume') setStartAtMs(action.progressSeconds * 1000)
    else if (action.id === 'restart') setStartAtMs(0)
    else setStartAtMs(undefined)
    setPlaying(true)
  }

  function activateTab(id: string) {
    if (id === 'details' || id === 'cast' || id === 'similar') setActiveTab(id)
  }

  useRemoteNav({
    onDirection: (dir) => {
      if (!movie) return
      enterSimilar.cancel()
      if (row === 'more') {
        if (dir === 'down') setRow('actions')
        return
      }
      if (row === 'actions') {
        if (dir === 'left') setActionFocus((f) => clamp(f - 1, 0, actions.length - 1))
        if (dir === 'right') setActionFocus((f) => clamp(f + 1, 0, actions.length - 1))
        if (dir === 'up' && hasMore) setRow('more')
        if (dir === 'down') {
          setFocusedTabId(activeTab)
          setRow('tabs')
        }
        return
      }
      if (row === 'panel') {
        const index = panelKeys.indexOf(panelFocusKey as string)
        if (dir === 'left' || dir === 'right') {
          const next = clamp(index + (dir === 'left' ? -1 : 1), 0, panelKeys.length - 1)
          setPanelFocusKey(panelKeys[next])
        }
        if (dir === 'up') {
          setFocusedTabId(activeTab)
          setRow('tabs')
        }
        return
      }
      // row === 'tabs'
      if (dir === 'left' || dir === 'right') {
        const idx = TABS.findIndex((t) => t.id === effectiveTabId)
        const next = clamp(idx + (dir === 'left' ? -1 : 1), 0, TABS.length - 1)
        setFocusedTabId(TABS[next].id)
        setRow('tabs')
      }
      if (dir === 'up') setRow('actions')
      // ↓ só entra no painel se a aba focada é a ativa e o painel tem focáveis; senão o foco fica na aba.
      if (dir === 'down' && effectiveTabId === activeTab && panelKeys.length > 0) {
        setPanelFocusKey((current) => (current !== undefined && panelKeys.includes(current) ? current : panelKeys[0]))
        setRow('panel')
      }
    },
    onSelect: () => {
      // Estado de carregando/erro tem uma única saída ("Voltar") — sem isto,
      // OK do controle físico não a ativa, só o mouse (achado R-005, feature
      // 010; corrigido aqui localmente, sem tocar `useRemoteNav` global).
      if (!movie) {
        onBack()
        return
      }
      if (row === 'more') {
        setSynopsisOpen(true)
        return
      }
      if (row === 'tabs') {
        activateTab(effectiveTabId)
        return
      }
      if (row === 'panel') {
        if (panelFocusKey !== undefined) selectPanelKey(panelFocusKey)
        return
      }
      const action = actions[safeActionFocus]
      if (!action) return
      if (action.id === 'trailer') {
        const toast = trailerActionToast(trailerState)
        if (toast !== null) showToast(toast)
        // `playing` cobre o instante entre um OK repetido e a camada do player montar (FR-012).
        else if (!playing) setTrailerOpen(true)
        return
      }
      if (action.id === 'favorite') {
        void favoriteToggle.toggle(movie)
        return
      }
      if (action.id === 'similar') {
        setActiveTab('similar')
        setFocusedTabId('similar')
        setRow('tabs')
        enterSimilar.request()
        return
      }
      if (action.id === 'toggle-watched') {
        if (identity) toggleWatched.mutate({ ...identity, watched: !action.watched })
        return
      }
      if (action.id === 'remove-history') {
        if (identity) setRemoval({ error: false })
        return
      }
      openPlayer(action)
    },
    onBack,
  })

  if (!movie) {
    // Carregando e "não existe mais" precisam dos dois de uma saída focável.
    return (
      <div className="screen">
        <div className="live-state">
          <div className="live-state-copy">
            {query.isLoading ? 'Carregando…' : 'Este filme não está mais no catálogo.'}
          </div>
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const metaParts: string[] = []
  if (movie.year != null) metaParts.push(String(movie.year))
  metaParts.push(groupLabel(movie.original_group ?? undefined))
  if (watched) metaParts.push('✓ Assistido')

  return (
    // Achado real (feature 028, FR-006): rolava com a barra nativa visível.
    <div className="screen vod-detail no-scrollbar">
      <div className="vod-detail-hero">
        <DetailBackdrop url={metadata?.backdropUrl?.value} origin={metadata?.backdropUrl?.origin} />
        <div className="vod-detail-poster">
          <PosterArt url={movie.icon_url ?? undefined} title={movie.name} />
        </div>
        <div className="vod-detail-info">
          <div className="vod-detail-eyebrow">FILME</div>
          <div className="vod-detail-title">{movie.name}</div>
          <div className="vod-detail-meta">{metaParts.join(' · ')}</div>
          <SynopsisBlock synopsis={synopsis} moreFocused={row === 'more'} onMore={() => setSynopsisOpen(true)} />
          <div className="vod-detail-actions">
            {actions.map((action, i) => {
              const softDisabled = action.id === 'trailer' && trailerActionSoftDisabled(trailerState)
              return (
                <div
                  key={action.id}
                  className={`vod-detail-action${row === 'actions' && i === safeActionFocus && !removal ? ' tv-focus' : ''}${softDisabled ? ' is-soft-disabled' : ''}`}
                  aria-disabled={softDisabled ? 'true' : undefined}
                >
                  {action.id === 'trailer' ? trailerActionLabel(trailerState) : actionLabel(action)}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <Tabs items={TABS} activeId={activeTab} focusedId={row === 'tabs' ? effectiveTabId : undefined} onSelect={activateTab} />

      <div className="vod-detail-panel" ref={enterSimilar.panelRef}>
        {activeTab === 'details' && (
          <dl className="vod-detail-facts">
            <div className="vod-detail-fact">
              <dt>Tipo</dt>
              <dd>Filme</dd>
            </div>
            <div className="vod-detail-fact">
              <dt>Categoria</dt>
              <dd>{groupLabel(movie.original_group ?? undefined)}</dd>
            </div>
            {movie.year != null && (
              <div className="vod-detail-fact">
                <dt>Ano</dt>
                <dd>{movie.year}</dd>
              </div>
            )}
            {movie.added_at != null && (
              <div className="vod-detail-fact">
                <dt>Adicionado em</dt>
                <dd>{formatShortDate(movie.added_at)}</dd>
              </div>
            )}
            <MetadataFacts rows={metadataFactRows(metadata, false)} />
            <div className="vod-detail-fact">
              <dt>Disponível</dt>
              <dd>{movie.playable ? 'Sim' : 'Não'}</dd>
            </div>
          </dl>
        )}

        {activeTab === 'cast' &&
          (castPeople.length > 0 ? (
            <CastPeoplePanel
              people={castPeople}
              focusedKey={row === 'panel' ? panelFocusKey : undefined}
              onSelectPerson={(person) => selectPanelKey(personFocusKey(person.personId))}
            />
          ) : (
            <CastPanel cast={metadata?.cast} loading={metadataQuery.isLoading === true} />
          ))}

        {activeTab === 'similar' && (
          <SimilarPanel
            status={similar.status}
            titles={similar.titles}
            coverage={similar.coverage}
            kind="movie"
            focusedKey={row === 'panel' ? panelFocusKey : undefined}
            configureFocused={row === 'panel' && panelFocusKey === CONFIGURE_KEY}
            onSelectTitle={(title) => selectPanelKey(title.key)}
            onConfigure={() => selectPanelKey(CONFIGURE_KEY)}
          />
        )}
      </div>

      <Toast message={toastMessage} messageKey={toastKey} />
      {synopsisOpen && synopsis && <SynopsisModal text={synopsis.value} onClose={() => setSynopsisOpen(false)} />}
      {summaryTitle && <TitleSummaryModal title={summaryTitle} onClose={() => setSummaryTitle(null)} />}
      {removal && (
        <HistoryRemovalModal
          subject={{ kind: 'item', name: movie.name }}
          hasProgress={(userStateQuery.data?.progressSeconds ?? 0) > 0}
          error={removal.error}
          onCancel={() => setRemoval(null)}
          onConfirm={confirmHistoryRemoval}
        />
      )}
      {/* Fechar o trailer não invalida nada: ver trailer não muda estado do usuário (FR-016). */}
      {trailerOpen && trailerState.status === 'available' && (
        <TrailerLayer title={movie.name} candidates={trailerState.candidates} onClose={() => setTrailerOpen(false)} />
      )}
      {playing && (
        <PlayerLayer
          itemId={movieId}
          title={movie.name}
          startAtMs={startAtMs}
          identity={{ title: movie.name }}
          onEditSource={onEditSource}
          onClose={() => {
            setPlaying(false)
            // Sem isto, o detalhe continuaria com a leitura de quando montou
            // — um filme assistido por 20 min voltaria anunciando "Assistir"
            // (`logic/reproducao-vod.md` §5.1). A invalidação fica aqui, que
            // detém a consulta e o estado `playing`; a camada não conhece
            // chaves de consulta do catálogo.
            if (identity) invalidateUserState(queryClient, identity.stableId)
          }}
        />
      )}
    </div>
  )
}
