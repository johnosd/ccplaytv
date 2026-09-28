import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { MOVIE_WATCHED_RATIO } from '../lib/player/resumePolicy'
import { disableScreenSaver, enableScreenSaver } from '../lib/player/screenSaver'
import { clamp, useRemoteNav } from '../lib/useRemoteNav'
import { useToast } from '../lib/useToast'
import { getComingSoon } from '../lib/comingSoon'
import { Toast } from './Toast'
import { PlayerChrome } from './PlayerChrome'
import {
  chromeControls,
  hasSeekBar,
  type ChromeEpisodeNeighbors,
  type ChromeMedia,
  type PlayerEpisodeStep,
  type PlayerIdentity,
} from './chromeControls'

export type { PlayerIdentity, PlayerEpisodeStep }

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

export interface PlayerLayerTopLayer {
  /** Árvore React a desenhar por cima do vídeo, dentro do próprio
   *  `.player-overlay` deste componente — nunca como filho de `.screen` por
   *  fora, ou a regra de `visibility:hidden` do plano de hardware (player.css,
   *  seletor `:root.video-plane-visible .screen > *:not(.player-overlay)`)
   *  a esconde. */
  content: ReactNode
  onDirection: (direction: 'up' | 'down' | 'left' | 'right') => void
  onSelect: () => void
  /** RETURN com esta camada aberta — fecha só ELA. Nunca dispara `onClose`
   *  do player inteiro. */
  onBack: () => void
  /**
   * Opcional (feature 016, edge case da spec): segurar OK sobre um item
   * favoritável desta camada continua favoritando/desfavoritando (feature
   * 013), sem conflito com o toque curto que aciona `onSelect` — mesmo
   * gesto por tempo de tecla já usado no resto do app. `undefined` quando
   * não há item focável pra favoritar (ex.: foco na trilha de categorias) —
   * nesse caso o OK age direto no keydown, como toque comum.
   */
  onLongSelect?: () => void
  /** Mesmo gesto de `onLongSelect`, via a tecla amarela do controle (feature 013). */
  onFavoriteKey?: () => void
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

  /** `null`/ausente (padrão): comportamento de sempre. Não-nulo: PlayerLayer
   *  desenha `content` por cima do vídeo e redireciona onDirection/onSelect/
   *  onBack do seu modal para os handlers daqui, em vez do comportamento
   *  padrão de controles de reprodução. */
  topLayer?: PlayerLayerTopLayer | null

  /** SELECT chega aqui em vez de "revelar controles" quando `topLayer` é
   *  `null` E o canal está na faixa/oculto (feature 027: OK na faixa do
   *  Live abre o zapping — antes, era "sem nenhuma ação de controle").
   *  Ausente: SELECT nesse caso continua só revelando a faixa vazia —
   *  Filmes/Séries não passam isto, comportamento inalterado (FR-013). */
  onIdleSelect?: () => void

  /** Dispara na primeira vez que a sessão ATUAL (a do `itemId`/`attempt`
   *  correntes) atinge `state === 'playing'`. Não dispara de novo por
   *  rebuffering do mesmo item. */
  onEnteredPlaying?: () => void

  /** Dispara quando a sessão ATUAL cai em erro — ADEMAIS do desenho padrão
   *  da tela de erro nativa do PlayerLayer (que só fica de fato visível
   *  quando `topLayer` for `null`; com `topLayer` aberto, o scrim+conteúdo
   *  do zapping cobre a tela de erro por trás dela). Mensagem já sanitizada
   *  (a mesma que a tela de erro nativa usaria). */
  onSessionError?: (message: string) => void

  /**
   * Feature 027: identidade exibida no chrome V14. Ausente: o chrome usa
   * `title`. `channelNumber`/`logoUrl` só fazem sentido no canal; `subtitle`
   * no episódio (`T1:E2 • Nome`).
   */
  identity?: PlayerIdentity

