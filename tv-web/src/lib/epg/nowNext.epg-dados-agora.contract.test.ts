/**
 * Contrato da feature 030 (EPG — dados e "Agora") — travado em
 * `sdd/specs/030-epg-dados-agora/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { nowAndNext } from './nowNext'
import type { EpgProgram } from './types'

const H = 3_600_000
const at = (hour: number, minute = 0) => Date.UTC(2026, 8, 29, hour, minute, 0)

function program(title: string, start: number, end: number): EpgProgram {
  return { channelKey: 'c', start, end, title }
}

describe('nowAndNext — contrato da feature 030', () => {
  // FR-023 (progresso real), FR-025 ("A seguir"), FR-030 (lacuna/encerrado = vazio), FR-020 (deslocamento sem novo download), edge "sobreposição"
  it('acha agora/a seguir sem inventar: progresso real, lacuna vazia, sobreposição pelo mais recente, deslocamento na leitura', () => {
    const a = program('A', at(10), at(11))
    const b = program('B', at(11), at(12))
    const c = program('C', at(13), at(14)) // lacuna 12:00–13:00

    // Fora de ordem de propósito: a função não pode depender da ordem de entrada.
    const schedule = [c, b, a]

    const inA = nowAndNext(schedule, at(10, 30), 0)
    expect(inA.now).toMatchObject({ title: 'A', start: at(10), end: at(11) })
    expect(inA.now?.progress).toBeCloseTo(0.5, 5)
    expect(inA.next).toMatchObject({ title: 'B', start: at(11), end: at(12) })

    const inGap = nowAndNext(schedule, at(12, 30), 0)
    expect(inGap.now).toBeUndefined()
    expect(inGap.next).toMatchObject({ title: 'C' })

    const afterAll = nowAndNext(schedule, at(15), 0)
    expect(afterAll.now).toBeUndefined()
    expect(afterAll.next).toBeUndefined()

    const overlap = nowAndNext([program('Longo', at(10), at(12)), program('Curto', at(10, 30), at(11, 30))], at(10, 45), 0)
    expect(overlap.now?.title).toBe('Curto')

    // +1 h: às 11:30 do relógio, o programa declarado 10:00–11:00 é o que está no ar, exibido 11:00–12:00.
    const shifted = nowAndNext(schedule, at(11, 30), 1 * H)
    expect(shifted.now).toMatchObject({ title: 'A', start: at(11), end: at(12) })
    expect(shifted.now?.progress).toBeCloseTo(0.5, 5)
    expect(shifted.next).toMatchObject({ title: 'B', start: at(12), end: at(13) })
  })
})
