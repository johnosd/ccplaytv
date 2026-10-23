/**
 * O que os contratos travados não cobrem: o rastreador compartilhado fora do build de medição.
 *
 * Existe por causa do R-002 do plano: instrumentar o manipulador de tecla acrescenta trabalho no caminho mais quente
 * do app. Se a medição não fosse inerte no pacote normal, ela alteraria justamente o que mede.
 */
import { describe, expect, it } from 'vitest'
import { beginSharedSpan, snapshotSharedSpans } from './phaseSpans'

describe('rastreador compartilhado de etapas', () => {
  it('fora do build de medição não cria nada: abrir e fechar não gera amostra', () => {
    // `VITE_CCPLAY_PERF` não está ligado no ambiente de teste — é o mesmo caso do pacote normal.
    const fechar = beginSharedSpan('tecla')
    expect(() => fechar()).not.toThrow()
    expect(snapshotSharedSpans()).toBeNull()
  })
})
