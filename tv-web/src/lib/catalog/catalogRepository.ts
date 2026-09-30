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
 * 2. **Importação que troca de caminho escreve numa geração nova**, publicada
 *    só no fim (D-004 da 005) — a anterior continua legível enquanto isso.
 *    **Desde a feature 038 (D-004, R-010)**, a atualização pelo mesmo caminho
 *    (Xtream→Xtream, conteúdo guardado→conteúdo guardado) e a renovação dos
 *    itens de uma categoria escrevem **na geração ativa**: com a pré-carga, a
 *    geração nova apagaria o catálogo inteiro numa transação só e esfriaria
 *    tudo. Cada escrita deixa a categoria inteira antiga ou inteira nova, nunca
 *    pela metade (`applyStructureRefresh`, `renewCategoryItems`).
 */

import {
  db,
  type CatalogDb,
  type CatalogRecord,
  type CatalogItemKind,
  type CategoryKind,
  type CategoryRecord,
  type CatalogFetchMode,
  type StoredCatalogRecord,
  type UserStateRecord,
} from './db'
import { parseStableId, type StableIdParts } from './userStateRepository'
import { categoryMatchKey, diffCategories } from './structureDiff'
import {
  blockRecord,
  blockRecords,
  blocksOfKind,
  blocksOfSource,
  categoryIdOfBlockItem,
  KIND_MAX,
  KIND_MIN,
  writeBlockWithin,
} from './categoryBlocks'

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
 *
 * Exportada para `storedEntries.ts` (feature 014) reusar a mesma detecção
 * na gravação dos blocos — sem duplicar a lista de nomes de erro.
 */
