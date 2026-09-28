import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  invalidateUserStates,
  stableIdOf,
  useCatalogItem,
  useSeriesEpisodes,
  useSeriesWatchedSummary,
  useUserState,
  useUserStates,
  type EpisodeOut,
} from '../catalog/catalogApi'
import { useRemoteNav, clamp } from '../../lib/useRemoteNav'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import { verticalScrollEdges, type ScrollEdges } from '../../lib/focus/scrollEdges'
import {
  episodeBadge,
  episodeCode,
  groupBySeason,
  nextEpisode,
  previousEpisode,
  seriesPrimaryAction,
  type Season,
  type SeriesPrimary,
} from './episodeNavigation'
import { PlayerLayer, type PlayerEpisodeStep } from '../../components/PlayerLayer'
import { NextEpisodeCountdown } from './NextEpisodeCountdown'
import { ContentCard } from '../../components/ContentCard'
import { Tabs, type TabItem } from '../../components/Tabs'
import { Modal } from '../../components/Modal'
import { isResumable } from '../../lib/player/resumePolicy'
import { formatTime } from '../../lib/player/formatTime'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { getComingSoon } from '../../lib/comingSoon'

export interface SeriesDetailScreenProps {
  seriesId: string
  onBack: () => void
}

type DetailTab = 'episodes' | 'details' | 'cast' | 'similar'
type Row = 'actions' | 'tabs' | 'season' | 'episodes'

const TABS: TabItem[] = [
  { id: 'episodes', label: 'Episódios' },
  { id: 'details', label: 'Detalhes' },
  { id: 'cast', label: 'Elenco', softDisabled: true },
  { id: 'similar', label: 'Semelhantes', softDisabled: true },
]

type SeriesAction =
  | { id: 'primary'; primary: SeriesPrimary }
  | { id: 'favorite'; isFavorite: boolean }
  | { id: 'trailer' }

/** Ações do hero, na ordem de foco (feature 025, FR-038): `[Continuar|Assistir TX:EY] [Minha Lista] [Trailer]`. */
function buildActions(primary: SeriesPrimary | null, isFavorite: boolean): SeriesAction[] {
  const actions: SeriesAction[] = []
  if (primary) actions.push({ id: 'primary', primary })
  actions.push({ id: 'favorite', isFavorite })
  actions.push({ id: 'trailer' })
  return actions
}

function actionLabel(action: SeriesAction): string {
  switch (action.id) {
    case 'primary': {
      const code = episodeCode(action.primary.episode)
      return action.primary.kind === 'resume' ? `▶ Continuar ${code}` : `▶ Assistir ${code}`
    }
    case 'favorite':
      return action.isFavorite ? '✓ Na Minha Lista' : '+ Minha Lista'
    case 'trailer':
      return '▶ Trailer'
  }
}

/**
 * Altura de linha de `.vod-episode-row` — `ContentCard` landscape (292×164,
 * feature 022) + título/meta abaixo + o respiro do layout (feature 025,
 * FR-041).
 */
const EPISODE_ROW_HEIGHT = 232
const EPISODE_OVERSCAN = 6

/**
 * A mesma identidade que `PlayerLayer`/`progressRecorder` usam pra gravar
 * (feature 012, D-006) — calculada aqui a partir dos campos que
 * `EpisodeOut` carrega, pro `stableId` bater exatamente com o que fica
 * gravado. Nunca lança: episódio sem identidade estável simplesmente não
 * oferece retomada (D-010 da 011, mesmo padrão).
 */
function episodeStableId(episode: EpisodeOut): string | null {
  return stableIdOf({
    source_id: episode.source_id,
    kind: 'episode',
    provider_stream_id: episode.provider_stream_id,
    series_id: episode.series_id,
    season_number: episode.season_number,
    episode_number: episode.episode_number,
    original_name: episode.original_name,
  })
}

/** Índice da temporada que contém o episódio, ou 0 se não achar (nunca deveria acontecer aqui). */
function locateSeason(seasons: Season[], episodeId: string): number {
  const idx = seasons.findIndex((season) => season.episodes.some((ep) => ep.id === episodeId))
  return idx === -1 ? 0 : idx
}

