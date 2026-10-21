/**
 * Documento de tela (feature 086, `logic/documento-de-tela.md` P1/P2): tudo o que uma vitrine precisa para o primeiro
 * desenho, num registro só, lido numa leitura.
 *
 * O meio onde ele mora e o porquê estão em `screenDocumentStore.ts`. Aqui fica a montagem, que depende do catálogo.
 *
 * **Nunca é fonte da verdade**: é projeção descartável do catálogo. Apagar só custa uma abertura lenta.
 */

import { db, type CatalogDb } from './db'
import { getCategoryAccess, listVisibleCategories } from './categoryAccess'
import { isCovered } from './catalogSearch'
import { buildShowcaseRowsFromCandidates } from './showcaseRows'
import { dayKey } from './ratedSelection'
import {
  loadRawScreenDocument,
  saveScreenDocument,
  SCREEN_DOCUMENT_VERSION,
  type ScreenDocument,
} from './screenDocumentStore'

export { clearScreenDocuments, type ScreenDocument, type ScreenDocumentCategory } from './screenDocumentStore'

/** Igualdade de conjuntos de categorias excluídas (os dois lados chegam ordenados). */
function sameExcluded(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Lê o documento guardado, **se ele ainda vale**: mesma versão, geração ativa, mesmo dia e mesmo conjunto de categorias
 * escondidas/travadas. Qualquer divergência devolve `undefined`, e quem chama usa o caminho dos candidatos.
 *
 * Síncrono de propósito: é isto que o torna imune à carga em curso.
 */
export function readScreenDocument(
  sourceId: string,
  kind: 'movie' | 'series',
  expected: { generation: number; now: number; excluded: readonly number[] },
): ScreenDocument | undefined {
  const document = loadRawScreenDocument(sourceId, kind)
  if (document === undefined) return undefined
  if (document.v !== SCREEN_DOCUMENT_VERSION || document.kind !== kind || document.sourceId !== sourceId) return undefined
  if (document.generation !== expected.generation) return undefined
  if (document.day !== dayKey(expected.now)) return undefined
  if (!Array.isArray(document.excluded) || !sameExcluded(document.excluded, expected.excluded)) return undefined
  if (!Array.isArray(document.recent) || !Array.isArray(document.rated) || !Array.isArray(document.categories)) return undefined
  return document
}

/** Guarda o documento (ver `screenDocumentStore.ts`). */
export const writeScreenDocument = saveScreenDocument

export interface BuildScreenDocumentOptions {
  database?: CatalogDb
  now?: number
  /** Capas da primeira tela, decididas por quem conhece o formato das fileiras (a tela passa; o 2º plano omite). */
  images?: readonly string[]
}

/**
 * Monta o documento a partir do que já está gravado: os candidatos por categoria e a trilha de categorias. **Não** toca
 * a rede e **não** lê blocos do catálogo (contrato C3). Roda fora da abertura da tela — no fim da carga por seção, ou
 * depois de a tela já ter desenhado pelo caminho dos candidatos.
 */
export async function buildScreenDocument(
  sourceId: string,
  kind: 'movie' | 'series',
  options: BuildScreenDocumentOptions = {},
): Promise<ScreenDocument | undefined> {
  const database = options.database ?? db
  const now = options.now ?? Date.now()
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined) return undefined

  const [rows, access, categories] = await Promise.all([
    buildShowcaseRowsFromCandidates(sourceId, kind, { database, now }),
    getCategoryAccess(sourceId, database),
    listVisibleCategories(sourceId, kind, database),
  ])
  const usable = categories.filter((category) => !access.excluded.has(category.id as number))
  return {
    v: SCREEN_DOCUMENT_VERSION,
    sourceId,
    generation,
    kind,
    builtAt: now,
    day: dayKey(now),
    excluded: [...access.excluded].sort((a, b) => a - b),
    categories: usable.map((category) => ({
      id: category.id as number,
      // A trilha mostra o nome da fonte; categoria sem nome aparece vazia, como já aparece hoje (nunca inventamos um).
      name: category.name ?? '',
      covered: isCovered(category),
      order: category.order,
    })),
    recent: rows.recent,
    rated: rows.rated,
    coveredCategories: rows.coveredCategories,
    totalCategories: rows.totalCategories,
    images: [...(options.images ?? [])],
  }
}

/** Monta e guarda, numa chamada. `false` quando não havia o que guardar ou o `localStorage` recusou. */
export async function refreshScreenDocument(
  sourceId: string,
  kind: 'movie' | 'series',
  options: BuildScreenDocumentOptions = {},
): Promise<boolean> {
  const document = await buildScreenDocument(sourceId, kind, options)
  return document === undefined ? false : saveScreenDocument(document)
}

/**
 * Refaz **um** documento que esteja faltando, para a fila de segundo plano do prefetch (T071): uma lista que já estava
 * no aparelho, ou um documento que a gravação de candidatos acabou de invalidar, ganha o seu aqui — nunca na abertura
 * da tela.
 *
 * @returns `true` se refez um (há mais trabalho a fazer), `false` quando os dois tipos já têm o seu.
 */
export async function refreshMissingScreenDocuments(sourceId: string, database: CatalogDb = db): Promise<boolean> {
  for (const kind of ['movie', 'series'] as const) {
    if (loadRawScreenDocument(sourceId, kind) !== undefined) continue
    return await refreshScreenDocument(sourceId, kind, { database })
  }
  return false
}
