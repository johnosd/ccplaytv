/**
 * Item do provedor → registro do catálogo, e falha de obtenção → resultado (extraídos de `categoryLoader.ts` na
 * feature 082, T001, para dar folga ao teto de linhas da catraca; comportamento idêntico).
 */
import type { CatalogRecord } from './db'
import { StorageFullError, type CatalogCategory } from './catalogRepository'
import { copyListingFields } from './adultFlag'
import { providerErrorCode } from '../errors/errorCatalog'
import { ProviderError, ProviderIncompatibleError, type MappedChannel } from './xtreamConnector'
import type { CategoryFetchOutcome, EnsureCategoryResult } from './categoryLoader'

/** Um item mapeado do provedor como registro do catálogo — mesmo formato na carga por categoria e por seção (feature 038). */
export function toItemRecord(
  channel: MappedChannel,
  sourceId: string,
  generation: number,
  category: CatalogCategory,
): CatalogRecord {
  const record: CatalogRecord = {
    sourceId,
    generation,
    kind: channel.kind,
    name: channel.name,
    originalName: channel.originalName,
    group: channel.group,
    groupOrder: category.order,
    categoryId: category.id,
    providerStreamId: channel.providerStreamId,
    providerCategoryId: channel.providerCategoryId,
    seriesId: channel.seriesId,
    seasonNumber: channel.seasonNumber,
    episodeNumber: channel.episodeNumber,
    streamExtension: channel.streamExtension,
    // Provedor nunca guarda URL — ela é montada na hora, a partir do identificador (`playbackUrl.ts`).
    directUrl: undefined,
    // Feature 015/024: capa/logo declarado pela fonte (também canal desde a 024 — mapLiveEntry preenche).
    iconUrl: channel.iconUrl,
    // Feature 030: id de EPG só no canal (FR-006/FR-008).
    epgChannelId: channel.kind === 'channel' ? channel.epgChannelId : undefined,
    // Feature 025: ano/inclusão declarados pela fonte (filme/série do provedor).
    year: channel.year,
    addedAt: channel.addedAt,
  }
  // Feature 055 (D-002/D-003): campos da listagem só quando existem (nota em filme e série; gênero e fundo só em série).
  copyListingFields(channel, record) // nota (055) e marcação de adulto do painel (066, FR-035)
  // Feature 058 (FR-007): dias de arquivo só no canal, e só quando o painel declara.
  if (channel.kind === 'channel' && channel.archiveDays !== undefined) record.archiveDays = channel.archiveDays
  if (channel.kind === 'series') {
    if (channel.providerGenres !== undefined) record.providerGenres = channel.providerGenres
    if (channel.providerBackdropUrl !== undefined) record.providerBackdropUrl = channel.providerBackdropUrl
  }
  return record
}

/** Falha de gravação por falta de espaço vira dado, nunca exceção (feature 038, FR-008). */
export function failureOf(error: unknown, hadItems: boolean): EnsureCategoryResult {
  const outcome: CategoryFetchOutcome = hadItems ? 'stale-served' : 'failed'
  if (error instanceof StorageFullError) return { outcome, reason: 'storage_full' }
  // Feature 042 (FR-017): 429 do painel é dado, não exceção — a pré-carga espera; a entrada mostra `API-429`.
  if (error instanceof ProviderError && error.kind === 'rate_limited') {
    return { outcome, reason: 'rate_limited', errorCode: 'API-429' }
  }
  if (error instanceof ProviderError) return { outcome, errorCode: providerErrorCode(error.kind, navigator.onLine) }
  if (error instanceof ProviderIncompatibleError) return { outcome, errorCode: 'SRC-422' }
  return { outcome }
}
