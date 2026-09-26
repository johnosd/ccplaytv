import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useScrollFocusedIntoView } from './useScrollFocusedIntoView'

describe('useScrollFocusedIntoView (achado feature 009, Cenário B — trilha de categorias sem virtualização)', () => {
  it('rola o elemento anexado pra dentro da área visível quando a dependência muda', () => {
    const { result, rerender } = renderHook(({ dep }: { dep: number }) => useScrollFocusedIntoView<HTMLButtonElement>(dep), {
      initialProps: { dep: 0 },
    })

    const node = document.createElement('button')
    const scrollIntoView = vi.fn()
    node.scrollIntoView = scrollIntoView
    // Simula o React anexando o ref ao nó focado.
    ;(result.current as { current: HTMLButtonElement | null }).current = node

    rerender({ dep: 1 })

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  })

  it('sem nó anexado (nenhum item focado ainda), não lança', () => {
    const { rerender } = renderHook(({ dep }: { dep: number }) => useScrollFocusedIntoView<HTMLButtonElement>(dep), {
      initialProps: { dep: 0 },
    })

    expect(() => rerender({ dep: 1 })).not.toThrow()
  })
})
