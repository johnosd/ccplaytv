import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db, type ImportRunRecord } from '../../lib/catalog/db'
import {
  createSource,
  deleteSource,
  listSources,
  readCredential,
  updateSource,
} from '../../lib/catalog/sourceRepository'
import { reconcileRun, type ImportHandle } from '../../lib/catalog/importPipeline'
import { runImport } from '../../lib/catalog/importRunner'
import { decideOnOpen } from '../../lib/catalog/freshness'
import { logger } from '../../lib/logger'

export type SourceType = 'm3u_url' | 'provider_credentials'

export interface ProviderCredentialsInput {
  dns: string
  username: string
  password: string
}

export interface CreateSourceInput {
  type: SourceType
  display_name: string
  m3u_url?: string
  provider?: ProviderCredentialsInput
}

export interface CreateSourceResponse {
  source_id: string
  import_job_id: string
}

export type ImportJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'cancelled'

export type ImportStep = 'acquiring' | 'parsing' | 'classifying' | 'publishing' | 'done'

export const TERMINAL_STATUSES: ImportJobStatus[] = [
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
]

export interface ImportJobCounts {
  entries_read: number
  channels: number
  discarded_by_type: number
  invalid: number
  /**
   * O que `entries_read`/`channels` contam (feature 010). `'categories'`
   * na fonte de provedor pelo protocolo JSON — que grava só estrutura e
   * conclui em segundos, sem percentual (FR-013). `'items'` em todo o
   * resto: canal, filme, série ou episódio, como sempre foi.
   */
  unit: 'items' | 'categories'
}

export interface ImportJobResponse {
  id: string
  source_id: string
  status: ImportJobStatus
  current_step: ImportStep
  counts: ImportJobCounts
  warnings: string[]
  error_kind: string | null
  created_at: string
  updated_at: string
  finished_at: string | null
}

export interface CancelImportJobResponse {
  id: string
  status: ImportJobStatus
  cancel_requested_at: string | null
}

export interface RetryImportJobResponse {
  id: string
  source_id: string
  status: ImportJobStatus
}

export type ConnectionState = 'never_synced' | 'synced' | 'error'

export type ProviderImportMode = 'xtream_api' | 'legacy_m3u' | null
/** Motivo do Modo limitado (feature 014, FR-020). `null` quando a fonte não está em Modo limitado. */
export type LimitedReason = 'protocol_unavailable' | 'panel_unreachable' | null

export interface SourceOut {
  id: string
  type: SourceType
  display_name: string
  connection_state: ConnectionState
  last_successful_sync_at: string | null
  provider_import_mode: ProviderImportMode
  limited_reason: LimitedReason
  provider_dns: string | null
  last_truncated_by_storage: boolean
  last_discarded_by_type: number
}

export interface ProviderCredentialsPatch {
  dns?: string
  username?: string
  password?: string
}

export interface UpdateSourceInput {
  display_name?: string
  m3u_url?: string
  provider?: ProviderCredentialsPatch
}

export interface SourceListResponse {
  sources: SourceOut[]
}

export interface ResyncSourceResponse {
  source_id: string
  import_job_id: string
}

export interface OpenSourceResponse {
  triggered: boolean
  import_job_id: string | null
}

const ACTIVE_POLL_INTERVAL_MS = 1500
const runningImports = new Map<string, ImportHandle>()

function mapStep(step: string): ImportStep {
  switch (step) {
    case 'fetching':
      return 'acquiring'
    case 'parsing':
      return 'parsing'
    case 'storing':
      return 'publishing'
    case 'done':
      return 'done'
    default:
      return 'done'
  }
}

function mapStatus(status: ImportRunRecord['status']): ImportJobStatus {
  switch (status) {
    case 'running':
      return 'running'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'completed'
  }
}

