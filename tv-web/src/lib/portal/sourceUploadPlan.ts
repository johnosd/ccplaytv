/**
 * Plano de envio TV → site (feature 071, FR-008..FR-010). Função pura: decide o que subir.
 * STUB do sdd-plan — implementar na T021.
 */
export interface UploadableSource {
  id: string
  type: 'm3u_url' | 'provider_credentials'
  displayName: string
  m3uUrl?: string
  providerDns?: string
  providerUsername?: string
  providerPassword?: string
  epgManualUrl?: string
  epgOffsetHours?: number
  /** Revisão local da lista (contador que sobe a cada mudança). */
  revision: number
}

export interface SourceUpload {
  sourceId: string
  revision: number
  type: 'm3u_url' | 'provider_credentials'
  displayName: string
  m3uUrl?: string
  providerDns?: string
  providerUsername?: string
  providerPassword?: string
  epgManualUrl?: string
  epgOffsetHours?: number
}

export interface PlanSourceUploadsInput {
  sources: UploadableSource[]
  /** Última revisão já aceita pelo serviço, por sourceId. Vazio = nunca enviou nada. */
  uploaded: Record<string, number>
}

export function planSourceUploads(_input: PlanSourceUploadsInput): SourceUpload[] {
  throw new Error('not implemented')
}