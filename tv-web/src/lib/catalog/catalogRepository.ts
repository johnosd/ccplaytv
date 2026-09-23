/**
 * Acesso ao catálogo local (`contracts/local-storage.md` §2).
 *
 * Nenhuma tela fala com Dexie direto (D-001) — tudo passa por aqui, para
 * trocar a camada de armazenamento depois não alcançar nenhuma tela.
 *
 * Duas regras estruturais valem em todo este arquivo:
 *
 * 1. **Leitura é sempre da geração ativa**, e quem chama não informa
 *    geração. Isso impede uma tela de ler pela metade um catálogo que
 *    ainda está sendo escrito.
 * 2. **Escrita é sempre numa geração nova**, publicada só no fim (D-004).
 *    A anterior continua legível enquanto isso.
 */

import { db, type CatalogDb, type CatalogRecord, type CatalogItemKind } from './db'

/**
 * Limites da faixa de `generation` e de `groupOrder` nas consultas por
 * índice composto. `-Infinity`/`Infinity` não são chaves válidas de
 * IndexedDB; estes são, e cobrem toda a faixa que o pipeline produz —
 * inclusive `Number.MAX_SAFE_INTEGER`, usado pelo conector para a
 * categoria desconhecida.
 */
const KEY_MIN = -1
const KEY_MAX = Number.MAX_SAFE_INTEGER

/** Falta de espaço no aparelho — sinalizada ao chamador, nunca engolida (FR-018). */
export class StorageFullError extends Error {
  constructor() {
    super('Não há espaço no aparelho para guardar o catálogo.')
    this.name = 'StorageFullError'
  }
}

/**
 * O navegador reporta falta de espaço de mais de um jeito, e o Dexie ainda
 * embrulha o erro original. Reconhecer só uma das formas deixaria o
 * truncamento passar como erro genérico — e a pessoa veria um catálogo
 * incompleto sem aviso.
 */
function isQuotaError(error: unknown): boolean {
  const names = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const name = (current as { name?: unknown }).name
    if (typeof name === 'string' && names.has(name)) return true
    current = (current as { inner?: unknown }).inner
  }
  return false
}

/** Uma categoria do catálogo, na ordem em que a fonte a declarou (FR-002). */
export interface CatalogCategory {
  /**
   * Como a fonte declarou. Ausente é estado legítimo — canal sem categoria
   * existe, e não recebe rótulo inventado.
   */
  name?: string
  /** Chave de paginação: é por ela que se pede a página, não pelo nome. */
  order: number
  count: number
}

async function activeGenerationOf(
  sourceId: string,
  database: CatalogDb,
): Promise<number | undefined> {
  const source = await database.sources.get(sourceId)
  return source?.activeGeneration
}

/**
 * Consulta sempre pelo índice de três partes, mesmo quando a categoria não
 * é filtrada: assim a varredura de uma geração inteira também sai na ordem
 * declarada pela fonte, sem ordenação por texto em cima.
 */
function query(database: CatalogDb, sourceId: string, generation: number, groupOrder?: number, kind?: CatalogItemKind) {
  if (kind) {
    const low = [sourceId, generation, kind, groupOrder ?? KEY_MIN]
    const high = [sourceId, generation, kind, groupOrder ?? KEY_MAX]
    return database.channels.where('[sourceId+generation+kind+groupOrder]').between(low, high, true, true)
  }
  const low = [sourceId, generation, groupOrder ?? KEY_MIN]
  const high = [sourceId, generation, groupOrder ?? KEY_MAX]
  return database.channels.where('[sourceId+generation+groupOrder]').between(low, high, true, true)
}

/** Tudo de uma fonte, qualquer geração — usado só para descarte. */
function allGenerations(database: CatalogDb, sourceId: string) {
  return database.channels
    .where('[sourceId+generation]')
    .between([sourceId, KEY_MIN], [sourceId, KEY_MAX], true, true)
}

/**
 * Categorias da geração ativa, na ordem declarada pela fonte.
 *
 * Percorre só as chaves distintas do índice composto — não o catálogo. Com
 * 300 mil canais e algumas centenas de categorias, a diferença entre isso e
 * um `toArray()` é a diferença entre abrir a lista e travar a TV (FR-005).
 */
