import { useEffect, useRef, useState } from 'react'
import { CatalogApiError, fetchPlayback, stableIdOf, type CatalogItemPlayback } from '../features/catalog/catalogApi'
import {
  createPlayerSession,
  FULLSCREEN_REGION,
  type PlayerAdapterFactory,
  type PlayerCapabilities,
  type PlayerServiceSession,
  type PlayerState,
} from '../lib/player/PlayerService'
import { createProgressRecorder, type ProgressRecorder, type ProgressRecorderIdentity } from '../lib/player/progressRecorder'
import { clamp, useRemoteNav } from '../lib/useRemoteNav'
import { PlayerControls, playerControlsActions } from './PlayerControls'

/**
 * Monta a identidade estável do item, sem deixar `stableIdOf` lançar até a
 * camada de reprodução — perder retomada é degradação aceitável, nunca
 * falha de player (D-010, R-010 do plano da 011). A partir da feature 012
 * (D-006), inclui `series_id`/temporada/episódio — antes, todo episódio
 * colidiria em `s0|e0` (R-001 do plano da 012).
 */
function computeIdentity(playback: CatalogItemPlayback): ProgressRecorderIdentity | null {
  const stableId = stableIdOf(playback)
  return stableId ? { stableId, sourceId: playback.source_id } : null
}

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
  /**
   * Se presente, a conclusão chama isto em vez de `onClose` (feature 012,
   * D-008) — quem decide entre encerrar e encadear o próximo episódio é a
   * tela (autoplay), nunca esta camada. Live TV e Filmes não passam isto e
   * não mudam de comportamento.
   */
  onCompleted?: () => void
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
  onCompleted,
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
  const recorderRef = useRef<ProgressRecorder | null>(null)

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
      // Ponto de saída (RETURN, desmontagem, nova tentativa): grava o resto
      // que ainda não tinha cruzado o intervalo periódico (`logic/
      // reproducao-vod.md` §2, `aoSair`). Vem antes de fechar a sessão —
      // depois disso `session.progress` já não importa mais.
      recorderRef.current?.onExit('close')
      sessionRef.current?.close()
      sessionRef.current = null
      recorderRef.current = null
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

        // Gravador de progresso (feature 011). Identidade calculada uma vez
        // por sessão — nunca lançando até aqui (D-010). `recordCompletion`
        // só liga pra episódio (feature 012, D-007) — "assistido" de filme
        // continua fora de escopo (item 13 do backlog).
        const recorder = createProgressRecorder(
          computeIdentity(playback),
          session.capabilities.reportsPosition,
          undefined,
          { recordCompletion: playback.kind === 'episode' },
        )
        recorderRef.current = recorder
        let previousState: PlayerState | null = null

        // O erro é copiado para o estado no momento em que acontece, em vez
        // de ser lido do ref durante o render — um ref não dispara
        // re-render, então a mensagem poderia ficar defasada.
        const publish = () => {
          if (cancelled) return
          // Alimenta o gravador a cada emissão da sessão — inclusive as que
          // só trazem progresso novo (a cadência de 5s vive dentro do
          // próprio gravador, não aqui).
          if (session.progress) {
            recorder.onProgress(session.progress.positionMs, session.progress.durationMs)
          }
          // Pausar é ponto de saída (R0-4): a pessoa parou de propósito.
          if (session.state === 'paused' && previousState !== 'paused') {
            recorder.onExit('pause')
          }
          // Fim de filme/episódio é conclusão normal, não falha (US3/FR-019):
          // fecha a camada sem passar pelo caminho de erro. `previousState`
          // evita chamar de novo no re-emit que o próprio `close()` do
          // cleanup dispara (guardado também por `cancelled`, em dobro).
          // `onCompleted` (feature 012, D-008) substitui `onClose` quando a
          // tela quer decidir o que vem depois (autoplay) em vez de só sair.
          if (session.state === 'completed' && previousState !== 'completed') {
            previousState = session.state
            recorder.onExit('completed')
            ;(onCompleted ?? onClose)()
            return
          }
          previousState = session.state

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unavailableMessage/genericErrorMessage/startAtMs/onClose/onCompleted são props de configuração, estáveis na prática (não recriam a sessão por si)
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
        const actions = playerControlsActions(session.capabilities, session.progress)
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

        // Achado na TV física (Fase 6): a barra fica visualmente ACIMA dos
        // botões, então CIMA entra nela (não direita) e BAIXO volta —
        // pedido direto do usuário depois de testar no aparelho.
        const seekBarIndex = actions.findIndex((a) => a.id === 'seekBar')
        const buttonCount = seekBarIndex === -1 ? actions.length : seekBarIndex

        if (actions[focusedIndex]?.id === 'seekBar') {
          // Com a barra focada, esquerda/direita buscam direto, sem mover o
          // foco — segurar acumula na porta single-flight do motor, não
          // aqui (R-019: acumular NESTE nível é que travava o app).
          if (dir === 'left') session.jumpBy(-JUMP_MS)
          else if (dir === 'right') session.jumpBy(JUMP_MS)
          else if (dir === 'down') setFocusedIndex(playPauseIndexOf(session.capabilities))
          // cima: já está no topo, nada a fazer além de reafirmar "visível".
          scheduleHide()
          return
        }

        // Um dos três botões focado: esquerda/direita navegam só entre eles
        // (a barra não entra nessa varredura); cima entra na barra, se existir.
        if (dir === 'left') {
          setFocusedIndex((i) => clamp(i - 1, 0, buttonCount - 1))
        } else if (dir === 'right') {
          setFocusedIndex((i) => clamp(i + 1, 0, buttonCount - 1))
        } else if (dir === 'up' && seekBarIndex !== -1) {
          setFocusedIndex(seekBarIndex)
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
        const actions = playerControlsActions(session.capabilities, session.progress)
        const action = actions[focusedIndex]
        if (!action) return
        if (action.id === 'playPause') session.togglePause()
        else if (action.id === 'jumpBack') session.jumpBy(-JUMP_MS)
        else if (action.id === 'jumpForward') session.jumpBy(JUMP_MS)
        // seekBar: sem ação em SELECT — o gesto dela é esquerda/direita, não OK.
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
