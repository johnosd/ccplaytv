/**
 * Contrato da feature 031 (EPG — Guia completo) — travado em
 * `sdd/specs/031-epg-guia-completo/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Todos os horários são construídos em horário LOCAL (`new Date(y, m, d, …)`):
 * "hoje/amanhã" e as marcas de hora são do relógio local do aparelho, então o
 * teste não pode depender do fuso da máquina que o roda.
 */
import { describe, expect, it } from 'vitest'
import {
  blocksInView,
  dayOfTime,
  jumpToDay,
  moveHorizontal,
  moveVertical,
  scrollForFocus,
  tickTimes,
  type GuideProgram,
  type GuideRow,
} from './guideGrid'

const at = (hour: number, minute = 0, dayOffset = 0) => new Date(2026, 8, 29 + dayOffset, hour, minute, 0, 0).getTime()
const prog = (start: number, end: number, title: string): GuideProgram => ({ start, end, title })

const A: GuideRow = {
  channelId: 'A',
  programs: [
    prog(at(10), at(11), 'A1'),
    prog(at(11), at(12), 'A2'),
    // lacuna 12:00–13:00
    prog(at(13), at(14), 'A3'),
    prog(at(7, 0, 1), at(8, 0, 1), 'A-amanha'),
  ],
}
const B: GuideRow = { channelId: 'B', programs: [prog(at(10, 30), at(11, 30), 'B1'), prog(at(11, 30), at(12, 30), 'B2')] }
const C: GuideRow = { channelId: 'C', programs: [] } // canal sem EPG
const ROWS = [A, B, C]

describe('guideGrid — contrato da feature 031', () => {
  // US2/AC1-AC2, FR-014, FR-015, FR-016, FR-004, edge "lacuna", edge "lista de canais sem EPG", edge "meia-noite"
  it('navega por programa e por canal mantendo a hora de referência, e as abas Hoje/Amanhã saltam de dia', () => {
    // ←/→: por programa, pulando lacuna, saturando nas pontas; linha sem EPG não muda.
    expect(moveHorizontal(A, { channelId: 'A', programStart: at(11) }, 'right')).toEqual({ channelId: 'A', programStart: at(13) })
    expect(moveHorizontal(A, { channelId: 'A', programStart: at(13) }, 'left')).toEqual({ channelId: 'A', programStart: at(11) })
    expect(moveHorizontal(A, { channelId: 'A', programStart: at(10) }, 'left')).toEqual({ channelId: 'A', programStart: at(10) })
    expect(moveHorizontal(C, { channelId: 'C', programStart: null }, 'right')).toEqual({ channelId: 'C', programStart: null })

    // ↑/↓: o bloco do canal vizinho que COBRE a hora de referência (e não o mesmo índice)…
    expect(moveVertical(ROWS, { channelId: 'A', programStart: at(11) }, at(11, 15), 'down')).toEqual({ channelId: 'B', programStart: at(10, 30) })
    // …ou, numa lacuna, o mais próximo.
    expect(moveVertical(ROWS, { channelId: 'A', programStart: at(13) }, at(13, 10), 'down')).toEqual({ channelId: 'B', programStart: at(11, 30) })
    // Canal sem EPG: o bloco vazio é alcançável (a linha não é pulada) e devolve o foco à linha de cima.
    expect(moveVertical(ROWS, { channelId: 'B', programStart: at(10, 30) }, at(10, 45), 'down')).toEqual({ channelId: 'C', programStart: null })
    expect(moveVertical(ROWS, { channelId: 'C', programStart: null }, at(11), 'up')).toEqual({ channelId: 'B', programStart: at(10, 30) })
    // Bordas da lista: nada de volta ao início.
    expect(moveVertical(ROWS, { channelId: 'A', programStart: at(10) }, at(10, 5), 'up')).toBeNull()
    expect(moveVertical(ROWS, { channelId: 'C', programStart: null }, at(11), 'down')).toBeNull()

    // Dia local da hora focada (a aba ativa) — e a virada da meia-noite: 23:59 é hoje, 00:00 é amanhã.
    const now = at(11, 30)
    expect(dayOfTime(at(23, 59), now)).toBe('today')
    expect(dayOfTime(at(0, 0, 1), now)).toBe('tomorrow')
    expect(dayOfTime(at(0, 0, 2), now)).toBeNull()
    // Se "agora" cruza a meia-noite, "hoje" passa a ser o dia novo.
    expect(dayOfTime(at(0, 5, 1), at(0, 1, 1))).toBe('today')

    // Abas: Hoje → o que cobre agora; Amanhã → 1º programa depois da meia-noite local. Linha vazia só muda a hora.
    expect(jumpToDay(A, 'today', now)).toEqual({ focus: { channelId: 'A', programStart: at(11) }, refTime: now })
    expect(jumpToDay(A, 'tomorrow', now)).toEqual({ focus: { channelId: 'A', programStart: at(7, 0, 1) }, refTime: at(0, 0, 1) })
    expect(jumpToDay(C, 'tomorrow', now)).toEqual({ focus: { channelId: 'C', programStart: null }, refTime: at(0, 0, 1) })
  })

  // US1/AC2, FR-001, FR-003, FR-014, edge "programa curto", edge "cortado na borda"
  it('a grade é proporcional e recortada na janela, e a rolagem mantém o foco visível dentro dos limites', () => {
    const view = { viewStart: at(10), spanMs: 2 * 3_600_000 } // 10:00–12:00
    const row: GuideRow = {
      channelId: 'A',
      programs: [
        prog(at(9, 30), at(10, 30), 'antes'), // começa antes da janela: cortado na esquerda
        prog(at(10, 30), at(11, 30), 'meio'),
        prog(at(11, 30), at(13), 'depois'), // termina depois: cortado na direita
        prog(at(13), at(14), 'fora'), // fora da janela: nem existe
      ],
    }
    const blocks = blocksInView(row, view).map((block) => ({ title: block.program.title, left: block.leftPct, width: block.widthPct }))
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ title: 'antes', left: 0, width: 25 })
    expect(blocks[1]).toEqual({ title: 'meio', left: 25, width: 50 })
    expect(blocks[2]).toEqual({ title: 'depois', left: 75, width: 25 })
    // Largura proporcional à duração, mesmo para um programa de 3 minutos (o mínimo legível é CSS, não do modelo).
    expect(blocksInView({ channelId: 'A', programs: [prog(at(10), at(10, 3), 'curto')] }, view)[0].widthPct).toBeCloseTo(2.5, 5)

    const bounds = { from: at(0), to: at(23, 59) }
    expect(scrollForFocus(view, prog(at(10, 30), at(11), 'x'), bounds)).toEqual(view) // já visível: não mexe
    expect(scrollForFocus(view, prog(at(9), at(9, 30), 'x'), bounds).viewStart).toBe(at(9)) // à esquerda: alinha no início dele
    expect(scrollForFocus(view, prog(at(12, 30), at(13), 'x'), bounds).viewStart).toBe(at(11)) // à direita: o fim encosta na borda
    expect(scrollForFocus(view, prog(at(9), at(15), 'x'), bounds).viewStart).toBe(at(9)) // maior que a janela: alinha no início
    // Nunca além da janela guardada (FR-003): mesmo pedindo um programa que "termina" depois do limite.
    expect(scrollForFocus(view, prog(at(23, 40), at(23, 59), 'x'), bounds).viewStart).toBe(at(23, 59) - view.spanMs)

    // Marcas de hora: de 30 em 30 min, no horário local, dentro da janela.
    expect(tickTimes(view)).toEqual([at(10), at(10, 30), at(11), at(11, 30)])
  })
})