/**
 * Subtítulo do chrome do player (feature 027, `logic/chrome-player.md` §8):
 * `T1:E2 • Nome`, sem repetir o nome quando `episodeCode` já É o nome (M3U/
 * Modo limitado sem temporada/episódio identificável).
 */
function episodeSubtitle(episode: EpisodeOut): string {
  const code = episodeCode(episode)
  return code === episode.name ? episode.name : `${code} • ${episode.name}`
}

/**
 * Máquina do detalhe (`logic/episodios-autoplay.md` §7, D-008): `playing` e
 * `countdown` nunca coexistem — a camada do player sempre desmonta (fecha a
 * sessão) antes de a contagem montar, nunca duas sessões de reprodução ao
 * mesmo tempo (FR-013).
 */
type Mode =
  | { kind: 'browsing' }
  | { kind: 'playing'; episode: EpisodeOut; startAtMs: number | undefined }
  | { kind: 'countdown'; finished: EpisodeOut; next: EpisodeOut }

/**
 * Detalhe de série no layout V14 (feature 025, US6): hero com ação primária
 * "Continuar/Assistir TX:EY", Minha Lista, Trailer mock; abas Episódios/
 * Detalhes/Elenco/Semelhantes; seletor de temporada em modal; episódios em
 * `ContentCard` landscape com progresso real (`logic/detalhe-vod.md`). Sem
 * topbar (FR-004) — raiz `.screen`, coberta pela regra de transparência do
 * plano de hardware. Autoplay/contagem/máquina `Mode` **inalterados** desde
 * a feature 012.
 */
