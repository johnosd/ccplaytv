import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000'

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
  movies: number
  series: number
  episodes: number
  unclassified: number
  invalid: number
}

export interface ImportJobResponse {
  id: string
  source_id: string
  status: ImportJobStatus
  current_step: ImportStep
  counts: ImportJobCounts
  warnings: string[]
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

// `null` para fonte m3u_url, ou fonte de provedor ainda não migrada pelo
// conector novo (feature 004). `legacy_m3u` é o sinal de modo limitado.
export type ProviderImportMode = 'xtream_api' | 'legacy_m3u' | null

export interface SourceOut {
  id: string
  type: SourceType
  display_name: string
  connection_state: ConnectionState
  last_successful_sync_at: string | null
  provider_import_mode: ProviderImportMode
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

export class ImportApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    const message =
      (detail && typeof detail === 'object' && 'detail' in detail
        ? String((detail as { detail?: unknown }).detail)
        : null) ?? response.statusText
    throw new ImportApiError(response.status, message)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

const ACTIVE_POLL_INTERVAL_MS = 1500

export function useCreateSource() {
  return useMutation({
    mutationFn: (input: CreateSourceInput) =>
      apiFetch<CreateSourceResponse>('/sources', {
        method: 'POST',
        body: JSON.stringify({ ...input, request_key: crypto.randomUUID() }),
      }),
  })
}

export function useImportJob(jobId: string | null) {
  return useQuery({
    queryKey: ['import-job', jobId],
    queryFn: () => apiFetch<ImportJobResponse>(`/import-jobs/${jobId}`),
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
    mutationFn: (jobId: string) =>
      apiFetch<CancelImportJobResponse>(`/import-jobs/${jobId}/cancel`, { method: 'POST' }),
    onSuccess: (_result, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['import-job', jobId] })
    },
  })
}

export function useRetryImportJob() {
  return useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<RetryImportJobResponse>(`/import-jobs/${jobId}/retry`, { method: 'POST' }),
  })
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => apiFetch<SourceListResponse>('/sources'),
  })
}

export function useDeleteSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sourceId: string) => apiFetch<void>(`/sources/${sourceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
  })
}

export function useResyncSource() {
  return useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch<ResyncSourceResponse>(`/sources/${sourceId}/resync`, { method: 'POST' }),
  })
}

/**
 * Avisa o backend "abri esta fonte" — nunca decide nada no cliente (D-004).
 * O backend decide migrar (FR-012), atualizar por idade (FR-020) ou não
 * fazer nada; a TV só dispara a chamada e, se algo foi disparado, acompanha
 * o job para saber quando o catálogo pode ter mudado (ver `useAutoRefresh`
 * em `App.tsx`).
 */
export function useOpenSource() {
  return useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch<OpenSourceResponse>(`/sources/${sourceId}/open`, { method: 'POST' }),
  })
}