export async function listCategories(
  sourceId: string,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<CatalogCategory[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []

  const keys = (await query(database, sourceId, generation, undefined, kind).uniqueKeys()) as unknown[]
  const orders = keys
    .map((key) => (Array.isArray(key) ? Number(key[kind ? 3 : 2]) : Number.NaN))
    .filter((value) => Number.isFinite(value))

  const categories: CatalogCategory[] = []
  for (const order of Array.from(new Set(orders)).sort((a, b) => a - b)) {
    // Duas consultas, não duas chamadas na mesma: `first()` aplica um
    // limite que fica no objeto de consulta, e um `count()` em seguida
    // contaria no máximo 1.
    const sample = await query(database, sourceId, generation, order, kind).first()
    if (!sample) continue
    const count = await query(database, sourceId, generation, order, kind).count()
    categories.push({ name: sample.group, order, count })
  }
  return categories
}

/**
 * Uma janela de canais de uma categoria — paginado por contrato (FR-005): a
 * tela pede uma página, nunca o catálogo.
 */
export async function listChannels(
  sourceId: string,
  groupOrder: number,
  offset: number,
  limit: number,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  return query(database, sourceId, generation, groupOrder, kind).offset(offset).limit(limit).toArray()
}

/**
 * Quantos canais há na geração ativa. Serve para decidir estado vazio —
 * nunca para prometer que o catálogo da fonte veio inteiro.
 */
export async function countChannels(
  sourceId: string,
  groupOrder?: number,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<number> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return 0
  return query(database, sourceId, generation, groupOrder, kind).count()
}

export async function getChannel(
  id: number,
  database: CatalogDb = db,
): Promise<CatalogRecord | undefined> {
  return database.channels.get(id)
}

/**
 * Grava um lote na geração em construção.
 *
 * Em transação: um lote entra inteiro ou não entra. Falta de espaço sobe
 * como `StorageFullError` para o pipeline poder registrar truncamento em
 * vez de fingir que gravou.
 */
export async function storeBatch(
  channels: CatalogRecord[],
  database: CatalogDb = db,
): Promise<void> {
  if (channels.length === 0) return
  try {
    await database.transaction('rw', database.channels, async () => {
      await database.channels.bulkAdd(channels)
    })
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}

/**
 * Escolhe o número da próxima geração.
 *
 * Olha o maior número já presente, não só o ativo: uma importação anterior
 * que falhou no meio pode ter deixado linhas de uma geração mais alta, e
 * reaproveitar esse número misturaria catálogo velho com novo.
 */
export async function allocateGeneration(
  sourceId: string,
  database: CatalogDb = db,
): Promise<number> {
  const source = await database.sources.get(sourceId)
  const highestStored = await allGenerations(database, sourceId).reverse().first()
  return Math.max(source?.activeGeneration ?? 0, highestStored?.generation ?? 0) + 1
}

/**
 * Publica a geração recém-escrita: troca o ponteiro da fonte **e só então**
 * descarta as anteriores (D-004).
 *
 * A ordem é o ponto. Descartar primeiro deixaria a pessoa sem catálogo
 * durante a troca; e se a publicação falhasse ali no meio, sem catálogo
 * nenhum.
 */
export async function publishGeneration(
  sourceId: string,
  generation: number,
  database: CatalogDb = db,
): Promise<void> {
  await database.transaction('rw', database.sources, database.channels, async () => {
    await database.sources.update(sourceId, { activeGeneration: generation, updatedAt: Date.now() })
    await allGenerations(database, sourceId)
      .and((channel) => channel.generation !== generation)
      .delete()
  })
}

/** Limpa uma importação que não chegou ao fim, sem tocar na geração ativa. */
export async function discardGeneration(
  sourceId: string,
  generation: number,
  database: CatalogDb = db,
): Promise<void> {
  const active = await activeGenerationOf(sourceId, database)
  if (active === generation) {
    // Guarda contra apagar o catálogo que está no ar por um número errado
    // vindo de uma execução antiga.
    throw new Error('Geração ativa não pode ser descartada.')
  }
  await query(database, sourceId, generation).delete()
}

/** Remove todo o catálogo de uma fonte, de todas as gerações. */
export async function deleteAllForSource(
  sourceId: string,
  database: CatalogDb = db,
): Promise<void> {
  await allGenerations(database, sourceId).delete()
}
