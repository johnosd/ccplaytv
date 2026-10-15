import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVirtualFocusSync } from '../lib/focus/useVirtualFocusSync'

export interface RailProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  focusedIndex: number
  /** Largura fixa de cada item, em px — sem medição automática nesta v1 (D-008). */
  itemWidth: number
  /**
   * Altura fixa do trilho, em px. Obrigatória: os itens são posicionados de
   * forma absoluta (virtualização), então sem altura explícita o trilho
   * colapsa a 0 e nada aparece (achado F-001 do converge, R-007).
   */
  itemHeight: number
  /**
   * Feature 060 (D-008): largura do item em `focusedIndex` quando ele é maior que os demais (card que expande no foco do
   * Início). Opcional — sem ela todos os itens têm `itemWidth` e nada muda para as outras telas.
   */
  focusedItemWidth?: number
  /**
   * Feature 060: `'start'` leva o item focado ao início da janela visível (limitado ao fim do trilho). Padrão `'auto'` = o
   * mínimo de rolagem para o item aparecer, como sempre foi.
   */
  align?: 'auto' | 'start'
}

/**
 * Trilho horizontal virtualizado de verdade (feature 022, D-008 do
 * plan.md): reaproveita `@tanstack/react-virtual` na orientação
 * `horizontal` (mesma técnica vertical da feature 009) e
 * `useVirtualFocusSync` (feature 009) pra manter o item logicamente
 * focado sempre montado, sem `ResizeObserver` — quem usa o `Rail` já sabe
 * a largura fixa do seu item.
 */
export function Rail<T>({
  items,
  renderItem,
  focusedIndex,
  itemWidth,
  itemHeight,
  focusedItemWidth,
  align = 'auto',
}: RailProps<T>): ReactNode {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Só o item focado pode ser mais largo (feature 060); sem `focusedItemWidth` é sempre `itemWidth`.
  const widthOf = (index: number): number =>
    focusedItemWidth !== undefined && index === focusedIndex ? focusedItemWidth : itemWidth

  const virtualizer = useVirtualizer({
    count: items.length,
    horizontal: true,
    getScrollElement: () => scrollRef.current,
    estimateSize: widthOf,
    overscan: 3,
  })

  // estimateSize só vale na 1ª medição: se a largura do item muda depois (ex.: "Continue assistindo" abre com pôster alto e vira
  // card largo quando os fundos chegam), as posições guardadas ficam com a largura antiga e os itens se sobrepõem até uma
  // rolagem remedir. Remede quando itemWidth muda.
  useEffect(() => {
    virtualizer.measure()
  }, [itemWidth, virtualizer])

  // Item focado mais largo: remede ANTES de pintar (layout effect), senão um quadro sairia com as posições do foco anterior.
  // `-1` quando a prop não é usada — nenhuma outra tela paga uma medição a mais a cada troca de foco.
  const focusedWidthKey = focusedItemWidth !== undefined ? focusedIndex : -1
  useLayoutEffect(() => {
    if (focusedItemWidth !== undefined) virtualizer.measure()
  }, [focusedItemWidth, focusedWidthKey, virtualizer])

  useVirtualFocusSync({
    focusedIndex,
    scrollToIndex: (index, options) => virtualizer.scrollToIndex(index, align === 'start' ? { ...options, align: 'start' } : options),
    enabled: items.length > 0,
  })

  // Rail sem itens não desenha nada — nem trilho vazio, nem placeholder (FR-016).
  if (items.length === 0) return null

  // Indicador de posição só faz sentido havendo pra onde rolar (edge case: 1 item só).
  const showPosition = items.length > 1
  const progress = showPosition ? focusedIndex / (items.length - 1) : 0

  // Fade só onde há conteúdo além daquela borda (F-003): esquerda com rolagem
  // > 0, direita com itens além da janela — nunca com 1 item só, nem quando
  // tudo cabe. `scrollRect` ainda nulo (antes da 1ª medição) = sem fade.
  const total = virtualizer.getTotalSize()
  const offset = virtualizer.scrollOffset ?? 0
  const viewport = virtualizer.scrollRect?.width ?? 0
  const fadeStart = offset > 0
  const fadeEnd = viewport > 0 && total - offset - viewport > 1
  // Rolagem por foco continua (`overflow-x: auto` em `.rail`, components.css) — só a barra nativa some (feature 028, FR-001).
  const railClass = `rail no-scrollbar${fadeStart ? ' rail--fade-start' : ''}${fadeEnd ? ' rail--fade-end' : ''}`

  return (
    <div className="rail-wrapper">
      <div ref={scrollRef} className={railClass} style={{ height: itemHeight }}>
        <div className="rail-inner" style={{ width: total }}>
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              className="rail-item"
              style={{ width: widthOf(virtualItem.index), transform: `translateX(${virtualItem.start}px)` }}
            >
              {renderItem(items[virtualItem.index], virtualItem.index)}
            </div>
          ))}
        </div>
      </div>
      {showPosition && (
        <div className="rail-position" aria-hidden="true">
          <div className="rail-position-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
    </div>
  )
}
