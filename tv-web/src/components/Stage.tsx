import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { computeStageLayout } from '../lib/stage'

export interface StageProps {
  children: ReactNode
}

/**
 * Palco lógico 1920×1080 escalado uniformemente pra caber na viewport,
 * centralizado (DS V14 §4.1, feature 021, D-003 do plan.md).
 *
 * Recalcula só o `style.transform` do próprio nó no `resize` — nunca
 * remonta os filhos, então o foco atual (`document.activeElement`) e o
 * estado de qualquer tela sobrevivem à mudança de viewport (FR-011).
 */
export function Stage({ children }: StageProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    function applyLayout() {
      const { transform } = computeStageLayout(window.innerWidth, window.innerHeight)
      if (transform) node!.style.transform = transform
      else node!.style.removeProperty('transform')
    }

    applyLayout()
    window.addEventListener('resize', applyLayout)
    return () => window.removeEventListener('resize', applyLayout)
  }, [])

  return (
    <div ref={ref} className="stage">
      {children}
    </div>
  )
}
