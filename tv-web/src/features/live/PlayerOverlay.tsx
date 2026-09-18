import { useEffect, useRef, useState } from 'react'
import { CatalogApiError, fetchPlayback } from '../catalog/catalogApi'
import {
  createPlayerSession,
  FULLSCREEN_REGION,
  type PlayerAdapterFactory,
  type PlayerServiceSession,
  type PlayerState,
} from '../../lib/player/PlayerService'
import { useRemoteNav } from '../../lib/useRemoteNav'

export interface PlayerOverlayProps {
  itemId: string
  channelName: string
  onClose: () => void
  /**
   * Costura de injeção do motor. Em produção fica `undefined` e o
   * `PlayerService` escolhe AVPlay ou `<video>` em tempo de execução; nos
   * testes, permite dirigir a máquina de estados sem depender de qual
   * adaptador está ativo.
   */
  createAdapter?: PlayerAdapterFactory
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
  error: '',
  closed: '',
}

/**
 * Camada de reprodução em tela cheia.
 *
 * É uma **camada**, não uma tela do roteador, de propósito: a `LiveScreen`
 * continua montada por baixo, então o foco e a posição da lista sobrevivem
 * sem precisar carregar estado de foco no histórico de navegação do `App`
 * (plano da spec 003, D-005).
 *
 * `modal: true` no `useRemoteNav` faz esta camada interceptar a tecla antes
 * da lista reagir — mesmo padrão do `ConfirmDialog`. É também o que garante a
 * saída do estado `playing`, que por desenho não tem elemento focável
 * (D-010): RETURN sempre encerra.
 */
export function PlayerOverlay({
  itemId,
  channelName,
  onClose,
  createAdapter,
}: PlayerOverlayProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'resolving' })
  const [errorFocus, setErrorFocus] = useState<0 | 1>(0)
  const [attempt, setAttempt] = useState(0)
  const [hardwarePlane, setHardwarePlane] = useState(false)
  const sessionRef = useRef<PlayerServiceSession | null>(null)

  useEffect(() => {
    let cancelled = false

    function teardown() {
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

        const session = createPlayerSession(playback.url, FULLSCREEN_REGION, { createAdapter })
        sessionRef.current = session
        setHardwarePlane(session.rendersOnHardwarePlane)

        // O erro é copiado para o estado no momento em que acontece, em vez
        // de ser lido do ref durante o render — um ref não dispara
        // re-render, então a mensagem poderia ficar defasada.
        const publish = () => {
          if (cancelled) return
          if (session.state === 'error') {
            setPhase({
              kind: 'error',
              message: session.error?.message ?? 'Não foi possível reproduzir este canal.',
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
          message: unavailable
            ? 'Este canal não tem uma fonte de reprodução disponível.'
            : 'Não foi possível reproduzir este canal.',
          retryable: !unavailable,
        })
      }
    }

    void start()

    return () => {
      cancelled = true
      teardown()
    }
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
    hardwarePlane && phase.kind === 'session' && (phase.state === 'buffering' || phase.state === 'playing')

  useEffect(() => {
    if (!showsVideo) return
    const root = document.documentElement
    root.classList.add('video-plane-visible')
    return () => root.classList.remove('video-plane-visible')
  }, [showsVideo])

  useRemoteNav(
    {
      onDirection: (dir) => {
        if (!isErrorScreen || !canRetry) return
        if (dir === 'left') setErrorFocus(0)
        if (dir === 'right') setErrorFocus(1)
      },
      onSelect: () => {
        if (!isErrorScreen) return
        if (canRetry && errorFocus === 0) {
          setErrorFocus(0)
          setAttempt((n) => n + 1)
          return
        }
        onClose()
      },
      // RETURN encerra de qualquer estado — inclusive de `playing`, que não
      // tem elemento focável. É a saída garantida (D-010).
      onBack: onClose,
    },
    { modal: true },
  )

  if (isErrorScreen) {
    return (
      <div className="player-overlay" role="dialog" aria-label="Erro de reprodução">
        <div className="player-message">
          <div className="player-message-title">{channelName}</div>
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

  const label =
    phase.kind === 'resolving' ? 'Preparando…' : STATE_LABEL[phase.state]

  return (
    <div className="player-overlay" role="dialog" aria-label={`Reproduzindo ${channelName}`}>
      {/* O adaptador de desenvolvimento monta o <video> aqui. O AVPlay não usa
          este nó: ele desenha num plano de hardware atrás da camada web. */}
      <div id="player-surface" className="player-surface" />
      {label !== '' && (
        <div className="player-status">
          <div className="player-status-channel">{channelName}</div>
          <div className="player-status-label">{label}</div>
        </div>
      )}
    </div>
  )
}
