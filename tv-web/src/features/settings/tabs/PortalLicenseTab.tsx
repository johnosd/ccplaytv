import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { PortalLicensePanel, type PortalPanelHandle } from '../PortalLicensePanel'
import { resolveAction, type PortalActionId, type PortalView } from '../portalActions'
import type { SettingsTabProps } from './settingsTab'

/**
 * Teclas de Portal & licença (features 075/076, `logic/avancado-foco.md` §2). A aba é dona da visão (principal ou
 * Avançado) e do foco, que é um **id** de ação — o conjunto de ações vem do painel e muda com a licença, o build, a
 * falha de vínculo e a visão. RETURN na subtela é tratado aqui (`onBack`), antes de a tela sair.
 */
export function PortalLicenseTab({ focused, exitToTabs, goToTopbar, handleRef }: SettingsTabProps) {
  const [{ view, focusedId }, setState] = useState<{ view: PortalView; focusedId?: PortalActionId }>({ view: 'main' })
  const panel = useRef<PortalPanelHandle>(null)
  const setFocus = (id: PortalActionId) => setState(current => ({ ...current, focusedId: id }))
  const setView = (next: PortalView, id: PortalActionId) => setState({ view: next, focusedId: id })
  useEffect(() => {
    if (!focused) return
    const target = document.querySelector('.portal-license-panel .tv-focus, .portal-advanced .tv-focus')
    const handle = panel.current
    if (!target || !handle) return
    // Primeira ação: volta ao topo do painel (mostra o título e o texto). As demais mostram o bloco inteiro do item
    // (título + texto + botão), não só o botão — com `nearest` no botão, o título do item ficava cortado em cima.
    if (handle.actions[0] === resolveAction(handle.actions, handle.initial, focusedId)) target.closest('.settings-panel')?.scrollTo?.({ top: 0 })
    else (target.closest('.portal-advanced-item') ?? target).scrollIntoView?.({ block: 'nearest' })
  }, [focusedId, view, focused])
  useImperativeHandle(handleRef, () => ({
    onEnter: () => setState({ view: 'main', focusedId: panel.current?.mainInitial }),
    onDirection: direction => {
      const handle = panel.current
      if (!handle) return
      const { actions } = handle
      const id = resolveAction(actions, handle.initial, focusedId)
      const position = actions.indexOf(id)
      if (view === 'advanced') {
        // Nas pontas da subtela nada acontece: a saída é Voltar (RETURN ou ←).
        if (direction === 'left') setView('main', 'advanced')
        else if (direction === 'up') setFocus(actions[Math.max(0, position - 1)])
        else if (direction === 'down') setFocus(actions[Math.min(actions.length - 1, position + 1)])
        return
      }
      if (direction === 'up') { if (position <= 0) goToTopbar(); else setFocus(actions[position - 1]) }
      else if (direction === 'down') setFocus(actions[Math.min(actions.length - 1, position + 1)])
      else if (direction === 'left') { if (id === 'refresh') setFocus('purchase'); else exitToTabs() }
      else if (id === 'purchase' && actions.includes('refresh')) setFocus('refresh')
    },
    onSelect: () => {
      const handle = panel.current
      if (handle) handle.activate(resolveAction(handle.actions, handle.initial, focusedId))
    },
    onBack: () => {
      if (view !== 'advanced') return false
      setView('main', 'advanced')
      return true
    },
  }))
  return <PortalLicensePanel view={view} focused={focused} focusedId={focusedId} handleRef={panel} onActionFocus={setFocus} onView={setView} />
}