function toSourceOut(source: Awaited<ReturnType<typeof listSources>>[number]): SourceOut {
  return {
    id: source.id,
    type: source.type,
    display_name: source.displayName,
    connection_state: source.connectionState,
    last_successful_sync_at: source.lastSuccessfulSyncAt
      ? new Date(source.lastSuccessfulSyncAt).toISOString()
      : null,
    provider_import_mode: source.providerImportMode ?? null,
    limited_reason: source.limitedReason ?? null,
    provider_dns: source.providerDns ?? null,
    last_truncated_by_storage: source.lastTruncatedByStorage ?? false,
    last_discarded_by_type: source.lastDiscardedByType ?? 0,
  }
}

const SECTION_UNAVAILABLE: Record<string, string> = {
  movie: 'O provedor não respondeu à lista de filmes.',
  series: 'O provedor não respondeu à lista de séries.',
}

function toJobResponse(run: ImportRunRecord): ImportJobResponse {
  const warnings: string[] = []
  if (run.truncatedByStorage) warnings.push('A lista não coube inteira no aparelho.')
  if (run.invalidCount > 0) warnings.push('Entradas inválidas foram ignoradas.')
  // Canais, filmes e séries são todos importados: o que sobra no descarte
  // por tipo é o que não foi possível reconhecer. Dizer "só canais" aqui
  // descreveria uma versão do app que não é mais esta.
  if (run.discardedByType > 0) {
    warnings.push('Entradas de tipo não reconhecido ficaram de fora.')
  }
  for (const section of run.unavailableSections ?? []) {
    const message = SECTION_UNAVAILABLE[section]
    if (message) warnings.push(message)
  }

  return {
    id: run.id,
    source_id: run.sourceId,
    status: mapStatus(run.status),
    current_step: mapStep(run.step),
    counts: {
      entries_read: run.entriesRead,
      channels: run.channelsStored,
      discarded_by_type: run.discardedByType,
      invalid: run.invalidCount,
      unit: run.unit ?? 'items',
    },
    warnings,
    error_kind: run.errorKind ?? null,
    created_at: new Date(run.startedAt).toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
  }
}

async function startLocalImport(sourceId: string): Promise<ImportHandle> {
  // Pelo `importRunner`, não pelo pipeline direto: é ele que põe o trabalho
  // num Worker (e cai para a thread principal se o Worker não estiver no
  // pacote, R-002). Chamar `startImport` aqui mantinha um laço de centenas
  // de milhares de entradas na thread de interface — a tela parada e o
  // controle sem resposta que a constitution proíbe (SC-005). É também o
  // que faz o empacotador emitir `assets/importWorker.js`.
  const handle = await runImport(sourceId)
  runningImports.set(handle.runId, handle)
  void handle.completion
    .catch((error: unknown) => {
      // A categoria do erro já está no registro da execução, que é o que a
      // tela lê. O que chega aqui é o que o pipeline não soube categorizar —
      // defeito nosso, anotado em vez de virar rejeição sem dono.
      logger.warn('Importação terminou com erro não categorizado', error)
    })
    .finally(() => {
      runningImports.delete(handle.runId)
    })
  return handle
}

export function useCreateSource() {
  return useMutation({
    mutationFn: async (input: CreateSourceInput) => {
      const sourceId = await createSource({
        type: input.type,
        displayName: input.display_name,
        m3uUrl: input.m3u_url,
        providerDns: input.provider?.dns,
        providerUsername: input.provider?.username,
        providerPassword: input.provider?.password,
      })
      const handle = await startLocalImport(sourceId)
      return {
        source_id: sourceId,
        import_job_id: handle.runId,
      } satisfies CreateSourceResponse
    },
  })
}

