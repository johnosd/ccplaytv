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
import type { CategoryKind } from '../db'
import {
  MAX_ATTEMPTS_PER_SESSION,
  pickNextCategory,
  SECTION_ORDER,
  workNeeded,
  type PrefetchCategoryState,
  type PrefetchHint,
} from './prefetchOrder'

export type PrefetchRunOutcome = 'done' | 'failed' | 'storage_full' | 'rate_limited'

/** Feature 042 (FR-017): espera depois de um 429 do painel, sem contar como tentativa. */
export const RATE_LIMIT_PAUSE_MS = 60_000

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
  /**
   * Feature 038 (`research.md` R0-3): obtém várias categorias de uma seção com
   * UM pedido da seção inteira. Opcional: sem ele, tudo vai por categoria.
   * Nunca lança; avisa cada categoria gravada por `onCategory`.
   */
  runSection?: (
    sourceId: string,
    kind: CategoryKind,
    categoryIds: number[],
    options: { signal: AbortSignal; onCategory: (categoryId: number) => void },
  ) => Promise<PrefetchRunOutcome>
}

/** Mínimo de categorias a obter numa seção para valer um pedido da seção inteira. */
export const SECTION_BULK_MIN = 2

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
  /** Feature 042: motivo da pausa temporária por limite do painel (some quando a espera acaba). */
  pausedReason?: 'rate_limited'
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
      candidate.stoppedReason === progress.stoppedReason &&
      candidate.pausedReason === progress.pausedReason
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

  /**
   * Feature 042 (FR-017, `logic/rede-e-lifecycle.md` §5): espera `RATE_LIMIT_PAUSE_MS`
   * mostrando o motivo (`pausedReason`), pela mesma espera cancelável dos demais
   * recuos (`stop()`/novo `start()` a acordam). `false` = esta época acabou.
   */
  async function pauseForRateLimit(myEpoch: number, last: { ready: number; total: number }): Promise<boolean> {
    setProgress({ state: 'paused', ...last, pausedReason: 'rate_limited' })
    await wait(RATE_LIMIT_PAUSE_MS)
    return epoch === myEpoch
  }

  /** Seções já buscadas inteiras nesta sessão (zera ao começar e quando a estrutura muda). */
  const bulkTried = new Set<CategoryKind>()
  let bulkController: AbortController | null = null

  /** A seção a buscar inteira agora: a da dica primeiro, depois Canais → Filmes → Séries. */
  function pickSectionForBulk(
    categories: PrefetchCategoryState[],
    at: number,
  ): { kind: CategoryKind; ids: number[] } | undefined {
    if (!deps.runSection || deps.scope === 'neighborhood') return undefined
    const kinds = hint ? [hint.kind, ...SECTION_ORDER.filter((kind) => kind !== hint!.kind)] : [...SECTION_ORDER]
    for (const kind of kinds) {
      if (bulkTried.has(kind)) continue
      const ids = categories
        .filter(
          (category) =>
            category.kind === kind &&
            category.fetchMode === 'on_demand' &&
            workNeeded(category, at) !== undefined &&
            (attempts.get(category.id) ?? 0) < MAX_ATTEMPTS_PER_SESSION,
        )
        .map((category) => category.id)
      if (ids.length >= SECTION_BULK_MIN) return { kind, ids }
    }
    return undefined
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
      const prioritizedNext = nextPrioritized(categories, at)

      // Feature 038 (R0-3): com várias categorias a obter numa seção, um pedido
      // da seção inteira em vez de um por categoria (o painel limita a
      // frequência). Uma tentativa por seção até a estrutura mudar; o que
      // sobrar segue por categoria. Uma entrada que pediu prioridade passa na
      // frente.
      const bulk = prioritizedNext === undefined ? pickSectionForBulk(categories, at) : undefined
      if (bulk && deps.runSection) {
        bulkTried.add(bulk.kind)
        setProgress({ state: 'running', ...last })
        const controller = new AbortController()
        bulkController = controller
        const outcome = await deps
          .runSection(sourceId, bulk.kind, bulk.ids, {
            signal: controller.signal,
            onCategory: (categoryId) => {
              if (epoch === myEpoch) deps.onCategoryDone?.(sourceId, categoryId)
            },
          })
          .catch((): PrefetchRunOutcome => 'failed')
        bulkController = null
        if (epoch !== myEpoch) return
        if (outcome === 'storage_full') {
          setProgress({ state: 'stopped', ...last, stoppedReason: 'storage_full' })
          return
        }
        if (outcome === 'rate_limited') {
          // O painel pediu um intervalo (feature 042, FR-017): a seção volta a ser tentada depois da espera.
          bulkTried.delete(bulk.kind)
          if (!(await pauseForRateLimit(myEpoch, last))) return
          continue
        }
        await wait(gapMs)
        continue
      }

      const next = prioritizedNext ?? pickNextCategory({ categories, hint, attempts, now: at, scope: deps.scope })

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
      if (outcome === 'rate_limited') {
        // Não é tentativa e a categoria não vai para o fim da fila: o 429 não é culpa dela.
        if (!(await pauseForRateLimit(myEpoch, last))) return
        continue
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
      bulkController?.abort()
      currentSource = sourceId
      attempts.clear()
      bulkTried.clear()
      prioritized.length = 0
      wakeUp()
      setProgress({ state: 'paused', ready: 0, total: 0 })
      void loop(epoch, sourceId)
    },
    stop() {
      epoch += 1
      // A seção inteira pode estar no meio: cancela (a de uma categoria nunca é
      // cancelada — é compartilhada com a entrada).
      bulkController?.abort()
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
      // A estrutura mudou (atualização): as seções podem ser buscadas inteiras de novo.
      bulkTried.clear()
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
