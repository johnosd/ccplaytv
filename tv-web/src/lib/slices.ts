/**
 * Trabalho em fatias (feature 084): laços longos que cedem a vez à interface e respeitam um `AbortSignal`, sem mudar o
 * resultado. Regras em `sdd/specs/084-indice-busca-sem-travar/logic/fatias.md` §1.
 */

import { yieldToMain as defaultYieldToMain } from './metadata/discoveryRules'

export interface SliceOptions {
  /** Cancela o trabalho: a próxima conferência rejeita com `AbortError`. */
  signal?: AbortSignal
  /** Como ceder a vez à interface (padrão: `yieldToMain`, sem o atraso de 4 ms do `setTimeout`); injetável nos testes. */
  yieldToMain?: () => Promise<void>
  /** Quanto trabalho cabe numa fatia antes de ceder, em ms (padrão 8: na TV, ~6–10× isso, ainda abaixo de 100 ms). */
  budgetMs?: number
}

export interface SliceClock {
  /** Cede se a fatia passou do orçamento; `force` cede sempre (ex.: fim de um bloco do catálogo). */
  maybeYield(force?: boolean): Promise<void>
  /** Lança `AbortError` se o sinal já foi abortado. */
  check(): void
}

const DEFAULT_BUDGET_MS = 8

function abortError(): DOMException {
  return new DOMException('Operação cancelada', 'AbortError')
}

/**
 * Relógio de fatias. Confere o sinal antes **e depois** de ceder: abortar durante a cessão não pode deixar o trabalho
 * seguir.
 */
export function createSliceClock(options: SliceOptions = {}): SliceClock {
  const { signal, budgetMs = DEFAULT_BUDGET_MS } = options
  const yieldNow = options.yieldToMain ?? defaultYieldToMain
  let sliceStart = performance.now()

  function check(): void {
    // A razão do sinal (um `AbortError`) já nasceu quando alguém abortou: não depende de o ambiente ainda estar de pé.
    if (signal?.aborted) throw signal.reason ?? abortError()
  }

  return {
    check,
    async maybeYield(force = false): Promise<void> {
      check()
      if (!force && performance.now() - sliceStart < budgetMs) return
      await yieldNow()
      check()
      sliceStart = performance.now()
    },
  }
}

/** Conferir o relógio custa (`performance.now`): os laços só o fazem a cada tantos itens. */
const ITEMS_PER_CHECK = 256

export async function forEachInSlices<T>(items: readonly T[], fn: (item: T) => void, clock: SliceClock): Promise<void> {
  clock.check()
  for (let index = 0; index < items.length; index += 1) {
    fn(items[index])
    if ((index & (ITEMS_PER_CHECK - 1)) === ITEMS_PER_CHECK - 1) await clock.maybeYield()
  }
}

/** `items.map(fn)` em fatias; preserva a ordem e não muta a entrada. */
export async function mapInSlices<T, R>(items: readonly T[], fn: (item: T) => R, clock: SliceClock): Promise<R[]> {
  clock.check()
  const out: R[] = []
  for (let index = 0; index < items.length; index += 1) {
    out.push(fn(items[index]))
    if ((index & (ITEMS_PER_CHECK - 1)) === ITEMS_PER_CHECK - 1) await clock.maybeYield()
  }
  return out
}

const RUN = 32
/** Saídas de um merge entre uma conferência do relógio e a seguinte. */
const OUTPUTS_PER_CHECK = 1024

/**
 * Devolve exatamente `[...items].sort(compare)`. É um merge sort estável de baixo para cima (execuções iniciais de 32 por
 * inserção estável; em empate o merge pega sempre da esquerda). Ordenar pedaços com `sort` nativo e juntar mudaria a
 * ordem dos empates.
 */
export async function stableSortInSlices<T>(
  items: readonly T[],
  compare: (a: T, b: T) => number,
  clock: SliceClock,
): Promise<T[]> {
  clock.check()
  const count = items.length
  let source = items.slice()
  for (let start = 0; start < count; start += RUN) {
    const end = Math.min(start + RUN, count)
    for (let i = start + 1; i < end; i += 1) {
      const value = source[i]
      let j = i - 1
      while (j >= start && compare(source[j], value) > 0) {
        source[j + 1] = source[j]
        j -= 1
      }
      source[j + 1] = value
    }
    if (((start / RUN) & 7) === 7) await clock.maybeYield()
  }

  let target = new Array<T>(count)
  for (let width = RUN; width < count; width *= 2) {
    let outputs = 0
    for (let low = 0; low < count; low += 2 * width) {
      const middle = Math.min(low + width, count)
      const high = Math.min(low + 2 * width, count)
      let left = low
      let right = middle
      let out = low
      while (left < middle && right < high) {
        // Só pega da direita se for estritamente menor: no empate, a esquerda (estabilidade).
        target[out++] = compare(source[right], source[left]) < 0 ? source[right++] : source[left++]
        outputs += 1
        if (outputs === OUTPUTS_PER_CHECK) {
          outputs = 0
          await clock.maybeYield()
        }
      }
      while (left < middle) target[out++] = source[left++]
      while (right < high) target[out++] = source[right++]
    }
    const swap = source
    source = target
    target = swap
    await clock.maybeYield(true)
  }
  return source
}
