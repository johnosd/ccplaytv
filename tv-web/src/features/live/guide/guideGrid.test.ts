import { describe, expect, it } from 'vitest'
import {
  blocksInView,
  initialFocus,
  jumpToDay,
  moveHorizontal,
  moveVertical,
  programCovering,
  programNearest,
  scrollForFocus,
  tickTimes,
  type GuideProgram,
  type GuideRow,
} from './guideGrid'

const at = (hour: number, minute = 0, dayOffset = 0) => new Date(2026, 8, 29 + dayOffset, hour, minute, 0, 0).getTime()
const prog = (start: number, end: number, title: string): GuideProgram => ({ start, end, title })

describe('programCovering / programNearest', () => {
  const row: GuideRow = { channelId: 'A', programs: [prog(at(10), at(11), 'A1'), prog(at(12), at(13), 'A2')] }

  it('cobre pelo intervalo semiaberto [início, fim)', () => {
    expect(programCovering(row, at(10))?.title).toBe('A1')
    expect(programCovering(row, at(10, 59))?.title).toBe('A1')
    expect(programCovering(row, at(11))).toBeUndefined() // o fim não pertence ao programa
    expect(programCovering(row, at(11, 30))).toBeUndefined()
  })

  it('com sobreposição, vale o que começou por último', () => {
    const overlapped: GuideRow = { channelId: 'A', programs: [prog(at(10), at(12), 'longo'), prog(at(10, 30), at(11, 30), 'curto')] }
    expect(programCovering(overlapped, at(10, 45))?.title).toBe('curto')
  })

  it('numa lacuna, o mais próximo; no empate, o anterior; linha vazia, nada', () => {
    expect(programNearest(row, at(11, 20))?.title).toBe('A1') // 20 min do fim de A1 vs 40 min do início de A2
    expect(programNearest(row, at(11, 40))?.title).toBe('A2')
    expect(programNearest(row, at(11, 30))?.title).toBe('A1') // empate exato: o anterior
    expect(programNearest({ channelId: 'C', programs: [] }, at(11))).toBeUndefined()
  })

  it('initialFocus: programa atual, ou o bloco vazio numa linha sem EPG', () => {
    expect(initialFocus(row, at(10, 30))).toEqual({ channelId: 'A', programStart: at(10) })
    expect(initialFocus({ channelId: 'C', programs: [] }, at(10, 30))).toEqual({ channelId: 'C', programStart: null })
  })
})

describe('moveHorizontal — foco cujo programa sumiu', () => {
  it('reancora no programa mais próximo do início antigo em vez de ficar sem foco', () => {
    const row: GuideRow = { channelId: 'A', programs: [prog(at(10), at(11), 'A1'), prog(at(12), at(13), 'A2')] }
    expect(moveHorizontal(row, { channelId: 'A', programStart: at(11, 45) }, 'right')).toEqual({ channelId: 'A', programStart: at(12) })
  })
})

describe('moveVertical', () => {
  const rows: GuideRow[] = [
    { channelId: 'A', programs: [prog(at(10), at(11), 'A1')] },
    { channelId: 'B', programs: [prog(at(10), at(12), 'B1')] },
    { channelId: 'C', programs: [] },
    { channelId: 'D', programs: [prog(at(9), at(10), 'D1')] },
  ]

  it('atravessa uma linha sem EPG sem perder a hora de referência', () => {
    const viaC = moveVertical(rows, { channelId: 'B', programStart: at(10) }, at(10, 30), 'down')
    expect(viaC).toEqual({ channelId: 'C', programStart: null })
    expect(moveVertical(rows, viaC!, at(10, 30), 'down')).toEqual({ channelId: 'D', programStart: at(9) }) // o mais próximo de 10:30
  })

  it('foco de canal que não está mais na lista → null (quem chama trata)', () => {
    expect(moveVertical(rows, { channelId: 'X', programStart: null }, at(10), 'down')).toBeNull()
  })
})

describe('jumpToDay — programa que atravessa a meia-noite', () => {
  it('Amanhã escolhe o programa que ainda está no ar depois da meia-noite', () => {
    const row: GuideRow = {
      channelId: 'A',
      programs: [prog(at(22), at(1, 0, 1), 'madrugada'), prog(at(1, 0, 1), at(6, 0, 1), 'depois')],
    }
    expect(jumpToDay(row, 'tomorrow', at(11)).focus.programStart).toBe(at(22))
  })
})

describe('scrollForFocus / blocksInView / tickTimes', () => {
  const view = { viewStart: at(10), spanMs: 2 * 3_600_000 }

  it('nunca passa dos limites, mesmo quando a janela guardada é menor que a visível', () => {
    const tiny = { from: at(10), to: at(10, 30) }
    expect(scrollForFocus(view, prog(at(10, 10), at(10, 20), 'x'), tiny).viewStart).toBe(at(10))
  })

  it('devolve o mesmo objeto quando nada muda (não força re-render)', () => {
    expect(scrollForFocus(view, prog(at(10, 30), at(11), 'x'), { from: at(0), to: at(23) })).toBe(view)
  })

  it('programa de 0 largura útil (início = fim dentro da janela) não vira bloco de largura negativa', () => {
    const blocks = blocksInView({ channelId: 'A', programs: [prog(at(11), at(11, 1), 'x')] }, view)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].widthPct).toBeGreaterThan(0)
  })

  it('marcas de hora começam na próxima meia hora quando a janela começa no meio de uma', () => {
    expect(tickTimes({ viewStart: at(10, 10), spanMs: 3_600_000 })).toEqual([at(10, 30), at(11)])
  })
})
