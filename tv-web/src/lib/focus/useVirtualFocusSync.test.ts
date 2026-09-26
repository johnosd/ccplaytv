import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useVirtualFocusSync } from './useVirtualFocusSync'

describe('useVirtualFocusSync (feature 009, logic/virtualizacao-foco.md §2)', () => {
  it('desloca o virtualizador para o índice focado ao montar e a cada mudança', () => {
    const scrollToIndex = vi.fn()
    const { rerender } = renderHook(
      ({ focusedIndex }) => useVirtualFocusSync({ focusedIndex, scrollToIndex, enabled: true }),
      { initialProps: { focusedIndex: 0 } },
    )

    expect(scrollToIndex).toHaveBeenCalledWith(0, { align: 'auto' })

    rerender({ focusedIndex: 42 })

    expect(scrollToIndex).toHaveBeenCalledWith(42, { align: 'auto' })
    expect(scrollToIndex).toHaveBeenCalledTimes(2)
  })

  it('não desloca quando desabilitado (categoria carregando/com erro/sem itens)', () => {
    const scrollToIndex = vi.fn()
    renderHook(() => useVirtualFocusSync({ focusedIndex: 5, scrollToIndex, enabled: false }))

    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('não rearma o deslocamento só porque scrollToIndex mudou de identidade — só o índice importa', () => {
    const scrollToIndex1 = vi.fn()
    const scrollToIndex2 = vi.fn()
    const { rerender } = renderHook(
      ({ scrollToIndex }) => useVirtualFocusSync({ focusedIndex: 3, scrollToIndex, enabled: true }),
      { initialProps: { scrollToIndex: scrollToIndex1 } },
    )
    expect(scrollToIndex1).toHaveBeenCalledTimes(1)

    // Um virtualizador recriado a cada render (identidade nova de scrollToIndex)
    // não pode disparar um novo scrollToIndex sem o índice ter mudado de fato.
    rerender({ scrollToIndex: scrollToIndex2 })

    expect(scrollToIndex2).not.toHaveBeenCalled()
  })
})
