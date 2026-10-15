import { useEffect } from 'react'

type Stage = 'SERIES_MISSING' | 'CREDENTIAL_READ' | 'GENERATION_READ' | 'EPISODES_FETCH' | 'EPISODES_STORE' | 'SERIES_OPEN' | 'SERIES_QUERY' | 'EPISODES_QUERY' | 'ROUTE_MODULE_FAILED' | 'ROUTE_RENDER_FAILED'
const stages: readonly string[] = ['SERIES_MISSING', 'CREDENTIAL_READ', 'GENERATION_READ', 'EPISODES_FETCH', 'EPISODES_STORE', 'SERIES_OPEN', 'SERIES_QUERY', 'EPISODES_QUERY', 'ROUTE_MODULE_FAILED', 'ROUTE_RENDER_FAILED']
const names = ['ProviderError', 'ProviderIncompatibleError', 'StorageFullError', 'DataError', 'BulkError', 'TransactionInactiveError', 'DatabaseClosedError', 'ConstraintError', 'ReadOnlyError', 'MissingAPIError', 'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'QuotaExceededError', 'InvalidStateError', 'NotFoundError', 'AbortError', 'VersionError', 'UnknownError']
const listeners = new Set<() => void>()
let entries: string[] = []
let snapshot = 'SERIES-DIAG-03'

/** Only fixed classifications and positions in known application files leave this function. */
export function safeErrorSignature(error: unknown): string {
  try {
    if (!error || typeof error !== 'object') return 'UNKNOWN'
    const value = error as { name?: unknown; message?: unknown; stack?: unknown; kind?: unknown }
    const name = typeof value.name === 'string' && names.includes(value.name) ? value.name : 'UNKNOWN'
    const message = typeof value.message === 'string' ? value.message.slice(0, 8000) : ''
    const providerKinds = ['invalid_credentials', 'subscription_expired', 'direct_connection_refused', 'network_failure', 'rate_limited']
    const kind = name === 'ProviderError' && typeof value.kind === 'string' && providerKinds.includes(value.kind) ? value.kind : undefined
    const http = name === 'ProviderIncompatibleError' ? /^Provedor respondeu com status ([1-5][0-9]{2})\.$/.exec(message)?.[1] : undefined
    const react = /Minified React error #([0-9]{1,4})\b/.exec(message)
    const category = kind ? 'PROVIDER-' + kind : http ? 'HTTP-' + http : react ? 'REACT-' + react[1]
      : /Maximum update depth/i.test(message) ? 'UPDATE_DEPTH'
      : /Rendered (more|fewer) hooks|order of Hooks/i.test(message) ? 'HOOK_ORDER'
      : /not a function/i.test(message) ? 'NOT_FUNCTION'
      : /Cannot read propert/i.test(message) ? 'PROPERTY_READ'
      : /before initialization/i.test(message) ? 'INITIALIZATION'
      : /module|import/i.test(message) ? 'MODULE'
      : 'UNCLASSIFIED'
    const stack = typeof value.stack === 'string' ? value.stack.slice(0, 24000) : ''
    const positions = [...stack.matchAll(/(?:^|[/])(index|route-series-detail|catalogApi|freshness|accountCheck|seriesLoader|xtreamConnector|SeriesDetailScreen|RouteBoundary)\.(js|tsx?)(?::([0-9]{1,8})):([0-9]{1,8})(?=[)\s]|$)/gm)]
      .slice(0, 3).map((match) => match[1] + '.' + match[2] + ':' + match[3] + ':' + match[4])
    return [name, category, ...positions].join(' ')
  } catch {
    return 'UNKNOWN'
  }
}

export function recordSeriesDiagnostic(stage: Stage, state: 'loading' | 'ready' | 'failed' | 'empty' = 'ready', error?: unknown): void {
  if (!stages.includes(stage)) return
  const safeState = ['loading', 'ready', 'failed', 'empty'].includes(state) ? state : 'failed'
  entries = [...entries, stage + ' ' + safeState + (error === undefined ? '' : ' | ' + safeErrorSignature(error))].slice(-8)
  snapshot = 'SERIES-DIAG-03\n' + entries.join('\n')
  listeners.forEach((listener) => listener())
}

export const getSeriesDiagnostics = (): string => snapshot
export function subscribeSeriesDiagnostics(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

interface QueryState { isLoading: boolean; isError: boolean; error: unknown; data?: unknown }
export function useSeriesDiagnostics(seriesId: string, query: QueryState, episodes: QueryState & { data?: { episodes: unknown[]; outcome: string } }): void {
  const count = episodes.data?.episodes.length ?? 0
  const outcome = episodes.data?.outcome
  const hasSeries = Boolean(query.data)
  useEffect(() => { recordSeriesDiagnostic('SERIES_OPEN') }, [seriesId])
  useEffect(() => {
    recordSeriesDiagnostic('SERIES_QUERY', query.isLoading ? 'loading' : query.isError ? 'failed' : hasSeries ? 'ready' : 'empty', query.error ?? undefined)
  }, [query.isLoading, query.isError, query.error, hasSeries])
  useEffect(() => {
    recordSeriesDiagnostic('EPISODES_QUERY', episodes.isLoading ? 'loading' : episodes.isError || outcome === 'failed' ? 'failed' : count ? 'ready' : 'empty', episodes.error ?? undefined)
  }, [episodes.isLoading, episodes.isError, episodes.error, outcome, count])
}
