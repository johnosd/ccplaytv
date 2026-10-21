/**
 * Produção das fileiras que dependem de serviço externo — Top 10 e Dica (feature 087).
 *
 * As **regras** de seleção não moram aqui: elas são as da feature 057 (`lib/metadata/discoveryRules.ts`), reusadas como
 * estão. Esta unidade só muda **onde** e **quando** elas rodam — saem da tela e passam para a fila de segundo plano,
 * que grava o resultado para a abertura apenas ler.
 *
 * A ordem dos passos e o porquê de cada parada antecipada estão em
 * `sdd/specs/087-top10-dica-segundo-plano/logic/producao-em-segundo-plano.md` §4.
 */

import { db, type CatalogDb, type CatalogReadItem, type CatalogRecord } from './db'
import { iterateKindRecordBatches } from './catalogDerivedRows'
import { compactSearchRecord, isCovered } from './catalogSearch'
import { listVisibleCategories } from './categoryAccess'
import { readExternalRow, writeExternalRow } from './showcaseRows'
import { toShowcaseItem } from './showcaseSelection'
import {
  matchDiscoveryTitlesAsync,
  selectTip,
  selectTop10,
  yieldToMain,
  type LocalTitleFields,
} from '../metadata/discoveryRules'
import { loadTipPool, loadWeeklyTrending, localDay, weekKey } from '../metadata/tmdbDiscovery'
import type { AppLanguage } from '../i18n/languages'

export interface RefreshExternalRowOptions {
  database?: CatalogDb
  now?: number
  signal?: AbortSignal
  /** Idioma das consultas ao TMDB, como a tela passava. */
  language?: AppLanguage
}

type ExternalKind = 'movie' | 'series'
type ExternalRow = 'top10' | 'tip'

/** Registros entre duas cessões da thread ao montar o índice — a mesma fatia que a tela usava (feature 084). */
const INDEX_SLICE = 2000

/**
 * Os campos que o casamento lê de um registro do catálogo. São os mesmos que a tela lia, e é isto que garante que o
 * resultado continue idêntico ao de hoje (FR-004).
 */
const READ: LocalTitleFields<CatalogRecord> = {
  id: (record) => String(record.id),
  // Nome como a fonte declarou (com `[L]`, `4K`...), como o cruzamento da feature 035.
  name: (record) => record.originalName,
  year: (record) => record.year,
  rating: (record) => record.providerRating,
  addedAt: (record) => record.addedAt,
}

/** A validade do registro: a semana para o Top 10, o dia para a Dica — o mesmo período do cache do TMDB. */
function periodOf(row: ExternalRow, now: number): string {
  return row === 'top10' ? weekKey(now) : localDay(now)
}

/**
 * O índice de nomes do tipo inteiro, montado em fatias que cedem a thread.
 *
 * É a parte cara (43 549 filmes na TV de referência) e a razão de existir desta feature: aqui ela roda com o aparelho
 * quieto, não enquanto a pessoa navega.
 */
async function buildKindIndex(
  sourceId: string,
  kind: ExternalKind,
  database: CatalogDb,
  signal?: AbortSignal,
): Promise<CatalogRecord[]> {
  const records: CatalogRecord[] = []
  let sinceYield = 0
  for await (const batch of iterateKindRecordBatches(sourceId, kind, { database, signal, pageSize: INDEX_SLICE })) {
    for (const record of batch) records.push(compactSearchRecord(record))
    sinceYield += batch.length
    if (sinceYield >= INDEX_SLICE) {
      sinceYield = 0
      await yieldToMain()
    }
  }
  return records
}

type RefreshListener = (sourceId: string, kind: ExternalKind) => void
const refreshListeners = new Set<RefreshListener>()

/**
 * A fila acabou de gravar uma fileira externa (T028, FR-006).
 *
 * Sem este aviso a fileira só apareceria quando a pessoa saísse e voltasse: a invalidação que a pré-carga faz depende de
 * **uma categoria chegar**, e o produtor roda justamente quando não há mais categoria a chegar. Canal próprio, e não o
 * `onCategoryDone` da pré-carga, pelo mesmo motivo da feature 086: aquele invalida a trilha, as contagens, as prévias e
 * as páginas de "Todos" — trabalho demais para uma fileira que mudou.
 */
function notifyExternalRowRefreshed(sourceId: string, kind: ExternalKind): void {
  for (const listener of [...refreshListeners]) {
    try {
      listener(sourceId, kind)
    } catch {
      // um ouvinte com problema não impede os outros nem derruba quem produziu a fileira
    }
  }
}

/** Assina o aviso acima. Devolve a função que cancela. */
export function onExternalRowRefreshed(listener: RefreshListener): () => void {
  refreshListeners.add(listener)
  return () => {
    refreshListeners.delete(listener)
  }
}

/**
 * Refaz **uma** fileira externa, se o período dela ainda não estiver guardado.
 *
 * @returns `true` se fez trabalho; `false` quando já estava em dia ou não havia como produzir.
 */
