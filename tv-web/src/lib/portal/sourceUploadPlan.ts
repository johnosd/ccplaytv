/**
 * Plano de envio TV → site (feature 071, FR-008..FR-010). Função pura: decide o que subir.
 * Lista incompleta (sem os campos que o serviço exige) nunca sobe; a que já subiu só volta com revisão nova.
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

const filled = (value: string | undefined): value is string => typeof value === 'string' && value.trim() !== ''

/** Campos que o serviço exige por tipo (`merge_configuration`): sem eles o item seria recusado como inválido. */
function isComplete(source: UploadableSource): boolean {
  if (!filled(source.displayName)) return false
  return source.type === 'm3u_url'
    ? filled(source.m3uUrl)
    : filled(source.providerDns) && filled(source.providerUsername) && filled(source.providerPassword)
}

export function planSourceUploads({ sources, uploaded }: PlanSourceUploadsInput): SourceUpload[] {
  const plan: SourceUpload[] = []
  for (const source of sources) {
    if (!isComplete(source)) continue
    const sent = uploaded[source.id]
    if (sent !== undefined && sent >= source.revision) continue
    const item: SourceUpload = { sourceId: source.id, revision: source.revision, type: source.type, displayName: source.displayName }
    if (source.type === 'm3u_url') item.m3uUrl = source.m3uUrl
    else {
      item.providerDns = source.providerDns
      item.providerUsername = source.providerUsername
      item.providerPassword = source.providerPassword
    }
    if (filled(source.epgManualUrl)) item.epgManualUrl = source.epgManualUrl
    if (typeof source.epgOffsetHours === 'number' && source.epgOffsetHours !== 0) item.epgOffsetHours = source.epgOffsetHours
    plan.push(item)
  }
  return plan
}