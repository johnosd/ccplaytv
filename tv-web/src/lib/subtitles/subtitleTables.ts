/**
 * Tabelas da feature 090 (Dexie v27, `dbSchema.ts`) com acesso tipado. Ficam fora da classe `CatalogDb` porque
 * `db.ts` está no teto de linhas da catraca (mesmo motivo de `parentalTables.ts`).
 */
import type { Table } from 'dexie'
import type { CatalogDb } from '../catalog/db'
import type { SubtitleLanguage, SubtitleProvider } from './types'

/** Uma legenda externa guardada: uma por idioma por item (`data-model.md` §1). */
export interface ExternalSubtitleRecord {
  stableId: string
  sourceId: string
  language: SubtitleLanguage
  /** `SubtitleResult.id` de onde veio (`os:…`/`sd:…`). Nunca URL. */
  resultId: string
  release: string
  delayMs: number
  /** No máximo uma linha ativa por `stableId`. */
  active: boolean
  /** Texto do arquivo comprimido com gzip (`blockCodec.gzipText`). */
  bytes: Uint8Array
  size: number
  savedAt: number
  lastUsedAt: number
}

/** A chave pessoal (BYOK) de um fornecedor de legenda (`data-model.md` §1b, exceção (l) da constitution). */
export interface SubtitleCredentialRecord {
  provider: SubtitleProvider
  key: string
  state: 'valid' | 'rejected' | 'rate_limited'
  lastTestedAt: number
  chosen: boolean
}

export function externalSubtitles(database: CatalogDb): Table<ExternalSubtitleRecord, [string, SubtitleLanguage]> {
  return database.table('externalSubtitles')
}

export function subtitleCredentials(database: CatalogDb): Table<SubtitleCredentialRecord, SubtitleProvider> {
  return database.table('subtitleCredentials')
}
