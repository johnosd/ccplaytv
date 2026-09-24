import { useEffect, useRef, useState } from 'react'
import { CatalogApiError, fetchPlayback } from '../features/catalog/catalogApi'
import {
  createPlayerSession,
  FULLSCREEN_REGION,
  type PlayerAdapterFactory,
  type PlayerCapabilities,
  type PlayerServiceSession,
  type PlayerState,
} from '../lib/player/PlayerService'
import { clamp, useRemoteNav } from '../lib/useRemoteNav'
import { PlayerControls, playerControlsActions } from './PlayerControls'

export interface PlayerLayerProps {
  itemId: string
  title: string
  onClose: () => void
  /**
   * Costura de injeção do motor. Em produção fica `undefined` e o
   * `PlayerService` escolhe AVPlay ou `<video>` em tempo de execução; nos
   * testes, permite dirigir a máquina de estados sem depender de qual
   * adaptador está ativo.
   */
  createAdapter?: PlayerAdapterFactory
  /** Posição de retomada em ms, aplicada antes de a reprodução começar. */
  startAtMs?: number
  /** Mensagem de "não há fonte de reprodução" (409). Live TV preserva a sua (FR-022). */
  unavailableMessage?: string
  /** Mensagem genérica de falha. Live TV preserva a sua (FR-022). */
  genericErrorMessage?: string
}

type Phase =
  | { kind: 'resolving' }
  | { kind: 'session'; state: PlayerState }
  | { kind: 'error'; message: string; retryable: boolean }

const STATE_LABEL: Record<PlayerState, string> = {
  idle: 'Preparando…',
  preparing: 'Preparando…',
  buffering: 'Carregando…',
  playing: '',
  // O ícone de play/pause na barra já comunica o estado — sem texto extra.
  paused: '',
  // Tratado antes de chegar a renderizar (fecha a camada) — feature 011 Fase 5.
  completed: '',
  error: '',
  closed: '',
}

/** Guia Samsung 06 §1: oculta após 5s sem interação, salto de 10s. */
const HIDE_CONTROLS_MS = 5000
const JUMP_MS = 10_000

const DEFAULT_UNAVAILABLE_MESSAGE = 'Este item não tem uma fonte de reprodução disponível.'
const DEFAULT_GENERIC_ERROR_MESSAGE = 'Não foi possível reproduzir isto.'

/**
 * Camada de reprodução em tela cheia — compartilhada entre Live TV e Filmes
 * (feature 011; antes vivia só em `features/live/PlayerOverlay.tsx`).
 *
 * É uma **camada**, não uma tela do roteador, de propósito: a tela de baixo
 * continua montada, então o foco e a posição sobrevivem sem precisar
 * carregar estado de foco no histórico de navegação do `App` (plano da spec
 * 003, D-005).
 *
 * `modal: true` no `useRemoteNav` faz esta camada interceptar a tecla antes
 * da tela por baixo reagir — mesmo padrão do `ConfirmDialog`. É também o que
 * garante a saída do estado `playing` com os controles ocultos, que por
 * desenho não tem elemento focável (D-010 da feature 003; desvio consciente
 * também nesta feature — ver Constitution Check do `plan.md`): RETURN sempre
 * encerra.
 */
