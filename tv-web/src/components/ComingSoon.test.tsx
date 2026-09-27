import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, useState, type ReactNode } from 'react'
import { AnnouncerContext } from '../lib/announcer'
import { ComingSoon } from './ComingSoon'

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
  return createElement(Wrapper, null, children)
}

describe('ComingSoon', () => {
  it('renderiza a mensagem do registro', () => {
    render(<ComingSoon id="exemplo-onda-2" />)
    expect(screen.getByText('Esta função ainda não foi construída.')).toBeInTheDocument()
  })

  it('ativar sem onSelect já produz o anúncio "Em breve" (FR-035 cumprido só pelo componente)', () => {
    vi.useFakeTimers()
    try {
      render(withRegion(<ComingSoon id="exemplo-onda-2" />))
      fireEvent.click(screen.getByRole('button'))
      vi.advanceTimersByTime(20)
      const slot = document.querySelector<HTMLElement>('.sr-only')!
      expect(slot.textContent).toBe('Em breve — Esta função ainda não foi construída.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('com onSelect fornecido, ele também dispara', () => {
    const onSelect = vi.fn()
    render(<ComingSoon id="exemplo-onda-2" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
