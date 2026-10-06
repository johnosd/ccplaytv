/**
 * Contrato da feature 061 (classificação indicativa e nota TMDB) — travado em
 * `sdd/specs/061-classificacao-nota-tmdb/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/classificacao-e-nota.md` §3.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetAppLanguageForTests, writeAppLanguage } from '../lib/i18n/appLanguage'
import { ContentRatingBadge } from './ContentRatingBadge'

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
})

describe('ContentRatingBadge — contrato da feature 061', () => {
  // FR-004, FR-005, FR-016, SC-003, SC-005, US1/AC2+AC4; Constitution: "IA e Classificação Nunca Inventam Dados" e "Foco Visível e Sem Becos Sem Saída"
  it('mostra só a classificação do país do idioma, com nome acessível; troca na hora com o idioma; sem valor daquele país não mostra nada (nunca o de outro país)', () => {
    const { container, rerender } = render(<ContentRatingBadge certifications={{ BR: '14', US: 'R' }} />)

    // pt → Brasil.
    const br = screen.getByLabelText('Classificação indicativa: 14 anos')
    expect(br).toHaveTextContent('14')
    expect(container).not.toHaveTextContent('R')
    // Só apresentação: nada focável.
    expect(container.querySelector('button, a, input, [tabindex]')).toBeNull()

    // en → EUA, sem remontar e sem outra fonte de dado.
    act(() => {
      writeAppLanguage('en')
    })
    rerender(<ContentRatingBadge certifications={{ BR: '14', US: 'R' }} />)
    expect(screen.getByLabelText('Content rating: R')).toHaveTextContent('R')
    expect(container).not.toHaveTextContent('14')

    // es → Espanha, que não tem valor: nada, nem a do Brasil, nem a dos EUA.
    act(() => {
      writeAppLanguage('es')
    })
    rerender(<ContentRatingBadge certifications={{ BR: '14', US: 'R' }} />)
    expect(container).toBeEmptyDOMElement()

    // Sem classificações guardadas: nada.
    rerender(<ContentRatingBadge certifications={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