export async function refreshExternalRow(
  sourceId: string,
  kind: ExternalKind,
  row: ExternalRow,
  options: RefreshExternalRowOptions = {},
): Promise<boolean> {
  const database = options.database ?? db
  const now = options.now ?? Date.now()
  const signal = options.signal

  // 1. A geração ativa da lista: sem ela não há onde ancorar o registro (FR-013).
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined) return false

  // 2. O período já guardado é a validade. Dentro dele não há trabalho — e nenhuma consulta é disparada (FR-007).
  //
  // A cobertura entra na conta junto com o período (T036): uma categoria que chega depois **não** muda o período, e sem
  // isto a fileira ficaria parada no catálogo de quando foi produzida até a semana virar. Refazer aqui não consulta
  // nada: o ranking do período já está em cache, só o cruzamento é refeito.
  const periodKey = periodOf(row, now)
  const stored = await readExternalRow(sourceId, kind, row, database)
  const categories = await listVisibleCategories(sourceId, kind, database)
  const coveredCategories = categories.filter(isCovered).length
  const totalCategories = categories.length
  if (stored?.periodKey === periodKey
    && stored.coveredCategories === coveredCategories
    && stored.totalCategories === totalCategories) return false

  // 3. O ranking do serviço. Sem títulos — sem chave, chave recusada, em pausa por limite, serviço fora do ar — não se
  //    grava nada: o guardado continua valendo e a próxima rodada da fila tenta de novo (FR-008, FR-009).
  const load = row === 'top10' ? loadWeeklyTrending : loadTipPool
  const result = await load(kind, { database, now: () => now, language: options.language, signal })
  if (result.titles.length === 0) return false
  // Resposta de outro período (o serviço falhou e o carregador devolveu o cache anterior): gravá-la sob o período novo
  // marcaria como feito um trabalho que não foi feito, e prenderia a fileira no conteúdo velho até o período seguinte.
  if (result.stale) return false

  // 4. O índice do tipo. Catálogo vazio: não há com o que casar.
  const records = await buildKindIndex(sourceId, kind, database, signal)
  if (records.length === 0) return false

  // 5. Casar e selecionar — as funções da 057, sem nenhuma regra nova.
  const matches = await matchDiscoveryTitlesAsync(result.titles, records, READ, { yieldFn: yieldToMain, signal })
  const chosen: Array<{ local: CatalogRecord; rank?: number }> = row === 'top10'
    ? selectTop10(matches)
    // A semente tem de ser a mesma da tela de hoje, senão a Dica muda de título (logic §4).
    : selectTip(matches, { now, seed: tipSeed(sourceId, kind, now) }).map((local) => ({ local }))

  const titleOf = new Map(matches.map((match) => [READ.id(match.local), match.title]))
  const items: CatalogReadItem[] = []
  const ranks: number[] = []
  const backdrops: Array<[string, string]> = []
  const ratings: Array<[string, { average: number; votes: number }]> = []
  for (const { local, rank } of chosen) {
    const id = READ.id(local)
    items.push(toShowcaseItem(local))
    if (rank !== undefined) ranks.push(rank)
    const title = titleOf.get(id)
    if (title === undefined) continue
    // O que veio do serviço fica junto: a tela não pode consultá-lo depois para desenhar o card (FR-003).
    if (title.backdropUrl !== undefined) backdrops.push([id, title.backdropUrl])
    ratings.push([id, { average: title.voteAverage, votes: title.voteCount }])
  }

  try {
    // 6. Gravar, **inclusive vazio** quando a seleção fica abaixo do mínimo: o período é a validade, e é o registro
    //    vazio que impede a fila de remontar o índice do tipo a cada rodada (FR-015).
    await writeExternalRow({
      id: '',
      sourceId,
      generation,
      kind,
      row,
      periodKey,
      computedAt: now,
      items,
      ranks: row === 'top10' ? ranks : undefined,
      backdrops,
      ratings,
      coveredCategories,
      totalCategories,
    }, database)
  } catch {
    // FR-016: esta projeção nunca atrapalha a gravação do catálogo. Sem espaço, a fileira só fica ausente até uma
    // próxima rodada — e devolver `false` deixa a fila seguir para a limpeza, que é o que libera espaço.
    return false
  }
  notifyExternalRowRefreshed(sourceId, kind)
  return true
}

/** A semente do sorteio da Dica — a MESMA que a tela usava, senão a Dica do dia muda de título. */
export function tipSeed(sourceId: string, kind: ExternalKind, now: number): string {
  return `${localDay(now)}|${kind}|${sourceId}`
}

/**
 * Trocar o idioma do app (FR-012): o registro **fica** e só o período é zerado, para a fila refazê-lo no idioma novo.
 *
 * A assimetria com remover a chave é deliberada: remover é a pessoa pedindo que o conteúdo do serviço saia, e sai na
 * hora; trocar o idioma não é pedido para esvaziar nada — a fileira continua na tela com o resultado anterior e troca
 * sozinha quando o novo ficar pronto.
 */
export async function markExternalRowsForRefresh(database: CatalogDb = db): Promise<void> {
  await database.showcaseExternalRows.toCollection().modify((record) => {
    record.periodKey = ''
  })
}

/** A ordem da varredura: um tipo por vez, as duas fileiras dele juntas. */
const ROWS: ReadonlyArray<readonly [ExternalKind, ExternalRow]> = [
  ['movie', 'top10'],
  ['movie', 'tip'],
  ['series', 'top10'],
  ['series', 'tip'],
]

/** Refaz a primeira fileira que estiver fora do período — uma por rodada da fila de segundo plano. */
export async function refreshStaleExternalRows(
  sourceId: string,
  options: RefreshExternalRowOptions = {},
): Promise<boolean> {
  for (const [kind, row] of ROWS) {
    // Uma por rodada, de propósito: montar o índice do tipo é a parte cara, e a fila precisa poder parar entre as duas.
    if (await refreshExternalRow(sourceId, kind, row, options)) return true
  }
  return false
}
