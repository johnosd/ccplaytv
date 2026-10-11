import type { SourceRecord, SourceType } from './db'

export interface SourceExtras {
  epgManualUrl?: string
  epgOffsetHours?: number
  epgDisabled?: boolean
  clearFields?: ('epgManualUrl' | 'epgOffsetHours')[]
}
export interface CreateSourceInput extends SourceExtras {
  type: SourceType
  displayName: string
  m3uUrl?: string
  providerDns?: string
  providerUsername?: string
  providerPassword?: string
}
export interface UpdateSourceInput extends SourceExtras {
  displayName?: string
  m3uUrl?: string
  providerDns?: string
  providerUsername?: string
  providerPassword?: string
}

/** Campos opcionais: vazio preserva; limpeza é sempre explícita. Nunca ecoar URL no erro. */
export function sourceExtras(input: SourceExtras): Partial<SourceRecord> {
  const patch: Partial<SourceRecord> = {}
  const invalid = () => { throw new Error('invalid_source_configuration') }
  if (input.clearFields !== undefined && (!Array.isArray(input.clearFields) ||
      input.clearFields.length > 2 || input.clearFields.some(field => !['epgManualUrl', 'epgOffsetHours'].includes(field)))) invalid()
  if (input.epgManualUrl !== undefined) {
    if (typeof input.epgManualUrl !== 'string' || input.epgManualUrl.length > 4096 || /[\x00-\x1f\x7f]/.test(input.epgManualUrl)) invalid()
    const trimmed = input.epgManualUrl.trim()
    if (trimmed) {
      try { if (!['http:', 'https:'].includes(new URL(trimmed).protocol)) invalid() } catch { invalid() }
      patch.epgManualUrl = trimmed
      patch.epgLastErrorKind = undefined
      patch.epgLastErrorAt = undefined
    }
  }
  if (input.epgOffsetHours !== undefined) {
    if (!Number.isInteger(input.epgOffsetHours) || Math.abs(input.epgOffsetHours) > 12) invalid()
    patch.epgOffsetHours = input.epgOffsetHours === 0 ? undefined : input.epgOffsetHours
  }
  if (input.epgDisabled !== undefined) {
    if (typeof input.epgDisabled !== 'boolean') invalid()
    patch.epgDisabled = input.epgDisabled
    if (input.epgDisabled) {
      patch.epgLastSyncAt = undefined
      patch.epgLastErrorKind = undefined
      patch.epgLastErrorAt = undefined
    }
  }
  for (const field of input.clearFields ?? []) {
    if ((field === 'epgManualUrl' && input.epgManualUrl?.trim()) ||
        (field === 'epgOffsetHours' && input.epgOffsetHours !== undefined)) invalid()
    patch[field] = undefined
    if (field === 'epgManualUrl') {
      patch.epgLastErrorKind = undefined
      patch.epgLastErrorAt = undefined
    }
  }
  return patch
}