export function PlayerLayer({
  itemId,
  title,
  onClose,
  createAdapter,
  startAtMs,
  unavailableMessage = DEFAULT_UNAVAILABLE_MESSAGE,
  genericErrorMessage = DEFAULT_GENERIC_ERROR_MESSAGE,
}: PlayerLayerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'resolving' })
  const [errorFocus, setErrorFocus] = useState<0 | 1>(0)
  const [attempt, setAttempt] = useState(0)
  const [hardwarePlane, setHardwarePlane] = useState(false)
  // Controles começam visíveis (clarificação de 23/09/2026) — ver `logic/
  // reproducao-vod.md` §4.
  const [controlsVisible, setControlsVisible] = useState(true)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const sessionRef = useRef<PlayerServiceSession | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearHideTimer() {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  /**
   * O foco inicial, ao revelar, é sempre o play/pause (`logic/
   * reproducao-vod.md` §4) — nunca um índice fixo, porque a ordem de
   * `playerControlsActions` começa por `jumpBack` quando `canSeek` é
   * verdadeiro.
   */
  function playPauseIndexOf(capabilities: PlayerCapabilities): number {
    const idx = playerControlsActions(capabilities).findIndex((action) => action.id === 'playPause')
    return idx === -1 ? 0 : idx
  }

  /**
   * Reinicia o temporizador de ocultar. Lê `sessionRef.current.state`
   * diretamente (não o `phase` do React) porque pausar é síncrono nos dois
   * adaptadores — o `state` do objeto de sessão já reflete "paused" antes do
   * próximo render, e o temporizador não pode se basear num valor que só
   * atualiza depois (closure de `phase` ficaria um passo atrás).
   */
  function scheduleHide() {
    clearHideTimer()
    // Não oculta enquanto pausado: a pessoa parou de propósito e precisa ver
    // os controles pra retomar (logic/reproducao-vod.md §4).
    if (sessionRef.current?.state === 'paused') return
    const actions = sessionRef.current ? playerControlsActions(sessionRef.current.capabilities) : []
    if (actions.length === 0) return // canal ao vivo: nada a mostrar, nada a temporizar
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), HIDE_CONTROLS_MS)
  }

  function revealControls() {
    setControlsVisible(true)
    if (sessionRef.current) setFocusedIndex(playPauseIndexOf(sessionRef.current.capabilities))
    scheduleHide()
  }

  useEffect(() => {
    let cancelled = false

    function teardown() {
      clearHideTimer()
      sessionRef.current?.close()
      sessionRef.current = null
    }

    async function start() {
      setPhase({ kind: 'resolving' })
      try {
        // Uma busca por tentativa, sempre pelo id do item: a URL anterior
        // nunca é reaproveitada, para não contornar expiração ou revogação
        // (ADR-002 §5; contrato, regra 3).
        const playback = await fetchPlayback(itemId)
        if (cancelled) return

        // `playback.kind` vem do catálogo real — nunca fixo. É ele que
        // resolve as capacidades desta sessão (motor ∩ mídia, D-001).
        const session = createPlayerSession(playback.url, FULLSCREEN_REGION, playback.kind, {
          createAdapter,
          startAtMs,
        })
        sessionRef.current = session
        setHardwarePlane(session.rendersOnHardwarePlane)
        setFocusedIndex(playPauseIndexOf(session.capabilities))
        scheduleHide()

        // O erro é copiado para o estado no momento em que acontece, em vez
        // de ser lido do ref durante o render — um ref não dispara
        // re-render, então a mensagem poderia ficar defasada.
        const publish = () => {
          if (cancelled) return
          if (session.state === 'error') {
            setPhase({
              kind: 'error',
              message: session.error?.message ?? genericErrorMessage,
              retryable: true,
            })
            return
          }
          setPhase({ kind: 'session', state: session.state })
        }

        publish()
        session.subscribe(publish)
      } catch (error) {
        if (cancelled) return
        // 409 = o item existe mas não é reproduzível (corrida entre listar e
        // reproduzir). Não adianta tentar de novo.
        const unavailable = error instanceof CatalogApiError && error.status === 409
        setPhase({
          kind: 'error',
          message: unavailable ? unavailableMessage : genericErrorMessage,
          retryable: !unavailable,
        })
      }
    }

    void start()

    return () => {
      cancelled = true
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unavailableMessage/genericErrorMessage/startAtMs são props de configuração, estáveis na prática (não recriam a sessão por si)
  }, [itemId, attempt, createAdapter])

  const isErrorScreen = phase.kind === 'error'
  const errorMessage = phase.kind === 'error' ? phase.message : ''
  const canRetry = phase.kind === 'error' ? phase.retryable : false

  // Libera a área do vídeo quando o motor pinta no plano de hardware: enquanto
  // qualquer camada web opaca cobrir essa área, o canal toca sem imagem
  // (bug `live-tv-toca-audio-sem-imagem`). Só nos estados que têm vídeo —
  // em `resolving` e `error` o fundo preto é o que mantém a camada legível.
  // A remoção fica no cleanup, e não no caminho feliz: classe esquecida deixa
  // o app inteiro transparente na TV, falha pior que o bug original.
  const showsVideo =
    hardwarePlane &&
    phase.kind === 'session' &&
    (phase.state === 'buffering' || phase.state === 'playing' || phase.state === 'paused')

  useEffect(() => {
    if (!showsVideo) return
    const root = document.documentElement
    root.classList.add('video-plane-visible')
    return () => root.classList.remove('video-plane-visible')
  }, [showsVideo])

  // `scheduleHide` chamado de dentro de um handler de tecla só vê o estado de
  // ANTES do pedido de pausa — pausar é confirmado de forma assíncrona pelo
  // motor (`onStateChange`), nunca no mesmo tick do SELECT. Sem reagir à
  // confirmação real, um temporizador armado enquanto ainda tocava sobrevive
  // e oculta os controles mesmo já pausado (`logic/reproducao-vod.md` §4).
  const sessionState = phase.kind === 'session' ? phase.state : null
  useEffect(() => {
    if (sessionState === null) return
    scheduleHide()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleHide lê refs estáveis (sessionRef/hideTimerRef); só o valor de sessionState deve reagendar
  }, [sessionState])

  useRemoteNav(
    {
      onDirection: (dir) => {
        if (isErrorScreen) {
          if (!canRetry) return
          if (dir === 'left') setErrorFocus(0)
          if (dir === 'right') setErrorFocus(1)
          return
        }
        const session = sessionRef.current
        if (!session) return
        const actions = playerControlsActions(session.capabilities)
        if (actions.length === 0) return // canal ao vivo: sem busca, sem pausa (FR-003/FR-022)

        if (!controlsVisible) {
          // Ocultos: esquerda/direita SALTAM e revelam a barra
          // (logic/reproducao-vod.md §4 — guia Samsung 06 §1).
          if (dir === 'left') {
            session.jumpBy(-JUMP_MS)
            revealControls()
            return
          }
          if (dir === 'right') {
            session.jumpBy(JUMP_MS)
            revealControls()
            return
          }
          revealControls() // cima/baixo só revelam
          return
        }

        // Visíveis: esquerda/direita NAVEGAM entre ações, sem saltar.
        if (dir === 'left') {
          setFocusedIndex((i) => clamp(i - 1, 0, actions.length - 1))
        } else if (dir === 'right') {
          setFocusedIndex((i) => clamp(i + 1, 0, actions.length - 1))
        }
        scheduleHide()
      },
      onSelect: () => {
        if (isErrorScreen) {
          if (canRetry && errorFocus === 0) {
            setErrorFocus(0)
            setAttempt((n) => n + 1)
            return
          }
          onClose()
          return
        }
        const session = sessionRef.current
        if (!session) return
        if (!controlsVisible) {
          revealControls()
          return
        }
        const actions = playerControlsActions(session.capabilities)
        const action = actions[focusedIndex]
        if (!action) return
        if (action.id === 'playPause') session.togglePause()
        else if (action.id === 'jumpBack') session.jumpBy(-JUMP_MS)
        else if (action.id === 'jumpForward') session.jumpBy(JUMP_MS)
        scheduleHide()
      },
      // RETURN encerra de qualquer estado — inclusive de `playing`, que não
      // tem elemento focável com os controles ocultos. É a saída garantida
      // (D-010 da feature 003).
      onBack: onClose,
    },
    { modal: true },
  )

  if (isErrorScreen) {
    return (
      <div className="player-overlay" role="dialog" aria-label="Erro de reprodução">
        <div className="player-message">
          <div className="player-message-title">{title}</div>
          {/* Mensagem sanitizada: nunca inclui URL, endereço de provedor ou
              credencial (FR-011). */}
          <div className="player-message-copy">{errorMessage}</div>
          <div className="player-actions">
            {canRetry && (
              <button
                type="button"
                className={`player-action${errorFocus === 0 ? ' tv-focus' : ''}`}
              >
                Tentar de novo
              </button>
            )}
            <button
              type="button"
              className={`player-action${!canRetry || errorFocus === 1 ? ' tv-focus' : ''}`}
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  const label = phase.kind === 'resolving' ? 'Preparando…' : STATE_LABEL[phase.state]
  const session = sessionRef.current

  return (
    <div className="player-overlay" role="dialog" aria-label={`Reproduzindo ${title}`}>
      {/* O adaptador de desenvolvimento monta o <video> aqui. O AVPlay não usa
          este nó: ele desenha num plano de hardware atrás da camada web. */}
      <div id="player-surface" className="player-surface" />
      {label !== '' && (
        <div className="player-status">
          <div className="player-status-channel">{title}</div>
          <div className="player-status-label">{label}</div>
        </div>
      )}
      {controlsVisible && session && phase.kind === 'session' && (
        <PlayerControls
          capabilities={session.capabilities}
          state={phase.state}
          progress={session.progress}
          focusedIndex={focusedIndex}
        />
      )}
    </div>
  )
}
