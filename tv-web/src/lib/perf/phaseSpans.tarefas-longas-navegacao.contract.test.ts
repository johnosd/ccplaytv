// Contratos da feature 088 — travados pelo sdd-plan; o sdd-execute só pode fazê-los passar, nunca editá-los.
import { describe, expect, it } from 'vitest'
import { createPhaseSpanTracker, summarizeSpans } from './phaseSpans'

describe('atribuição por etapa do caminho de navegação (088)', () => {
  // FR-012 + Constitution "Segredos Fora dos Clientes e dos Logs": o que sai da TV é só número, em chaves de um
  // conjunto FECHADO. Um nome de etapa livre (ou um campo extra) é o caminho por onde nome de item vazaria.
  it('agrega por etapa em chaves planas do conjunto fechado, arredondadas, e devolve `null` sem amostra', () => {
    expect(summarizeSpans([])).toBeNull()

    const resumo = summarizeSpans([['tecla', 12.4], ['render', 80.6], ['tecla', 7.1], ['capa', 3]])
    expect(resumo).toEqual({
      teclaN: 2, teclaMs: 20, teclaMax: 12,
      renderN: 1, renderMs: 81, renderMax: 81,
      capaN: 1, capaMs: 3, capaMax: 3,
    })
    // Nada além do conjunto fechado: nenhuma chave inventada, nenhum valor que não seja número finito.
    for (const [chave, valor] of Object.entries(resumo as Record<string, number>)) {
      expect(chave).toMatch(/^(tecla|render|capa)(N|Ms|Max)$/)
      expect(Number.isFinite(valor)).toBe(true)
    }
  })

  // O caso traiçoeiro: o fechamento é uma função devolvida, e no caminho de navegação ela será chamada de `finally`,
  // de cleanup de efeito e de caminho de erro. Contar duas vezes inflaria a atribuição e mandaria a feature otimizar
  // a etapa errada — pior que não medir.
  it('fechar o mesmo intervalo duas vezes conta uma só', () => {
    const tracker = createPhaseSpanTracker()
    try {
      const fechar = tracker.begin('tecla')
      fechar()
      fechar()
      const resumo = tracker.snapshot()
      expect(resumo?.teclaN).toBe(1)
    } finally {
      tracker.dispose()
    }
  })

  // A agregação é POR JANELA (o mesmo formato do `longTasks.ts`, emitido a cada ~5 s): se o `snapshot` não zerasse, a
  // janela seguinte repetiria as amostras da anterior e o número cresceria sozinho.
  it('`snapshot` zera a janela: a chamada seguinte não repete o que já foi reportado', () => {
    const tracker = createPhaseSpanTracker()
    try {
      tracker.begin('render')()
      expect(tracker.snapshot()?.renderN).toBe(1)
      expect(tracker.snapshot()).toBeNull()

      tracker.begin('capa')()
      const segunda = tracker.snapshot()
      expect(segunda?.capaN).toBe(1)
      expect(segunda?.renderN).toBeUndefined()
    } finally {
      tracker.dispose()
    }
  })
})
