import { useCallback, useEffect, useRef, useState } from 'react'
import { createPlayerSession, FULLSCREEN_REGION, type PlayerAdapterFactory, type PlayerServiceSession } from '../../lib/player/PlayerService'
import { RadioDirectoryError, type RadioDirectory } from '../../lib/radio/radioDirectory'
import { listRadioFavorites, refreshRadioFavorite } from '../../lib/radio/radioFavorites'
import type { RadioStation } from '../../lib/radio/radioTypes'

/**
 * Reprodução da Rádio (feature 074, `logic/radio-tela.md` §5). Sessão do `PlayerService` criada aqui, sem `PlayerLayer`
 * (D-005): nunca liga o plano de vídeo nem mexe na proteção de tela (FR-018). `kind: 'channel'` = sem pausa nem busca
 * (FR-016). Cada `play`/`stop` troca o token: callback de sessão antiga nunca muda o estado.
 */

export const CONNECT_TIMEOUT_MS = 15_000

export type RadioPlaybackFailure = 'unavailable' | 'offline'

export type RadioPlaybackState =
  | { status: 'idle' }
  | { status: 'connecting' | 'playing'; station: RadioStation }
  | { status: 'failed'; station: RadioStation; reason: RadioPlaybackFailure }

export interface PlayOptions {
  /** Tocada a partir de `★ Favoritos`: resolve a versão atual pelo `uuid` (FR-023, contrato 4). */
  fromFavorites?: boolean
}

function offlineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function useRadioPlayback(directory: RadioDirectory, createAdapter?: PlayerAdapterFactory) {
  const [state, setState] = useState<RadioPlaybackState>({ status: 'idle' })
  const token = useRef(0)
  const session = useRef<PlayerServiceSession | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abort = useRef<AbortController | null>(null)

  const release = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    abort.current?.abort()
    abort.current = null
    unsubscribe.current?.()
    unsubscribe.current = null
    session.current?.close()
    session.current = null
  }, [])

  const stop = useCallback(() => {
    token.current += 1
    release()
    setState({ status: 'idle' })
  }, [release])

  const play = useCallback(
    (station: RadioStation, options: PlayOptions = {}) => {
      token.current += 1
      const mine = token.current
      release()
      setState({ status: 'connecting', station })
      const current = () => token.current === mine
      const fail = (reason: RadioPlaybackFailure) => {
        if (!current()) return
        release()
        setState({ status: 'failed', station, reason })
      }

      const start = (url: string) => {
        if (!current()) return
        const opened = createPlayerSession(url, FULLSCREEN_REGION, 'channel', { createAdapter })
        session.current = opened
        let reported = false
        const onChange = () => {
          if (!current()) return
          if (opened.state === 'playing' && !reported) {
            reported = true
            if (timer.current !== null) clearTimeout(timer.current)
            timer.current = null
            setState({ status: 'playing', station })
            directory.reportClick(station.uuid)
          } else if (opened.state === 'error') {
            fail(offlineNow() ? 'offline' : 'unavailable')
          }
        }
        unsubscribe.current = opened.subscribe(onChange)
        timer.current = setTimeout(() => fail('unavailable'), CONNECT_TIMEOUT_MS)
        onChange()
      }

      if (!options.fromFavorites) {
        start(station.streamUrl)
        return
      }
      const controller = new AbortController()
      abort.current = controller
      void (async () => {
        try {
          const [latest] = await directory.stationsByUuid([station.uuid], controller.signal)
          if (!current()) return
          if (!latest) {
            fail('unavailable')
            return
          }
          void refreshRadioFavorite(latest)
          start(latest.streamUrl)
        } catch (error) {
          if (!current()) return
          const aborted = !(error instanceof RadioDirectoryError) && error instanceof Error && error.name === 'AbortError'
          if (aborted) return
          // Diretório fora: a última URL conhecida do favorito ainda pode tocar (logic §5.2).
          const fallback = (await listRadioFavorites()).find((item) => item.id === station.id)?.lastStreamUrl
          if (fallback) start(fallback)
          else fail('offline')
        }
      })()
    },
    [createAdapter, directory, release],
  )

  // Sair da tela para a rádio (FR-015).
  useEffect(
    () => () => {
      token.current += 1
      release()
    },
    [release],
  )

  return { state, play, stop }
}

export type RadioPlayback = ReturnType<typeof useRadioPlayback>
