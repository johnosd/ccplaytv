import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { ErrorState } from './ErrorState'
import { Spinner } from './Spinner'
import { useAnnounce } from '../lib/announcer'
import { useRemoteNav, type RemoteDirection } from '../lib/useRemoteNav'
import type { MediaKey } from '../lib/tizenMediaKeys'
import {
  parseBridgeMessage,
  trailerBridgeSrc,
  TRAILER_BRIDGE_ORIGIN,
  type AppToBridge,
} from '../lib/trailer/bridgeConfig'
import type { TrailerCandidate } from '../lib/trailer/trailerCandidates'
import {
  reduceTrailerSession,
  startTrailerSession,
  trailerErrorMessage,
  type TrailerSessionEvent,
  type TrailerSessionState,
} from '../lib/trailer/trailerSession'

/**
 * Camada de tela cheia que toca um trailer pelo player oficial do YouTube,
 * carregado através da página-ponte (feature 033, ADR-012,
 * `logic/sessao-de-trailer.md` e `logic/pagina-ponte.md`). Dona do teclado
 * enquanto aberta (`useRemoteNav` modal); nunca conhece o catálogo nem o
 * estado do usuário (D-009).
 */
export interface TrailerLayerProps {
  /** Só para a tela (título/anúncio) — NUNCA vai para a página-ponte (FR-010). */
  title: string
  /** Já na ordem de preferência; só os dois primeiros são usados (FR-017). */
  candidates: readonly TrailerCandidate[]
  /** Chamado uma vez ao fechar (RETURN, fim, "Voltar", app oculto). */
  onClose: () => void
}

/** Salto das setas (FR-013). */
const SEEK_STEP_SECONDS = 10
/** Um `seek-by` pendente sem `seeked` da ponte é liberado depois disto (single-flight, §7). */
const SEEK_RELEASE_MS = 1000
/** A faixa some depois disto sem tecla tratada, tocando (§6). */
const BAR_HIDE_MS = 4000
/** Só o preferido e um reserva (FR-017). */
const MAX_USED_CANDIDATES = 2

type ErrorAction = 'retry' | 'back'

