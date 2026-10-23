/**
 * Abre o banco do catálogo o mais cedo possível (feature 086, T086).
 *
 * Por que: na TV, a 1ª abertura do Início ficou em ~1,9 s com **todas as 6 leituras** pendentes, em três entradas
 * seguidas e sem nada concorrendo (as cargas só começavam depois). Um custo comum às seis, pago uma vez por sessão,
 * aponta para a primeira abertura do IndexedDB — que toda consulta espera e que, com 390 categorias e os pedaços
 * comprimidos, não é barata neste aparelho.
 *
 * Isto **não** deixa a abertura do banco mais rápida: paga essa conta antes de a Home montar, enquanto a pessoa ainda
 * está na splash e na seleção de lista, onde ninguém espera por ela. E mede, para a próxima medição dizer se a hipótese
 * estava certa em vez de eu supor de novo.
 */

import { db } from './db'
import { emitMetric } from '../perf/metricsChannel'

let started: Promise<void> | undefined

/**
 * Começa a abrir o banco. Idempotente: a 1ª chamada manda, as seguintes só aguardam a mesma promessa. Nunca rejeita —
 * se o banco não abrir aqui, quem precisar dele abre depois e o erro aparece lá, como antes.
 */
export function warmCatalogDb(): Promise<void> {
  if (started) return started
  const startedAt = performance.now()
  started = db
    .open()
    .then(() => {
      emitMetric({ source: 'showcase', outcome: 'done', dbOpenMs: Math.round(performance.now() - startedAt) })
    })
    .catch(() => {
      emitMetric({ source: 'showcase', outcome: 'failed', dbOpenMs: Math.round(performance.now() - startedAt) })
    })
  return started
}

/** Só para teste. */
export function resetWarmupForTests(): void {
  started = undefined
}
