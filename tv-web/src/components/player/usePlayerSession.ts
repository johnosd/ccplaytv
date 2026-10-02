import { useEffect, useRef, useState, type RefObject } from 'react'
import { CatalogApiError, fetchPlayback, stableIdOf, type CatalogItemPlayback } from '../../features/catalog/catalogApi'
import {
  createPlayerSession,
  FULLSCREEN_REGION,
  type PlayerAdapterFactory,
  type PlayerServiceSession,
  type PlayerState,
} from '../../lib/player/PlayerService'
import { createProgressRecorder, type ProgressRecorder, type ProgressRecorderIdentity } from '../../lib/player/progressRecorder'
import { MOVIE_WATCHED_RATIO } from '../../lib/player/resumePolicy'
import { disableScreenSaver, enableScreenSaver } from '../../lib/player/screenSaver'
import { diagnoseFetchFailure, diagnosePlayback, type PlaybackDiagnosis } from '../../lib/player/playbackDiagnosis'
import { readPlaybackSourceAccess, type PlaybackSourceAccess } from '../../lib/player/playbackSourceAccess'
import { nextReconnect, RECONNECT_DELAYS_MS, RECONNECT_STABLE_MS } from '../../lib/player/reconnectPolicy'
import { verifyNetwork } from '../../lib/network/verifyNetwork'
import { prefetchGate } from '../../lib/catalog/prefetch'
import type { ChromeMedia } from '../chromeControls'
import type { PanelState, Phase, ResumeGate } from './playerLayerTypes'
import type { PlayerChrome } from './usePlayerChrome'

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

export interface PlayerSessionParams {
  itemId: string
  createAdapter: PlayerAdapterFactory | undefined
  startAtMs: number | undefined
  unavailableMessage: string
  genericErrorMessage: string
  onClose: () => void
  onCompleted: (() => void) | undefined
  onEnteredPlaying: (() => void) | undefined
  onSessionError: ((message: string) => void) | undefined
  sessionRef: RefObject<PlayerServiceSession | null>
  panelRef: RefObject<PanelState | null>
  chrome: PlayerChrome
  reapplyTrackChoice: (session: PlayerServiceSession) => void
  /** Feature 041: aspecto e qualidade da sequência, logo depois das faixas. */
  reapplyViewChoice: (session: PlayerServiceSession) => void
}

export interface PlayerSessionState {
  phase: Phase
  hardwarePlane: boolean
  /** "Tentar de novo" da tela de erro: nova tentativa da mesma sessão. */
  retry: () => void
  /** Feature 042: estado para desenhar o aviso da retomada sem rede. */
  resumeGate: ResumeGate
  /** Feature 042: o mesmo valor, para o teclado ler sem esperar um commit (refs, 027). */
  resumeGateRef: RefObject<ResumeGate>
  /** "Tentar de novo" do aviso da retomada: repete a verificação (single-flight). */
  recheckResume: () => void
  /** Id da lista do item que toca (`null` antes de resolver). */
  sourceIdRef: RefObject<string | null>
}

/**
 * Sessão e ciclo de vida da reprodução (features 011/012/019/020/027/029).
 * Extraído do `PlayerLayer` na feature 040 sem mudar nada. Registra, nesta
 * ordem, o efeito da pré-carga (038) e o da sessão — os demais efeitos de
 * ciclo de vida são hooks à parte, chamados pelo `PlayerLayer` logo depois,
 * na mesma ordem de antes (`logic/divisao.md` §1.2).
 */
