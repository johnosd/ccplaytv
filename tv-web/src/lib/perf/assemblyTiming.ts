/**
 * Medição da montagem de Home/Filmes/Séries (feature 079, `research.md` R-006). **Desligada por padrão**: só registra com
 * `isPerfEnabled()` (`localStorage['ccplaytv:perf'] === '1'` ou build `VITE_CCPLAY_PERF=1`).
 *
 * Registra apenas números e chaves de fileira — nunca URL, título ou objeto de catálogo (constitution, "Segredos Fora dos
 * Clientes e dos Logs"). O relatório vai para o console e para `window.__ccplayAssemblyTimings`.
 */

import { logger } from '../logger'
import { isPerfEnabled } from './entryTiming'

export interface AssemblyReport {
  screen: string
  /** ms da montagem da tela até aparecer. */
  revealMs: number
  reason: string
  /** Chaves das leituras ainda pendentes na revelação (com `reason: 'cap'`, é o que estourou o teto). */
  pending: string[]
  /** Chaves das fileiras que chegaram depois do teto acima do que estava na tela (ficaram para a próxima entrada). */
  deferred: string[]
  /** Capas da primeira tela: pedidas e terminadas até a revelação. */
  images: { requested: number; settled: number }
}

function reports(): AssemblyReport[] {
  const holder = globalThis as { __ccplayAssemblyTimings?: AssemblyReport[] }
  if (!holder.__ccplayAssemblyTimings) holder.__ccplayAssemblyTimings = []
  return holder.__ccplayAssemblyTimings
}

/** Registra uma revelação. Sem a chave ligada, não faz nada e devolve `null`. */
export function recordAssembly(report: AssemblyReport): AssemblyReport | null {
  if (!isPerfEnabled()) return null
  const entry: AssemblyReport = { ...report, pending: [...report.pending], deferred: [...report.deferred], images: { ...report.images } }
  reports().push(entry)
  logger.log(
    `[perf] montagem ${entry.screen}: ${entry.revealMs}ms (${entry.reason}) capas=${entry.images.settled}/${entry.images.requested}` +
      (entry.pending.length > 0 ? ` pendentes=${entry.pending.join(',')}` : ''),
  )
  return entry
}

/** Atualiza as fileiras adiadas de um relatório já publicado (chegaram depois do teto). */
export function recordDeferred(entry: AssemblyReport | null, deferred: readonly string[]): void {
  if (!entry || deferred.length === entry.deferred.length) return
  entry.deferred = [...deferred]
  logger.log(`[perf] montagem ${entry.screen}: adiadas=${entry.deferred.join(',')}`)
}

/** Relatórios publicados (testes e roteiro na TV). */
export function takeAssemblyReports(): AssemblyReport[] {
  return [...reports()]
}
