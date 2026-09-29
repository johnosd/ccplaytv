import type { CatalogDb, CatalogRecord, TitleFields, TmdbResultRecord } from '../catalog/db'
import { buildStableId } from '../catalog/userStateRepository'

/**
 * Persistência da metadata do provedor por título (feature 032,
 * `data-model.md` §1). Fica à parte de `titleMetadata.ts` porque dois
 * caminhos gravam a mesma coisa: o detalhe do filme/série
 * (`ensureTitleMetadata`) e a obtenção de episódios da série
 * (`seriesLoader`, que já traz o `info` da série na mesma resposta — D-009).
 */

/**
 * Versão do conjunto de campos do provedor que guardamos. Registro com versão
 * menor conta como vencido mesmo dentro das 24 h (033/D-006: 1 = até a 032,
 * 2 = passa a incluir `trailerVideos`).
 */
export const PROVIDER_FIELDS_VERSION = 2

type IdentityRecord = Pick<CatalogRecord, 'sourceId' | 'kind' | 'providerStreamId' | 'seriesId' | 'originalName'>

/**
 * Chave do cache: a mesma identidade lógica de `userStateRepository` (fonte +
 * tipo + id estável), nunca a URL (D-001). `null` quando o item não tem
 * identidade estável — sem cache, mas sem quebrar a tela.
 */
export function titleStableId(record: IdentityRecord): string | null {
  try {
    return buildStableId({
      sourceId: record.sourceId,
      kind: record.kind,
      providerStreamId: record.providerStreamId,
      seriesId: record.seriesId,
      originalName: record.originalName,
    })
  } catch {
    return null
  }
}

/**
 * Grava o resultado do TMDB para o título (inclusive "sem correspondência" e
 * "id morto" — D-005) e carimba a obtenção. O que o provedor declarou é
 * preservado; sem registro prévio (fonte M3U), cria só com a parte TMDB.
 */
export async function storeTmdbResult(
  database: CatalogDb,
  record: IdentityRecord,
  result: TmdbResultRecord,
  now: number,
): Promise<void> {
  if (record.kind !== 'movie' && record.kind !== 'series') return
  const stableId = titleStableId(record)
  if (stableId === null) return
  const kind = record.kind
  await database.transaction('rw', database.titleMetadata, async () => {
    const existing = await database.titleMetadata.get(stableId)
    await database.titleMetadata.put({
      ...existing,
      stableId,
      sourceId: record.sourceId,
      kind,
      tmdb: result,
      tmdbFetchedAt: now,
    })
  })
}

/**
 * Grava (substituindo) o que o provedor declarou para o título e carimba a
 * obtenção. O registro do TMDB, se já existir, é preservado.
 */
export async function storeProviderMetadata(
  database: CatalogDb,
  record: IdentityRecord,
  fields: TitleFields,
  providerTmdbId: number | undefined,
  now: number,
): Promise<void> {
  if (record.kind !== 'movie' && record.kind !== 'series') return
  const stableId = titleStableId(record)
  if (stableId === null) return
  const kind = record.kind
  await database.transaction('rw', database.titleMetadata, async () => {
    const existing = await database.titleMetadata.get(stableId)
    await database.titleMetadata.put({
      ...existing,
      stableId,
      sourceId: record.sourceId,
      kind,
      provider: fields,
      providerTmdbId,
      providerFetchedAt: now,
      providerVersion: PROVIDER_FIELDS_VERSION,
    })
  })
}
