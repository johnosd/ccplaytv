// Feature 021, Fase 5 (T032) — `useAnnounce`, o caminho pra mensagens sem
// texto visível correspondente (uso futuro: erro acionável, canal
// confirmado). O toast em si já é coberto pelo contrato C4.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { createElement, useState, type ReactNode } from 'react'
import { AnnouncerContext, useAnnounce } from './announcer'

afterEach(cleanup)

function withRegion(children: ReactNode) {
  function Wrapper({ children }: { children: ReactNode }) {
    const [region, setRegion] = useState<HTMLElement | null>(null)
    return createElement(
      AnnouncerContext.Provider,
      { value: region },
      children,
      createElement('div', { ref: setRegion, className: 'announcer-region' }, createElement('span', { className: 'sr-only' })),
    )
  }
  return Wrapper({ children })
}

describe('useAnnounce', () => {
  it('sem região no contexto, não lança', () => {
    const { result } = renderHook(() => useAnnounce())
    expect(() => result.current('mensagem')).not.toThrow()
  })

  it('com região, grava a mensagem no slot .sr-only (após limpar)', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useAnnounce(), {
        wrapper: ({ children }) => withRegion(children) as never,
      })
      const slot = document.querySelector<HTMLElement>('.sr-only')!

      result.current('Conexão restaurada')
      expect(slot.textContent).toBe('') // limpo antes de gravar
      vi.advanceTimersByTime(20)
      expect(slot.textContent).toBe('Conexão restaurada')
    } finally {
      vi.useRealTimers()
    }
  })

  it('repetir a mesma mensagem limpa e regrava (nó muda de conteúdo de novo)', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useAnnounce(), {
        wrapper: ({ children }) => withRegion(children) as never,
      })
      const slot = document.querySelector<HTMLElement>('.sr-only')!

      result.current('Fonte sincronizada')
      vi.advanceTimersByTime(20)
      expect(slot.textContent).toBe('Fonte sincronizada')

      result.current('Fonte sincronizada')
      expect(slot.textContent).toBe('')
      vi.advanceTimersByTime(20)
      expect(slot.textContent).toBe('Fonte sincronizada')
    } finally {
      vi.useRealTimers()
    }
  })

  it('nunca move o foco', () => {
    vi.useFakeTimers()
    try {
      const button = document.createElement('button')
      document.body.appendChild(button)
      button.focus()

      const { result } = renderHook(() => useAnnounce(), {
        wrapper: ({ children }) => withRegion(children) as never,
      })
      result.current('Erro de reprodução')
      vi.advanceTimersByTime(20)

      expect(document.activeElement).toBe(button)
      button.remove()
    } finally {
      vi.useRealTimers()
    }
  })
})
