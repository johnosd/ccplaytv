/**
 * Atraso de cada tarefa longa desde a última tecla (feature 089, FR-002).
 *
 * O método, as faixas e o que cada resultado significa estão em
 * `sdd/specs/089-tarefas-longas-fora-navegacao/logic/atraso-e-sonda.md` §1. Leia antes de mexer aqui.
 *
 * Por que existe: a feature 088 mediu `tecla`, `render` e `capa` e encontrou **95,4%** do tempo de thread preso **fora**
 * de todas as etapas. Isto não acrescenta um quarto nome adivinhado — é um **discriminador**: se os atrasos se
 * concentram perto de zero, o trabalho é disparado pela navegação e só acontece depois do primeiro quadro; se estão
 * espalhados, não é a navegação.
 *
 * Só existe no build de medição (`VITE_CCPLAY_PERF=1`). Só números e as chaves fixas da tabela de §1.
 */

import type { LongTaskWindow } from './longTaskAttribution'

/**
 * As faixas de atraso, em ordem crescente. Conjunto **FECHADO**: o canal de métricas só aceita chaves conhecidas, e
 * nome de faixa livre é por onde texto do provedor vazaria para a evidência.
 *
 * Os limites são a cadência da sonda (300 ms por tecla, `autopilot.ts`): com eles, trabalho disparado pela tecla cai
 * nas duas primeiras faixas e trabalho independente se espalha por todas.
 */
const FAIXAS: ReadonlyArray<{ readonly limite: number; readonly chave: string }> = [
  { limite: 50, chave: 'atrasoAte50' },
  { limite: 150, chave: 'atrasoAte150' },
  { limite: 300, chave: 'atrasoAte300' },
  { limite: Number.POSITIVE_INFINITY, chave: 'atrasoAcima300' },
]

/** Tarefa que começou antes de qualquer tecla da janela — a causa é da abertura, não da navegação. */
const SEM_TECLA = 'atrasoSemTecla'

/** A última tecla em `ordenadas` que não é posterior a `instante`. `undefined` se não houve nenhuma. */
function ultimaTeclaAte(ordenadas: readonly number[], instante: number): number | undefined {
  let baixo = 0
  let alto = ordenadas.length - 1
  let achado: number | undefined
  while (baixo <= alto) {
    const meio = (baixo + alto) >> 1
    if (ordenadas[meio] <= instante) {
      achado = ordenadas[meio]
      baixo = meio + 1
    } else {
      alto = meio - 1
    }
  }
  return achado
}

/**
 * Reparte o tempo das tarefas longas por faixa de atraso desde a última tecla.
 *
 * `keyTimes` são carimbos de `performance.now()` dos `keydown` da janela, na mesma origem de `task.start` — **nunca**
 * `Date.now()`. Não precisam vir ordenados: depender disso é a suposição que passa no teste e quebra em produção.
 *
 * Cada tarefa cai em **exatamente uma** faixa, a do atraso do seu início, então a soma dos `*Ms` fecha com a soma das
 * durações. Uma tarefa de 700 ms que começa 10 ms depois da tecla pertence inteira à faixa 0–50: o que se quer saber é
 * **o que a disparou**, não onde ela terminou. `null` quando não houve tarefa longa na janela.
 */
export function summarizeKeyDelays(
  tasks: readonly LongTaskWindow[],
  keyTimes: readonly number[],
): Record<string, number> | null {
  if (tasks.length === 0) return null
  const ordenadas = [...keyTimes].sort((a, b) => a - b)
  const porFaixa = new Map<string, { ms: number; n: number }>()

  for (const tarefa of tasks) {
    const tecla = ultimaTeclaAte(ordenadas, tarefa.start)
    const chave = tecla === undefined ? SEM_TECLA : (FAIXAS.find((f) => tarefa.start - tecla < f.limite)?.chave ?? SEM_TECLA)
    const atual = porFaixa.get(chave) ?? { ms: 0, n: 0 }
    atual.ms += tarefa.duration
    atual.n += 1
    porFaixa.set(chave, atual)
  }

  const saida: Record<string, number> = {}
  for (const [chave, valor] of porFaixa) {
    // Arredonda só na saída; faixa sem amostra nunca aparece aqui, então não vira zero.
    saida[`${chave}Ms`] = Math.round(valor.ms)
    saida[`${chave}N`] = valor.n
  }
  return saida
}

export interface KeyDelayTracker {
  /** Registra o instante de um `keydown` (em `performance.now()`). */
  onKey(at: number): void
  /** Reparte as tarefas longas da janela por faixa de atraso e **zera** as teclas guardadas. */
  snapshot(tasks: readonly LongTaskWindow[]): Record<string, number> | null
  dispose(): void
}

/** Guarda os instantes das teclas da janela corrente. Mesmo formato de janela do `longTasks.ts`. */
export function createKeyDelayTracker(): KeyDelayTracker {
  let teclas: number[] = []
  return {
    onKey(at) {
      teclas.push(at)
    },
    snapshot(tasks) {
      const resumo = summarizeKeyDelays(tasks, teclas)
      // Zera a janela, mas **mantém a última tecla como semente**: uma tarefa longa que começa logo no início da
      // janela seguinte foi disparada pela última tecla desta, e sem a semente ela viraria `atrasoSemTecla` — uma
      // faixa inflada de graça, que apontaria a causa para a abertura em vez da navegação.
      teclas = teclas.length > 0 ? [teclas[teclas.length - 1]] : []
      return resumo
    },
    dispose() {
      teclas = []
    },
  }
}
