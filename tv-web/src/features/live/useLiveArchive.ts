import { useMemo, useState } from 'react'
import { useEpgPrograms, type CatalogItemOut } from '../catalog/catalogApi'
import type { PlayerArchive } from '../../components/PlayerLayer'
import { nextArchiveStep } from '../../lib/epg/catchup'
import { useNow } from '../../lib/useNow'
import type { GuideProgram } from './guide/guideGrid'
import { buildGuideRows } from './guide/guideRows'
import type { EnteredKey } from './liveTrail'
import type { LiveGuideState } from './useLiveGuide'
import type { LiveZapping, LiveZappingState } from './useLiveZapping'

/**
 * Programa de arquivo em reprodução na Live (feature 058, `logic/arquivo.md`
 * §7, `data-model.md` §7). Nunca persistido, nunca em histórico (FR-019).
 * `origin` decide o RETURN: do Guia volta ao Guia no programa; de "Do início"
 * volta ao ao vivo do mesmo canal (D-012).
 */
export interface LiveArchive {
  channelId: string
  program: GuideProgram
  origin: 'guide' | 'startOver'
  /** Só com `origin: 'guide'`: a lista do Guia, para reabri-lo no mesmo lugar. */
  guideList?: EnteredKey
}

/** Estado no topo da `LiveScreen` (como `useLiveGuideState`): o Guia o liga, `useLiveArchive` o consome. */
export function useLiveArchiveState() {
  const [archive, setArchive] = useState<LiveArchive | null>(null)
  return { archive, setArchive }
}

export type LiveArchiveState = ReturnType<typeof useLiveArchiveState>

export interface LiveArchiveParams {
  sourceId: string
  archiveState: LiveArchiveState
  zap: LiveZappingState
  zapping: LiveZapping
  guide: LiveGuideState
}

/**
 * Comportamento do arquivo na Live (feature 058): o que o `PlayerLayer` recebe
 * (`archive`, `onArchiveEnded`, `onGoLive`, `startOver`) e como RETURN/CH±
 * saem dele. A programação do canal em reprodução vem do mesmo EPG guardado
 * que o Guia desenha (`buildGuideRows`), nunca de rede.
 */
export function useLiveArchive({ sourceId, archiveState, zap, zapping, guide }: LiveArchiveParams) {
  const { archive, setArchive } = archiveState
  const { playing, setPlaying } = zap
  const now = useNow()

  const epgIds = useMemo(() => (playing ? [playing.epg_channel_id] : []), [playing])
  const lookup = useEpgPrograms(sourceId, epgIds).data
  const programs: readonly GuideProgram[] = useMemo(
    () => (playing ? (buildGuideRows([playing], lookup)[0]?.programs ?? []) : []),
    [playing, lookup],
  )

  // O arquivo só vale para o canal que toca — outra troca qualquer o descarta.
  const active = archive !== null && playing !== null && archive.channelId === playing.id ? archive : null
  const playerArchive: PlayerArchive | null = active
    ? { start: active.program.start, end: active.program.end, title: active.program.title }
    : null

  /** FR-013: o seguinte, contíguo e no arquivo; o atual (ou lacuna) vai ao ao vivo. */
  function onArchiveEnded() {
    if (!active || !playing) return
    const step = nextArchiveStep(programs, active.program, playing.archive_days, Date.now())
    setArchive(step.kind === 'archive' ? { ...active, program: step.program } : null)
  }

  function onGoLive() {
    setArchive(null)
  }

  /** RETURN no player: do Guia volta ao Guia no programa; de "Do início" volta ao ao vivo; sem arquivo, o de sempre. */
  function onPlayerClose() {
    if (!active) {
      zapping.onPlayerClosed()
      return
    }
    setArchive(null)
    if (active.origin === 'startOver') return
    const channel: CatalogItemOut | null = playing
    setPlaying(null)
    guide.setGuide({ list: active.guideList ?? { kind: 'all' }, originId: channel?.id ?? null, programStart: active.program.start })
  }

  /** FR-018: CH±/↑/↓ no arquivo vão ao ao vivo do vizinho — o arquivo sai junto com a troca. */
  function onChannelStep(direction: 'previous' | 'next'): boolean {
    const moved = zapping.stepChannel(direction)
    if (moved) setArchive(null)
    return moved
  }

  /**
   * Falha no arquivo mostra a tela de erro (`PLAY-06`, com "Ao vivo"/"Voltar"):
   * o retorno automático ao último canal bom (D-008 da 027) não vale aqui.
   */
  function onSessionError() {
    if (active) {
      zap.lastGoodChannelRef.current = null
      return
    }
    zapping.onSessionError()
  }

  /** FR-015/FR-016: "Do início" só em canal com arquivo; sem programa atual no EPG fica soft disabled. */
  const current = programs.find((program) => program.start <= now && now < program.end)
  const startOver =
    playing && !active && (playing.archive_days ?? 0) > 0
      ? {
          enabled: current !== undefined,
          onSelect: () => {
            if (current) setArchive({ channelId: playing.id, program: current, origin: 'startOver' })
          },
        }
      : null

  return { playerArchive, onArchiveEnded, onGoLive, onPlayerClose, onChannelStep, onSessionError, startOver }
}
