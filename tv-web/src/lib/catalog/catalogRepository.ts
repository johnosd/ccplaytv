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

import {
  db,
  type CatalogDb,
  type CatalogRecord,
  type CatalogItemKind,
  type CategoryKind,
  type CategoryRecord,
  type CatalogFetchMode,
} from './db'

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

  return records
    .sort((a, b) => a.order - b.order)
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
 * Substituição **parcial** deixaria item órfão de uma obtenção anterior —
 * por isso os itens antigos daquela categoria são removidos antes dos
 * novos entrarem, no mesmo lock. Localiza pelo mesmo `groupOrder` que a
 * categoria declara: é o eixo que já ordena a leitura paginada, e cada
 * categoria tem o seu, sem colisão com outra do mesmo `kind`.
 */
export async function storeCategoryItems(
  target: CategoryItemsTarget,
  items: CatalogRecord[],
  now: number,
  database: CatalogDb = db,
): Promise<void> {
  try {
    await database.transaction('rw', database.channels, database.categories, async () => {
      await database.channels
        .where('[sourceId+generation+kind+groupOrder]')
        .equals([target.sourceId, target.generation, target.kind, target.groupOrder])
        .delete()

      if (items.length > 0) {
        await database.channels.bulkAdd(
          items.map((item) => ({
            ...item,
            sourceId: target.sourceId,
            generation: target.generation,
            kind: target.kind,
            groupOrder: target.groupOrder,
            categoryId: target.categoryId,
          })),
        )
      }

      await database.categories.update(target.categoryId, {
        itemsFetchedAt: now,
        itemsCount: items.length,
      })
    })
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
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
    await database.transaction('rw', database.channels, async () => {
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

      await database.channels.update(target.seriesRecordId, { episodesFetchedAt: now })
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
    async () => {
      await database.sources.update(sourceId, { activeGeneration: generation, updatedAt: Date.now() })
      await allGenerations(database, sourceId)
        .and((channel) => channel.generation !== generation)
        .delete()
      // Estrutura da geração anterior sai junto (feature 010) — nunca
      // `userStates`, que não tem noção de geração (D-002 do plan.md).
      await allCategoryGenerations(database, sourceId)
        .and((category) => category.generation !== generation)
        .delete()
    },
  )
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
}

/** Remove todo o catálogo de uma fonte, de todas as gerações. */
export async function deleteAllForSource(
  sourceId: string,
  database: CatalogDb = db,
): Promise<void> {
  await allGenerations(database, sourceId).delete()
  await allCategoryGenerations(database, sourceId).delete()
}
