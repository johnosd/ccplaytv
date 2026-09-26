import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  invalidateUserStates,
  stableIdOf,
  useCatalogItem,
  useSeriesEpisodes,
  useUserStates,
  type EpisodeOut,
} from '../catalog/catalogApi'
import { useRemoteNav, clamp } from '../../lib/useRemoteNav'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import { episodeBadge, groupBySeason, nextEpisode, type Season } from './episodeNavigation'
import { PlayerLayer } from '../../components/PlayerLayer'
import { NextEpisodeCountdown } from './NextEpisodeCountdown'
import { isResumable } from '../../lib/player/resumePolicy'
import { formatTime } from '../../lib/player/formatTime'

export interface SeriesDetailScreenProps {
  seriesId: string
  onBack: () => void
}

/**
 * Altura de linha de `.episode-row` — miniatura de 68px + padding (16px de
 * cada lado) do CSS (`screens.css`).
 */
const EPISODE_ROW_HEIGHT = 100
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
 * Detalhe de uma série: cabeçalho, abas de temporada e lista de episódios
 * — layout do protótipo (`docs/design/CCPlayTv Prototype - Standalone.html`,
 * tela "detalhe série"; as classes `.series-detail-*`/`.season-tab`/
 * `.episode-row` já existiam em `screens.css`, prontas e nunca consumidas).
 *
 * Foco em duas linhas (`logic/episodios-autoplay.md` §8, D-013): abas de
 * temporada (esquerda/direita, sem tocar rede) e lista de episódios
 * (cima/baixo). OK num episódio toca direto, sem menu — FR-009.
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

  const [row, setRow] = useState<'seasons' | 'episodes'>('seasons')
  const [seasonIdx, setSeasonIdx] = useState(0)
  const safeSeasonIdx = clamp(seasonIdx, 0, Math.max(0, seasons.length - 1))
  const currentSeason = seasons[safeSeasonIdx]
  const seasonEpisodes = currentSeason?.episodes ?? []

  const [focusedEpisodeId, setFocusedEpisodeId] = useState<string | null>(null)
  const episodeIdx = Math.max(
    0,
    seasonEpisodes.findIndex((episode) => episode.id === focusedEpisodeId),
  )

  const focusedSeasonRef = useScrollFocusedIntoView<HTMLButtonElement>(safeSeasonIdx)

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

  function enterSeason(index: number) {
    setSeasonIdx(index)
    setRow('episodes')
    setFocusedEpisodeId(seasons[index]?.episodes[0]?.id ?? null)
  }

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

  /** Contagem expirou sem cancelar — toca o próximo, movendo aba/foco se ele estiver noutra temporada (D-008). */
  function playNext(next: EpisodeOut) {
    const seasonIndex = locateSeason(seasons, next.id)
    setSeasonIdx(seasonIndex)
    setRow('episodes')
    setFocusedEpisodeId(next.id)
    setMode({ kind: 'playing', episode: next, startAtMs: startAtMsFor(next) })
  }

  /** Cancelar a contagem — volta à lista, foco no episódio que acabou de concluir, sem tocar nada (FR-015). */
  function cancelCountdown(finished: EpisodeOut) {
    setMode({ kind: 'browsing' })
    setFocusedEpisodeId(finished.id)
  }

  useRemoteNav({
    onDirection: (dir) => {
      if (!series || mode.kind !== 'browsing') return
      if (row === 'seasons') {
        if (dir === 'left') setSeasonIdx((i) => clamp(i - 1, 0, seasons.length - 1))
        if (dir === 'right') setSeasonIdx((i) => clamp(i + 1, 0, seasons.length - 1))
        if (dir === 'down' && seasonEpisodes.length > 0) {
          setRow('episodes')
          setFocusedEpisodeId(seasonEpisodes[0]?.id ?? null)
        }
        return
      }
      // row === 'episodes'
      if (dir === 'up') {
        if (episodeIdx === 0) {
          setRow('seasons')
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
      if (row === 'seasons') {
        if (seasonEpisodes.length > 0) enterSeason(safeSeasonIdx)
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

  return (
    <div className="screen">
      <div className="series-detail-header">
        <div className="series-detail-thumb">
          <div className="backdrop-noise" />
        </div>
        <div className="series-detail-info">
          <div className="series-detail-title">{series.name}</div>
          <p className="series-detail-synopsis">Resumo não disponível na extração M3U/Xtream nativa.</p>
          <div className="series-detail-cast">Elenco: Desconhecido</div>
        </div>
      </div>

      {outcome === 'stale-served' && (
        <div className="live-truncated-note">
          Não foi possível atualizar agora — mostrando o que já estava salvo.
        </div>
      )}

      <div className="season-tabs">
        {seasons.map((season, i) => (
          <button
            key={season.key}
            ref={i === safeSeasonIdx ? focusedSeasonRef : undefined}
            type="button"
            aria-selected={i === safeSeasonIdx}
            className={`season-tab${row === 'seasons' && i === safeSeasonIdx ? ' tv-focus' : ''}`}
          >
            {season.label}
          </button>
        ))}
      </div>

      <div ref={episodeListRef} className="episode-list">
        <div className="episode-list-inner" style={{ height: episodeVirtualizer.getTotalSize() }}>
          {episodeVirtualizer.getVirtualItems().map((virtualRow) => {
            const episode = seasonEpisodes[virtualRow.index]
            if (!episode) return null
            const badge = episodeBadge(stateFor(episode))
            return (
              <div
                key={episode.id}
                className={`episode-row${row === 'episodes' && episodeIdx === virtualRow.index ? ' tv-focus' : ''}`}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="episode-thumb" aria-hidden="true" />
                <div>
                  <div className="episode-title">{episode.name}</div>
                  {badge.resumeSeconds !== null && (
                    <div className="episode-meta">Continuar de {formatTime(badge.resumeSeconds * 1000)}</div>
                  )}
                </div>
                {badge.watched && <span className="episode-badge">✓ Assistido</span>}
              </div>
            )
          })}
        </div>
      </div>

      {mode.kind === 'playing' && (
        <PlayerLayer
          itemId={mode.episode.id}
          title={mode.episode.name}
          startAtMs={mode.startAtMs}
          onClose={() => handlePlayerClose(mode.episode)}
          onCompleted={() => handlePlayerCompleted(mode.episode)}
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
