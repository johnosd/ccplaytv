// Contratos da feature 089 — travados pelo sdd-plan; o sdd-execute só pode fazê-los passar, nunca editá-los.
import { describe, expect, it } from 'vitest'
import { summarizeKeyDelays } from './keyDelay'

describe('atraso das tarefas longas desde a última tecla (089)', () => {
  // FR-002 + logic/atraso-e-sonda.md §1: é esta separação que distingue trabalho disparado pela navegação (e tardio)
  // de trabalho independente dela. Sem ela a feature não tem alvo, e a 088 provou que escolher alvo por intuição
  // produz conclusão falsa.
  it('separa por faixa de atraso, e a soma dos ms fecha com a duração total', () => {
    expect(summarizeKeyDelays([], [1000])).toBeNull()

    // Teclas em 1000 e 1300 (a cadência da sonda é 300 ms). Uma tarefa por faixa:
    const resumo = summarizeKeyDelays(
      [
        { start: 1010, duration: 40 }, //   10 ms depois da tecla → faixa 0–50
        { start: 1080, duration: 60 }, //   80 ms depois         → faixa 50–150
        { start: 1200, duration: 70 }, //  200 ms depois         → faixa 150–300
        { start: 1700, duration: 90 }, //  400 ms depois de 1300 → acima de 300
        { start: 900, duration: 30 }, //   antes de qualquer tecla → sem tecla
      ],
      [1300, 1000], // fora de ordem de propósito: depender da ordem é suposição que quebra em produção
    )

    expect(resumo).toEqual({
      atrasoAte50Ms: 40, atrasoAte50N: 1,
      atrasoAte150Ms: 60, atrasoAte150N: 1,
      atrasoAte300Ms: 70, atrasoAte300N: 1,
      atrasoAcima300Ms: 90, atrasoAcima300N: 1,
      atrasoSemTeclaMs: 30, atrasoSemTeclaN: 1,
    })

    const somaMs = Object.entries(resumo as Record<string, number>)
      .filter(([chave]) => chave.endsWith('Ms'))
      .reduce((total, [, valor]) => total + valor, 0)
    expect(somaMs).toBe(40 + 60 + 70 + 90 + 30)
  })

  // Constitution "Segredos Fora dos Clientes e dos Logs" + FR-014: o que sai da TV é só número, em chaves de um
  // conjunto FECHADO. Nome de faixa livre é por onde texto do provedor vazaria para a evidência. Faixa sem amostra é
  // OMITIDA, para não confundir "nenhuma amostra" com "duração zero".
  it('usa só as chaves do conjunto fechado, e omite a faixa sem amostra', () => {
    const resumo = summarizeKeyDelays([{ start: 1010, duration: 40 }], [1000])

    expect(resumo).toEqual({ atrasoAte50Ms: 40, atrasoAte50N: 1 })
    for (const chave of Object.keys(resumo as Record<string, number>)) {
      expect(chave).toMatch(/^atraso(Ate50|Ate150|Ate300|Acima300|SemTecla)(Ms|N)$/)
      expect(chave).toMatch(/^[a-z][A-Za-z0-9]{0,39}$/) // KEY_PATTERN do canal de métricas (feature 085)
    }
  })

  // O caso traiçoeiro: uma tarefa LONGA que começa logo depois da tecla pertence INTEIRA à faixa do seu início,
  // mesmo terminando muito depois da tecla seguinte. É o que se quer saber — o que a disparou, não onde terminou.
  // Repartir por sobreposição faria a causa aparecer na faixa errada e mandaria a feature otimizar outro lugar.
  it('a tarefa pertence à faixa do seu início, mesmo atravessando a tecla seguinte', () => {
    const resumo = summarizeKeyDelays([{ start: 1010, duration: 700 }], [1000, 1300, 1600])

    expect(resumo).toEqual({ atrasoAte50Ms: 700, atrasoAte50N: 1 })
  })
})
