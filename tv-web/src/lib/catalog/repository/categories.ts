/** Categorias da fonte: leitura, gravaÃ§Ã£o e carimbos. Parte da divisÃ£o de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogFetchMode, type CatalogItemKind, type CategoryKind, type CategoryRecord } from '../db'
import { KEY_MAX, KEY_MIN, activeGenerationOf } from './shared'

/** Uma categoria do catálogo, na ordem em que a fonte a declarou (FR-002). */
export interface CatalogCategory {
  /** Chave local — usada por `categoryLoader` para buscar/gravar os itens desta categoria (feature 010). */
  id: number
  /** Seção do painel a que pertence — decide qual endpoint `categoryLoader` chama. */
  kind: CategoryKind
  /**
   * Como a fonte declarou. Ausente é estado legítimo — canal sem categoria
   * existe, e não recebe rótulo inventado.
   */
  name?: string
  /** Chave de paginação: é por ela que se pede a página, não pelo nome. */
  order: number
  /** Quantos itens estão gravados agora. `0` para categoria ainda não obtida. */
  count: number
  /** Como os itens desta categoria chegam (data-model.md §2.1). */
  fetchMode: CatalogFetchMode
  /** Identificador do provedor — é por ele que a busca sob demanda pergunta. `undefined` em categoria `eager`. */
  providerCategoryId?: string
  /** Contagem que a fonte declara. `undefined` = a fonte não declarou nada — nunca um número inventado no lugar (FR-014). */
  declaredCount?: number
  /** Instante da última obtenção dos itens. `undefined` = nunca obtida. */
  itemsFetchedAt?: number
  /** Renovação pedida por uma atualização de estrutura (feature 038, FR-025). Pendente quando > `itemsFetchedAt`. */
  renewRequestedAt?: number
}

/** O que se grava ao registrar a estrutura de uma fonte (feature 010). */
export interface NewCategory {
  sourceId: string
  generation: number
  kind: CategoryKind
  fetchMode: CatalogFetchMode
  providerCategoryId?: string
  name?: string
  order: number
  declaredCount?: number
}

/**
 * Uma categoria pelo id local — usada por `seriesLoader.ts` (feature 012)
 * para saber se a série pertence a uma categoria `eager` (M3U/Modo
 * limitado, nunca toca rede) ou `on_demand` (Xtream, obtida sob demanda),
 * sem exigir que o chamador já tenha o objeto `CatalogCategory` em mãos —
 * diferente de `ensureCategory` (feature 010), que recebe a categoria
 * pronta porque a tela já a leu de `listCategories`.
 */
export async function getCategory(
  id: number,
  database: CatalogDb = db,
): Promise<CategoryRecord | undefined> {
  return database.categories.get(id)
}

/**
 * Categorias da geração ativa, na ordem declarada pela fonte.
 *
 * Lê a coleção `categories` (feature 010) — não deriva mais das chaves
 * únicas de `channels`. **Caminho único de leitura**: toda fonte grava
 * estrutura, inclusive a que importa a lista inteira em fluxo
 * (`fetchMode: 'eager'`), então não existe aqui uma derivação de reserva
 * para fonte sem estrutura gravada (D-004 do `plan.md` da feature 010;
 * `data-model.md` §2.1). Fonte importada antes desta feature não tem
 * linha em `categories` e aparece vazia aqui até re-sincronizar — é
 * tratada como fonte a re-sincronizar, não como dado a converter
 * (`data-model.md` §4).
 *
 * A categoria é uma tabela pequena (algumas centenas de linhas, mesmo numa
 * fonte com 300 mil itens) — diferente de `channels`, varrê-la inteira por
 * `sourceId` no ramo sem `kind` é seguro; o ramo com `kind` usa o índice
 * composto porque é o caminho quente, chamado a cada tela.
 */

export async function listCategories(
  sourceId: string,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<CatalogCategory[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []

  const records = kind
    ? await database.categories
        .where('[sourceId+generation+kind+order]')
        .between([sourceId, generation, kind, KEY_MIN], [sourceId, generation, kind, KEY_MAX], true, true)
        .toArray()
    : (await database.categories.where('sourceId').equals(sourceId).toArray()).filter(
        (record) => record.generation === generation,
      )

  // Feature 038 (D-005): `order` é a chave dos itens e nunca muda depois de
  // criada; a posição de exibição que a última atualização declarou é
  // `position` (ausente = `order`, registro anterior à 038).
  return records
    .sort((a, b) => (a.position ?? a.order) - (b.position ?? b.order) || a.order - b.order)
    .map((record) => ({
      id: record.id as number,
      kind: record.kind,
      name: record.name,
      order: record.order,
      count: record.itemsCount ?? 0,
      fetchMode: record.fetchMode,
      providerCategoryId: record.providerCategoryId,
      declaredCount: record.declaredCount,
      itemsFetchedAt: record.itemsFetchedAt,
      renewRequestedAt: record.renewRequestedAt,
    }))
}

/**
 * Grava uma ou mais categorias da estrutura, devolvendo os ids locais
 * criados na mesma ordem em que foram passadas (contrato §1).
 *
 * Serve os dois caminhos de importação: o de provedor chama de uma vez com
 * a lista inteira de uma seção (`fetchMode: 'on_demand'`); o caminho
 * integral chama com uma categoria por vez, no instante em que o grupo
 * aparece pela primeira vez no fluxo — antes de o primeiro item daquele
 * grupo ser gravado, porque o item precisa do id da categoria para apontar
 * (`data-model.md` §3).
 */
export async function storeCategories(
  categories: NewCategory[],
  database: CatalogDb = db,
): Promise<number[]> {
  if (categories.length === 0) return []
  return database.transaction('rw', database.categories, async () => {
    const ids = await database.categories.bulkAdd(categories as CategoryRecord[], { allKeys: true })
    return ids as number[]
  })
}

/**
 * Carimba a obtenção de uma categoria sem tocar nos itens dela.
 *
 * Usada pelo caminho integral (M3U): os itens já foram gravados pelo fluxo
 * normal de `storeBatch` durante a importação, em lotes — só falta
 * registrar quando e quantos, o que só se sabe no fim (`data-model.md` §3).
 */
export async function markCategoryFetched(
  categoryId: number,
  itemsFetchedAt: number,
  itemsCount: number,
  database: CatalogDb = db,
): Promise<void> {
  await database.categories.update(categoryId, { itemsFetchedAt, itemsCount })
}

/** Grava, na importação, a contagem real que a leitura da categoria vai produzir (feature 014, D-011). */
export async function setDeclaredCount(
  categoryId: number,
  declaredCount: number,
  database: CatalogDb = db,
): Promise<void> {
  await database.categories.update(categoryId, { declaredCount })
}
