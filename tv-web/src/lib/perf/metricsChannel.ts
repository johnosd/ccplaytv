/**
 * Canal genérico de métricas do app real (feature 085, US3). Só existe no build de medição
 * (`VITE_CCPLAY_METRICS_REPORT=http://<ip-do-pc>:8770/app-metrics`): manda linhas **só com números e rótulos fixos**
 * ao coletor local da `tizen-sonda`. No build normal a variável não existe e nada é enviado nem empacotado.
 *
 * Nunca URL, credencial, nome de lista/categoria/canal/título nem texto do provedor (constitution, "Segredos Fora dos
 * Clientes e dos Logs"). O envio nunca bloqueia: fila limitada, falha descartada em silêncio.
 *
 * Desenho em `sdd/specs/085-gravacao-carga-secao-tv/logic/canal-metricas.md`.
 */

export const METRICS_SCHEMA = 'ccplay-app-metrics/1'

/** Quem emitiu a linha. Rótulo fixo, definido no código. */
export type MetricSource = 'section-load' | 'entry' | 'frames' | 'assembly' | 'epg' | 'budget' | 'showcase'

/** Uma linha já saneada: `source` + campos numéricos finitos + rótulos da lista fixa. */
export type MetricLine = { source: MetricSource } & Record<string, number | string>

export interface MetricsChannel {
  /** Enfileira (saneada); nunca lança nem espera rede. */
  emit(line: Record<string, unknown>): void
  /** Envia o que está na fila; resolve sempre (falha descartada). */
  flush(): Promise<void>
  /** Linhas na fila agora (nunca passa de `maxQueue`). */
  pending(): number
}

const SOURCES: ReadonlySet<string> = new Set<MetricSource>(['section-load', 'entry', 'frames', 'assembly', 'epg', 'budget', 'showcase'])

/**
 * Únicas strings que podem sair, todas literais do código. Nunca entra aqui um valor que poderia ter vindo da lista
 * IPTV ou da pessoa (nome de canal, categoria, título, URL).
 */
const LABELS: ReadonlySet<string> = new Set([
  // CategoryKind / CatalogItemKind
  'channel', 'movie', 'series', 'episode',
  // SectionLoadOutcome
  'done', 'failed', 'storage_full', 'rate_limited',
  // AssemblyScreen / RevealReason (literais de `lib/assembly`)
  'home', 'movies', 'cache', 'ready', 'cap',
  // SyncEpgResult.outcome / EpgErrorKind (literais de `lib/epg`)
  'synced', 'skipped', 'network', 'refused', 'unreadable',
  // BudgetMode (`makeRoomFor`)
  'entry', 'prefetch', 'probe',
  // EpgPhase
  'sent', 'start', 'config', 'headers', 'room', 'read', 'written',
])

const KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,39}$/
const DEFAULT_MAX_QUEUE = 200
const FLUSH_DELAY_MS = 2000
const SEND_TIMEOUT_MS = 5000

/**
 * Mantém só `source` válido, números finitos e strings da lista fixa de rótulos (`logic/canal-metricas.md` §2).
 * Devolve `null` quando `source` não é um rótulo conhecido.
 */
export function sanitizeMetricLine(line: Record<string, unknown>): MetricLine | null {
  const source = line.source
  if (typeof source !== 'string' || !SOURCES.has(source)) return null
  const out: Record<string, number | string> = { source }
  for (const [key, value] of Object.entries(line)) {
    if (key === 'source' || !KEY_PATTERN.test(key)) continue
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'string' && LABELS.has(value)) out[key] = value
  }
  return out as MetricLine
}

/** Destino aceito: só `http:` em `localhost`/`127.0.0.1`/`192.168.x.y`, caminho `/app-metrics`, sem credencial/query. */
export function metricsDestination(destination: string | undefined): URL | null {
  if (!destination) return null
  try {
    const url = new URL(destination)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname)
    if (url.protocol !== 'http:' || !local || url.pathname !== '/app-metrics' || url.username || url.password || url.search || url.hash) return null
    return url
  } catch { return null }
}

export function createMetricsChannel(options: {
  destination: string | undefined
  fetchImpl?: typeof fetch
  maxQueue?: number
}): MetricsChannel {
  const url = metricsDestination(options.destination)
  const maxQueue = options.maxQueue ?? DEFAULT_MAX_QUEUE
  let queue: MetricLine[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = async (): Promise<void> => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined }
    const lines = queue
    queue = []
    if (!url || lines.length === 0) return
    try {
      const send = options.fetchImpl ?? fetch
      await send(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: METRICS_SCHEMA, sentAt: Date.now(), lines }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })
    } catch { /* o lote que falhou não volta para a fila */ }
  }

  return {
    emit(line) {
      try {
        if (!url) return
        const clean = sanitizeMetricLine(line)
        if (!clean) return
        queue.push(clean)
        if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue)
        if (timer === undefined) timer = setTimeout(() => { void flush() }, FLUSH_DELAY_MS)
      } catch { /* medir nunca atrapalha o app */ }
    },
    flush,
    pending: () => queue.length,
  }
}

let defaultChannel: MetricsChannel | undefined

/** Emissor padrão do app: no-op quando `VITE_CCPLAY_METRICS_REPORT` não existe (build normal). */
export function emitMetric(line: Record<string, unknown>): void {
  // Checagem direta de `import.meta.env`: no build normal o Vite a troca por `undefined` e o resto some do pacote.
  if (!import.meta.env.VITE_CCPLAY_METRICS_REPORT) return
  defaultChannel ??= createMetricsChannel({ destination: import.meta.env.VITE_CCPLAY_METRICS_REPORT })
  defaultChannel.emit(line)
}
