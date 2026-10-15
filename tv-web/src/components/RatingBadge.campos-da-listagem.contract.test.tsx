/**
 * Teste de CONTRATO da feature 055 — selo da nota do provedor. Travado em
 * `sdd/specs/055-campos-da-listagem-xtream/contract-tests.lock`. O sdd-execute só pode fazê-lo passar,
 * nunca editá-lo.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { RatingBadge } from './RatingBadge'

afterEach(cleanup)

describe('RatingBadge — contrato da feature 055', () => {
  // FR-004, FR-005, FR-009, US1/AC1, US1/AC4 · Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('card: "★ 7,4" com uma casa e vírgula (pt), sem o rótulo de origem e sem nada focável', () => {
    const { container } = render(<RatingBadge value={7.4} />)
    expect(container).toHaveTextContent('★')
    expect(container).toHaveTextContent('7,4')
    expect(container).not.toHaveTextContent('Provedor')

    // Inteiro também mostra uma casa.
    cleanup()
    const whole = render(<RatingBadge value={8} />)
    expect(whole.container).toHaveTextContent('8,0')

    // Selo é só apresentação: nada que o controle remoto possa focar.
    expect(whole.container.querySelector('button, a, input, [tabindex]')).toBeNull()
  })

  // FR-003, FR-004, FR-006, FR-014, US1/AC2-AC3 · Constitution: "IA e Classificação Nunca Inventam Dados"
  it('hero/detalhe: com origem mostra "Provedor" (nunca IMDb/TMDB); sem nota válida não renderiza nada, nem "0" nem "sem nota"', () => {
    const { container } = render(<RatingBadge value={7.4} showSource />)
    expect(container).toHaveTextContent('7,4')
    expect(container).toHaveTextContent('Provedor')
    expect(container).not.toHaveTextContent(/imdb|tmdb/i)

    for (const invalid of [undefined, null, 0, -1, 11, Number.NaN]) {
      cleanup()
      const empty = render(<RatingBadge value={invalid} showSource />)
      expect(empty.container, `value ${String(invalid)} não deveria renderizar`).toBeEmptyDOMElement()
    }
  })
})