export function usePlayerSession({
  itemId,
  createAdapter,
  startAtMs,
  unavailableMessage,
  genericErrorMessage,
  onClose,
  onCompleted,
  onEnteredPlaying,
  onSessionError,
  sessionRef,
  panelRef,
  chrome,
  reapplyTrackChoice,
  reapplyViewChoice,
}: PlayerSessionParams): PlayerSessionState {
  const [phase, setPhase] = useState<Phase>({ kind: 'resolving' })
  const [attempt, setAttempt] = useState(0)
  const [hardwarePlane, setHardwarePlane] = useState(false)
  const recorderRef = useRef<ProgressRecorder | null>(null)

  // Feature 042 (`logic/rede-e-lifecycle.md` §3/§4). Tudo em refs: o teclado e
  // os timers leem outro turno, sem esperar um commit (lição da 027).
  const attemptsRef = useRef(0)
  const resumeAtRef = useRef<number | undefined>(undefined)
  const lastItemRef = useRef(itemId)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Estado da conta da lista que toca (feature 034), lido uma vez por sessão —
  // alimenta o diagnóstico (credencial recusada/conta expirada, R-002).
  const sourceAccessRef = useRef<PlaybackSourceAccess>(null)
  /** Lista do item que toca — para a ação "Editar lista" do erro de fonte (id da lista, não segredo). */
  const sourceIdRef = useRef<string | null>(null)
  const resumeGateRef = useRef<ResumeGate>(null)
  const [resumeGate, setResumeGateState] = useState<ResumeGate>(null)
  const recheckResumeRef = useRef<() => void>(() => {})
  function setResumeGate(value: ResumeGate) {
    resumeGateRef.current = value
    setResumeGateState(value)
  }

  const { clearHideTimer, playPauseIndexOf, scheduleHide, seekBarFocusedRef, setFocused, setLevel, setMedia } = chrome

  // Feature 038 (FR-004/SC-004): camada aberta = nenhuma categoria da
  // pré-carga começa. Montou/desmontou; zapping não remonta a camada.
  useEffect(() => prefetchGate.acquirePlayback(), [])

  useEffect(() => {
    let cancelled = false
    let verifyingResume = false

    // Outro item (zapping, CH±, próximo episódio): a posição e a contagem do
    // anterior nunca vazam (`logic/rede-e-lifecycle.md` §3.6).
    if (lastItemRef.current !== itemId) {
      lastItemRef.current = itemId
      resumeAtRef.current = undefined
      attemptsRef.current = 0
    }

    function clearReconnectTimers() {
      if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current)
      if (stableTimerRef.current !== null) clearTimeout(stableTimerRef.current)
      reconnectTimerRef.current = null
      stableTimerRef.current = null
    }

    function teardown() {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearReconnectTimers()
      recheckResumeRef.current = () => {}
      setResumeGate(null)
      clearHideTimer()
      // Um painel de faixas nunca sobrevive à sessão a que pertence (feature 029).
      panelRef.current = null
      // Ponto de saída (RETURN, desmontagem, nova tentativa): grava o resto
      // que ainda não tinha cruzado o intervalo periódico (`logic/
      // reproducao-vod.md` §2, `aoSair`). Vem antes de fechar a sessão —
      // depois disso `session.progress` já não importa mais.
      recorderRef.current?.onExit('close')
      sessionRef.current?.close()
      sessionRef.current = null
      recorderRef.current = null
    }

    /** Mesma lógica do `catch` de `start()` — reaproveitada pela revalidação
     *  de `onVisibilityChange` (D-003) pra nunca duplicar a distinção
     *  409/`unavailableMessage` de outros erros/`genericErrorMessage`. */
    function applyFetchError(error: unknown) {
      if (cancelled) return
      const unavailable = error instanceof CatalogApiError && error.status === 409
      const diagnosis = diagnoseFetchFailure({
        status: error instanceof CatalogApiError ? error.status : null,
        online: navigator.onLine,
        at: Date.now(),
      })
      setPhase({
        kind: 'error',
        message: unavailable ? unavailableMessage : genericErrorMessage,
        retryable: !unavailable,
        diagnosis,
      })
      onSessionError?.(unavailable ? unavailableMessage : genericErrorMessage)
    }

    /**
     * Feature 020 (US2): oculto → pausa (filme/episódio, D-002) ou fecha
     * (canal ao vivo, sem pausa real, D-002) — só quando havia reprodução
     * ATIVA (`playing`/`buffering`); uma sessão já pausada manualmente não
     * ganha uma segunda transição, e `togglePause()` às cegas a RETOMARIA
     * (edge case da spec). Visível → revalida a URL do item antes de
     * qualquer nova tentativa de retomar (D-003, FR-004/FR-008) — só existe
     * sessão aberta aqui pra filme/episódio pausado, já que canal fechou a
     * própria sessão no ramo oculto.
     */
    function onVisibilityChange() {
      const session = sessionRef.current
      if (!session) return
      if (document.visibilityState === 'hidden') {
        const isActive = session.state === 'playing' || session.state === 'buffering'
        if (!isActive) return
        if (session.capabilities.canPause) {
          session.togglePause()
        } else {
          session.close()
          sessionRef.current = null
          onClose()
        }
        return
      }
      void verifyResume()
    }

    /**
     * Feature 042 (D-006, `logic/rede-e-lifecycle.md` §4): ao voltar do app
     * oculto, rede → URL → só então libera RETOMAR. Single-flight. A
     * verificação usa só o sinal do aparelho (sem origem): a confirmação real
     * é a reabertura/retomada em si, que cai no mesmo caminho de erro.
     */
    async function verifyResume() {
      const session = sessionRef.current
      if (!session || session.state === 'error' || session.state === 'completed' || session.state === 'closed') return
      if (verifyingResume) return
      verifyingResume = true
      setResumeGate('verifying')
      const online = await verifyNetwork()
      if (cancelled) return
      if (!online) {
        verifyingResume = false
        setResumeGate('blocked')
        return
      }
      try {
        await fetchPlayback(itemId)
      } catch (error) {
        verifyingResume = false
        if (cancelled) return
        setResumeGate(null)
        applyFetchError(error)
        return
      }
      verifyingResume = false
      if (!cancelled) setResumeGate(null)
    }

    recheckResumeRef.current = () => {
      if (resumeGateRef.current === 'blocked') void verifyResume()
    }

    async function start() {
      setPhase(
        attemptsRef.current > 0
          ? { kind: 'reconnecting', attempt: attemptsRef.current, max: RECONNECT_DELAYS_MS.length }
          : { kind: 'resolving' },
      )
      try {
        // Uma busca por tentativa, sempre pelo id do item: a URL anterior
        // nunca é reaproveitada, para não contornar expiração ou revogação
        // (ADR-002 §5; contrato, regra 3).
        const playback = await fetchPlayback(itemId)
        if (cancelled) return
        sourceAccessRef.current = null
        sourceIdRef.current = playback.source_id
        void readPlaybackSourceAccess(playback.source_id).then((access) => {
          if (!cancelled) sourceAccessRef.current = access
        })

        // `playback.kind` vem do catálogo real — nunca fixo. É ele que
        // resolve as capacidades desta sessão (motor ∩ mídia, D-001) e a
        // mídia do chrome (feature 027, D-001 do plano da 027).
        const media: ChromeMedia = playback.kind === 'channel' ? 'live' : 'vod'
        const session = createPlayerSession(playback.url, FULLSCREEN_REGION, playback.kind, {
          createAdapter,
          // Reconexão do VOD retoma da última posição conhecida (FR-009); sem
          // ela vale a posição de retomada que a tela pediu.
          startAtMs: resumeAtRef.current ?? startAtMs,
        })
        sessionRef.current = session
        setHardwarePlane(session.rendersOnHardwarePlane)
        setMedia(media)
        seekBarFocusedRef.current = false
        if (media === 'live') {
          // Nova sessão do Live sempre começa na faixa — inclusive depois de
          // uma troca por ↑/↓/CH± (`logic/chrome-player.md` §4).
          setLevel('band')
        } else {
          setLevel('full')
          setFocused(playPauseIndexOf(session.capabilities))
        }
        scheduleHide()

        // Gravador de progresso (feature 011). Identidade calculada uma vez
        // por sessão — nunca lançando até aqui (D-010). `recordCompletion`
        // liga pra episódio (feature 012, D-007) e, desde a feature 019,
        // também pra filme — com um limiar próprio, mais baixo
        // (`MOVIE_WATCHED_RATIO`, 90%) que o de episódio (95%, default de
        // `isPastEnd`, D-002/D-003 do plano da 019).
        const recorder = createProgressRecorder(
          computeIdentity(playback),
          session.capabilities.reportsPosition,
          undefined,
          {
            recordCompletion: playback.kind === 'episode' || playback.kind === 'movie',
            completionRatio: playback.kind === 'movie' ? MOVIE_WATCHED_RATIO : undefined,
          },
        )
        recorderRef.current = recorder
        let previousState: PlayerState | null = null
        let enteredPlayingFired = false
        // Um stream que nunca tocou (canal morto, URL ruim) vai direto ao erro:
        // reconectar só vale para o que CAIU (D-003).
        let playedThisSession = false

        // O erro é copiado para o estado no momento em que acontece, em vez
        // de ser lido do ref durante o render — um ref não dispara
        // re-render, então a mensagem poderia ficar defasada.
        const publish = () => {
          if (cancelled) return
          // Erro/conclusão fecham o painel aberto (feature 029): o foco vai
          // para a tela de erro ou para quem trata a conclusão.
          if (session.state === 'error' || session.state === 'completed') panelRef.current = null
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
            // Aguarda a escrita (markCompleted/clearProgress) terminar ANTES
            // de fechar — achado real na feature 019, T023: fechar direto
            // disparava a invalidação de `useUserState` numa corrida com a
            // transação de conclusão ainda em voo (2 operações Dexie
            // sequenciais), e o refetch mais simples podia vencer, deixando
            // a tela presa no estado antigo até remontar.
            void recorder.onExit('completed').then(() => {
              if (cancelled) return
              ;(onCompleted ?? onClose)()
            })
            return
          }
          previousState = session.state

          if (session.state === 'playing' && !enteredPlayingFired) {
            enteredPlayingFired = true
            reapplyTrackChoice(session)
            reapplyViewChoice(session)
            onEnteredPlaying?.()
          }

          // 30 s ininterruptos em `playing` zeram a contagem de tentativas (D-003).
          if (session.state === 'playing') {
            playedThisSession = true
            if (stableTimerRef.current === null) {
              stableTimerRef.current = setTimeout(() => {
                stableTimerRef.current = null
                attemptsRef.current = 0
              }, RECONNECT_STABLE_MS)
            }
          } else if (stableTimerRef.current !== null) {
            clearTimeout(stableTimerRef.current)
            stableTimerRef.current = null
          }

          if (session.state === 'error') {
            // Reconexão automática (feature 042, D-003/D-004): só um stream que
            // já tocou (ou que já está numa sequência), com rede e permissão do
            // diagnóstico. Reabre pelo MESMO caminho do "Tentar de novo".
            const diagnosis: PlaybackDiagnosis = diagnosePlayback({
              error: session.error,
              online: navigator.onLine,
              mediaKind: playback.kind,
              engine: session.engine,
              at: Date.now(),
              sourceAccess: sourceAccessRef.current,
            })
            const decision = nextReconnect({
              attempt: attemptsRef.current,
              online: navigator.onLine,
              autoReconnect: (playedThisSession || attemptsRef.current > 0) && diagnosis.autoReconnect,
            })
            if (decision.action === 'retry' && document.visibilityState !== 'hidden') {
              const positionMs = session.progress?.positionMs
              if (playback.kind !== 'channel' && positionMs !== undefined && positionMs > 0) {
                resumeAtRef.current = positionMs
              }
              attemptsRef.current += 1
              setPhase({ kind: 'reconnecting', attempt: attemptsRef.current, max: RECONNECT_DELAYS_MS.length })
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null
                setAttempt((n) => n + 1)
              }, decision.delayMs)
              return
            }
            // O texto sanitizado que o próprio motor/sessão informou vence; sem
            // ele, o desconhecido usa a mensagem da tela ("este canal"/"este
            // filme") e as causas conhecidas usam o texto da tabela de erros.
            const message =
              session.error?.message ?? (diagnosis.category === 'unknown' ? genericErrorMessage : diagnosis.message)
            setPhase({ kind: 'error', message, retryable: true, diagnosis })
            onSessionError?.(message)
            return
          }
          setPhase({ kind: 'session', state: session.state })
        }

        publish()
        session.subscribe(publish)
      } catch (error) {
        // 409 = o item existe mas não é reproduzível (corrida entre listar e
        // reproduzir). Não adianta tentar de novo.
        applyFetchError(error)
      }
    }

    void start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unavailableMessage/genericErrorMessage/startAtMs/onClose/onCompleted são props de configuração, estáveis na prática (não recriam a sessão por si)
  }, [itemId, attempt, createAdapter])

  return {
    phase,
    hardwarePlane,
    // A pessoa assumiu o controle: a contagem automática recomeça (D-003).
    retry: () => {
      attemptsRef.current = 0
      setAttempt((n) => n + 1)
    },
    resumeGate,
    resumeGateRef,
    recheckResume: () => recheckResumeRef.current(),
    sourceIdRef,
  }
}

