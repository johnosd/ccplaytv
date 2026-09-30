/**
 * Agendador da pré-carga em segundo plano (feature 038, US1/US5,
 * `logic/agendador-pre-carga.md`).
 *
 * Uma categoria de cada vez, pelo mesmo caminho da entrada normal
 * (`ensureCategory`, injetado aqui como `runCategory`), só quando o portão de
 * atividade deixa (FR-003/FR-004), na ordem de `pickNextCategory` (FR-005).
 * Nunca aborta uma categoria em andamento: a busca é compartilhada com uma
 * entrada real pelo `dedup` do `categoryLoader`, e abortá-la quebraria a
 * entrada também.
 */

import type { ActivityGate } from './activityGate'
import {
  MAX_ATTEMPTS_PER_SESSION,
  pickNextCategory,
  workNeeded,
  type PrefetchCategoryState,
  type PrefetchHint,
} from './prefetchOrder'

export type PrefetchRunOutcome = 'done' | 'failed' | 'storage_full'

export interface PrefetchSchedulerDeps {
  /** Estado atual das categorias da lista (lido do disco a cada rodada — FR-006). */
  loadCategories: (sourceId: string) => Promise<PrefetchCategoryState[]>
  /** Obtém/renova uma categoria. Nunca lança: falha é `'failed'`. */
  runCategory: (sourceId: string, categoryId: number) => Promise<PrefetchRunOutcome>
  gate: ActivityGate
  now?: () => number
  /** Silêncio de teclas exigido antes de começar uma categoria (FR-003). Padrão `IDLE_AFTER_KEY_MS`. */
  idleAfterKeyMs?: number
  /** Pausa entre uma categoria e a próxima, para ceder a thread. Padrão `GAP_BETWEEN_CATEGORIES_MS`. */
  gapMs?: number
  /** Uma categoria terminou com itens novos no disco (a raiz invalida as consultas dela). */
  onCategoryDone?: (sourceId: string, categoryId: number) => void
  /**
   * Limpeza em partes de gerações antigas (feature 038, D-008) — uma parte por
   * chamada, só com o portão aberto. Devolve `true` se ainda sobrou trabalho.
   */
  housekeeping?: (sourceId: string) => Promise<boolean>
  /** Recuo do FR-014 (`'neighborhood'`). Padrão `'full'`. */
  scope?: 'full' | 'neighborhood'
}

export const IDLE_AFTER_KEY_MS = 2000
export const GAP_BETWEEN_CATEGORIES_MS = 500
/** Sem nada a fazer, relê o disco de tempos em tempos: categorias vencem com o app aberto (FR-025). */
export const RECHECK_WHEN_DONE_MS = 10 * 60 * 1000

export type PrefetchState = 'idle' | 'running' | 'paused' | 'done' | 'stopped'

export interface PrefetchProgress {
  state: PrefetchState
  sourceId: string | null
  /** Categorias com itens no aparelho (qualquer idade). */
  ready: number
  /** Categorias da lista que a pré-carga cobre (exclui `eager`). */
  total: number
  /** Motivo de parada definitiva nesta sessão (FR-008). */
  stoppedReason?: 'storage_full'
}

export interface PrefetchScheduler {
  start(sourceId: string): void
  stop(): void
  setHint(hint: PrefetchHint | undefined): void
  /** Passa uma categoria para a frente da fila (entrada numa categoria vencida — FR-026). */
  prioritize(categoryId: number): void
  /** A estrutura mudou (atualização terminou) — relê as categorias. */
  wake(): void
  getProgress(): PrefetchProgress
  subscribe(listener: () => void): () => void
}

const IDLE_PROGRESS: PrefetchProgress = { state: 'idle', sourceId: null, ready: 0, total: 0 }

