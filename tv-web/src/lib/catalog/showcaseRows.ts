/**
 * Montagem das fileiras calculadas a partir dos candidatos guardados (feature 086, `logic/selecoes-guardadas.md` §2 e §4).
 *
 * É o que a tela chama no lugar da varredura do tipo inteiro. Lê as linhas de candidatos (dezenas), filtra categoria
 * escondida/travada na LEITURA e mescla com os mesmos acumuladores da varredura — o resultado é idêntico (contrato C1).
 * **Nunca** toca a rede e **nunca** lê blocos do catálogo.
 */

import { db, type CatalogDb, type CatalogReadItem, type ShowcaseExternalRowRecord } from './db'
import { getCategoryAccess, listVisibleCategories } from './categoryAccess'
import { isCovered } from './catalogSearch'
import { readCandidates, type ShowcaseCandidateItem } from './showcaseCandidates'
import { createRecentlyAddedAccumulator, RATED_FIELDS, showcaseSeed } from './showcaseSelection'
import { createRatedSelectionAccumulator } from './ratedSelection'

export type { ShowcaseCandidateItem }

export type ExternalRowKey = 'top10' | 'tip' | 'because'

export type ShowcaseExternalRow = ShowcaseExternalRowRecord

export interface ShowcaseRows {
  recent: CatalogReadItem[]
  rated: CatalogReadItem[]
  /** Categorias visíveis já obtidas, para o aviso de cobertura parcial (FR-006). */
  coveredCategories: number
  totalCategories: number
}

export interface BuildShowcaseRowsOptions {
  database?: CatalogDb
  /** Instante da montagem — define a semente diária de "Bem avaliados". */
  now?: number
}

/**
 * Monta "Adicionados recentemente" e "Bem avaliados" da geração ativa. O resultado é igual ao da varredura do tipo
 * inteiro para o mesmo catálogo (contrato C1): mesmos acumuladores, alimentados na mesma ordem — categoria na ordem da
 * fonte, itens na ordem do bloco. **Não reimplemente a seleção aqui.**
 */
export async function buildShowcaseRowsFromCandidates(
  sourceId: string,
  kind: 'movie' | 'series',
  options: BuildShowcaseRowsOptions = {},
): Promise<ShowcaseRows> {
  const database = options.database ?? db
  const now = options.now ?? Date.now()
  const [rows, access, categories] = await Promise.all([
    readCandidates(sourceId, kind, database),
    // Feature 066: escondida ou travada sai na LEITURA — mudar a visibilidade não exige recalcular candidato nenhum.
    getCategoryAccess(sourceId, database),
    // Todas as categorias visíveis do tipo, inclusive as que a pré-carga ainda não trouxe: é delas que sai a cobertura.
    listVisibleCategories(sourceId, kind, database),
  ])
  // A cobertura conta as categorias que PODEM contribuir: as visíveis do tipo menos as escondidas/travadas. Uma categoria
  // que a pré-carga ainda não trouxe entra no total (é o que mantém o aviso de cobertura parcial honesto, FR-006).
  const usable = categories.filter((category) => !access.excluded.has(category.id))
  const byId = new Map(usable.map((category) => [category.id, category]))
  const visible = rows.filter((row) => byId.has(row.categoryId))

  const recent = createRecentlyAddedAccumulator<CatalogReadItem>((item) => item.addedAt)
  const rated = createRatedSelectionAccumulator<CatalogReadItem>(RATED_FIELDS, { now, seed: showcaseSeed(sourceId, kind, now) })
  for (const row of visible) {
    for (const item of row.recent) recent.add(item)
    for (const item of row.rated) rated.add(item)
  }
  return {
    recent: recent.finish(),
    rated: rated.finish().picked,
    coveredCategories: usable.filter(isCovered).length,
    totalCategories: usable.length,
  }
}

const externalId = (sourceId: string, kind: string, row: ExternalRowKey): string => `${sourceId}|${kind}|${row}`

/**
 * Fileira que depende de serviço externo, como foi guardada. Devolve `undefined` quando não há resultado guardado —
 * a fileira simplesmente não existe, e a montagem NUNCA dispara a consulta nem espera por ela (FR-013).
 *
 * Período vencido **não** invalida: a fileira mostra o guardado até o novo chegar (FR-015). Quem decide se vale a pena
 * buscar o período seguinte é quem roda em segundo plano, nunca a tela.
 */
export async function readExternalRow(
  sourceId: string,
  kind: 'movie' | 'series',
  row: ExternalRowKey,
  database: CatalogDb = db,
): Promise<ShowcaseExternalRow | undefined> {
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined) return undefined
  const stored = await database.showcaseExternalRows.get(externalId(sourceId, kind, row))
  return stored?.generation === generation ? stored : undefined
}

/** Guarda o resultado do casamento com o serviço externo. Roda fora da abertura da tela (FR-014). */
export async function writeExternalRow(row: ShowcaseExternalRow, database: CatalogDb = db): Promise<void> {
  await database.showcaseExternalRows.put({ ...row, id: externalId(row.sourceId, row.kind, row.row) })
}
