import { useRef, useState, type RefObject } from 'react'
import type { PlayerCapabilities, PlayerServiceSession } from '../../lib/player/PlayerService'
import {
  chromeControls,
  type ChromeControl,
  type ChromeEpisodeNeighbors,
  type ChromeMedia,
  type PlayerEpisodeStep,
} from '../chromeControls'
import { HIDE_CONTROLS_MS } from './playerMessages'
import type { ChromeLevel, PanelState } from './playerLayerTypes'

export interface PlayerChromeParams {
  sessionRef: RefObject<PlayerServiceSession | null>
  panelRef: RefObject<PanelState | null>
  episodeStep: PlayerEpisodeStep | null | undefined
  onGuide: (() => void) | undefined
}

export interface PlayerChrome {
  chromeMediaRef: RefObject<ChromeMedia>
  chromeLevelRef: RefObject<ChromeLevel>
  focusedIndexRef: RefObject<number>
  seekBarFocusedRef: RefObject<boolean>
  rerender: () => void
  setMedia: (value: ChromeMedia) => void
  setLevel: (value: ChromeLevel) => void
  setFocused: (value: number) => void
  setSeekBar: (value: boolean) => void
  clearHideTimer: () => void
  controlsFor: (capabilities: PlayerCapabilities, paused: boolean) => ChromeControl[]
  playPauseIndexOf: (capabilities: PlayerCapabilities) => number
  scheduleHide: () => void
  revealFull: () => void
  revealBand: () => void
}

/**
 * Chrome do player (feature 027): nível, mídia, foco, barra de busca e o
 * auto-ocultar. Extraído do `PlayerLayer` na feature 040 sem mudar nada —
 * `sessionRef`/`panelRef` chegam como os próprios objetos ref
 * (`logic/divisao.md` §1.1).
 */
export function usePlayerChrome({ sessionRef, panelRef, episodeStep, onGuide }: PlayerChromeParams): PlayerChrome {
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
   * verdade também durante o próprio render).
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
    const session = sessionRef.current
    return chromeControls(chromeMediaRef.current, capabilities, paused, episodeNeighborsOf(), {
      tracks: session?.supportsTracks ?? false,
      info: session?.supportsStreamInfo ?? false,
      guide: onGuide !== undefined,
    })
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
    // Com um painel aberto o chrome nem é desenhado; quem fecha o painel
    // reagenda (feature 029).
    if (panelRef.current) return
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

  return {
    chromeMediaRef,
    chromeLevelRef,
    focusedIndexRef,
    seekBarFocusedRef,
    rerender,
    setMedia,
    setLevel,
    setFocused,
    setSeekBar,
    clearHideTimer,
    controlsFor,
    playPauseIndexOf,
    scheduleHide,
    revealFull,
    revealBand,
  }
}
