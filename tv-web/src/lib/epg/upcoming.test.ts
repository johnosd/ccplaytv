import { describe, expect, it } from 'vitest'
import { upcomingAfterNow, upcomingForChannel } from './upcoming'
import type { EpgLookup, EpgProgram } from './types'

const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 2, hour, minute, 0)
const prog = (start: number, end: number, title: string, description?: string): EpgProgram => {
  const p: EpgProgram = { channelKey: 'c', start, end, title }
  if (description !== undefined) p.description = description
  return p
}

describe('upcomingAfterNow', () => {
  const programs = [
    prog(at(10), at(11), 'A'),
    prog(at(11), at(12), 'B'),
    prog(at(12), at(13), 'C'),
    prog(at(13), at(14), 'D'),
  ]

  it('respeita um limit diferente de 3', () => {
    expect(upcomingAfterNow(programs, at(10, 30), 0, 1).map((p) => p.title)).toEqual(['B'])
    expect(upcomingAfterNow(programs, at(10, 30), 0, 2).map((p) => p.title)).toEqual(['B', 'C'])
    expect(upcomingAfterNow(programs, at(10, 30), 0, 0)).toEqual([])
  })

  it('programa que começa exatamente no fim do atual entra', () => {
    expect(upcomingAfterNow(programs, at(10, 59), 0).map((p) => p.title)).toEqual(['B', 'C', 'D'])
  })

  it('sobreposição segue a regra de nowAndNext: vale o que começou por último', () => {
    const overlap = [prog(at(10), at(12), 'Longo'), prog(at(11), at(11, 30), 'Curto'), prog(at(12), at(13), 'Depois')]
    expect(upcomingAfterNow(overlap, at(11, 10), 0).map((p) => p.title)).toEqual(['Depois'])
  })

  it('preserva a description quando definida e não cria o campo quando ausente', () => {
    const withDesc = [prog(at(10), at(11), 'A'), prog(at(11), at(12), 'B', 'Sinopse'), prog(at(12), at(13), 'C')]
    const [b, c] = upcomingAfterNow(withDesc, at(10, 30), 0)
    expect(b.description).toBe('Sinopse')
    expect('description' in c).toBe(false)
  })
})

describe('upcomingForChannel', () => {
  it('aplica o deslocamento do lookup', () => {
    const lookup: EpgLookup = {
      byKey: new Map([['c', [prog(at(10), at(11), 'A'), prog(at(11), at(12), 'B')]]]),
      offsetMs: 3_600_000,
    }
    const result = upcomingForChannel(lookup, 'c', at(11, 30))
    expect(result.map((p) => p.title)).toEqual(['B'])
    expect(result[0].start).toBe(at(12))
  })
})
