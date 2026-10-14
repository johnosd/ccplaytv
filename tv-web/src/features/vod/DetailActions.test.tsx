import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DetailIconAction, DetailPrimaryAction } from './DetailActions'
import { findUnnamedControls } from '../../testing/accessibleNames'

// Feature 059, D-002 (`logic/hero-cinema.md` §3–§4): o rótulo é texto direto do elemento focável.

afterEach(() => cleanup())

describe('DetailPrimaryAction', () => {
  it('o rótulo é o próprio elemento focado; com progresso mostra barra e "faltam"', () => {
    render(<DetailPrimaryAction label="▶ Continuar de 42:10" focused progress={{ percent: 33, remainingSeconds: 5150 }} />)
    const primary = screen.getByText('▶ Continuar de 42:10')
    expect(primary.className).toContain('tv-focus')
    expect(primary.className).toContain('vod-detail-action')
    expect(within(primary).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    expect(within(primary).getByText('faltam 1 h 25 min')).toBeInTheDocument()
  })

  it('sem progresso não há barra nem "faltam"', () => {
    render(<DetailPrimaryAction label="▶ Assistir" focused={false} progress={null} />)
    expect(screen.getByText('▶ Assistir').className).not.toContain('tv-focus')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/faltam/)).not.toBeInTheDocument()
  })
})

describe('DetailIconAction', () => {
  it('é um botão com nome acessível; foco e soft-disabled ficam no mesmo elemento do rótulo', () => {
    render(
      <div>
        <DetailIconAction icon="restart" label="↺ Reiniciar" focused />
        <DetailIconAction icon="trailer" label="Trailer — indisponível" focused={false} softDisabled />
      </div>,
    )
    const restart = screen.getByRole('button', { name: '↺ Reiniciar' })
    expect(screen.getByText('↺ Reiniciar')).toBe(restart)
    expect(restart.className).toContain('tv-focus')
    const trailer = screen.getByText('Trailer — indisponível')
    expect(trailer.className).toContain('is-soft-disabled')
    expect(trailer.getAttribute('aria-disabled')).toBe('true')
    expect(findUnnamedControls(document.body).map((found) => found.description)).toEqual([])
  })
})