/**
 * Libera a área do vídeo quando o motor pinta no plano de hardware: enquanto
 * qualquer camada web opaca cobrir essa área, o canal toca sem imagem
 * (bug `live-tv-toca-audio-sem-imagem`). Só nos estados que têm vídeo —
 * em `resolving` e `error` o fundo preto é o que mantém a camada legível.
 * A remoção fica no cleanup, e não no caminho feliz: classe esquecida deixa
 * o app inteiro transparente na TV, falha pior que o bug original.
 */
export function useVideoPlane(showsVideo: boolean): void {
  useEffect(() => {
    if (!showsVideo) return
    const root = document.documentElement
    root.classList.add('video-plane-visible')
    return () => root.classList.remove('video-plane-visible')
  }, [showsVideo])
}

/**
 * `scheduleHide` chamado de dentro de um handler de tecla só vê o estado de
 * ANTES do pedido de pausa — pausar é confirmado de forma assíncrona pelo
 * motor (`onStateChange`), nunca no mesmo tick do SELECT. Sem reagir à
 * confirmação real, um temporizador armado enquanto ainda tocava sobrevive
 * e oculta o chrome mesmo já pausado.
 */
export function useRescheduleOnState(sessionState: PlayerState | null, scheduleHide: () => void): void {
  useEffect(() => {
    if (sessionState === null) return
    scheduleHide()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleHide lê refs estáveis (sessionRef/hideTimerRef); só o valor de sessionState deve reagendar
  }, [sessionState])
}

/**
 * Proteção de tela (feature 020, D-004): desligada enquanto tocando de
 * verdade, religada pelo cleanup em qualquer outra transição — pausar,
 * completar, erro, fechar ou desmontar — sem listar cada uma. O zapping
 * (feature 016) não pausa a sessão do canal por baixo da lista, então isto
 * continua desligado durante o zapping por construção (US1 AC3).
 */
export function useScreenSaverWhilePlaying(isPlaying: boolean): void {
  useEffect(() => {
    if (!isPlaying) return
    disableScreenSaver()
    return () => enableScreenSaver()
  }, [isPlaying])
}
