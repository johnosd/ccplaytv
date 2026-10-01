import type { RefObject } from 'react'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { getComingSoon } from '../../lib/comingSoon'
import type { PlayerServiceSession } from '../../lib/player/PlayerService'
import { hasSeekBar, type PlayerEpisodeStep } from '../chromeControls'
import { GUIDE_UNAVAILABLE_MESSAGE, JUMP_MS, LIMIT_MESSAGE } from './playerMessages'
import type { PanelState, PlayerLayerTopLayer } from './playerLayerTypes'
import type { PlayerChrome } from './usePlayerChrome'
import type { PlayerPanels } from './usePlayerPanels'

export interface PlayerKeyboardParams {
  topLayer: PlayerLayerTopLayer | null | undefined
  isErrorScreen: boolean
  canRetry: boolean
  errorFocus: 0 | 1
  setErrorFocus: (value: 0 | 1) => void
  retry: () => void
  sessionRef: RefObject<PlayerServiceSession | null>
  panelRef: RefObject<PanelState | null>
  chrome: PlayerChrome
  panels: PlayerPanels
  showToast: (message: string) => void
  onClose: () => void
  onIdleSelect: (() => void) | undefined
  onChannelStep: ((direction: 'previous' | 'next') => boolean) | undefined
  onGuide: (() => void) | undefined
  episodeStep: PlayerEpisodeStep | null | undefined
}

/**
 * Teclado da camada de reprodução — UM registro de `useRemoteNav` com
 * `modal: true` (`logic/divisao.md` §1.3). Extraído do `PlayerLayer` na
 * feature 040 sem mudar nada.
 *
 * `modal: true` faz esta camada interceptar a tecla antes da tela por baixo
 * reagir — mesmo padrão do `Modal`. É também o que garante a saída do estado
 * `playing` com o chrome oculto, que por desenho não tem elemento focável
 * (D-010 da feature 003; desvio consciente também na 027): RETURN sempre
 * encerra (ou, no Live com a linha aberta, volta à faixa primeiro).
 */
export function usePlayerKeyboard({
  topLayer,
  isErrorScreen,
  canRetry,
  errorFocus,
  setErrorFocus,
  retry,
  sessionRef,
  panelRef,
  chrome,
  panels,
  showToast,
  onClose,
  onIdleSelect,
  onChannelStep,
  onGuide,
  episodeStep,
}: PlayerKeyboardParams): void {
  const {
    chromeLevelRef,
    chromeMediaRef,
    controlsFor,
    focusedIndexRef,
    playPauseIndexOf,
    revealBand,
    revealFull,
    scheduleHide,
    seekBarFocusedRef,
    setFocused,
    setLevel,
    setSeekBar,
  } = chrome
  const { activatePanelControl, closePanel, handlePanelDirection, handlePanelSelect } = panels

  useRemoteNav(
    {
      onDirection: (dir) => {
        if (topLayer) {
          topLayer.onDirection(dir)
          return
        }
        if (panelRef.current) {
          handlePanelDirection(dir)
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
            // 'band' sozinha (efeito da sessão) — nada a fazer aqui além do aviso.
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
        if (panelRef.current) {
          handlePanelSelect()
          return
        }
        if (isErrorScreen) {
          if (canRetry && errorFocus === 0) {
            setErrorFocus(0)
            retry()
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
          // Linha: OK aciona o controle focado — Áudio e legendas abre o painel
          // (feature 029); os demais são "Em breve" (FR-022).
          const control = controlsFor(session.capabilities, false)[focusedIndexRef.current]
          if (control && activatePanelControl(control, session)) return
          if (control?.id === 'guide') {
            // Feature 031: real quando a tela sabe abrir o guia (`onGuide`); senão só explica.
            if (control.availability === 'real') onGuide?.()
            else showToast(GUIDE_UNAVAILABLE_MESSAGE)
            scheduleHide()
            return
          }
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
        if (activatePanelControl(control, session)) return

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
        // Com um painel aberto as demais teclas de mídia esperam (feature 029).
        if (topLayer) {
          topLayer.onMediaKey?.(key)
          return
        }
        if (isErrorScreen || panelRef.current) return
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
        // RETURN fecha primeiro o painel, depois a linha do Live, depois o player.
        if (panelRef.current) {
          closePanel()
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
}