export function createPrefetchScheduler(deps: PrefetchSchedulerDeps): PrefetchScheduler {
  const now = deps.now ?? (() => Date.now())
  const idleAfterKeyMs = deps.idleAfterKeyMs ?? IDLE_AFTER_KEY_MS
  const gapMs = deps.gapMs ?? GAP_BETWEEN_CATEGORIES_MS
  const gate = deps.gate

  /** Cada `start`/`stop` troca a época: um laço de época antiga sai sem fazer nada. */
  let epoch = 0
  let currentSource: string | null = null
  let hint: PrefetchHint | undefined
  const attempts = new Map<number, number>()
  const prioritized: number[] = []
  let progress: PrefetchProgress = IDLE_PROGRESS
  const listeners = new Set<() => void>()
  /** Quem está esperando agora (uma espera por vez — só existe um laço vivo). */
  let wakeWaiter: (() => void) | null = null

  function setProgress(next: Omit<PrefetchProgress, 'sourceId'>): void {
    const candidate: PrefetchProgress = { ...next, sourceId: currentSource }
    if (
      candidate.state === progress.state &&
      candidate.sourceId === progress.sourceId &&
      candidate.ready === progress.ready &&
      candidate.total === progress.total &&
      candidate.stoppedReason === progress.stoppedReason
    ) {
      return
    }
    progress = candidate
    for (const listener of [...listeners]) listener()
  }

  function wakeUp(): void {
    const waiter = wakeWaiter
    wakeWaiter = null
    waiter?.()
  }

  /** Espera até `ms` (ou para sempre), até o portão mudar (`onGate`), ou até alguém acordar. */
  function wait(ms: number | undefined, onGate = false): Promise<void> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let unsubscribe: (() => void) | undefined
      const done = () => {
        if (timer !== undefined) clearTimeout(timer)
        unsubscribe?.()
        if (wakeWaiter === done) wakeWaiter = null
        resolve()
      }
      if (ms !== undefined) timer = setTimeout(done, ms)
      if (onGate) unsubscribe = gate.subscribe(done)
      wakeWaiter = done
    })
  }

  /** Espera o portão abrir. `false` = esta época acabou no meio da espera. */
  async function waitUntilOpen(myEpoch: number, last: { ready: number; total: number }): Promise<boolean> {
    while (epoch === myEpoch) {
      const reason = gate.blockReason(now(), idleAfterKeyMs)
      if (reason === undefined) return true
      setProgress({ state: 'paused', ...last })
      if (reason === 'key') {
        const until = gate.keyIdleAt(idleAfterKeyMs) ?? now()
        await wait(Math.max(1, until - now() + 1))
      } else {
        await wait(undefined, true)
      }
    }
    return false
  }

  function nextPrioritized(categories: PrefetchCategoryState[], at: number): number | undefined {
    while (prioritized.length > 0) {
      const id = prioritized[0]
      const category = categories.find((candidate) => candidate.id === id)
      const stillNeeded =
        category !== undefined &&
        workNeeded(category, at) !== undefined &&
        (attempts.get(id) ?? 0) < MAX_ATTEMPTS_PER_SESSION
      if (stillNeeded) return id
      prioritized.shift()
    }
    return undefined
  }

  async function loop(myEpoch: number, sourceId: string): Promise<void> {
    let last = { ready: 0, total: 0 }
    while (epoch === myEpoch) {
      if (!(await waitUntilOpen(myEpoch, last))) return

      let categories: PrefetchCategoryState[]
      try {
        categories = await deps.loadCategories(sourceId)
      } catch {
        categories = []
      }
      if (epoch !== myEpoch) return

      const covered = categories.filter((category) => category.fetchMode !== 'eager')
      last = { ready: covered.filter((category) => category.itemsFetchedAt !== undefined).length, total: covered.length }
      const at = now()
      const next =
        nextPrioritized(categories, at) ??
        pickNextCategory({ categories, hint, attempts, now: at, scope: deps.scope })

      if (next === undefined) {
        setProgress({ state: 'done', ...last })
        if (deps.housekeeping && gate.blockReason(now(), idleAfterKeyMs) === undefined) {
          const more = await deps.housekeeping(sourceId).catch(() => false)
          if (epoch !== myEpoch) return
          if (more) {
            await wait(gapMs)
            continue
          }
        }
        await wait(RECHECK_WHEN_DONE_MS)
        continue
      }

      setProgress({ state: 'running', ...last })
      const outcome = await deps.runCategory(sourceId, next).catch((): PrefetchRunOutcome => 'failed')
      if (epoch !== myEpoch) return

      if (outcome === 'storage_full') {
        setProgress({ state: 'stopped', ...last, stoppedReason: 'storage_full' })
        return
      }
      const index = prioritized.indexOf(next)
      if (outcome === 'done') {
        if (index >= 0) prioritized.splice(index, 1)
        deps.onCategoryDone?.(sourceId, next)
      } else {
        attempts.set(next, (attempts.get(next) ?? 0) + 1)
        if (index >= 0) prioritized.splice(index, 1)
      }

      if (deps.housekeeping && gate.blockReason(now(), idleAfterKeyMs) === undefined) {
        await deps.housekeeping(sourceId).catch(() => false)
        if (epoch !== myEpoch) return
      }
      await wait(gapMs)
    }
  }

  return {
    start(sourceId) {
      if (currentSource === sourceId && progress.state !== 'stopped' && progress.state !== 'idle') return
      epoch += 1
      currentSource = sourceId
      attempts.clear()
      prioritized.length = 0
      wakeUp()
      setProgress({ state: 'paused', ready: 0, total: 0 })
      void loop(epoch, sourceId)
    },
    stop() {
      epoch += 1
      currentSource = null
      prioritized.length = 0
      wakeUp()
      setProgress({ state: 'stopped', ready: 0, total: 0 })
    },
    setHint(next) {
      hint = next
      wakeUpIfDone()
    },
    prioritize(categoryId) {
      if (!prioritized.includes(categoryId)) prioritized.push(categoryId)
      wakeUpIfDone()
    },
    wake() {
      wakeUpIfDone()
    },
    getProgress() {
      return progress
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  /**
   * Só acorda a espera "sem nada a fazer" — acordar uma espera de portão ou do
   * intervalo entre categorias furaria FR-003/FR-004 (o laço reavalia o portão
   * de qualquer jeito, mas o intervalo de cessão encurtaria).
   */
  function wakeUpIfDone(): void {
    if (progress.state === 'done') wakeUp()
  }
}
