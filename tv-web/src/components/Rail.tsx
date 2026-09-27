import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVirtualFocusSync } from '../lib/focus/useVirtualFocusSync'

export interface RailProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  focusedIndex: number
  /** Largura fixa de cada item, em px — sem medição automática nesta v1 (D-008). */
  itemWidth: number
}

/**
 * Trilho horizontal virtualizado de verdade (feature 022, D-008 do
 * plan.md): reaproveita `@tanstack/react-virtual` na orientação
 * `horizontal` (mesma técnica vertical da feature 009) e
 * `useVirtualFocusSync` (feature 009) pra manter o item logicamente
 * focado sempre montado, sem `ResizeObserver` — quem usa o `Rail` já sabe
 * a largura fixa do seu item.
 */
export function Rail<T>({ items, renderItem, focusedIndex, itemWidth }: RailProps<T>): ReactNode {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    horizontal: true,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => itemWidth,
    overscan: 3,
  })

  useVirtualFocusSync({
    focusedIndex,
    scrollToIndex: virtualizer.scrollToIndex,
    enabled: items.length > 0,
  })

  // Rail sem itens não desenha nada — nem trilho vazio, nem placeholder (FR-016).
  if (items.length === 0) return null

  // Indicador de posição só faz sentido havendo pra onde rolar (edge case: 1 item só).
  const showPosition = items.length > 1
  const progress = showPosition ? focusedIndex / (items.length - 1) : 0

  return (
    <div className="rail-wrapper">
      <div ref={scrollRef} className="rail">
        <div className="rail-inner" style={{ width: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              className="rail-item"
              style={{ width: itemWidth, transform: `translateX(${virtualItem.start}px)` }}
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
