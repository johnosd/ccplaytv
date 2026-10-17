import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppShell } from '../../components/AppShell'
import { useAnnounce } from '../../lib/announcer'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import { useLanguage, useT } from '../../lib/i18n/I18nProvider'
import type { PlayerAdapterFactory } from '../../lib/player/PlayerService'
import { createRadioDirectory, type RadioDirectory } from '../../lib/radio/radioDirectory'
import { listRadioFavorites, toggleRadioFavorite } from '../../lib/radio/radioFavorites'
import type { RadioStation } from '../../lib/radio/radioTypes'
import { NowPlayingBar } from './NowPlayingBar'
import { radioHints, renderRadioColumns } from './radioColumns'
import { useRadioCatalog } from './useRadioCatalog'
import { useRadioKeyboard } from './useRadioKeyboard'
import { useRadioPlayback } from './useRadioPlayback'

/**
 * Tela Rádio (feature 074) — só compõe (`logic/radio-tela.md` §1): catálogo, reprodução, teclado e desenho. Sem topbar
 * própria (D-001); a barra "Tocando agora" ocupa o slot da topbar (D-006). Nunca liga o plano de vídeo (D-005).
 */
export interface RadioScreenProps {
  /** RETURN na trilha (volta ao Início). */
  onBack: () => void
  /** Costura de teste; em produção, o conector real (`createRadioDirectory()`). */
  directory?: RadioDirectory
  /** Costura de teste do motor; em produção fica `undefined` e o `PlayerService` escolhe AVPlay ou `<video>`. */
  createAdapter?: PlayerAdapterFactory
}

let sharedDirectory: RadioDirectory | null = null

/** Um conector por app: o espelho descoberto vale para a sessão inteira (`logic/diretorio.md` §2). */
function defaultDirectory(): RadioDirectory {
  sharedDirectory ??= createRadioDirectory()
  return sharedDirectory
}

export function RadioScreen({ onBack, directory: injected, createAdapter }: RadioScreenProps): ReactNode {
  const t = useT()
  const language = useLanguage()
  const announce = useAnnounce()
  const directory = useMemo(() => injected ?? defaultDirectory(), [injected])
  const catalog = useRadioCatalog(directory, language, t)
  const playback = useRadioPlayback(directory, createAdapter)
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(new Set())
  const trailRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { reloadFavorites } = catalog

  useEffect(() => {
    let alive = true
    void listRadioFavorites().then((items) => {
      if (alive) setFavoriteIds(new Set(items.map((item) => item.id)))
    })
    return () => {
      alive = false
    }
  }, [])

  const onToggleFavorite = useCallback(
    (station: RadioStation) => {
      void toggleRadioFavorite(station).then((nowFavorite) => {
        setFavoriteIds((current) => {
          const next = new Set(current)
          if (nowFavorite) next.add(station.id)
          else next.delete(station.id)
          return next
        })
        announce(t(nowFavorite ? 'radio.announce.favoriteAdded' : 'radio.announce.favoriteRemoved', { name: station.name }))
        void reloadFavorites()
      })
    },
    [announce, reloadFavorites, t],
  )

  const focus = useRadioKeyboard({ catalog, playback, onBack, onToggleFavorite, trailRef, listRef })
  const trailFocusRef = useScrollFocusedIntoView<HTMLButtonElement>(`${focus.zone}|${focus.trailFocusId}`)
  const listFocusRef = useScrollFocusedIntoView<HTMLDivElement>(`${focus.zone}|${focus.listIndex}|${catalog.entered}`)

  // Cada mudança de estado da reprodução é anunciada; o foco nunca é puxado para a barra (§5.3).
  const { state } = playback
  useEffect(() => {
    if (state.status === 'playing') announce(t('radio.announce.playing', { name: state.station.name }))
    else if (state.status === 'failed') announce(t('radio.announce.failed', { name: state.station.name }))
  }, [announce, state, t])

  return (
    <div className="screen radio-screen">
      <AppShell
        hints={radioHints(t, focus.zone)}
        topBar={
          <NowPlayingBar
            state={state}
            focusedAction={focus.barAction}
            nextAvailable={focus.nextAvailable}
            onAction={focus.runBarAction}
          />
        }
      >
        {renderRadioColumns({ catalog, focus, playback: state, favoriteIds, language, t, trailFocusRef, listFocusRef, trailRef, listRef })}
      </AppShell>
      {/* Só o adaptador `<video>` de desenvolvimento monta aqui; o AVPlay não usa o DOM. */}
      <div id="player-surface" className="radio-player-surface" hidden />
    </div>
  )
}