export function TrailerLayer({ title, candidates, onClose }: TrailerLayerProps): ReactElement {
  const announce = useAnnounce()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const onCloseRef = useRef(onClose)
  const closedRef = useRef(false)

  // Estado da sessão em ref + render forçado: uma tecla que chega entre a
  // mudança de fase e o próximo commit não pode ler o estado velho (R-004,
  // mesma lição do PlayerLayer da feature 027).
  const [state, setState] = useState<TrailerSessionState>(() =>
    startTrailerSession({
      candidateCount: Math.min(candidates.length, MAX_USED_CANDIDATES),
      now: Date.now(),
      online: navigator.onLine,
    }),
  )
  const stateRef = useRef(state)
  const [attempt, setAttempt] = useState(0)
  // Qual iframe já respondeu "ready": com o player vivo, o que falta é o YouTube (anúncios),
  // e a tela deve deixar o vídeo à vista em vez de escondê-lo atrás de um "Carregando".
  const [aliveKey, setAliveKey] = useState<string | null>(null)
  const frameKeyRef = useRef('')
  const [errorFocus, setErrorFocus] = useState(0)
  const errorFocusRef = useRef(0)
  const [barVisible, setBarVisible] = useState(true)
  const seekPendingRef = useRef(false)
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  function dispatch(event: TrailerSessionEvent) {
    const next = reduceTrailerSession(stateRef.current, event)
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
  }

  function send(message: { type: 'toggle' | 'stop' } | { type: 'seek-by'; seconds: number }) {
    // Nunca `'*'`: o destino é a ponte, e só ela (o app é `file://`, a ponte é https).
    iframeRef.current?.contentWindow?.postMessage(
      { source: 'ccplay-app', v: 1, ...message } as AppToBridge,
      TRAILER_BRIDGE_ORIGIN,
    )
  }

  /** Fecha exatamente uma vez: `ended` e RETURN podem chegar juntos. */
  function finish() {
    if (closedRef.current) return
    closedRef.current = true
    send({ type: 'stop' })
    onCloseRef.current()
  }

  function revealBar() {
    setBarVisible(true)
    if (barTimerRef.current) clearTimeout(barTimerRef.current)
    barTimerRef.current = setTimeout(() => setBarVisible(false), BAR_HIDE_MS)
  }

  function actions(): ErrorAction[] {
    return stateRef.current.error?.retryable ? ['retry', 'back'] : ['back']
  }

  function retry() {
    dispatch({ type: 'retry', now: Date.now() })
    if (stateRef.current.phase === 'loading') setAttempt((n) => n + 1)
  }

  function seek(direction: 'left' | 'right') {
    if (seekPendingRef.current) return // descarta, nunca acumula (feature 011)
    seekPendingRef.current = true
    send({ type: 'seek-by', seconds: direction === 'left' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS })
    seekTimerRef.current = setTimeout(() => {
      seekPendingRef.current = false
    }, SEEK_RELEASE_MS)
  }

  function toggle() {
    const { phase } = stateRef.current
    if (phase === 'playing' || phase === 'paused') send({ type: 'toggle' })
  }

  useRemoteNav(
    {
      onDirection: (direction: RemoteDirection) => {
        const { phase } = stateRef.current
        if (phase === 'error') {
          if (direction === 'left' || direction === 'right') {
            const count = actions().length
            const next = Math.min(Math.max(errorFocusRef.current + (direction === 'left' ? -1 : 1), 0), count - 1)
            errorFocusRef.current = next
            setErrorFocus(next)
          }
          return
        }
        if (phase !== 'playing' && phase !== 'paused') return
        revealBar()
        if (direction === 'left' || direction === 'right') seek(direction)
      },
      onSelect: () => {
        const { phase } = stateRef.current
        if (phase === 'loading') {
          dispatch({ type: 'close' })
        } else if (phase === 'playing' || phase === 'paused') {
          revealBar()
          toggle()
        } else if (phase === 'error') {
          const action = actions()[errorFocusRef.current] ?? 'back'
          if (action === 'retry') {
            errorFocusRef.current = 0
            setErrorFocus(0)
            retry()
          } else {
            dispatch({ type: 'close' })
          }
        }
      },
      onBack: () => dispatch({ type: 'close' }),
      onMediaKey: (key: MediaKey) => {
        if (key === 'MediaPlayPause' || key === 'MediaPlay' || key === 'MediaPause') {
          revealBar()
          toggle()
        }
        // Stop, Rewind, FastForward e CH±: sem efeito na camada.
      },
    },
    { modal: true },
  )

  // Mensagens da ponte: só da origem dela E da janela do iframe em uso.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = parseBridgeMessage(event, iframeRef.current?.contentWindow ?? null)
      if (!message) return // inválida: ignorada, sem log
      switch (message.type) {
        case 'playing':
        case 'paused':
        case 'ended':
          dispatch({ type: 'bridge-state', state: message.type })
          break
        case 'error':
          dispatch({ type: 'player-error', code: message.code })
          break
        case 'api-failed':
          dispatch({ type: 'bridge-failed' })
          break
        case 'ready':
          dispatch({ type: 'bridge-ready', now: Date.now() })
          setAliveKey(frameKeyRef.current)
          // O YouTube pode puxar o foco do documento; sem isto as teclas param de chegar (R-002).
          window.focus()
          break
        case 'seeked':
          seekPendingRef.current = false
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Prazo de 15 s: só vale carregando; um por abertura (o reserva usa o que sobrou).
  useEffect(() => {
    if (state.phase !== 'loading') return
    const timer = setTimeout(() => dispatch({ type: 'timeout' }), Math.max(0, state.deadline - Date.now()))
    return () => clearTimeout(timer)
  }, [state.phase, state.deadline, state.candidateIndex, attempt])

  // Fechada (fim, RETURN, Cancelar, Voltar): para a ponte e avisa o dono, uma vez.
  useEffect(() => {
    if (state.phase === 'closed') finish()
  }, [state.phase])

  // App oculto: fecha (FR-015).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') dispatch({ type: 'close' })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Faixa: entra tocando e some depois de um tempo sem tecla; pausada, fica sempre.
  useEffect(() => {
    if (state.phase === 'playing') {
      revealBar()
    } else if (barTimerRef.current) {
      clearTimeout(barTimerRef.current)
      barTimerRef.current = null
      setBarVisible(true)
    }
  }, [state.phase])

  useEffect(() => {
    announce(`Trailer de ${title}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [])

  useEffect(() => {
    if (state.phase === 'error' && state.error) announce(trailerErrorMessage(state.error))
  }, [state.phase, state.error, announce])

  // Desmontar por fora (o dono some com a camada) também para o vídeo e limpa os prazos.
  // Layout effect de propósito: o cleanup do pai roda antes de o React soltar a ref do
  // iframe; num `useEffect` a janela já não estaria mais acessível para o `stop`.
  useLayoutEffect(() => {
    return () => {
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
      if (barTimerRef.current) clearTimeout(barTimerRef.current)
      // Só manda parar: NÃO marca `closedRef`. Em desenvolvimento o StrictMode desmonta e
      // remonta o efeito logo na abertura — marcar aqui deixaria `finish()` mudo para sempre
      // (achado pelo E2E: o fim do vídeo não fechava a camada). `stop` repetido é inofensivo.
      send({ type: 'stop' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `send` só lê refs
  }, [])

  const candidate = candidates[state.candidateIndex]
  const { phase } = state
  // `closed` mantém o iframe até o dono desmontar a camada: o `stop` do fechamento
  // ainda precisa da janela dele.
  const showFrame = phase !== 'error' && candidate !== undefined
  const frameKey = `${state.candidateIndex}-${attempt}`
  frameKeyRef.current = frameKey
  const playerAlive = aliveKey === frameKey

  return (
    <div className="trailer-layer" role="dialog" aria-modal="true" aria-label={`Trailer de ${title}`}>
      {showFrame && (
        <iframe
          // Trocar de candidato ou tentar de novo REMONTA o iframe: nunca reaproveita a janela antiga.
          key={frameKey}
          ref={iframeRef}
          className="trailer-frame"
          src={trailerBridgeSrc(candidate.videoId)}
          title="Trailer"
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          tabIndex={-1}
          onLoad={() => window.focus()}
        />
      )}

      {phase === 'loading' && playerAlive && (
        // Player vivo, esperando o YouTube (anúncios): o vídeo fica à vista e só a faixa de baixo aparece.
        <div className="trailer-bar">
          <p className="trailer-title">{title}</p>
          <p className="trailer-hint">Anúncios do YouTube podem passar antes do trailer</p>
          <div className="trailer-pill tv-focus">Cancelar</div>
        </div>
      )}

      {phase === 'loading' && !playerAlive && (
        <div className="trailer-loading">
          <Spinner size={48} />
          <p className="trailer-loading-text">Carregando trailer</p>
          <p className="trailer-title">{title}</p>
          <div className="trailer-pill tv-focus">Cancelar</div>
        </div>
      )}

      {(phase === 'playing' || phase === 'paused') && (
        <div className={`trailer-bar${phase === 'playing' && !barVisible ? ' trailer-bar-hidden' : ''}`}>
          <p className="trailer-title">{title}</p>
          <p className="trailer-hint">OK pausa · ← → 10 s · Voltar fecha</p>
          <div className="trailer-pill tv-focus">{phase === 'paused' ? '▶ Continuar' : '⏸ Pausar'}</div>
        </div>
      )}

      {phase === 'error' && state.error && (
        <div className="trailer-error">
          <ErrorState
            title="Não foi possível tocar o trailer"
            description={trailerErrorMessage(state.error)}
            code={state.error.code}
            focusedActionIndex={errorFocus}
            actions={
              state.error.retryable
                ? [
                    { label: 'Tentar de novo', onSelect: () => retry() },
                    { label: 'Voltar', onSelect: () => dispatch({ type: 'close' }) },
                  ]
                : [{ label: 'Voltar', onSelect: () => dispatch({ type: 'close' }) }]
            }
          />
        </div>
      )}
    </div>
  )
}
