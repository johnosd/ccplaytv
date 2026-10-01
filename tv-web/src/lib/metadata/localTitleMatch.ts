import { db, type CatalogDb, type CatalogRecord, type TmdbTitleRef } from '../catalog/db'
import { activeGeneration, listAllOfKind, listCategories } from '../catalog/catalogRepository'
import { isCovered } from '../catalog/catalogSearch'
import { titleStableId } from './titleMetadataStore'
import { comparableTitle, yearHintFromTitle } from './tmdbMatch'
import type { KindCoverage, ResolvedTitle, TitleResolution } from './types'

/**
 * Cruzamento de títulos do TMDB com o catálogo JÁ guardado no aparelho
 * (feature 035, FR-005/FR-006/FR-007/FR-008 — `logic/cruzamento-local.md`).
 *
 * Só lê o IndexedDB (geração ativa da fonte, mesmo tipo): nunca rede, nunca
 * baixa categoria. Identidade TMDB conhecida primeiro; senão título
 * normalizado + ano exato. Várias cópias da MESMA obra (mesmo ano) → a primeira
 * na ordem da fonte; candidatos de anos diferentes → não encontrado.
 *
 * @param kinds tipos cuja cobertura deve ser informada, mesmo sem nenhum `ref` daquele tipo.
 */

type Kind = 'movie' | 'series'

function keyOf(ref: TmdbTitleRef): string {
  return `tmdb:${ref.kind}:${ref.tmdbId}`
}

function localYear(record: CatalogRecord): number | undefined {
  return record.year ?? yearHintFromTitle(record.originalName)
}

/** Registro local de cada ref de um tipo, pela ordem da fonte. */
async function matchKind(
  sourceId: string,
  kind: Kind,
  refs: TmdbTitleRef[],
  database: CatalogDb,
): Promise<Map<string, CatalogRecord>> {
  const found = new Map<string, CatalogRecord>()
  const wantedIds = new Set(refs.map((ref) => ref.tmdbId))

  // Identidade: título já casado no TMDB (só o que foi aberto alguma vez).
  const identity = new Map<string, number>()
  await database.titleMetadata
    .where('sourceId')
    .equals(sourceId)
    .each((row) => {
      if (row.kind === kind && row.tmdb?.status === 'matched' && wantedIds.has(row.tmdb.tmdbId)) {
        identity.set(row.stableId, row.tmdb.tmdbId)
      }
    })

  const byTitle = new Map<string, TmdbTitleRef[]>()
  for (const ref of refs) {
    for (const text of [ref.title, ref.originalTitle]) {
      const comparable = comparableTitle(text ?? '')
      if (comparable === '') continue
      const list = byTitle.get(comparable) ?? []
      if (!list.includes(ref)) list.push(ref)
      byTitle.set(comparable, list)
    }
  }

  const byIdentity = new Map<number, CatalogRecord>()
  const byTitleHits = new Map<TmdbTitleRef, Array<{ record: CatalogRecord; year: number }>>()

  for (const record of await listAllOfKind(sourceId, kind, database)) {
    const stableId = titleStableId(record)
    const tmdbId = stableId !== null ? identity.get(stableId) : undefined
    if (tmdbId !== undefined && !byIdentity.has(tmdbId)) byIdentity.set(tmdbId, record)

    const targets = byTitle.get(comparableTitle(record.originalName))
    if (!targets) continue
    const year = localYear(record)
    if (year === undefined) continue
    for (const ref of targets) {
      // Ano EXATO (emenda R-012): com ±1, homônimos de anos vizinhos abriam o filme errado.
      if (ref.year === undefined || year !== ref.year) continue
      const hits = byTitleHits.get(ref) ?? []
      hits.push({ record, year })
      byTitleHits.set(ref, hits)
    }
  }

  for (const ref of refs) {
    const viaIdentity = byIdentity.get(ref.tmdbId)
    if (viaIdentity) {
      found.set(keyOf(ref), viaIdentity)
      continue
    }
    const hits = byTitleHits.get(ref) ?? []
    // Anos diferentes entre os candidatos = ambíguo: nunca escolhe por aproximação.
    if (hits.length > 0 && hits.every((hit) => hit.year === hits[0].year)) found.set(keyOf(ref), hits[0].record)
  }
  return found
}

export async function resolveTmdbTitles(
  sourceId: string,
  refs: TmdbTitleRef[],
  kinds: Kind[],
  options: { database?: CatalogDb } = {},
): Promise<TitleResolution> {
  const database = options.database ?? db

  const unique: TmdbTitleRef[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    const key = keyOf(ref)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(ref)
  }

  const coverage: TitleResolution['coverage'] = {}
  const generation = await activeGeneration(sourceId, database)
  for (const kind of kinds) {
    const categories = generation === undefined ? [] : await listCategories(sourceId, kind, database)
    const value: KindCoverage = { covered: categories.filter(isCovered).length, total: categories.length }
    coverage[kind] = value
  }

  const matches = new Map<string, CatalogRecord>()
  if (generation !== undefined) {
    for (const kind of new Set(unique.map((ref) => ref.kind))) {
      const found = await matchKind(sourceId, kind, unique.filter((ref) => ref.kind === kind), database)
      for (const [key, record] of found) matches.set(key, record)
    }
  }

  const resolved = unique.map<ResolvedTitle>((ref) => {
    const record = matches.get(keyOf(ref))
    return record?.id !== undefined ? { ...ref, key: keyOf(ref), localItemId: String(record.id) } : { ...ref, key: keyOf(ref) }
  })
  return {
    titles: [...resolved.filter((title) => title.localItemId !== undefined), ...resolved.filter((title) => title.localItemId === undefined)],
    coverage,
  }
}
