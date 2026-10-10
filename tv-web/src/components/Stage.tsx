import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { computeStageLayout } from '../lib/stage'
import { isEditableTarget } from '../lib/useRemoteNav'

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

    // Última viewport aplicada. Com um campo de texto em edição, uma janela que só perdeu altura é o teclado da TV
    // (IME) subindo: reescalar encolheria a tela inteira enquanto a pessoa digita. O palco fica como está e o teclado
    // cobre a parte de baixo — os campos de busca ficam no topo (ad-hoc 2026-10-09).
    let applied: { width: number; height: number } | null = null

    function applyLayout() {
      const keyboardOpening =
        applied !== null &&
        isEditableTarget(document.activeElement) &&
        window.innerWidth === applied.width &&
        window.innerHeight < applied.height
      if (keyboardOpening) return
      applied = { width: window.innerWidth, height: window.innerHeight }
      const { transform, scale, offsetX } = computeStageLayout(window.innerWidth, window.innerHeight)
      // Janela mais larga que 16:9 (ex.: navegador no desktop): em vez de faixas pretas nas laterais, o palco
      // se estica na horizontal até a borda (largura lógica = viewport / escala) e fica colado à esquerda. Em
      // 16:9 (a TV) `offsetX` é 0 e nada muda; mais estreita que 16:9 mantém o letterbox vertical.
      if (offsetX > 0) {
        node!.style.width = `${window.innerWidth / scale}px`
        node!.style.setProperty('--stage-width', `${window.innerWidth / scale}px`)
        node!.style.transform = `scale(${scale})`
        return
      }
      node!.style.removeProperty('width')
      node!.style.removeProperty('--stage-width')
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
