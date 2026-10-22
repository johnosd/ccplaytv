/**
 * Tarefas longas de JavaScript na janela de medição (assessment `tarefa-longa-na-leitura-categoria-gorda`).
 *
 * **Por que existe**: na TV, navegar em Filmes/Séries produz quadros congelados de até ~900 ms, e esse número
 * atravessou as features 086 e 087 sem ser explicado. Medir só o quadro não distingue as duas causas possíveis:
 *
 * - quadro longo **com** tarefa longa correspondente → é código nosso segurando a thread;
 * - quadro longo **sem** tarefa longa → pausa de coleta de memória ou do compositor, e nenhuma otimização de laço
 *   resolve.
 *
 * Agregado **por janela**, junto dos quadros (`PerfOverlay`, a cada ~5 s), em vez de uma linha por evento: numa janela
 * ruim há dezenas de tarefas longas, e inundar o canal mudaria o que está sendo medido.
 *
 * Só existe no build de medição (`VITE_CCPLAY_PERF=1`). Só números — nunca nome de item.
 */

import type { LongTaskWindow } from './longTaskAttribution'

export interface LongTaskStats {
  /** Quantas tarefas acima de 50 ms (o limite que o próprio navegador usa para `longtask`). */
  longTasks: number
  /** Soma das durações, para saber quanto da janela a thread passou presa. */
  longTaskMs: number
  longTaskMaxMs: number
}

/** Resume durações (ms) de tarefas longas. `null` quando não houve nenhuma — a janela saiu limpa. */
export function summarizeLongTasks(durations: readonly number[]): LongTaskStats | null {
  if (durations.length === 0) return null
  let total = 0
  let pior = 0
  for (const duracao of durations) {
    total += duracao
    if (duracao > pior) pior = duracao
  }
  return { longTasks: durations.length, longTaskMs: Math.round(total), longTaskMaxMs: Math.round(pior) }
}

export interface LongTaskTracker {
  /** Resume o que chegou desde a chamada anterior e zera a janela. */
  snapshot(): LongTaskStats | null
  /**
   * As tarefas longas da janela com **início e duração**, e zera. O resumo acima diz *quanto* a thread ficou presa;
   * só o início permite cruzar com os intervalos das etapas e descobrir *de quem* é o tempo (feature 088, T025).
   */
  takeWindows(): LongTaskWindow[]
  dispose(): void
}

/**
 * Observa `longtask`. Devolve um rastreador inerte quando a API não existe (jsdom nos testes, ou um navegador sem
 * `longtask`): a ausência de instrumentação nunca pode derrubar o app que ela mede.
 */
export function createLongTaskTracker(): LongTaskTracker {
  let duracoes: number[] = []
  let janelas: LongTaskWindow[] = []
  let observer: PerformanceObserver | undefined
  try {
    observer = new PerformanceObserver((lista) => {
      for (const entrada of lista.getEntries()) {
        duracoes.push(entrada.duration)
        janelas.push({ start: entrada.startTime, duration: entrada.duration })
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  } catch {
    // sem `PerformanceObserver` ou sem suporte a `longtask`: segue sem medir
    observer = undefined
  }
  return {
    snapshot() {
      const resumo = summarizeLongTasks(duracoes)
      duracoes = []
      return resumo
    },
    takeWindows() {
      const atual = janelas
      janelas = []
      return atual
    },
    dispose() {
      observer?.disconnect()
      duracoes = []
      janelas = []
    },
  }
}
