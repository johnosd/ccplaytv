/**
 * Contrato da feature 048 (paridade visual da Live) — travado em
 * `sdd/specs/048-live-paridade-v14/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { nowAndNext } from './nowNext'
import { upcomingAfterNow, upcomingForChannel } from './upcoming'
import type { EpgLookup, EpgProgram } from './types'

const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 2, hour, minute, 0)
const prog = (start: number, end: number, title: string): EpgProgram => ({ channelKey: 'c', start, end, title })

describe('upcomingAfterNow — contrato da feature 048', () => {
  // FR-009 (até 3, só reais, em ordem), FR-010 (avança com o relógio), SC-003 (min(3, futuros)), FR-020 da 030 (deslocamento só na leitura)
  it('devolve min(3, futuros) em ordem, o 1º igual ao "A seguir" de nowAndNext, com deslocamento e lacuna', () => {
    // Fora de ordem de propósito: a função ordena como nowAndNext.
    const programs = [
      prog(at(13), at(14), 'Quarto'),
      prog(at(10), at(11), 'Atual'),
      prog(at(12), at(13), 'Terceiro'),
      prog(at(11), at(12), 'Segundo'),
      prog(at(14), at(15), 'Quinto'),
    ]

    const now = at(10, 30)
    const upcoming = upcomingAfterNow(programs, now, 0)
    expect(upcoming.map((p) => p.title)).toEqual(['Segundo', 'Terceiro', 'Quarto'])
    expect(upcoming[0]).toEqual(nowAndNext(programs, now, 0).next)

    // Com menos futuros que o limite, só os que existem.
    expect(upcomingAfterNow(programs, at(13, 30), 0).map((p) => p.title)).toEqual(['Quinto'])
    // Janela esgotada: nada, nunca texto inventado.
    expect(upcomingAfterNow(programs, at(15, 30), 0)).toEqual([])

    // Lacuna (nenhum programa agora): os próximos que ainda vão começar.
    const gap = [prog(at(9), at(10), 'Antes'), prog(at(11), at(12), 'Depois da lacuna')]
    expect(upcomingAfterNow(gap, at(10, 30), 0).map((p) => p.title)).toEqual(['Depois da lacuna'])

    // Deslocamento da fonte (+1h): horários deslocados na saída, avaliados contra o relógio.
    const shifted = upcomingAfterNow(programs, at(11, 30), 3_600_000)
    expect(shifted.map((p) => p.title)).toEqual(['Segundo', 'Terceiro', 'Quarto'])
    expect(shifted[0].start).toBe(at(12))

    // Por canal: sem lookup, sem id de EPG ou id desconhecido → vazio.
    const lookup: EpgLookup = { byKey: new Map([['c', programs]]), offsetMs: 0 }
    expect(upcomingForChannel(lookup, 'c', now).map((p) => p.title)).toEqual(['Segundo', 'Terceiro', 'Quarto'])
    expect(upcomingForChannel(undefined, 'c', now)).toEqual([])
    expect(upcomingForChannel(lookup, null, now)).toEqual([])
    expect(upcomingForChannel(lookup, 'outro', now)).toEqual([])
  })
})