  /**
   * Feature 027: ↑/↓/CH± no canal. Devolve `true` se trocou (a tela mudou
   * `itemId`) ou `false` no limite da lista — sem volta ao início (FR-011).
   * Ausente: ↑/↓ só revelam a faixa (sem trocar nada).
   */
  onChannelStep?: (direction: 'previous' | 'next') => boolean

  /**
   * Feature 027: anterior/próximo episódio. Ausente (filme, ou episódio
   * aberto de fora do detalhe da série): sem botões de episódio.
   */
  episodeStep?: PlayerEpisodeStep | null
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
  // O ícone de play/pause no chrome já comunica o estado — sem texto extra.
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

const LIMIT_MESSAGE = {
  channel: { previous: 'Este é o primeiro canal desta lista.', next: 'Este é o último canal desta lista.' },
  episode: { previous: 'Este é o primeiro episódio disponível.', next: 'Este é o último episódio disponível.' },
} as const

/**
 * Nível do chrome (feature 027, `logic/chrome-player.md` §3). VOD só usa
 * `hidden`/`full` (o comportamento da 011 preservado); Live usa os três —
 * `band` é a faixa de identidade sem nenhum controle focável, `full` é a
 * linha de controles revelada por ←/→.
 */
type ChromeLevel = 'hidden' | 'band' | 'full'

/**
 * Camada de reprodução em tela cheia — compartilhada entre Live TV, Filmes e
 * Séries (feature 011; antes vivia só em `features/live/PlayerOverlay.tsx`).
 *
 * É uma **camada**, não uma tela do roteador, de propósito: a tela de baixo
 * continua montada, então o foco e a posição sobrevivem sem precisar
 * carregar estado de foco no histórico de navegação do `App` (plano da spec
 * 003, D-005).
 *
 * `modal: true` no `useRemoteNav` faz esta camada interceptar a tecla antes
 * da tela por baixo reagir — mesmo padrão do `Modal`. É também o que
 * garante a saída do estado `playing` com o chrome oculto, que por desenho
 * não tem elemento focável (D-010 da feature 003; desvio consciente também
 * nesta feature — ver Complexity Tracking do `plan.md` da 027): RETURN
 * sempre encerra (ou, no Live com a linha aberta, volta à faixa primeiro).
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
  topLayer,
  onIdleSelect,
  onEnteredPlaying,
  onSessionError,
  identity,
  onChannelStep,
  episodeStep,
}: PlayerLayerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'resolving' })
  const [errorFocus, setErrorFocus] = useState<0 | 1>(0)
  const [attempt, setAttempt] = useState(0)
  const [hardwarePlane, setHardwarePlane] = useState(false)
  const sessionRef = useRef<PlayerServiceSession | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recorderRef = useRef<ProgressRecorder | null>(null)
  const { toastMessage, toastKey, showToast } = useToast()

  /**
   * Nível/mídia/foco do chrome vivem em REFS, não em `useState` — mesmo
   * motivo de `sessionRef.current.state` (comentário de `scheduleHide`
   * abaixo): `sessionRef.current` é mutado SINCRONAMENTE assim que a sessão
   * nasce, mas `chromeMedia`/`chromeLevel` só chegariam ao closure que
   * `useRemoteNav` usa (`handlersRef.current`) depois de um commit React —
   * uma tecla que chegasse nesse intervalo (achado real: os testes de
   * zapping da 016/018 reproduziam isso) leria a sessão nova com o nível/
   * mídia ainda default ('vod'/'full'), executando a ação errada. Refs são
   * lidas OUTRO turno, sem esperar re-render — `rerender()` só força o
   * commit que atualiza o que a tela DESENHA (as refs já são a fonte da
   * verdade também durante o próprio render, abaixo).
   */
  const chromeMediaRef = useRef<ChromeMedia>('vod')
  const chromeLevelRef = useRef<ChromeLevel>('full')
  const focusedIndexRef = useRef(0)
  const seekBarFocusedRef = useRef(false)
  const [, setRenderTick] = useState(0)

