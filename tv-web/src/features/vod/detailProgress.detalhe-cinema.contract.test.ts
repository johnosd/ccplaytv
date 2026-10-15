/**
 * Contrato da feature 059 (detalhe Cinema) — travado em
 * `sdd/specs/059-detalhe-cinema-filme-serie/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/hero-cinema.md` §3.
 */
import { describe, expect, it } from 'vitest'
import { primaryProgress } from './detailProgress'

describe('primaryProgress — contrato da feature 059', () => {
  // FR-007, SC-003; Constitution: "Progresso e Capacidades São Reais, Nunca Prometidos"
  it('só há progresso com posição de retomada válida E duração conhecida; percentual inteiro entre 1 e 99 e o restante em segundos', () => {
    expect(primaryProgress(2530, 7680)).toEqual({ percent: 33, remainingSeconds: 5150 })
    expect(primaryProgress(1200, 2400)).toEqual({ percent: 50, remainingSeconds: 1200 })
    expect(primaryProgress(40, 7680)).toEqual({ percent: 1, remainingSeconds: 7640 })
    expect(primaryProgress(7679, 7680)).toEqual({ percent: 99, remainingSeconds: 1 })

    expect(primaryProgress(2530, undefined)).toBeNull()
    expect(primaryProgress(2530, null)).toBeNull()
    expect(primaryProgress(2530, 0)).toBeNull()
    expect(primaryProgress(undefined, 7680)).toBeNull()
    expect(primaryProgress(null, 7680)).toBeNull()
    expect(primaryProgress(10, 7680)).toBeNull() // abaixo do mínimo de retomada: não há "Continuar"
    expect(primaryProgress(7680, 7680)).toBeNull()
    expect(primaryProgress(9000, 7680)).toBeNull()
  })
})
