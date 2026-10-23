import { describe, expect, it } from 'vitest'
import { createKeyDelayTracker, summarizeKeyDelays } from './keyDelay'
import { sanitizeMetricLine } from './metricsChannel'

describe('o rastreador de atraso por janela (089, T016)', () => {
  it('`snapshot` fecha a janela: a chamada seguinte não repete as teclas já reportadas', () => {
    const tracker = createKeyDelayTracker()
    try {
      tracker.onKey(1000)
      tracker.onKey(1300)
      expect(tracker.snapshot([{ start: 1310, duration: 20 }])).toEqual({ atrasoAte50Ms: 20, atrasoAte50N: 1 })

      // Janela seguinte, nenhuma tecla nova e uma tarefa muito depois: tem de cair em "acima de 300", não repetir a
      // contagem da janela anterior.
      expect(tracker.snapshot([{ start: 5000, duration: 30 }])).toEqual({ atrasoAcima300Ms: 30, atrasoAcima300N: 1 })
    } finally {
      tracker.dispose()
    }
  })

  // Diferença deliberada em relação ao que o `tasks.md` previa ("não reaproveitar a tecla da anterior"): a última
  // tecla da janela fica como SEMENTE. Uma tarefa longa que começa logo no início da janela seguinte foi disparada
  // por ela, e sem a semente viraria `atrasoSemTecla` — inflando de graça a faixa que aponta a causa para a abertura
  // em vez da navegação. Registrado no Registro da Fase 2.
  it('mantém a última tecla como semente, para a tarefa no início da janela seguinte não virar "sem tecla"', () => {
    const tracker = createKeyDelayTracker()
    try {
      tracker.onKey(1000)
      tracker.snapshot([{ start: 1010, duration: 10 }])

      // 20 ms depois da tecla da janela anterior — é dela que esta tarefa veio.
      expect(tracker.snapshot([{ start: 1020, duration: 40 }])).toEqual({ atrasoAte50Ms: 40, atrasoAte50N: 1 })
    } finally {
      tracker.dispose()
    }
  })

  it('sem tarefa longa na janela devolve `null`, mesmo tendo havido teclas', () => {
    const tracker = createKeyDelayTracker()
    try {
      tracker.onKey(1000)
      expect(tracker.snapshot([])).toBeNull()
    } finally {
      tracker.dispose()
    }
  })

  it('`dispose` descarta as teclas, inclusive a semente', () => {
    const tracker = createKeyDelayTracker()
    tracker.onKey(1000)
    tracker.dispose()
    expect(tracker.snapshot([{ start: 1010, duration: 10 }])).toEqual({ atrasoSemTeclaMs: 10, atrasoSemTeclaN: 1 })
  })
})

describe('o que sai no lote de métricas (089, T017)', () => {
  // FR-014 + Constitution "Segredos Fora dos Clientes e dos Logs": o canal descarta chave fora do padrão e valor que
  // não seja número finito. Este teste prova que as chaves de atraso ATRAVESSAM a sanitização — se uma delas não
  // casasse com `KEY_PATTERN`, seria silenciosamente descartada e a medição voltaria vazia da TV.
  it('todas as chaves de atraso sobrevivem à sanitização do canal, como números', () => {
    const resumo = summarizeKeyDelays(
      [
        { start: 1010, duration: 11 },
        { start: 1080, duration: 22 },
        { start: 1200, duration: 33 },
        { start: 1700, duration: 44 },
        { start: 900, duration: 55 },
      ],
      [1000, 1300],
    )
    expect(resumo).not.toBeNull()
    expect(Object.keys(resumo as Record<string, number>)).toHaveLength(10)

    const linha = sanitizeMetricLine({ source: 'frames', ...resumo })
    expect(linha).not.toBeNull()
    for (const [chave, valor] of Object.entries(resumo as Record<string, number>)) {
      expect((linha as Record<string, unknown>)[chave]).toBe(valor)
      expect(typeof valor).toBe('number')
    }
  })
})
