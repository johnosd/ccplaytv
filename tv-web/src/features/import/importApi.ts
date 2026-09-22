import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db, type ImportRunRecord } from '../../lib/catalog/db'
import {
  createSource,
  deleteSource,
  listSources,
  readCredential,
  updateSource,
} from '../../lib/catalog/sourceRepository'
import { startImport, type ImportHandle } from '../../lib/catalog/importPipeline'

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

export interface SourceOut {
  id: string
  type: SourceType
  display_name: string
  connection_state: ConnectionState
  last_successful_sync_at: string | null
  provider_import_mode: ProviderImportMode
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
    provider_dns: source.providerDns ?? null,
    last_truncated_by_storage: source.lastTruncatedByStorage ?? false,
    last_discarded_by_type: source.lastDiscardedByType ?? 0,
  }
}

function toJobResponse(run: ImportRunRecord): ImportJobResponse {
  const warnings: string[] = []
  if (run.truncatedByStorage) warnings.push('A lista não coube inteira no aparelho.')
  if (run.invalidCount > 0) warnings.push('Entradas inválidas foram ignoradas.')
  if (run.discardedByType > 0) warnings.push('Só canais foram importados nesta fonte.')

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
    },
    warnings,
    error_kind: run.errorKind ?? null,
    created_at: new Date(run.startedAt).toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
  }
}

async function startLocalImport(sourceId: string): Promise<ImportHandle> {
  const handle = await startImport(sourceId)
  runningImports.set(handle.runId, handle)
  void handle.completion.finally(() => {
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

export function useImportJob(jobId: string | null) {
  return useQuery({
    queryKey: ['import-job', jobId],
    queryFn: async () => {
      if (!jobId) return null
      const run = await db.importRuns.get(jobId)
      return run ? toJobResponse(run) : null
    },
    enabled: jobId !== null,
    refetchInterval: (query) => {
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
      if (handle) {
        handle.cancel()
      }
      const run = await db.importRuns.get(jobId)
      return {
        id: jobId,
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

      const { decideOnOpen } = await import('../../lib/catalog/freshness')
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
