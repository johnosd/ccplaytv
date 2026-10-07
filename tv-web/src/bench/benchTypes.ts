/**
 * Tipos e ajudantes da bancada do benchmark de importação (feature 063, US3).
 * Só roda em dev (`bench.html`): nada daqui entra no build. Formato do resultado:
 * `sdd/specs/063-codigo-saudavel-benchmark/logic/benchmark.md` §3 e §5.
 */

export type BenchFormat = 'xtream' | 'm3u' | 'xmltv'
export type BenchMode = 'stages' | 'real'

export interface BenchRunOptions {
  format: BenchFormat
  size: number
  mode: BenchMode
  /** Base do servidor das fontes fictícias (`http://127.0.0.1:<porta>`). Nunca vai para o resultado. */
  fixturesUrl: string
  /** Instante base do XMLTV (ms): `now` e janela do `parseXmltv`/`syncEpg`. */
  clock: number
}

export interface BenchCounts {
  categories: number
  items: number
}

/** `'não informado'` quando o navegador não responde: nunca um número inventado (FR-020). */
export type StorageValue = number | 'não informado'

export interface StorageReading {
  usage: StorageValue
  quota: StorageValue
}

export interface StagesTimings {
  fetchMs: number
  parseMs: number
  /** `null` no XMLTV, que não classifica nada. */
  classifyMs: number | null
  storeMs: number
  totalMs: number
}

export type BenchModeResult =
  | { mode: 'stages'; status: 'ok'; stages: StagesTimings; counts: BenchCounts }
  | {
      mode: 'real'
      status: 'ok'
      realPath: { status: 'ok'; totalMs: number }
      counts: BenchCounts
      storage: { before: StorageReading; after: StorageReading }
    }
  /** Só o `name` do erro: a mensagem de uma falha de rede embute a URL. */
  | { mode: BenchMode; status: 'failed'; failedStage: string; errorName: string }

/** Onde a execução está, para dizer em que etapa uma falha aconteceu. */
export interface StageTracker {
  stage: string
}

const round = (value: number) => Math.round(value * 10) / 10

export async function timed<T>(tracker: StageTracker, stage: string, work: () => Promise<T> | T): Promise<{ value: T; ms: number }> {
  tracker.stage = stage
  const startedAt = performance.now()
  const value = await work()
  return { value, ms: round(performance.now() - startedAt) }
}

export function failureOf(mode: BenchMode, tracker: StageTracker, error: unknown): BenchModeResult {
  const errorName = error instanceof Error && error.name ? error.name : 'Error'
  return { mode, status: 'failed', failedStage: tracker.stage, errorName }
}

/** Uso e quota de armazenamento, campo a campo; sem a API (ou se ela lançar) é `'não informado'`. */
export async function readStorage(): Promise<StorageReading> {
  try {
    const estimate = await navigator.storage.estimate()
    return {
      usage: typeof estimate.usage === 'number' ? estimate.usage : 'não informado',
      quota: typeof estimate.quota === 'number' ? estimate.quota : 'não informado',
    }
  } catch {
    return { usage: 'não informado', quota: 'não informado' }
  }
}

export const msSince = (startedAt: number) => round(performance.now() - startedAt)
export const roundMs = round
