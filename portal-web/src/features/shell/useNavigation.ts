import { useCallback, useEffect, useRef, useState } from 'react'
import { parseNav, pushNav, ROOT, sameNav, type NavState } from './navigation'

/** Estado de navegação espelhado no `history` (D-002). `initial` só vale na primeira renderização. */
export function useNavigation(initial: NavState = ROOT) {
  const [state, setState] = useState(initial)
  const current = useRef(state)
  useEffect(() => {
    // Marca a entrada atual para o `popstate` poder voltar a ela.
    window.history.replaceState({ destination: initial.destination, view: initial.view }, '', window.location.pathname + window.location.search)
    const onPop = (event: PopStateEvent) => {
      const restored = parseNav(event.state) ?? ROOT
      if (sameNav(restored, current.current)) return
      current.current = restored
      setState(restored)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const go = useCallback((next: NavState) => {
    if (!pushNav(window.history, window.location, current.current, next)) return
    current.current = next
    setState(next)
  }, [])
  /** Volta uma entrada do histórico (fecha editor/sub-tela); sem entrada anterior, cai na raiz do destino. */
  const back = useCallback((fallback: NavState) => {
    if (window.history.length > 1) window.history.back()
    else { current.current = fallback; setState(fallback) }
  }, [])
  return { state, go, back }
}
