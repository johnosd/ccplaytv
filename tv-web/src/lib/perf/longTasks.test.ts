import { describe, expect, it } from 'vitest'
import { createLongTaskTracker, summarizeLongTasks } from './longTasks'

describe('tarefas longas na janela de medição', () => {
  it('janela limpa devolve `null` — não emite campo nenhum', () => {
    expect(summarizeLongTasks([])).toBeNull()
  })

  // É o número que discrimina a causa: soma (quanto da janela a thread ficou presa) e pior caso (o quadro que a
  // pessoa sente). Arredondados, porque o canal de métricas só leva números e eles vão para evidência.
  it('resume contagem, soma e pior caso', () => {
    expect(summarizeLongTasks([51.4, 900.6, 120])).toEqual({ longTasks: 3, longTaskMs: 1072, longTaskMaxMs: 901 })
  })

  it('sem `PerformanceObserver` o rastreador fica inerte, sem derrubar quem o usa', () => {
    const original = globalThis.PerformanceObserver
    // @ts-expect-error — simula o ambiente sem a API (jsdom, ou navegador sem `longtask`)
    delete globalThis.PerformanceObserver
    try {
      const tracker = createLongTaskTracker()
      expect(tracker.snapshot()).toBeNull()
      expect(() => tracker.dispose()).not.toThrow()
    } finally {
      globalThis.PerformanceObserver = original
    }
  })
})
