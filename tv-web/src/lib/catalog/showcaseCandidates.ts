/**
 * Candidatos das fileiras calculadas, por categoria (feature 086, `logic/selecoes-guardadas.md` §1 e §3).
 *
 * Quem grava uma categoria também guarda, dela, os poucos itens que podem entrar em "Adicionados recentemente" e em
 * "Bem avaliados" — com os itens que já estão em mãos, sem nenhuma leitura extra. A tela deixa de varrer o tipo inteiro.
 *
 * Por que isto é exato: um item que não está entre os `RECENT_CANDIDATES` mais novos **da sua categoria** não pode estar
 * entre os 12 mais novos **do tipo**; o mesmo vale para o pool de "Bem avaliados" (§2.1 do logic).
 */

import { db, type BlockItem, type CatalogDb, type CatalogReadItem, type CatalogRecord, type ShowcaseCandidatesRecord } from './db'
import { createRecentlyAddedAccumulator } from './showcaseSelection'
import { RATED_FIELDS, showcaseSeed, toShowcaseItem } from './showcaseSelection'
import { createRatedSelectionAccumulator } from './ratedSelection'
import { readBlockChunks } from './blockChunks'

/** Os mais novos guardados por categoria: um item fora dos 12 mais novos da sua categoria nunca entra nos 12 do tipo. */
export const RECENT_CANDIDATES = 12
/** Pool de "Bem avaliados" (36) mais folga para o dedupe entre categorias (`logic/selecoes-guardadas.md` §2.1). */
export const RATED_CANDIDATES = 48

/** O que o card precisa, sem reabrir o bloco da categoria. Mesmo conjunto de `projectReadItem`. */
export type ShowcaseCandidateItem = CatalogReadItem

export type ShowcaseCandidates = ShowcaseCandidatesRecord

export interface CandidateTarget {
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  categoryId: number
  groupOrder: number
  order: number
}

/** Campos que faltam num `BlockItem` (o bloco guarda o resto no cabeçalho) para ele virar um registro completo. */
function asRecord(item: CatalogRecord | BlockItem, target: CandidateTarget, position: number): CatalogRecord {
  return {
    ...(item as CatalogRecord),
    sourceId: target.sourceId,
    generation: target.generation,
    kind: target.kind,
    categoryId: target.categoryId,
    groupOrder: target.groupOrder,
    categoryPosition: (item as CatalogRecord).categoryPosition ?? position,
  }
}

/**
 * Escolhe os candidatos de uma categoria a partir dos itens que estão sendo gravados. Função pura: não toca o banco.
 * Os dois conjuntos saem dos MESMOS acumuladores que a varredura usa (`logic/selecoes-guardadas.md` §2).
 */
export function pickCandidates(
  target: CandidateTarget,
  items: readonly (CatalogRecord | BlockItem)[],
  now: number,
): ShowcaseCandidates {
  const recent = createRecentlyAddedAccumulator<CatalogReadItem>((item) => item.addedAt, RECENT_CANDIDATES)
  // A seleção de "Bem avaliados" guarda o pool com folga: quem escolhe os 12 finais é a mesclagem, com todas as categorias.
  const rated = createRatedSelectionAccumulator<CatalogReadItem>(RATED_FIELDS, {
    now,
    seed: showcaseSeed(target.sourceId, target.kind, now),
    limit: RATED_CANDIDATES,
    min: 1,
  })
  let eligibleCount = 0
  for (let position = 0; position < items.length; position += 1) {
    const item = toShowcaseItem(asRecord(items[position], target, position))
    recent.add(item)
    rated.add(item)
    if (isEligible(item, now)) eligibleCount += 1
  }
  return {
    categoryId: target.categoryId,
    sourceId: target.sourceId,
    generation: target.generation,
    kind: target.kind,
    order: target.order,
    recent: recent.finish(),
    rated: rated.finish().picked,
    eligibleCount,
    itemsCount: items.length,
  }
}

/** Mesma régua de elegibilidade de "Bem avaliados" (nota 6,0–9,9 e ano conhecido), só para a contagem por categoria. */
function isEligible(item: CatalogReadItem, now: number): boolean {
  const rating = item.providerRating
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 6 || rating >= 10) return false
  const currentYear = new Date(now).getFullYear()
  return typeof item.year === 'number' && Number.isInteger(item.year) && item.year >= 1888 && item.year <= currentYear + 1
}

/** Grava os candidatos de uma categoria (chamado por quem grava a categoria, nunca pela tela). */
export async function writeCandidates(candidates: ShowcaseCandidates, database: CatalogDb = db): Promise<void> {
  await database.showcaseCandidates.put(candidates)
}

/** Apaga os candidatos de uma categoria (liberação pelo orçamento, geração trocada, lista apagada). */
export async function clearCandidates(categoryId: number, database: CatalogDb = db): Promise<void> {
  await database.showcaseCandidates.delete(categoryId)
}

/** Candidatos da geração ativa de uma lista e tipo, na ordem da fonte. Nunca lê blocos. */
export async function readCandidates(
  sourceId: string,
  kind: 'movie' | 'series',
  database: CatalogDb = db,
): Promise<ShowcaseCandidates[]> {
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined) return []
  const rows = await database.showcaseCandidates.where('[sourceId+generation+kind]').equals([sourceId, generation, kind]).toArray()
  return rows.sort((a, b) => a.order - b.order || a.categoryId - b.categoryId)
}

/**
 * Preenche os candidatos de UMA categoria que já está gravada mas ainda não os tem (feature 086, task T029).
 *
 * Sem isto, uma lista que já estava no aparelho antes desta feature nunca ganharia fileiras: o catálogo não é regravado,
 * e é a gravação que escreve os candidatos. Roda em segundo plano, uma categoria por vez, como a conversão de blocos da
 * feature 082 — nunca na abertura da tela.
 *
 * @returns `true` se preencheu uma categoria (há mais trabalho a fazer), `false` quando não falta nenhuma.
 */
export async function fillNextCandidates(sourceId: string, database: CatalogDb = db): Promise<boolean> {
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined) return false
  const categories = (await database.categories.where('sourceId').equals(sourceId).toArray())
    .filter((category) => category.generation === generation && (category.kind === 'movie' || category.kind === 'series'))
  if (categories.length === 0) return false
  const existing = new Set(await database.showcaseCandidates.where('[sourceId+generation+kind]')
    .between([sourceId, generation, 'movie'], [sourceId, generation, 'series'], true, true).primaryKeys() as number[])
  const pending = categories.find((category) => !existing.has(category.id as number) && (category.itemsCount ?? 0) > 0)
  if (!pending) return false
  const categoryId = pending.id as number
  const items = await readBlockChunks(database, categoryId)
  if (items.length === 0) {
    // Categoria carimbada com itens mas sem bloco (liberada pelo orçamento): grava vazio para não tentar de novo.
    await writeCandidates({ categoryId, sourceId, generation, kind: pending.kind as 'movie' | 'series', order: pending.order,
      recent: [], rated: [], eligibleCount: 0, itemsCount: 0 }, database)
    return true
  }
  await writeCandidates(
    pickCandidates({ sourceId, generation, kind: pending.kind as 'movie' | 'series', categoryId, groupOrder: pending.order, order: pending.order },
      items, Date.now()),
    database,
  )
  return true
}
