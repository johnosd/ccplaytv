import { describe, expect, it } from 'vitest'
import { attributeLongTasks, type SpanInterval } from './longTaskAttribution'

describe('atribuição das tarefas longas por etapa (088, T025)', () => {
  it('devolve `null` quando a janela não teve tarefa longa', () => {
    expect(attributeLongTasks([], [{ name: 'tecla', start: 0, end: 10 }])).toBeNull()
  })

  it('a soma das partes fecha com a duração total — "fora" é medida, não resíduo', () => {
    // Uma tarefa de 100 ms: 10 ms dentro de `tecla`, 50 ms dentro de `render`, 40 ms sem dono.
    const spans: SpanInterval[] = [
      { name: 'tecla', start: 1000, end: 1010 },
      { name: 'render', start: 1000, end: 1060 },
    ]
    const r = attributeLongTasks([{ start: 1000, duration: 100 }], spans)
    expect(r).toEqual({ ltTeclaMs: 10, ltRenderMs: 50, ltForaMs: 40, ltForaN: 1, ltForaMax: 40 })
    expect((r!.ltTeclaMs ?? 0) + (r!.ltRenderMs ?? 0) + (r!.ltForaMs ?? 0)).toBe(100)
  })

  it('`tecla` tem precedência sobre `render`: o ms disputado não é contado duas vezes', () => {
    // `tecla` roda DENTRO de `render` (abre no mesmo keydown). Sem precedência, 20 ms viriam como 40.
    const r = attributeLongTasks([{ start: 0, duration: 20 }], [
      { name: 'render', start: 0, end: 20 },
      { name: 'tecla', start: 0, end: 20 },
    ])
    expect(r).toEqual({ ltTeclaMs: 20 })
  })

  it('duas amostras sobrepostas da MESMA etapa contam uma vez só', () => {
    const r = attributeLongTasks([{ start: 0, duration: 100 }], [
      { name: 'render', start: 0, end: 60 },
      { name: 'render', start: 30, end: 80 },
    ])
    expect(r).toEqual({ ltRenderMs: 80, ltForaMs: 20, ltForaN: 1, ltForaMax: 20 })
  })

  it('etapa fora da tarefa não é creditada, e `ltForaMax` é a pior tarefa sem dono', () => {
    const spans: SpanInterval[] = [{ name: 'render', start: 5000, end: 9000 }]
    const r = attributeLongTasks([{ start: 0, duration: 300 }, { start: 1000, duration: 700 }], spans)
    expect(r).toEqual({ ltForaMs: 1000, ltForaN: 2, ltForaMax: 700 })
  })

  it('tarefa inteiramente dentro de uma etapa não produz `ltFora*`', () => {
    const r = attributeLongTasks([{ start: 100, duration: 80 }], [{ name: 'render', start: 90, end: 200 }])
    expect(r).toEqual({ ltRenderMs: 80 })
  })
})