export function SeriesDetailScreen({ seriesId, onBack }: SeriesDetailScreenProps) {
  const queryClient = useQueryClient()
  const query = useCatalogItem(seriesId)
  const series = query.data ?? undefined

  const episodesQuery = useSeriesEpisodes(seriesId)
  const episodes = episodesQuery.data?.episodes ?? []
  const outcome = episodesQuery.data?.outcome
  const seasons = groupBySeason(episodes)

  const stableIds = episodes.map(episodeStableId)
  const userStatesQuery = useUserStates(stableIds)

  function stateFor(episode: EpisodeOut) {
    const id = episodeStableId(episode)
    if (!id) return null
    const idx = stableIds.indexOf(id)
    return idx === -1 ? null : (userStatesQuery.data?.[idx] ?? null)
  }

  const seriesStableId = series ? stableIdOf(series) : null
  const seriesUserStateQuery = useUserState(seriesStableId)
  const isFavorite = seriesUserStateQuery.data?.isFavorite ?? false
  const watchedSummaryQuery = useSeriesWatchedSummary(series?.source_id ?? null)
  const watchedSummary = series?.series_id ? watchedSummaryQuery.data?.get(series.series_id) : undefined

  const primary = seriesPrimaryAction(seasons, stateFor)
  const actions = buildActions(primary, isFavorite)
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  const [row, setRow] = useState<Row>('actions')
  const [actionFocus, setActionFocus] = useState(0)
  const safeActionFocus = clamp(actionFocus, 0, actions.length - 1)
  const [activeTab, setActiveTab] = useState<DetailTab>('episodes')
  const [focusedTabId, setFocusedTabId] = useState<string>('episodes')

  const [seasonIdx, setSeasonIdx] = useState(0)
  const safeSeasonIdx = clamp(seasonIdx, 0, Math.max(0, seasons.length - 1))
  const currentSeason = seasons[safeSeasonIdx]
  const seasonEpisodes = currentSeason?.episodes ?? []
  const [seasonModalOpen, setSeasonModalOpen] = useState(false)
  const [seasonModalFocusIdx, setSeasonModalFocusIdx] = useState(0)
  // Série com mais temporadas do que cabem no modal: o foco aqui é estado +
  // `tv-focus`, não foco de DOM, então nada rola sozinho — a lista acompanha
  // o item focado e mostra edge fade só na borda com mais conteúdo (DS V14
  // §17; bug `modal-temporada-sem-indicador-mais-itens`).
  const focusedSeasonRef = useScrollFocusedIntoView<HTMLLIElement>(seasonModalFocusIdx)
  const [seasonListEdges, setSeasonListEdges] = useState<ScrollEdges>({ start: false, end: false })
  // Na abertura, o `Modal` só renderiza os filhos no render seguinte ao da
  // montagem (ele se ativa num efeito) — um efeito deste componente chegaria
  // antes da lista existir. O callback ref roda quando a lista de fato monta:
  // traz a temporada atual à vista (pode estar abaixo da dobra) e calcula o
  // fade inicial, já que sem rolagem nenhum `scroll` dispararia.
  const seasonListRef = useCallback((list: HTMLUListElement | null) => {
    if (!list) return
    list.querySelector<HTMLElement>('.tv-focus')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    setSeasonListEdges(verticalScrollEdges(list))
  }, [])

  const [focusedEpisodeId, setFocusedEpisodeId] = useState<string | null>(null)
  const episodeIdx = Math.max(
    0,
    seasonEpisodes.findIndex((episode) => episode.id === focusedEpisodeId),
  )

  const episodeListRef = useRef<HTMLDivElement>(null)
  const episodeVirtualizer = useVirtualizer({
    count: seasonEpisodes.length,
    getScrollElement: () => episodeListRef.current,
    estimateSize: () => EPISODE_ROW_HEIGHT,
    overscan: EPISODE_OVERSCAN,
  })

  const [mode, setMode] = useState<Mode>({ kind: 'browsing' })

  const episodesNavigable = row === 'episodes' && mode.kind === 'browsing' && seasonEpisodes.length > 0
  useVirtualFocusSync({
    focusedIndex: episodeIdx,
    scrollToIndex: episodeVirtualizer.scrollToIndex,
    enabled: episodesNavigable,
  })

  /**
   * `undefined` (motor decide) e `0` não existem aqui como distinção —
   * diferente do filme (Assistir/Reiniciar), o episódio só tem um caminho
   * de entrada (FR-009): retoma se houver posição, começa do início se
   * não houver.
   */
  function startAtMsFor(episode: EpisodeOut): number | undefined {
    const state = stateFor(episode)
    return isResumable(state?.progressSeconds) ? (state?.progressSeconds as number) * 1000 : undefined
  }

  function openEpisode(episode: EpisodeOut) {
    if (mode.kind !== 'browsing') return
    setMode({ kind: 'playing', episode, startAtMs: startAtMsFor(episode) })
  }

  /** RETURN/erro do player — sempre volta à lista, nunca ao próximo (D-008). */
  function handlePlayerClose(justPlayed: EpisodeOut) {
    setMode({ kind: 'browsing' })
    setFocusedEpisodeId(justPlayed.id)
    // Sem isto, a lista continuaria com a leitura de quando montou — mesmo
    // motivo de `MovieDetailScreen` (`logic/reproducao-vod.md` §5.1,
    // portado para lote nesta feature).
    invalidateUserStates(queryClient)
  }

  /** Conclusão real (US4) — decide entre encadear o próximo e voltar à lista (FR-014/FR-016). */
  function handlePlayerCompleted(justPlayed: EpisodeOut) {
    invalidateUserStates(queryClient)
    const next = nextEpisode(seasons, justPlayed.id)
    if (!next) {
      setMode({ kind: 'browsing' })
      setFocusedEpisodeId(justPlayed.id)
      return
    }
    setMode({ kind: 'countdown', finished: justPlayed, next })
  }

  /**
   * Troca para outro episódio da série, movendo temporada/linha/foco se ele
   * estiver noutra (D-008) — caminho comum do autoplay (`playNext`) e do
   * "Episódio anterior"/"Próximo episódio" do chrome (feature 027, FR-018:
   * "abrir o outro pelo mesmo caminho do autoplay"). A troca de `itemId`
   * (novo `mode.episode.id`) já grava o progresso do atual no teardown do
   * `PlayerLayer` (`recorder.onExit('close')`) — nada extra a fazer aqui.
   */
  function switchEpisode(target: EpisodeOut) {
    const seasonIndex = locateSeason(seasons, target.id)
    setSeasonIdx(seasonIndex)
    setRow('episodes')
    setFocusedEpisodeId(target.id)
    setMode({ kind: 'playing', episode: target, startAtMs: startAtMsFor(target) })
  }

  /** Contagem expirou sem cancelar — toca o próximo (D-008). */
  function playNext(next: EpisodeOut) {
    switchEpisode(next)
  }

  /**
   * Vizinhança de episódio pro chrome do player (feature 027, D-010 do
   * plan.md): `hasPrevious`/`hasNext` vêm de `previousEpisode`/`nextEpisode`
   * sobre a lista já carregada — nunca consulta rede. Só existe enquanto
   * `mode.kind === 'playing'` (o único caminho que monta `PlayerLayer` aqui).
   */
  function episodeStepFor(current: EpisodeOut): PlayerEpisodeStep {
    return {
      hasPrevious: previousEpisode(seasons, current.id) !== null,
      hasNext: nextEpisode(seasons, current.id) !== null,
      onStep: (direction) => {
        const target = direction === 'previous' ? previousEpisode(seasons, current.id) : nextEpisode(seasons, current.id)
        if (target) switchEpisode(target)
      },
    }
  }

  /** Cancelar a contagem — volta à lista, foco no episódio que acabou de concluir, sem tocar nada (FR-015). */
  function cancelCountdown(finished: EpisodeOut) {
    setMode({ kind: 'browsing' })
    setFocusedEpisodeId(finished.id)
  }

  /** Troca a aba real (Episódios/Detalhes) ou anuncia "Em breve" pra Elenco/Semelhantes (mock). */
  function activateTab(id: string) {
    if (id === 'episodes' || id === 'details') {
      setActiveTab(id)
      return
    }
    showToast(`Em breve — ${getComingSoon(id).message}`)
  }

  function openSeasonModal() {
    setSeasonModalFocusIdx(safeSeasonIdx)
    setSeasonModalOpen(true)
  }

  /** OK no modal de temporada — troca `seasonIdx`, fecha e deixa o foco no botão (FR-040). */
  function chooseSeason(index: number) {
    setSeasonIdx(index)
    setFocusedEpisodeId(seasons[index]?.episodes[0]?.id ?? null)
    setSeasonModalOpen(false)
    setRow('season')
  }

  useRemoteNav({
    onDirection: (dir) => {
      if (!series || mode.kind !== 'browsing') return
      if (row === 'actions') {
        if (dir === 'left') setActionFocus((f) => clamp(f - 1, 0, actions.length - 1))
        if (dir === 'right') setActionFocus((f) => clamp(f + 1, 0, actions.length - 1))
        if (dir === 'down') {
          setFocusedTabId(activeTab)
          setRow('tabs')
        }
        return
      }
      if (row === 'tabs') {
        if (dir === 'left' || dir === 'right') {
          const idx = TABS.findIndex((t) => t.id === focusedTabId)
          const next = clamp(idx + (dir === 'left' ? -1 : 1), 0, TABS.length - 1)
          setFocusedTabId(TABS[next].id)
        }
        if (dir === 'up') setRow('actions')
        if (dir === 'down' && activeTab === 'episodes') setRow('season')
        return
      }
      if (row === 'season') {
        if (dir === 'up') setRow('tabs')
        if (dir === 'down' && seasonEpisodes.length > 0) {
          setRow('episodes')
          if (!seasonEpisodes.some((ep) => ep.id === focusedEpisodeId)) {
            setFocusedEpisodeId(seasonEpisodes[0]?.id ?? null)
          }
        }
        return
      }
      // row === 'episodes'
      if (dir === 'up') {
        if (episodeIdx === 0) {
          setRow('season')
          return
        }
        setFocusedEpisodeId(seasonEpisodes[episodeIdx - 1]?.id ?? null)
        return
      }
      if (dir === 'down') {
        const next = clamp(episodeIdx + 1, 0, seasonEpisodes.length - 1)
        setFocusedEpisodeId(seasonEpisodes[next]?.id ?? null)
      }
    },
    onSelect: () => {
      // Estados de carregando/erro/vazio têm uma única saída — sem isto, OK
      // do controle físico não a ativa, só o mouse (mesmo achado R-005 da
      // 011, aplicado aqui de novo).
      if (!series) {
        onBack()
        return
      }
      if (episodesQuery.isLoading) {
        onBack()
        return
      }
      if (outcome === 'failed') {
        void episodesQuery.refetch()
        return
      }
      if (episodes.length === 0) {
        onBack()
        return
      }
      if (row === 'actions') {
        const action = actions[safeActionFocus]
        if (!action) return
        if (action.id === 'trailer') {
          showToast(`Em breve — ${getComingSoon('trailer').message}`)
          return
        }
        if (action.id === 'favorite') {
          void favoriteToggle.toggle(series)
          return
        }
        openEpisode(action.primary.episode)
        return
      }
      if (row === 'tabs') {
        activateTab(focusedTabId)
        return
      }
      if (row === 'season') {
        openSeasonModal()
        return
      }
      const episode = seasonEpisodes[episodeIdx]
      if (episode) openEpisode(episode)
    },
    onBack,
  })

  if (!series) {
    return (
      <div className="screen">
        <div className="live-state">
          <div className="live-state-copy">
            {query.isLoading ? 'Carregando…' : 'Esta série não está mais no catálogo.'}
          </div>
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  if (episodesQuery.isLoading) {
    return (
      <div className="screen">
        <div className="live-state">
          <div className="live-state-copy">Carregando episódios…</div>
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  if (outcome === 'failed') {
    return (
      <div className="screen">
        <div className="live-state">
          <div className="live-state-title">Não foi possível carregar os episódios desta série</div>
          <button
            type="button"
            className="live-state-action tv-focus"
            onClick={() => void episodesQuery.refetch()}
          >
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

  if (episodes.length === 0) {
    return (
      <div className="screen">
        <div className="live-state">
          <div className="live-state-title">Episódios ainda não disponíveis</div>
          <div className="live-state-copy">
            Esta série não tem episódios para mostrar agora. Os canais e os filmes desta fonte
            continuam funcionando normalmente.
          </div>
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const metaParts: string[] = []
  if (series.year != null) metaParts.push(String(series.year))
  metaParts.push(groupLabel(series.original_group ?? undefined))
  if (watchedSummary && watchedSummary.known > 0) {
    metaParts.push(watchedSummary.upToDate ? 'Em dia' : `${watchedSummary.watched}/${watchedSummary.known}`)
  }

  return (
    // Achado real (feature 028, FR-006): rolava com a barra nativa visível.
    <div className="screen vod-detail no-scrollbar">
      <div className="vod-detail-hero">
        <div className="vod-detail-poster">
          <ContentCard variant="portrait" title={series.name} iconUrl={series.icon_url ?? undefined} />
        </div>
        <div className="vod-detail-info">
          <div className="vod-detail-eyebrow">SÉRIE</div>
          <div className="vod-detail-title">{series.name}</div>
          <div className="vod-detail-meta">{metaParts.join(' · ')}</div>
          <div className="vod-detail-actions">
            {actions.map((action, i) => (
              <div
                key={action.id}
                className={`vod-detail-action${row === 'actions' && i === safeActionFocus ? ' tv-focus' : ''}${action.id === 'trailer' ? ' is-soft-disabled' : ''}`}
              >
                {actionLabel(action)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {outcome === 'stale-served' && (
        <div className="live-truncated-note">
          Não foi possível atualizar agora — mostrando o que já estava salvo.
        </div>
      )}

      <Tabs items={TABS} activeId={activeTab} focusedId={row === 'tabs' ? focusedTabId : undefined} onSelect={activateTab} />

      <div className="vod-detail-panel">
        {activeTab === 'details' && (
          <dl className="vod-detail-facts">
            <div className="vod-detail-fact">
              <dt>Temporadas conhecidas</dt>
              <dd>{seasons.length}</dd>
            </div>
            <div className="vod-detail-fact">
              <dt>Episódios conhecidos</dt>
              <dd>{episodes.length}</dd>
            </div>
            <div className="vod-detail-fact">
              <dt>Categoria</dt>
              <dd>{groupLabel(series.original_group ?? undefined)}</dd>
            </div>
            {series.year != null && (
              <div className="vod-detail-fact">
                <dt>Ano</dt>
                <dd>{series.year}</dd>
              </div>
            )}
            {watchedSummary && watchedSummary.known > 0 && (
              <div className="vod-detail-fact">
                <dt>Progresso</dt>
                <dd>{watchedSummary.upToDate ? 'Em dia' : `${watchedSummary.watched} de ${watchedSummary.known} assistidos`}</dd>
              </div>
            )}
          </dl>
        )}

        {activeTab === 'episodes' && (
          <>
            <div className="vod-season-row">
              <div className={`vod-season-button${row === 'season' ? ' tv-focus' : ''}`}>{currentSeason?.label ?? 'Temporada'} ▾</div>
              <span className="vod-season-count">{seasonEpisodes.length} episódios</span>
            </div>

            {/* Achado real (feature 028, FR-006): rolava com a barra nativa visível. */}
            <div ref={episodeListRef} className="vod-episode-list no-scrollbar">
              <div className="vod-episode-list-inner" style={{ height: episodeVirtualizer.getTotalSize() }}>
                {episodeVirtualizer.getVirtualItems().map((virtualRow) => {
                  const episode = seasonEpisodes[virtualRow.index]
                  if (!episode) return null
                  const badge = episodeBadge(stateFor(episode))
                  const durationSeconds = episode.duration_seconds ?? null
                  const pct =
                    durationSeconds != null && badge.resumeSeconds != null
                      ? Math.min(100, (badge.resumeSeconds / durationSeconds) * 100)
                      : null
                  const metaText = [episodeCode(episode), durationSeconds != null ? formatTime(durationSeconds * 1000) : null]
                    .filter(Boolean)
                    .join(' · ')
                  const focused = row === 'episodes' && episodeIdx === virtualRow.index
                  return (
                    <div
                      key={episode.id}
                      className={`vod-episode-row${focused ? ' tv-focus' : ''}`}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <ContentCard
                        variant="landscape"
                        title={episode.name}
                        meta={metaText}
                        iconUrl={episode.icon_url ?? series.icon_url ?? undefined}
                        focused={focused}
                        badge={badge.watched && <span className="watched-badge">✓ Concluído</span>}
                      />
                      <div className="vod-episode-progress">
                        {pct != null ? (
                          <div className="vod-episode-progress-bar">
                            <div className="vod-episode-progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        ) : badge.resumeSeconds != null ? (
                          <span>Continuar de {formatTime(badge.resumeSeconds * 1000)}</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {seasonModalOpen && (
        <Modal
          ariaLabel="Selecionar temporada"
          onBack={() => setSeasonModalOpen(false)}
          onDirection={(dir) => {
            if (dir === 'up' || dir === 'down') {
              setSeasonModalFocusIdx((i) => clamp(i + (dir === 'down' ? 1 : -1), 0, seasons.length - 1))
            }
          }}
          onSelect={() => chooseSeason(seasonModalFocusIdx)}
        >
          <ul
            ref={seasonListRef}
            className={`vod-season-modal-list no-scrollbar${seasonListEdges.start ? ' vod-season-modal-list--fade-start' : ''}${seasonListEdges.end ? ' vod-season-modal-list--fade-end' : ''}`}
            onScroll={(event) => setSeasonListEdges(verticalScrollEdges(event.currentTarget))}
          >
            {seasons.map((season, index) => (
              <li
                key={season.key}
                ref={index === seasonModalFocusIdx ? focusedSeasonRef : undefined}
                className={`vod-season-modal-item${index === seasonModalFocusIdx ? ' tv-focus' : ''}`}
              >
                {index === safeSeasonIdx && <span aria-hidden="true">✓ </span>}
                {season.label}
              </li>
            ))}
          </ul>
        </Modal>
      )}

      <Toast message={toastMessage} messageKey={toastKey} />

      {mode.kind === 'playing' && (
        <PlayerLayer
          itemId={mode.episode.id}
          title={mode.episode.name}
          startAtMs={mode.startAtMs}
          onClose={() => handlePlayerClose(mode.episode)}
          onCompleted={() => handlePlayerCompleted(mode.episode)}
          identity={{ title: series.name, subtitle: episodeSubtitle(mode.episode) }}
          episodeStep={episodeStepFor(mode.episode)}
        />
      )}

      {mode.kind === 'countdown' && (
        <NextEpisodeCountdown
          title={mode.next.name}
          seasonLabel={
            mode.next.season_number !== mode.finished.season_number
              ? (seasons[locateSeason(seasons, mode.next.id)]?.label ?? undefined)
              : undefined
          }
          onExpire={() => playNext(mode.next)}
          onCancel={() => cancelCountdown(mode.finished)}
        />
      )}
    </div>
  )
}