export class ImportJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Importação ${jobId} não encontrada.`)
    this.name = 'ImportJobNotFoundError'
  }
}

export function useImportJob(jobId: string | null) {
  return useQuery({
    queryKey: ['import-job', jobId],
    queryFn: async () => {
      if (!jobId) return null
      // Toda leitura reconcilia: uma execução cujo app foi fechado no meio
      // chega aqui ainda marcada como "em andamento", e sem isto a tela
      // acompanharia para sempre um progresso que não avança mais.
      const run = await reconcileRun(jobId)
      // Registro ausente é erro, não "ainda carregando". Devolver `null`
      // deixava o `refetchInterval` abaixo sem status terminal para
      // encontrar: a consulta repetia indefinidamente e a tela ficava presa
      // num carregamento sem nenhum elemento focável.
      if (!run) throw new ImportJobNotFoundError(jobId)
      return toJobResponse(run)
    },
    enabled: jobId !== null,
    retry: false,
    refetchInterval: (query) => {
      // Sem esta saída, a consulta em erro continuaria repetindo: `data`
      // fica indefinido e a comparação abaixo nunca encontra um status
      // terminal.
      if (query.state.status === 'error') return false
      const status = query.state.data?.status
      if (!status || !TERMINAL_STATUSES.includes(status)) {
        return ACTIVE_POLL_INTERVAL_MS
      }
      return false
    },
  })
}

export function useCancelImportJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const handle = runningImports.get(jobId)
      if (handle) handle.cancel()
      // Sem handle, não há o que cancelar: a execução foi iniciada por uma
      // carga anterior do app e morreu com ela. Reconciliar diz a verdade
      // sobre o registro, em vez de responder "cancelada" para algo que este
      // caminho não cancelou.
      const run = handle ? await db.importRuns.get(jobId) : await reconcileRun(jobId)
      return {
        id: jobId,
        // O cancelamento é cooperativo: o desfecho real chega pela consulta
        // de progresso, não por esta resposta.
        status: run ? mapStatus(run.status) : 'cancelled',
        cancel_requested_at: null,
      } satisfies CancelImportJobResponse
    },
    onSuccess: (_result, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['import-job', jobId] })
    },
  })
}

export function useRetryImportJob() {
  return useMutation({
    mutationFn: async (jobId: string) => {
      const existing = await db.importRuns.get(jobId)
      const sourceId = existing?.sourceId
      if (!sourceId) throw new Error('Importação não encontrada para repetir.')
      const result = await startLocalImport(sourceId)
      return {
        id: result.runId,
        source_id: sourceId,
        status: 'running',
      } satisfies RetryImportJobResponse
    },
  })
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: async () => ({
      sources: (await listSources()).map(toSourceOut),
    }),
  })
}

export function useUpdateSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ sourceId, input }: { sourceId: string; input: UpdateSourceInput }) => {
      const updated = await updateSource(sourceId, {
        displayName: input.display_name,
        m3uUrl: input.m3u_url,
        providerDns: input.provider?.dns,
        providerUsername: input.provider?.username,
        providerPassword: input.provider?.password,
      })
      return updated ? toSourceOut(updated) : undefined
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
  })
}

export function useDeleteSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sourceId: string) => {
      await deleteSource(sourceId)
      return undefined
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
  })
}

export function useResyncSource() {
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const handle = await startLocalImport(sourceId)
      return {
        source_id: sourceId,
        import_job_id: handle.runId,
      } satisfies ResyncSourceResponse
    },
  })
}

export function useOpenSource() {
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const source = await db.sources.get(sourceId)
      if (!source) throw new Error('Fonte não encontrada')

      // Importação estática de propósito. Um `import()` aqui faria o
      // empacotador emitir um pedaço separado (`assets/freshness.js`), que o
      // `tizen_web_project.yaml` precisaria listar arquivo a arquivo — e a
      // ausência dessa linha falharia **só na TV**, como abertura de fonte
      // que rejeita sem motivo aparente (R-002). São 36 linhas: não há o que
      // adiar.
      const action = decideOnOpen(source, Date.now())

      if (action !== 'none') {
        const handle = await startLocalImport(sourceId)
        return {
          triggered: true,
          import_job_id: handle.runId,
        } satisfies OpenSourceResponse
      }

      return {
        triggered: false,
        import_job_id: null,
      } satisfies OpenSourceResponse
    },
  })
}

export async function readSourceCredential(sourceId: string) {
  return readCredential(sourceId)
}