export function isQuotaError(error: unknown): boolean {
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

/** Identifica a categoria alvo de uma substituição integral de itens. */
export interface CategoryItemsTarget {
  sourceId: string
  generation: number
  kind: CategoryKind
  categoryId: number
  /** Mesmo valor de `order` da categoria — é o que localiza os itens dela em `channels`. */
  groupOrder: number
}

/** Identifica a série alvo de uma substituição integral de episódios (feature 012). */
export interface SeriesEpisodesTarget {
  sourceId: string
  generation: number
  seriesId: string
  /** Id local do registro `kind:'series'` — recebe o carimbo `episodesFetchedAt`. */
  seriesRecordId: number
}

async function activeGenerationOf(
  sourceId: string,
  database: CatalogDb,
): Promise<number | undefined> {
  const source = await database.sources.get(sourceId)
  return source?.activeGeneration
}

/**
 * Geração ativa de uma fonte, ou `undefined` se nenhuma foi publicada
 * ainda. Envoltório público do mesmo helper interno — existe para
 * `categoryLoader` (feature 010) saber onde escrever sem reimplementar a
 * leitura de `sources` nem furar D-001 (nenhuma tela/módulo fala com Dexie
 * direto).
 */
export async function activeGeneration(
  sourceId: string,
  database: CatalogDb = db,
): Promise<number | undefined> {
  return activeGenerationOf(sourceId, database)
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

/** Categorias de uma fonte, qualquer geração — mesmo propósito, para `categories`. */
function allCategoryGenerations(database: CatalogDb, sourceId: string) {
  return database.categories.where('sourceId').equals(sourceId)
}

/** Blocos guardados de uma fonte, qualquer geração — mesmo propósito, para `storedEntries` (feature 014). */
function allStoredEntriesGenerations(database: CatalogDb, sourceId: string) {
  return database.storedEntries
    .where('[sourceId+generation]')
    .between([sourceId, KEY_MIN], [sourceId, KEY_MAX], true, true)
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
 * Substitui integralmente os itens de uma categoria e carimba a obtenção,
 * numa única transação (contrato §1, D-006).
 *
 * Desde a feature 039 os itens vão para o **bloco** da categoria
 * (`categoryBlocks.ts`), e as linhas antigas daquela categoria saem no mesmo
 * lock — nunca item órfão, nunca duas cópias. A posição na ordem em que o
 * provedor entregou continua sendo a base do número do canal (feature 024,
 * `logic/numero-do-canal.md` §4): é a posição no bloco.
 */
export async function storeCategoryItems(
  target: CategoryItemsTarget,
  items: CatalogRecord[],
  now: number,
  database: CatalogDb = db,
): Promise<void> {
  await renewCategoryItems(target, items, now, database)
}

/**
 * Renova os itens de uma categoria **preservando o id local** de cada item que
 * continua na fonte (feature 038, FR-027, `logic/atualizacao-sem-esfriar.md`
 * §4) — foco, detalhe aberto e snapshot de volta guardam esse id. Casa por
 * identidade (id do provedor; série pelo `seriesId`; M3U pelo nome original),
 * nunca por posição nem por URL. Item que saiu é removido, item novo ganha id
 * novo, e campos gravados por outros carregadores (`episodesFetchedAt`) são
 * mantidos. Assinatura igual à gravada = nada é escrito além do instante
 * (`written: false`).
 */
export async function renewCategoryItems(
  target: CategoryItemsTarget,
  items: CatalogRecord[],
  now: number,
  database: CatalogDb = db,
): Promise<{ written: boolean }> {
  try {
    return await database.transaction(
      'rw',
      database.channels,
      database.categories,
      database.categoryBlocks,
      async () => ({ written: await writeBlockWithin(target, items, now, database) }),
    )
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}

/** Uma categoria lida numa atualização (feature 038, `logic/atualizacao-sem-esfriar.md` §4). */
export interface RefreshedCategory {
  kind: CategoryKind
  fetchMode: CatalogFetchMode
  providerCategoryId?: string
  name?: string
  /** Posição de exibição declarada nesta atualização. */
  position: number
  declaredCount?: number
  /** Só `stored`: onde está o conteúdo novo (geração de varredura). */
  storedFrom?: { generation: number; categoryId: number }
}

export interface StructureRefreshResult {
  kept: number
  added: number
  removed: number
}

/**
 * Aplica uma atualização de estrutura **na geração ativa** (feature 038,
 * D-004, `logic/atualizacao-sem-esfriar.md` §4.2/§4.3): categoria mantida
 * conserva id, `order` e itens (servidos até a renovação chegar) e ganha
 * nome/posição/contagem novos e `renewRequestedAt`; categoria nova entra fria,
 * com o próximo `order` livre da seção; categoria que saiu vai embora com os
 * itens (e, se de séries, os episódios delas). Seções fora de `kinds` (o
 * painel não as serviu) ficam intactas. Uma transação: ou tudo, ou nada
 * (FR-030).
 */
export async function applyStructureRefresh(
  sourceId: string,
  generation: number,
  kinds: readonly CategoryKind[],
  incoming: readonly RefreshedCategory[],
  now: number,
  database: CatalogDb = db,
): Promise<StructureRefreshResult> {
  return database.transaction('rw', database.categories, database.channels, database.categoryBlocks, async () => {
    const existing = (await database.categories.where('sourceId').equals(sourceId).toArray()).filter(
      (record) => record.generation === generation && kinds.includes(record.kind),
    )
    const diff = diffCategories(
      existing.map((record) => ({
        id: record.id as number,
        kind: record.kind,
        matchKey: categoryMatchKey(record.providerCategoryId, record.name),
      })),
      incoming.map((category, index) => ({
        kind: category.kind,
        matchKey: categoryMatchKey(category.providerCategoryId, category.name),
        name: category.name,
        position: index,
        declaredCount: category.declaredCount,
      })),
    )
    // O diff devolve os `IncomingCategory` que recebeu — voltar ao registro completo pela posição.
    const full = (position: number) => incoming[position]

    for (const { id, incoming: next } of diff.keep) {
      const source = full(next.position)
      await database.categories.update(id, {
        name: source.name,
        position: source.position,
        declaredCount: source.declaredCount,
        renewRequestedAt: now,
        ...(source.storedFrom ? { storedFrom: source.storedFrom } : {}),
      })
    }

    const nextOrder = new Map<CategoryKind, number>()
    for (const record of existing) {
      nextOrder.set(record.kind, Math.max(nextOrder.get(record.kind) ?? -1, record.order))
    }
    for (const next of diff.add) {
      const source = full(next.position)
      const order = (nextOrder.get(source.kind) ?? -1) + 1
      nextOrder.set(source.kind, order)
      await database.categories.add({
        sourceId,
        generation,
        kind: source.kind,
        fetchMode: source.fetchMode,
        providerCategoryId: source.providerCategoryId,
        name: source.name,
        order,
        position: source.position,
        declaredCount: source.declaredCount,
        storedFrom: source.storedFrom,
      } as CategoryRecord)
    }

    for (const id of diff.remove) {
      const record = existing.find((candidate) => candidate.id === id)
      if (!record) continue
      const rows = await database.channels
        .where('[sourceId+generation+kind+groupOrder]')
        .equals([sourceId, generation, record.kind, record.order])
        .toArray()
      // Feature 039: a categoria pode estar em bloco (formato novo) ou em
      // linhas (antigo, ainda não convertida) — as duas saem.
      const block = await database.categoryBlocks.get(id)
      const items = [...rows, ...(block ? blockRecords(block) : [])]
      if (block) await database.categoryBlocks.delete(id)
      if (record.kind === 'series') {
        for (const seriesId of new Set(items.map((item) => item.seriesId).filter((value): value is string => !!value))) {
          await database.channels
            .where('[sourceId+generation+seriesId]')
            .equals([sourceId, generation, seriesId])
            .delete()
        }
        // Episódios de série M3U guardam o `groupOrder` da categoria.
        await database.channels
          .where('[sourceId+generation+kind+groupOrder]')
          .equals([sourceId, generation, 'episode', record.order])
          .delete()
      }
      await database.channels.bulkDelete(rows.map((item) => item.id as number))
      await database.categories.delete(id)
    }

    return { kept: diff.keep.length, added: diff.add.length, removed: diff.remove.length }
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

/** Identifica a categoria `stored` cujo conteúdo guardado está sendo lido (feature 014). */
export interface StoredCategoryTarget {
  sourceId: string
  generation: number
  kind: CategoryKind
  categoryId: number
  /** Mesmo valor de `order` da categoria — episódios da série desta categoria também têm este `groupOrder`. */
  groupOrder: number
}

/**
 * Lê uma categoria do conteúdo guardado: grava os itens (e, para uma
 * categoria de séries, os episódios) em `channels`, carimba a obtenção e
 * apaga os blocos lidos — tudo numa única transação (feature 014, D-007).
 *
 * Depois desta chamada, a categoria nunca mais é lida do conteúdo guardado
 * na mesma geração: `itemsFetchedAt` passa a existir, e é isso que
 * `ensureCategory` (`categoryLoader.ts`) usa para devolver `fresh` sem
 * tocar `storedEntries` de novo.
 */
export async function storeStoredCategory(
  target: StoredCategoryTarget,
  items: StoredCatalogRecord[],
  episodes: StoredCatalogRecord[],
  now: number,
  database: CatalogDb = db,
  /**
   * Feature 038 (`logic/atualizacao-sem-esfriar.md` §4.3): de onde vieram os
   * blocos — a geração de varredura de uma atualização (`storedFrom`).
   * Ausente = os blocos são da própria categoria (regra da 014).
   */
  chunksFrom?: { generation: number; categoryId: number },
): Promise<void> {
  try {
    await database.transaction(
      'rw',
      database.channels,
      database.categories,
      database.storedEntries,
      database.categoryBlocks,
      async () => {
        // Episódios: substituição integral (D-011 da 038) — retomada e
        // "assistido" são por `stableId`, não pelo id local do episódio.
        await database.channels
          .where('[sourceId+generation+kind+groupOrder]')
          .equals([target.sourceId, target.generation, 'episode', target.groupOrder])
          .delete()

        // Itens: bloco da categoria, com id preservado (feature 038, D-006;
        // feature 039). A posição na ordem do arquivo continua sendo
        // `categoryPosition`, base do número do canal — `logic/numero-do-canal.md` §4.
        await writeBlockWithin(
          target,
          items.map((item) => ({ ...item, sourceId: target.sourceId, generation: target.generation })),
          now,
          database,
        )

        if (episodes.length > 0) {
          await database.channels.bulkAdd(
            episodes.map((episode) => ({
              ...episode,
              sourceId: target.sourceId,
              generation: target.generation,
              kind: 'episode',
              groupOrder: target.groupOrder,
              // Episódio nunca tem categoria navegável própria (D-001, feature 012).
              categoryId: undefined,
            })),
          )
        }

        // `writeBlockWithin` já carimbou `itemsFetchedAt`/`itemsCount`; o ponteiro
        // para os blocos da atualização some junto com os blocos.
        await database.categories.update(target.categoryId, { storedFrom: undefined })

        const from = chunksFrom ?? { generation: target.generation, categoryId: target.categoryId }
        await database.storedEntries
          .where('[sourceId+generation+categoryId+chunk]')
          .between(
            [target.sourceId, from.generation, from.categoryId, KEY_MIN],
            [target.sourceId, from.generation, from.categoryId, KEY_MAX],
            true,
            true,
          )
          .delete()
      },
    )
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}

/**
 * Todos os registros de um tipo na geração ativa, sem paginação — só para a
 * busca local (feature 017), que lê uma vez e filtra em memória (D-002 do
 * `plan.md` da 017). Nunca use isto para uma tela renderizar direto: sem
 * paginação, é exatamente o que `listChannels` existe para evitar.
 */
export async function listAllOfKind(
  sourceId: string,
  kind: CatalogItemKind,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  // Feature 039 (`logic/blocos-e-identidade.md` §5): blocos do tipo + linhas
  // das categorias ainda no formato antigo. Uma categoria é ou uma ou outra,
  // então juntar não duplica. Ordem: `groupOrder` (a da leitura por índice de
  // antes), e dentro da categoria a da fonte — `sort` é estável.
  const blocks = await blocksOfKind(database, sourceId, generation, kind).toArray()
  const rows = await query(database, sourceId, generation, undefined, kind).toArray()
  if (blocks.length === 0) return rows
  blocks.sort((a, b) => a.groupOrder - b.groupOrder)
  const records = blocks.flatMap(blockRecords)
  if (rows.length === 0) return records
  return [...records, ...rows].sort((a, b) => a.groupOrder - b.groupOrder)
}

/** Categorias da geração ativa com um dado `order` (e `kind`, se informado). */
async function categoriesAtOrder(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  groupOrder: number,
  kind?: CatalogItemKind,
): Promise<CategoryRecord[]> {
  if (kind) {
    if (kind === 'episode') return []
    return database.categories
      .where('[sourceId+generation+kind+order]')
      .equals([sourceId, generation, kind, groupOrder])
      .toArray()
  }
  return (await database.categories.where('sourceId').equals(sourceId).toArray()).filter(
    (record) => record.generation === generation && record.order === groupOrder,
  )
}

/**
 * Itens de uma categoria (ou de todas as que têm aquele `order`, sem `kind`):
 * do bloco, se houver; das linhas antigas, senão (feature 039, §5).
 */
async function readCategory(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  groupOrder: number,
  kind?: CatalogItemKind,
): Promise<CatalogRecord[]> {
  const categories = await categoriesAtOrder(database, sourceId, generation, groupOrder, kind)
  const blocks = (await database.categoryBlocks.bulkGet(categories.map((category) => category.id as number))).filter(
    (block): block is NonNullable<typeof block> => !!block && block.generation === generation,
  )
  const fromBlocks = blocks.flatMap(blockRecords)
  // Com `kind` e bloco achado, não há linha antiga daquela categoria (escrever
  // o bloco as apaga) — poupa a segunda leitura no caminho quente.
  if (kind && blocks.length > 0) return fromBlocks
  const rows = await query(database, sourceId, generation, groupOrder, kind).toArray()
  return fromBlocks.length > 0 ? [...fromBlocks, ...rows] : rows
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
  // Feature 038 (D-006): a renovação preserva ids, então a ordem por id deixa
  // de ser a da fonte — a ordem é `categoryPosition` (ausente = depois, por
  // id, como gravado antes da 024). Ordena antes de fatiar.
  const records = await readCategory(database, sourceId, generation, groupOrder, kind)
  records.sort((a, b) => {
    const pa = a.categoryPosition ?? Number.MAX_SAFE_INTEGER
    const pb = b.categoryPosition ?? Number.MAX_SAFE_INTEGER
    return pa - pb || (a.id ?? 0) - (b.id ?? 0)
  })
  return records.slice(offset, offset + limit)
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
  if (groupOrder !== undefined) {
    return (await readCategory(database, sourceId, generation, groupOrder, kind)).length
  }
  // Tipo (ou geração) inteiro: blocos + linhas — nunca a mesma categoria nos dois.
  const blocks =
    kind === 'episode'
      ? []
      : kind
        ? await blocksOfKind(database, sourceId, generation, kind).toArray()
        : (await blocksOfSource(database, sourceId).toArray()).filter((block) => block.generation === generation)
  const inBlocks = blocks.reduce((total, block) => total + block.items.length, 0)
  return inBlocks + (await query(database, sourceId, generation, undefined, kind).count())
}

/**
 * Um item pelo id local. Id negativo = item de bloco (feature 039,
 * `categoryIdOfBlockItem`); só é devolvido se o bloco for da geração ativa.
 * Id positivo = linha (formato antigo, ou episódio).
 */
export async function getChannel(
  id: number,
  database: CatalogDb = db,
): Promise<CatalogRecord | undefined> {
  const categoryId = categoryIdOfBlockItem(id)
  if (categoryId === undefined) return database.channels.get(id)
  const block = await database.categoryBlocks.get(categoryId)
  if (!block) return undefined
  if ((await activeGenerationOf(block.sourceId, database)) !== block.generation) return undefined
  const index = block.items.findIndex((item) => item.id === id)
  return index < 0 ? undefined : blockRecord(block, block.items[index], index)
}

/**
 * O registro `kind:'series'` de uma série pelo `seriesId`, na geração ativa
 * (feature 039, §5): linhas pelo índice; senão, blocos de séries um por vez.
 */
export async function findSeriesRecord(
  sourceId: string,
  seriesId: string,
  database: CatalogDb = db,
): Promise<CatalogRecord | undefined> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return undefined
  return findSeriesIn(database, sourceId, generation, seriesId)
}

async function findSeriesIn(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  seriesId: string,
): Promise<CatalogRecord | undefined> {
  const row = await database.channels
    .where('[sourceId+generation+seriesId]')
    .equals([sourceId, generation, seriesId])
    .and((candidate) => candidate.kind === 'series')
    .first()
  if (row) return row
  let found: CatalogRecord | undefined
  try {
    await blocksOfKind(database, sourceId, generation, 'series').each((block) => {
      const index = block.items.findIndex((item) => item.seriesId === seriesId)
      if (index >= 0) {
        found = blockRecord(block, block.items[index], index)
        throw new FavoritesScanComplete()
      }
    })
  } catch (error) {
    if (!(error instanceof FavoritesScanComplete)) throw error
  }
  return found
}

/** Sentinela pra encerrar `.each()` mais cedo — nunca vaza pra fora desta função. */
class FavoritesScanComplete {}

/**
 * Resolve favoritos (feature 013, `stableId` do usuário) em registros do
 * catálogo da GERAÇÃO ATIVA — sem isso a categoria "Favoritos" não tem o
 * que mostrar. Favorito cujo item não está carregado nesta instalação é
 * simplesmente omitido (contado em `unresolved`), nunca inventado
 * (`sdd/specs/013-favoritos/logic/resolucao-favoritos.md`).
 *
 * Devolve na MESMA ORDEM de `favorites` (mais recente primeiro, já que é
 * quem chama — `useFavoritesContent` — que passa a lista nessa ordem).
 */
export async function resolveFavorites(
  sourceId: string,
  kind: CatalogItemKind,
  favorites: StableIdParts[],
  database: CatalogDb = db,
): Promise<{ records: CatalogRecord[]; unresolved: number }> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return { records: [], unresolved: favorites.length }

  const resolved = new Map<StableIdParts, CatalogRecord>()

  // Feature 039 (§5): primeiro os blocos do tipo, UM POR VEZ (memória,
  // FR-013), parando assim que todos os favoritos forem achados; depois as
  // linhas antigas, só para o que sobrou. Uma categoria é ou bloco ou linhas.
  if (kind !== 'episode' && favorites.length > 0) {
    const byId = new Map<string, StableIdParts>()
    const byNameKey = new Map<string, StableIdParts>()
    for (const favorite of favorites) {
      if (favorite.identifier.type === 'id') byId.set(favorite.identifier.value, favorite)
      else byNameKey.set(favorite.identifier.value, favorite)
    }
    let remaining = favorites.length
    const take = (target: StableIdParts | undefined, record: () => CatalogRecord) => {
      if (!target || resolved.has(target)) return
      resolved.set(target, record())
      remaining -= 1
    }
    try {
      await blocksOfKind(database, sourceId, generation, kind).each((block) => {
        block.items.forEach((item, index) => {
          const record = () => blockRecord(block, item, index)
          if (item.providerStreamId) take(byId.get(item.providerStreamId), record)
          if (kind === 'series' && item.seriesId) take(byId.get(item.seriesId), record)
          if (byNameKey.size > 0) take(byNameKey.get(item.originalName.trim().toLowerCase()), record)
        })
        if (remaining === 0) throw new FavoritesScanComplete()
      })
    } catch (error) {
      if (!(error instanceof FavoritesScanComplete)) throw error
    }
    if (remaining === 0) return { records: favorites.map((favorite) => resolved.get(favorite) as CatalogRecord), unresolved: 0 }
  }

  // Id do painel: um lookup pelo índice por favorito — nunca uma varredura.
  for (const favorite of favorites) {
    if (favorite.identifier.type !== 'id' || resolved.has(favorite)) continue
    const value = favorite.identifier.value

    let record = await database.channels
      .where('[sourceId+generation+kind+providerStreamId]')
      .equals([sourceId, generation, kind, value])
      .first()

    // Série sem `providerStreamId` próprio guarda o `seriesId` como
    // identificador (`buildStableId`) — mesmo índice que a 012 já usa
    // pra achar os episódios, aqui filtrado pro registro da série em si.
    if (!record && kind === 'series') {
      record = await database.channels
        .where('[sourceId+generation+seriesId]')
        .equals([sourceId, generation, value])
        .and((candidate) => candidate.kind === 'series')
        .first()
    }

    if (record) resolved.set(favorite, record)
  }

  // Nome (só fonte M3U, sem identificador de painel): uma varredura só do
  // tipo, encerrada assim que todos os alvos restantes forem encontrados —
  // nunca por item, nunca ao focar (D-005 do plan.md).
  const byName = favorites.filter(
    (favorite): favorite is StableIdParts & { identifier: { type: 'name'; value: string } } =>
      favorite.identifier.type === 'name' && !resolved.has(favorite),
  )
  if (byName.length > 0) {
    const targetsByName = new Map(byName.map((favorite) => [favorite.identifier.value, favorite]))
    let remaining = targetsByName.size

    try {
      await database.channels
        .where('[sourceId+generation+kind+groupOrder]')
        .between([sourceId, generation, kind, KEY_MIN], [sourceId, generation, kind, KEY_MAX], true, true)
        .each((record) => {
          const key = record.originalName.trim().toLowerCase()
          const target = targetsByName.get(key)
          // Nome repetido em duas categorias: a ordem do índice já é por
          // `groupOrder` crescente, então o primeiro achado é o de menor
          // `groupOrder` — o `!resolved.has` abaixo nunca sobrescreve com
          // o segundo.
          if (target && !resolved.has(target)) {
            resolved.set(target, record)
            remaining -= 1
            if (remaining === 0) throw new FavoritesScanComplete()
          }
        })
    } catch (error) {
      if (!(error instanceof FavoritesScanComplete)) throw error
    }
  }

  const records: CatalogRecord[] = []
  let unresolved = 0
  for (const favorite of favorites) {
    const record = resolved.get(favorite)
    if (record) records.push(record)
    else unresolved += 1
  }
  return { records, unresolved }
}

/**
 * Resolve os `UserStateRecord`s de "Continuar assistindo" (feature 019,
 * D-009/D-011/R-002) de volta a registros do catálogo, na MESMA ordem de
 * entrada (já vem de `getContinueWatching`, mais recente primeiro).
 * Reaproveita o núcleo de `resolveFavorites` por kind — um episódio sempre
 * tem `providerStreamId` próprio do provedor (feature 012), então cai no
 * mesmo caminho de resolução por índice que filme/canal já usam.
 *
 * Um episódio nunca é devolvido como episódio: é trocado pelo registro da
 * SÉRIE-pai (mesmo `seriesId`, kind:'series') — abrir um item de "Continuar
 * assistindo" precisa levar ao MESMO lugar que abrir esse item pela
 * navegação normal já leva (D-011), e a navegação normal nunca abre um
 * episódio isolado, sempre a série (que então mostra o progresso de cada
 * episódio, já resolvido por `SeriesDetailScreen`). Item sem correspondência
 * (fonte removida, categoria reimportada) é omitido silenciosamente, nunca
 * lança.
 */
export async function resolveContinueWatching(
  sourceId: string,
  states: UserStateRecord[],
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []

  const records: CatalogRecord[] = []
  for (const state of states) {
    const parts = parseStableId(state.stableId)
    if (!parts) continue
    // Um item por vez (não em lote): `resolveFavorites` devolve só os
    // resolvidos, sem dizer QUAL `StableIdParts` cada um era — em lote não
    // dá pra saber com segurança se `records[i]` corresponde a `parts[i]`
    // quando algum item no meio não resolve. A lista de "Continuar
    // assistindo" é pequena (itens em progresso, não o catálogo inteiro),
    // então o custo de uma resolução por item é aceitável.
    const { records: resolved } = await resolveFavorites(sourceId, parts.kind, [parts], database)
    const record = resolved[0]
    if (!record) continue

    if (record.kind !== 'episode' || !record.seriesId) {
      records.push(record)
      continue
    }
    const series = await findSeriesIn(database, sourceId, generation, record.seriesId)
    if (series) records.push(series)
  }
  return records
}

/**
 * Episódios de uma série, na geração ativa (feature 012). Filtra
 * `kind:'episode'` mesmo lendo pelo índice `[sourceId+generation+seriesId]`
 * que a própria série também compartilha (D-002) — sem isso o registro da
 * série apareceria misturado na lista de episódios.
 */
export async function listEpisodes(
  sourceId: string,
  seriesId: string,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  const records = await database.channels
    .where('[sourceId+generation+seriesId]')
    .equals([sourceId, generation, seriesId])
    .toArray()
  return records.filter((record) => record.kind === 'episode')
}

/**
 * Todos os episódios já conhecidos de uma fonte, de qualquer série
 * (feature 019, D-007/D-008) — usa o mesmo índice `[sourceId+generation+
 * kind+groupOrder]` de `listChannels`/`countChannels`, sem grupo
 * específico (`query()` com `groupOrder` ausente cobre `KEY_MIN`..`KEY_MAX`
 * — todos). Nunca dispara `ensureSeriesEpisodes`: só lê o que já está
 * gravado, mesmo padrão de "nunca busca ao focar/renderizar" (`logic/
 * agregacao-serie.md`).
 */
export async function listAllEpisodes(
  sourceId: string,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  return query(database, sourceId, generation, undefined, 'episode').toArray()
}

/**
 * Substitui integralmente os episódios de uma série e carimba a obtenção,
 * numa única transação (feature 012, D-002, espelho de `storeCategoryItems`).
 *
 * Apaga só `kind:'episode'` com o mesmo `seriesId` — o registro da própria
 * série (mesmo `seriesId`, `kind:'series'`) nunca é tocado pela exclusão,
 * só recebe o carimbo de `episodesFetchedAt`.
 */
export async function storeSeriesEpisodes(
  target: SeriesEpisodesTarget,
  episodes: CatalogRecord[],
  now: number,
  database: CatalogDb = db,
): Promise<void> {
  try {
    await database.transaction('rw', database.channels, database.categoryBlocks, async () => {
      const existing = await database.channels
        .where('[sourceId+generation+seriesId]')
        .equals([target.sourceId, target.generation, target.seriesId])
        .toArray()
      const staleEpisodeIds = existing
        .filter((record) => record.kind === 'episode')
        .map((record) => record.id as number)
      if (staleEpisodeIds.length > 0) await database.channels.bulkDelete(staleEpisodeIds)

      if (episodes.length > 0) {
        await database.channels.bulkAdd(
          episodes.map((item) => ({
            ...item,
            sourceId: target.sourceId,
            generation: target.generation,
            kind: 'episode',
            seriesId: target.seriesId,
          })),
        )
      }

      // Feature 039 (§7): série em bloco (id negativo) recebe o carimbo dentro
      // do bloco — um `put` por abertura de série.
      const categoryId = categoryIdOfBlockItem(target.seriesRecordId)
      if (categoryId === undefined) {
        await database.channels.update(target.seriesRecordId, { episodesFetchedAt: now })
      } else {
        const block = await database.categoryBlocks.get(categoryId)
        const item = block?.items.find((candidate) => candidate.id === target.seriesRecordId)
        if (block && item) {
          item.episodesFetchedAt = now
          await database.categoryBlocks.put(block)
        }
      }
    })
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
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
  await database.transaction(
    'rw',
    database.sources,
    database.channels,
    database.categories,
    database.storedEntries,
    database.categoryBlocks,
    async () => {
      await database.sources.update(sourceId, { activeGeneration: generation, updatedAt: Date.now() })
      // Blocos de outras gerações (feature 039, §8): um registro por categoria — barato.
      await blocksOfSource(database, sourceId)
        .and((block) => block.generation !== generation)
        .delete()
      // Estrutura da geração anterior sai junto (feature 010) — nunca
      // `userStates`, que não tem noção de geração (D-002 do plan.md). É
      // pequena (centenas de linhas).
      await allCategoryGenerations(database, sourceId)
        .and((category) => category.generation !== generation)
        .delete()
      // Itens e conteúdo guardado da geração anterior NÃO saem aqui (feature
      // 038, D-008): com o catálogo pré-carregado, apagá-los nesta transação
      // seria o gargalo que congelou a TV na 010. Ficam invisíveis (toda
      // leitura filtra pela geração ativa) e a pré-carga os apaga em partes
      // (`collectStaleGenerations`).
    },
  )
}

/**
 * Apaga, **uma parte por vez**, itens e blocos guardados de gerações que não
 * servem mais (feature 038, D-008, `logic/atualizacao-sem-esfriar.md` §7) — o
 * que `publishGeneration` deixou de apagar numa transação só (com o catálogo
 * pré-carregado, essa transação congelaria a TV). Nunca toca: a geração ativa,
 * gerações apontadas por `storedFrom` (conteúdo novo ainda não lido) e
 * gerações de importação em andamento. Usa só faixas do índice
 * `[sourceId+generation]` entre as protegidas — nunca varre a geração ativa.
 *
 * @returns `true` se ainda sobrou algo para apagar.
 */
export async function collectStaleGenerations(
  sourceId: string,
  options: { batchSize?: number } = {},
  database: CatalogDb = db,
): Promise<boolean> {
  const batchSize = options.batchSize ?? 2000
  const active = await activeGenerationOf(sourceId, database)
  if (active === undefined) return false

  const protectedGenerations = new Set<number>([active])
  const categories = await allCategoryGenerations(database, sourceId).toArray()
  for (const category of categories) {
    if (category.generation === active && category.storedFrom) protectedGenerations.add(category.storedFrom.generation)
  }
  const runs = await database.importRuns.where('[sourceId+status]').equals([sourceId, 'running']).toArray()
  for (const run of runs) protectedGenerations.add(run.generation)

  const sorted = [...protectedGenerations].sort((a, b) => a - b)
  const ranges: Array<[number, number]> = []
  let low = KEY_MIN
  for (const generation of sorted) {
    if (generation - 1 >= low) ranges.push([low, generation - 1])
    low = generation + 1
  }
  ranges.push([low, KEY_MAX])

  let deleted = 0
  for (const [from, to] of ranges) {
    if (deleted >= batchSize) break
    const channelKeys = await database.channels
      .where('[sourceId+generation]')
      .between([sourceId, from], [sourceId, to], true, true)
      .limit(batchSize - deleted)
      .primaryKeys()
    if (channelKeys.length > 0) await database.channels.bulkDelete(channelKeys)
    deleted += channelKeys.length
    if (deleted >= batchSize) break
    const entryKeys = await database.storedEntries
      .where('[sourceId+generation]')
      .between([sourceId, from], [sourceId, to], true, true)
      .limit(batchSize - deleted)
      .primaryKeys()
    if (entryKeys.length > 0) await database.storedEntries.bulkDelete(entryKeys)
    deleted += entryKeys.length
    if (deleted >= batchSize) break
    // Blocos (feature 039, §8): cada um conta como um registro.
    const blockKeys = await database.categoryBlocks
      .where('[sourceId+generation+kind]')
      .between([sourceId, from, KIND_MIN], [sourceId, to, KIND_MAX], true, true)
      .limit(batchSize - deleted)
      .primaryKeys()
    if (blockKeys.length > 0) await database.categoryBlocks.bulkDelete(blockKeys)
    deleted += blockKeys.length
  }
  // Blocos de uma varredura que já não é apontada: o `storedFrom` limpo pela
  // renovação libera a geração de varredura inteira para a próxima parte.
  return deleted >= batchSize
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
  await allCategoryGenerations(database, sourceId)
    .and((category) => category.generation === generation)
    .delete()
  await allStoredEntriesGenerations(database, sourceId)
    .and((entry) => entry.generation === generation)
    .delete()
  await blocksOfSource(database, sourceId)
    .and((block) => block.generation === generation)
    .delete()
}

/** Remove todo o catálogo de uma fonte, de todas as gerações. */
export async function deleteAllForSource(
  sourceId: string,
  database: CatalogDb = db,
): Promise<void> {
  await allGenerations(database, sourceId).delete()
  await allCategoryGenerations(database, sourceId).delete()
  await allStoredEntriesGenerations(database, sourceId).delete()
  await blocksOfSource(database, sourceId).delete()
}
