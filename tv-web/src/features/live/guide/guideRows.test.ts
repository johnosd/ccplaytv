import { describe, expect, it } from 'vitest'
import type { EpgLookup } from '../../../lib/epg/types'
import { buildGuideRows, guideBounds, GUIDE_AFTER_MS, GUIDE_BEFORE_MS, GUIDE_SPAN_MS, initialView } from './guideRows'

const at = (hour: number, minute = 0) => new Date(2026, 8, 29, hour, minute, 0, 0).getTime()
const HOUR = 3_600_000

const item = (id: string, epg: string | null) => ({ id, epg_channel_id: epg })
const program = (channelKey: string, start: number, end: number, title: string, description?: string) => ({ channelKey, start, end, title, description })

function lookup(offsetMs = 0): EpgLookup {
  return {
    offsetMs,
    byKey: new Map([
      ['a.br', [program('a.br', at(11), at(12), 'Segundo'), program('a.br', at(10), at(11), 'Primeiro', 'Sinopse')]],
      ['sujo.br', [program('sujo.br', at(10), at(10), 'Sem duração'), program('sujo.br', at(11), at(12), ''), program('sujo.br', at(12), at(13), 'Bom')]],
    ]),
  }
}

describe('buildGuideRows', () => {
  it('uma linha por canal, na ordem recebida; ordena por início e soma o deslocamento da fonte', () => {
    const rows = buildGuideRows([item('1', 'a.br'), item('2', null), item('3', 'nao-existe.br')], lookup(HOUR))

    expect(rows.map((row) => row.channelId)).toEqual(['1', '2', '3'])
    expect(rows[0].programs.map((p) => [p.title, p.start, p.end])).toEqual([
      ['Primeiro', at(11), at(12)],
      ['Segundo', at(12), at(13)],
    ])
    expect(rows[0].programs[0].description).toBe('Sinopse')
    expect(rows[1].programs).toEqual([]) // sem id de EPG: nunca casado por nome
    expect(rows[2].programs).toEqual([]) // id sem programação lida
  })

  it('descarta programa sem título ou sem duração', () => {
    expect(buildGuideRows([item('1', 'sujo.br')], lookup())[0].programs.map((p) => p.title)).toEqual(['Bom'])
  })

  it('sem programação lida ainda (consulta carregando), todas as linhas ficam vazias', () => {
    expect(buildGuideRows([item('1', 'a.br')], undefined)[0].programs).toEqual([])
  })
})

describe('janela do guia', () => {
  it('limites são a janela que a 030 guarda (−12 h … +48 h)', () => {
    expect(guideBounds(at(10))).toEqual({ from: at(10) - GUIDE_BEFORE_MS, to: at(10) + GUIDE_AFTER_MS })
  })

  it('janela inicial: 30 min antes do bloco de meia hora atual, sempre dentro dos limites', () => {
    const bounds = guideBounds(at(10, 45))
    expect(initialView(at(10, 45), bounds)).toEqual({ viewStart: at(10), spanMs: GUIDE_SPAN_MS })
    expect(initialView(at(10, 30), guideBounds(at(10, 30))).viewStart).toBe(at(10))
    // Limite inferior: nunca começa antes do início da janela guardada.
    expect(initialView(at(10), { from: at(9, 45), to: at(20) }).viewStart).toBe(at(9, 45))
  })
})