  function rerender() {
    setRenderTick((n) => n + 1)
  }
  function setMedia(value: ChromeMedia) {
    chromeMediaRef.current = value
    rerender()
  }
  function setLevel(value: ChromeLevel) {
    chromeLevelRef.current = value
    rerender()
  }
  function setFocused(value: number) {
    focusedIndexRef.current = value
    rerender()
  }
  function setSeekBar(value: boolean) {
    seekBarFocusedRef.current = value
    rerender()
  }

  function clearHideTimer() {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  /** Vizinhança de episódio no formato que `chromeControls` espera, ou `null` (filme, ou episódio sem `episodeStep`). */
  function episodeNeighborsOf(): ChromeEpisodeNeighbors | null {
    return episodeStep ? { hasPrevious: episodeStep.hasPrevious, hasNext: episodeStep.hasNext } : null
  }

  /** Linha de controles da mídia/nível atuais (`logic/chrome-player.md` §2). */
  function controlsFor(capabilities: PlayerCapabilities, paused: boolean) {
    return chromeControls(chromeMediaRef.current, capabilities, paused, episodeNeighborsOf())
  }

  /**
   * O foco inicial do VOD, ao revelar, é sempre o play/pause (`logic/
   * chrome-player.md` §3) — nunca um índice fixo, porque a ordem de
   * `chromeControls` muda com `episodeStep` (episódio anterior entra antes).
   * `paused` não afeta a posição do id na lista, só o rótulo — por isso
   * sempre `false` aqui.
   */
  function playPauseIndexOf(capabilities: PlayerCapabilities): number {
    const idx = chromeControls('vod', capabilities, false, episodeNeighborsOf()).findIndex((c) => c.id === 'playPause')
    return idx === -1 ? 0 : idx
  }

  /**
   * Reinicia o temporizador de ocultar. Lê `sessionRef.current.state`
   * diretamente (não o `phase` do React) porque pausar é síncrono nos dois
   * adaptadores — o `state` do objeto de sessão já reflete "paused" antes do
   * próximo render, e o temporizador não pode se basear num valor que só
   * atualiza depois (closure de `phase` ficaria um passo atrás).
   *
   * D-015 (feature 027): diferente de antes, não sai mais cedo quando não
   * há nenhuma ação de capacidade — o Live sempre tem ao menos os mocks
   * "Em breve" na linha (ou só a faixa, sem linha nenhuma), e os dois também
   * escondem sozinhos depois de 5s.
   */
  function scheduleHide() {
    clearHideTimer()
    // Não oculta enquanto pausado: a pessoa parou de propósito e precisa ver
    // os controles pra retomar. Live nunca chega a `paused` de verdade (sem
    // capacidade de pausa), então esta guarda nunca o afeta.
    if (sessionRef.current?.state === 'paused') return
    hideTimerRef.current = setTimeout(() => setLevel('hidden'), HIDE_CONTROLS_MS)
  }

  /** Revela o nível "full" (VOD: a linha inteira; Live: faixa + linha) com o foco inicial de cada mídia. */
  function revealFull() {
    setLevel('full')
    seekBarFocusedRef.current = false
    if (chromeMediaRef.current === 'vod' && sessionRef.current) {
      setFocused(playPauseIndexOf(sessionRef.current.capabilities))
    } else {
      setFocused(0) // Live: linha sempre começa no primeiro controle (Guia)
    }
    scheduleHide()
  }

  /** Live apenas: garante a faixa visível (nunca fecha a linha se ela já estava aberta). */
  function revealBand() {
    if (chromeLevelRef.current === 'hidden') setLevel('band')
    scheduleHide()
  }

  useEffect(() => {
    let cancelled = false

    function teardown() {
      document.removeEventListener('visibilitychange', onVisibilityChange)
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

    /** Mesma lógica do `catch` de `start()` — reaproveitada pela revalidação
     *  de `onVisibilityChange` (D-003) pra nunca duplicar a distinção
     *  409/`unavailableMessage` de outros erros/`genericErrorMessage`. */
    function applyFetchError(error: unknown) {
      if (cancelled) return
      const unavailable = error instanceof CatalogApiError && error.status === 409
      setPhase({
        kind: 'error',
        message: unavailable ? unavailableMessage : genericErrorMessage,
        retryable: !unavailable,
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
      void fetchPlayback(itemId).catch(applyFetchError)
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
        // resolve as capacidades desta sessão (motor ∩ mídia, D-001) e a
        // mídia do chrome (feature 027, D-001 do plano da 027).
        const media: ChromeMedia = playback.kind === 'channel' ? 'live' : 'vod'
        const session = createPlayerSession(playback.url, FULLSCREEN_REGION, playback.kind, {
          createAdapter,
          startAtMs,
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
            onEnteredPlaying?.()
          }

          if (session.state === 'error') {
            setPhase({
              kind: 'error',
              message: session.error?.message ?? genericErrorMessage,
              retryable: true,
            })
            onSessionError?.(session.error?.message ?? genericErrorMessage)
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
  // e oculta o chrome mesmo já pausado.
  const sessionState = phase.kind === 'session' ? phase.state : null
  useEffect(() => {
    if (sessionState === null) return
    scheduleHide()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleHide lê refs estáveis (sessionRef/hideTimerRef); só o valor de sessionState deve reagendar
  }, [sessionState])

  // Proteção de tela (feature 020, D-004): desligada enquanto tocando de
  // verdade, religada pelo cleanup em qualquer outra transição — pausar,
  // completar, erro, fechar ou desmontar — sem listar cada uma. O zapping
  // (feature 016) não pausa a sessão do canal por baixo da lista, então isto
  // continua desligado durante o zapping por construção (US1 AC3).
  const isPlaying = sessionState === 'playing'
  useEffect(() => {
    if (!isPlaying) return
    disableScreenSaver()
    return () => enableScreenSaver()
  }, [isPlaying])

  useRemoteNav(
    {
      onDirection: (dir) => {
        if (topLayer) {
          topLayer.onDirection(dir)
          return
        }
        if (isErrorScreen) {
          if (!canRetry) return
          if (dir === 'left') setErrorFocus(0)
          if (dir === 'right') setErrorFocus(1)
          return
        }
        const session = sessionRef.current
        if (!session) return

        if (chromeMediaRef.current === 'live') {
          if (dir === 'up' || dir === 'down') {
            // ↑/↓ trocam de canal mesmo com a faixa oculta, e revelam-na
            // (FR-010) — inclusive quando a troca falha no limite (FR-011):
            // a pessoa vê o aviso sobre o canal que já estava tocando.
            if (chromeLevelRef.current === 'hidden') setLevel('band')
            const moved = onChannelStep?.(dir === 'up' ? 'previous' : 'next')
            // Sucesso: a troca de `itemId` já reconstrói a sessão e volta a
            // 'band' sozinha (efeito acima) — nada a fazer aqui além do aviso.
            if (moved === false) showToast(LIMIT_MESSAGE.channel[dir === 'up' ? 'previous' : 'next'])
            scheduleHide()
            return
          }
          if (dir === 'left' || dir === 'right') {
            if (chromeLevelRef.current !== 'full') {
              revealFull()
              return
            }
            const controls = controlsFor(session.capabilities, false)
            setFocused(clamp(focusedIndexRef.current + (dir === 'right' ? 1 : -1), 0, controls.length - 1))
            scheduleHide()
          }
          return
        }

        // VOD (filme/episódio) — comportamento da 011 preservado (FR-002).
        const paused = session.state === 'paused'

        if (chromeLevelRef.current !== 'full') {
          // Ocultos: esquerda/direita SALTAM e revelam; cima/baixo só revelam.
          if (dir === 'left') {
            session.jumpBy(-JUMP_MS)
            revealFull()
            return
          }
          if (dir === 'right') {
            session.jumpBy(JUMP_MS)
            revealFull()
            return
          }
          revealFull()
          return
        }

        if (seekBarFocusedRef.current) {
          // Com a barra focada, esquerda/direita buscam direto, sem mover o
          // foco — segurar acumula na porta single-flight do motor, não
          // aqui (R-019: acumular NESTE nível é que travava o app).
          if (dir === 'left') session.jumpBy(-JUMP_MS)
          else if (dir === 'right') session.jumpBy(JUMP_MS)
          else if (dir === 'down') {
            setSeekBar(false)
            setFocused(playPauseIndexOf(session.capabilities))
          }
          // cima: já está no topo, nada a fazer além de reafirmar "visível".
          scheduleHide()
          return
        }

        const controls = controlsFor(session.capabilities, paused)
        if (dir === 'left') {
          setFocused(clamp(focusedIndexRef.current - 1, 0, controls.length - 1))
        } else if (dir === 'right') {
          setFocused(clamp(focusedIndexRef.current + 1, 0, controls.length - 1))
        } else if (dir === 'up' && session.capabilities.canSeek && hasSeekBar(session.capabilities, session.progress)) {
          setSeekBar(true)
        }
        scheduleHide()
      },
      onSelect: () => {
        if (topLayer) {
          topLayer.onSelect()
          return
        }
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

        if (chromeMediaRef.current === 'live') {
          if (chromeLevelRef.current !== 'full') {
            // Faixa (ou oculto): OK abre a lista de zapping da 016 (FR-013/FR-034a).
            onIdleSelect?.()
            return
          }
          // Linha: OK aciona o controle focado — todos "Em breve" no Live (FR-022).
          const control = controlsFor(session.capabilities, false)[focusedIndexRef.current]
          if (control?.availability === 'soon' && control.comingSoonId) {
            showToast(`Em breve — ${getComingSoon(control.comingSoonId).message}`)
          }
          scheduleHide()
          return
        }

        // VOD
        if (chromeLevelRef.current !== 'full') {
          revealFull()
          return
        }
        if (seekBarFocusedRef.current) {
          // Sem ação em SELECT — o gesto dela é esquerda/direita, não OK.
          scheduleHide()
          return
        }

        const paused = session.state === 'paused'
        const control = controlsFor(session.capabilities, paused)[focusedIndexRef.current]
        if (!control) return

        if (control.id === 'playPause') session.togglePause()
        else if (control.id === 'jumpBack') session.jumpBy(-JUMP_MS)
        else if (control.id === 'jumpForward') session.jumpBy(JUMP_MS)
        else if (control.id === 'episodePrevious' || control.id === 'episodeNext') {
          const direction = control.id === 'episodePrevious' ? 'previous' : 'next'
          if (control.availability === 'real') episodeStep?.onStep(direction)
          else showToast(LIMIT_MESSAGE.episode[direction])
        } else if (control.availability === 'soon' && control.comingSoonId) {
          showToast(`Em breve — ${getComingSoon(control.comingSoonId).message}`)
        }
        scheduleHide()
      },
      onMediaKey: (key) => {
        // Sem sessão (ainda resolvendo), com erro, ou com o zapping aberto:
        // só Stop age — fecha o player inteiro (`logic/chrome-player.md` §5).
        if (key === 'MediaStop') {
          onClose()
          return
        }
        if (topLayer || isErrorScreen) return
        const session = sessionRef.current
        if (!session || session.state === 'idle' || session.state === 'preparing') return

        if (chromeMediaRef.current === 'live') {
          if (key === 'ChannelUp' || key === 'ChannelDown') {
            if (chromeLevelRef.current === 'hidden') setLevel('band')
            const moved = onChannelStep?.(key === 'ChannelUp' ? 'previous' : 'next')
            if (moved === false) {
              showToast(LIMIT_MESSAGE.channel[key === 'ChannelUp' ? 'previous' : 'next'])
            }
            scheduleHide()
            return
          }
          // Play/Pause/Play/Pause/Rewind/FastForward no canal: só revelam a faixa (FR-028).
          revealBand()
          return
        }

        // VOD
        if (key === 'ChannelUp' || key === 'ChannelDown') return // ignoradas (FR-027)

        if (key === 'MediaPlayPause') {
          session.togglePause() // já no-op sem canPause (mesma porta que o SELECT usa)
          revealFull()
          return
        }
        if (key === 'MediaPlay') {
          if (session.state === 'paused') session.togglePause() // idempotente: só age se estava pausado
          revealFull()
          return
        }
        if (key === 'MediaPause') {
          if (session.state === 'playing' || session.state === 'buffering') session.togglePause()
          revealFull()
          return
        }
        if (key === 'MediaRewind') {
          if (session.capabilities.canSeek) session.jumpBy(-JUMP_MS)
          revealFull()
          return
        }
        if (key === 'MediaFastForward') {
          if (session.capabilities.canSeek) session.jumpBy(JUMP_MS)
          revealFull()
        }
      },
      // RETURN: no VOD (ou na faixa/oculto do Live) encerra de qualquer
      // estado — inclusive de `playing`, que não tem elemento focável com o
      // chrome oculto (D-010 da feature 003). Na linha do Live, só volta à
      // faixa (FR-034b) — nunca fecha o player.
      onBack: () => {
        if (topLayer) {
          topLayer.onBack()
          return
        }
        if (!isErrorScreen && chromeMediaRef.current === 'live' && chromeLevelRef.current === 'full') {
          setLevel('band')
          scheduleHide()
          return
        }
        onClose()
      },
      // Repassados só quando `topLayer` os define (feature 016) — sem
      // `topLayer`, `undefined` preserva o comportamento legado de sempre
      // (OK sem gesto, agindo no keydown).
      onLongSelect: topLayer?.onLongSelect,
      onFavoriteKey: topLayer?.onFavoriteKey,
    },
    { modal: true },
  )

  const label = phase.kind === 'resolving' ? 'Preparando…' : (phase.kind === 'session' ? STATE_LABEL[phase.state] : '')
  const session = sessionRef.current
  const paused = phase.kind === 'session' && phase.state === 'paused'
  const chromeMedia = chromeMediaRef.current
  const chromeLevel = chromeLevelRef.current
  const chromeVisible = !topLayer && !isErrorScreen && session !== null && phase.kind === 'session' && chromeLevel !== 'hidden'

  return (
    <div className="player-overlay" role="dialog" aria-label={isErrorScreen ? 'Erro de reprodução' : `Reproduzindo ${title}`}>
      {/* O adaptador de desenvolvimento monta o <video> aqui. O AVPlay não usa
          este nó: ele desenha num plano de hardware atrás da camada web. */}
      <div id="player-surface" className="player-surface" />
      {isErrorScreen ? (
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
      ) : (
        <>
          {label !== '' && (
            <div className="player-status">
              <div className="player-status-channel">{title}</div>
              <div className="player-status-label">{label}</div>
            </div>
          )}
          {chromeVisible && session && (
            <PlayerChrome
              media={chromeMedia}
              identity={identity ?? { title }}
              paused={paused}
              controls={
                chromeMedia === 'live'
                  ? chromeLevel === 'full'
                    ? controlsFor(session.capabilities, false)
                    : []
                  : controlsFor(session.capabilities, paused)
              }
              focusedIndex={chromeLevel === 'full' && !seekBarFocusedRef.current ? focusedIndexRef.current : null}
              capabilities={session.capabilities}
              progress={session.progress}
              seekBarFocused={chromeMedia === 'vod' && seekBarFocusedRef.current}
            />
          )}
        </>
      )}
      <Toast message={toastMessage} messageKey={toastKey} />
      {topLayer && (
        <div className="player-zap-scrim">{topLayer.content}</div>
      )}
    </div>
  )
}
