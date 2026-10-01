/**
 * Medição da primeira entrada numa categoria (feature 038, FR-012,
 * `research.md` R0-1). **Desligada por padrão**: só registra com
 * `localStorage['ccplaytv:perf'] === '1'`.
 *
 * Registra apenas números — milissegundos desde o início da entrada, número de
 * itens e a seção. Nunca URL, credencial ou conteúdo (constitution, "Segredos
 * Fora dos Clientes e dos Logs"). O relatório vai para o console e para
 * `window.__ccplayEntryTimings` (lido pelo roteiro `e2e/carga-listas-real.mjs`).
 */

import { logger } from '../logger'

/**
 * `start`/`ensured`/`itemsOut` (feature 039, R-009) detalham a entrada numa
 * categoria já no aparelho: início da consulta, fim da checagem de frescor,
 * itens convertidos para a tela.
 */
export type EntryPhase = 'start' | 'request' | 'mapped' | 'written' | 'ensured' | 'read' | 'itemsOut' | 'firstPaint'

export interface EntryReport {
  categoryId: number
  kind: string
  /** ms desde `request` (ou desde a primeira marca, se `request` não houve — categoria já no disco). */
  phases: Partial<Record<EntryPhase, number>>
  items?: number
}

const PERF_KEY = 'ccplaytv:perf'

export function isPerfEnabled(): boolean {
  // Build de medição para a TV (que não entrega console): `VITE_CCPLAY_PERF=1`.
  if (import.meta.env.VITE_CCPLAY_PERF === '1') return true
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(PERF_KEY) === '1'
  } catch {
    return false
  }
}

interface Pending {
  kind: string
  start: number
  phases: Partial<Record<EntryPhase, number>>
  items?: number
}

const pending = new Map<number, Pending>()

function reports(): EntryReport[] {
  const holder = globalThis as { __ccplayEntryTimings?: EntryReport[] }
  if (!holder.__ccplayEntryTimings) holder.__ccplayEntryTimings = []
  return holder.__ccplayEntryTimings
}

/**
 * Marca uma fase da entrada na categoria `categoryId`. `firstPaint` fecha e
 * publica o relatório. Sem a chave ligada, não faz nada.
 */
export function markEntry(categoryId: number, kind: string, phase: EntryPhase, items?: number): void {
  if (!isPerfEnabled()) return
  const now = performance.now()
  let entry = pending.get(categoryId)
  // `start` (entrada da tela) também recomeça: sem isto, um registro deixado
  // por uma busca em segundo plano da mesma categoria minutos antes somava
  // esse tempo à entrada (visto na TV: `start=240247`).
  if (!entry || phase === 'request' || phase === 'start') {
    entry = { kind, start: now, phases: {} }
    pending.set(categoryId, entry)
  }
  entry.phases[phase] = Math.round(now - entry.start)
  if (items !== undefined) entry.items = items
  if (phase !== 'firstPaint') return

  pending.delete(categoryId)
  const report: EntryReport = { categoryId, kind: entry.kind, phases: entry.phases, items: entry.items }
  reports().push(report)
  for (const listener of [...listeners]) listener()
  logger.log(
    `[perf] entrada ${report.kind} #${report.categoryId}: ` +
      Object.entries(report.phases)
        .map(([name, ms]) => `${name}=${ms}ms`)
        .join(' ') +
      (report.items !== undefined ? ` itens=${report.items}` : ''),
  )
}

/** Relatórios já publicados (testes e roteiro E2E). */
export function takeEntryReports(): EntryReport[] {
  return [...reports()]
}

const listeners = new Set<() => void>()

/** Avisa a cada relatório novo (painel de medição na TV, `PerfOverlay`). */
export function subscribeEntryReports(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
