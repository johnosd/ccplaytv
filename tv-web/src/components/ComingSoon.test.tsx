import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, useState, type ReactNode } from 'react'
import { AnnouncerContext } from '../lib/announcer'
import { COMING_SOON } from '../lib/comingSoon'
import { ComingSoon } from './ComingSoon'

const FIXTURE_ID = 'fixture-teste'
const FIXTURE_MESSAGE = 'Esta função ainda não foi construída.'

beforeEach(() => {
  COMING_SOON[FIXTURE_ID] = { message: FIXTURE_MESSAGE, backlogItem: 99 }
})

afterEach(() => {
  delete COMING_SOON[FIXTURE_ID]
  cleanup()
})

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
    render(<ComingSoon id={FIXTURE_ID} />)
    expect(screen.getByText(FIXTURE_MESSAGE)).toBeInTheDocument()
  })

  it('ativar sem onSelect já produz o anúncio "Em breve" (FR-035 cumprido só pelo componente)', () => {
    vi.useFakeTimers()
    try {
      render(withRegion(<ComingSoon id={FIXTURE_ID} />))
      fireEvent.click(screen.getByRole('button'))
      vi.advanceTimersByTime(20)
      const slot = document.querySelector<HTMLElement>('.sr-only')!
      expect(slot.textContent).toBe(`Em breve — ${FIXTURE_MESSAGE}`)
    } finally {
      vi.useRealTimers()
    }
  })

  it('com onSelect fornecido, ele também dispara', () => {
    const onSelect = vi.fn()
    render(<ComingSoon id={FIXTURE_ID} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('focused aplica .tv-focus, e o botão continua nativo e focável', () => {
    const { rerender } = render(<ComingSoon id={FIXTURE_ID} />)
    const button = screen.getByRole('button')
    expect(button).not.toHaveClass('tv-focus')
    rerender(<ComingSoon id={FIXTURE_ID} focused />)
    expect(button).toHaveClass('tv-focus')
    expect(button).toHaveClass('is-soft-disabled')
    button.focus()
    expect(document.activeElement).toBe(button)
  })
})
