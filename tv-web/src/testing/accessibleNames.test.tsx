/**
 * Casos adicionais de `findUnnamedControls` (feature 028), fora da trava de
 * contrato — cobertura complementar às regras de `logic/nomes-acessiveis.md`.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { findUnnamedControls } from './accessibleNames'

afterEach(() => {
  cleanup()
})

describe('findUnnamedControls — casos adicionais', () => {
  it('a[href] sem texto conta como sem nome', () => {
    const { container } = render(<a href="#x" />)
    expect(findUnnamedControls(container).map((f) => f.reason)).toEqual(['no-name'])
  })

  it('select sem rótulo conta como sem nome', () => {
    const { container } = render(
      <select>
        <option>Um</option>
      </select>,
    )
    expect(findUnnamedControls(container).map((f) => f.reason)).toEqual(['no-name'])
  })

  it('role="option" sem nome é apontado', () => {
    const { container } = render(<div role="option" />)
    expect(findUnnamedControls(container).map((f) => f.reason)).toEqual(['no-name'])
  })

  it('aria-label só com espaços conta como sem nome (trim)', () => {
    const { container } = render(<button aria-label="   " type="button" />)
    expect(findUnnamedControls(container).map((f) => f.reason)).toEqual(['no-name'])
  })

  it('"Indisponivel" sem acento também anuncia a indisponibilidade', () => {
    const { container } = render(
      <button type="button" className="is-soft-disabled">
        Ação Indisponivel
      </button>,
    )
    expect(findUnnamedControls(container)).toEqual([])
  })

  it('controle nomeado, sem soft/hard disabled, nunca aparece', () => {
    const { container } = render(<button type="button">Assistir</button>)
    expect(findUnnamedControls(container)).toEqual([])
  })

  it('[tabindex="-1"] nunca é considerado interativo', () => {
    const { container } = render(<div tabIndex={-1} />)
    expect(findUnnamedControls(container)).toEqual([])
  })
})
