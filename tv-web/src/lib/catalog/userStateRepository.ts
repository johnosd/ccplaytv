/**
 * Favoritos e posição de retomada.
 *
 * A regra que organiza este arquivo é a identidade do item. A constitution
 * exige que essas preferências sejam chaveadas por **fonte + tipo +
 * identificador estável + temporada/episódio** — nunca pela URL, e nunca
 * pelo nome de exibição. Nome é dado editorial do provedor: renomear
 * "Die Hard" para "Die Hard (1988)" não deveria apagar o progresso de
 * ninguém, e dois episódios chamados "Piloto" em temporadas diferentes não
 * são o mesmo item.
 */

import { db, type CatalogDb, type CatalogItemKind, type UserStateRecord } from './db'

/**
 * O que identifica um item entre importações. Os campos opcionais refletem
 * o que cada tipo de fonte de fato entrega — não há valor inventado para
 * preencher o que a fonte não declarou.
 */
export interface StableIdentity {
  sourceId: string
  kind: CatalogItemKind
  /** Identificador do painel. É o que sobrevive a renomeação e a troca de URL. */
  providerStreamId?: string
  seriesId?: string
  seasonNumber?: number
  episodeNumber?: number
  /**
   * Último recurso, só para fonte por URL M3U: ali não existe identificador
   * separado. Menos estável que um id, e é por isso que só entra quando não
   * há id nenhum.
   */
  originalName?: string
}

function identifier(identity: StableIdentity): string {
  const own = identity.providerStreamId ?? identity.seriesId
  if (own) return `id:${own}`
  const name = identity.originalName?.trim().toLowerCase()
  if (name) return `name:${name}`
  throw new Error('Item sem identidade estável: nem identificador do painel, nem nome.')
}

export function buildStableId(identity: StableIdentity): string {
  const parts = [identity.sourceId, identity.kind, identifier(identity)]

  // Temporada/episódio entram na chave para dois episódios homônimos da
  // mesma série não colidirem num único registro de progresso.
  if (identity.kind === 'episode') {
    parts.push(`s${identity.seasonNumber ?? 0}`, `e${identity.episodeNumber ?? 0}`)
  }

  return parts.join('|')
}

export async function getUserState(
  stableId: string,
  database: CatalogDb = db,
): Promise<UserStateRecord | undefined> {
  return database.userStates.get(stableId)
}

/**
 * Lê-altera-grava numa transação só.
 *
 * Duas chamadas concorrentes para o mesmo item — favoritar e salvar
 * progresso ao sair do player, por exemplo — leriam as duas o estado
 * ausente e as duas tentariam `add`, e a segunda estouraria
 * `ConstraintError`. Dentro da transação, a segunda enxerga o que a
 * primeira gravou.
 */
async function upsert(
  stableId: string,
  sourceId: string,
  patch: (current: UserStateRecord) => UserStateRecord,
  database: CatalogDb = db,
): Promise<void> {
  await database.transaction('rw', database.userStates, async () => {
    const now = Date.now()
    const existing = await database.userStates.get(stableId)
    const base: UserStateRecord = existing ?? {
      stableId,
      sourceId,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    }
    await database.userStates.put({ ...patch(base), updatedAt: now })
  })
}

export async function toggleFavorite(
  stableId: string,
  sourceId: string,
  isFavorite: boolean,
  database: CatalogDb = db,
): Promise<void> {
  await upsert(
    stableId,
    sourceId,
    (current) => ({
      ...current,
      isFavorite,
      // Deixar de ser favorito apaga o instante — é o que tira o registro do
      // índice, em vez de mantê-lo lá com uma marca "mas não conta".
      favoritedAt: isFavorite ? (current.favoritedAt ?? Date.now()) : undefined,
    }),
    database,
  )
}

export async function updateProgress(
  stableId: string,
  sourceId: string,
  progressSeconds: number,
  database: CatalogDb = db,
): Promise<void> {
  await upsert(
    stableId,
    sourceId,
    (current) => ({ ...current, progressSeconds, lastWatched: Date.now() }),
    database,
  )
}

/**
 * Apaga a posição de retomada — usada ao cruzar o limiar final (quase todo
 * assistido) e na conclusão real do motor (feature 011, `progressRecorder.ts`
 * `logic/reproducao-vod.md` §2). Segue o mesmo padrão de `toggleFavorite`:
 * zera o campo em vez de marcar "concluído" numa coleção separada — não há
 * necessidade de inventar outro estado além de "tem posição" / "não tem".
 */
export async function clearProgress(
  stableId: string,
  sourceId: string,
  database: CatalogDb = db,
): Promise<void> {
  await upsert(
    stableId,
    sourceId,
    (current) => ({ ...current, progressSeconds: undefined }),
    database,
  )
}

export async function getGlobalFavorites(
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  // Pelo índice, do favoritado mais recente para o mais antigo. Registro sem
  // `favoritedAt` não está no índice — que é exatamente "não é favorito".
  return database.userStates.orderBy('favoritedAt').reverse().toArray()
}

export async function getContinueWatching(
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  const started = await database.userStates.orderBy('lastWatched').reverse().toArray()
  return started.filter((state) => (state.progressSeconds ?? 0) > 0)
}
