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
 * Reparte o tempo das tarefas longas por faixa de atraso desde a última tecla.
 *
 * `keyTimes` são carimbos de `performance.now()` dos `keydown` da janela, na mesma origem de `task.start` — **nunca**
 * `Date.now()`. Não precisam vir ordenados.
 *
 * Cada tarefa cai em **exatamente uma** faixa, a do atraso do seu início, então a soma dos `*Ms` fecha com a soma das
 * durações. `null` quando não houve tarefa longa na janela.
 */
export function summarizeKeyDelays(
  _tasks: readonly LongTaskWindow[],
  _keyTimes: readonly number[],
): Record<string, number> | null {
  throw new Error('not implemented')
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
  throw new Error('not implemented')
}
