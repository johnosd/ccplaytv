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

const KNOWN_KINDS = new Set<CatalogItemKind>(['channel', 'movie', 'series', 'episode', 'unclassified'])

/**
 * As partes de um `stableId` (feature 013) — o único formato que este
 * arquivo conhece; nenhuma tela faz `split` por conta própria
 * (`sdd/specs/013-favoritos/logic/resolucao-favoritos.md`).
 */
export interface StableIdParts {
  sourceId: string
  kind: CatalogItemKind
  identifier: { type: 'id'; value: string } | { type: 'name'; value: string }
}

/**
 * Inverso de `buildStableId` — usado para resolver um favorito de volta a
 * um registro do catálogo (feature 013). `null` para qualquer coisa que
 * não seja um `stableId` desta função geradora, em vez de adivinhar.
 *
 * Só a última fatia (`sN`/`eN`) é reservada para episódio: o identificador
 * em si (id do painel ou nome) pode conter `|` — um nome de fonte M3U com
 * pipe, por exemplo — porque é rejuntado a partir dos segmentos que
 * sobram, nunca cortado no primeiro `|` que aparecer.
 */
export function parseStableId(stableId: string): StableIdParts | null {
  const segments = stableId.split('|')
  if (segments.length < 3) return null

  const [sourceId, kindRaw, ...rest] = segments
  if (!sourceId || !KNOWN_KINDS.has(kindRaw as CatalogItemKind)) return null
  const kind = kindRaw as CatalogItemKind

  let identifierSegments = rest
  if (kind === 'episode') {
    if (rest.length < 3) return null // identificador + sN + eN
    const season = rest[rest.length - 2]
    const episode = rest[rest.length - 1]
    if (!/^s\d+$/.test(season) || !/^e\d+$/.test(episode)) return null
    identifierSegments = rest.slice(0, -2)
  }
  if (identifierSegments.length === 0) return null

  const identifierStr = identifierSegments.join('|')
  if (identifierStr.startsWith('id:')) {
    return { sourceId, kind, identifier: { type: 'id', value: identifierStr.slice(3) } }
  }
  if (identifierStr.startsWith('name:')) {
    return { sourceId, kind, identifier: { type: 'name', value: identifierStr.slice(5) } }
  }
  return null
}

/**
 * Favoritos de uma fonte e tipo, do mais recente para o mais antigo
 * (índice `favoritedAt`) — feature 013, categoria "Favoritos" da trilha.
 *
 * Filtra em memória por fonte/tipo em vez de um índice composto novo:
 * favoritos são dezenas a centenas por fonte, não o catálogo inteiro
 * (`plan.md` D-006) — bem diferente do volume que justificou os índices de
 * `channels`.
 */
export async function listFavorites(
  sourceId: string,
  kind: CatalogItemKind,
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  const prefix = `${sourceId}|${kind}|`
  const favorites = await database.userStates.orderBy('favoritedAt').reverse().toArray()
  return favorites.filter((state) => state.sourceId === sourceId && state.stableId.startsWith(prefix))
}

/**
 * `stableId`s assistidos de uma fonte/tipo (feature 019, D-006) — mesmo
 * espírito de `listFavorites`, mas sem índice próprio: `completedAt` não é
 * indexado (diferente de `favoritedAt`), então filtra em memória sobre o
 * que já é indexado por `sourceId` — escala com o que a pessoa já
 * interagiu, nunca com o catálogo inteiro.
 */
export async function listWatched(
  sourceId: string,
  kind: CatalogItemKind,
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  const prefix = `${sourceId}|${kind}|`
  const states = await database.userStates.where('sourceId').equals(sourceId).toArray()
  return states.filter((state) => state.completedAt != null && state.stableId.startsWith(prefix))
}

/**
 * Remove TODO o estado do usuário (favoritos e retomada) de uma fonte —
 * chamado ao remover a fonte (feature 013, `plan.md` D-007, FR-017). Uma
 * fonte readicionada ganha `sourceId` novo (UUID), então nada aqui fica
 * órfão-mas-recuperável: manter o registro só ocuparia espaço à toa.
 */
export async function deleteUserStatesForSource(
  sourceId: string,
  database: CatalogDb = db,
): Promise<void> {
  await database.userStates.where('sourceId').equals(sourceId).delete()
}

export async function getUserState(
  stableId: string,
  database: CatalogDb = db,
): Promise<UserStateRecord | undefined> {
  return database.userStates.get(stableId)
}

/**
 * Leitura em lote, na ordem pedida (feature 012) — a lista de episódios
 * calcula o selo de cada linha sem uma consulta por episódio.
 * `bulkGet` já preserva ordem e devolve `undefined` na posição de um id
 * sem registro (nunca aberto), sem lançar.
 */
export async function getUserStates(
  stableIds: string[],
  database: CatalogDb = db,
): Promise<(UserStateRecord | undefined)[]> {
  return database.userStates.bulkGet(stableIds)
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

/**
 * Marca conclusão real (feature 012, D-007): grava `completedAt`, apaga
 * `progressSeconds` (mesma limpeza de `clearProgress` — não faz sentido
 * "assistido" e "retomar do meio" coexistirem) e atualiza `lastWatched`.
 *
 * Persistente por design: gravar progresso depois (reassistir e sair no
 * meio) não apaga `completedAt` — os dois convivem, o selo continua ligado
 * enquanto a nova posição de retomada aparece separadamente.
 */
export async function markCompleted(
  stableId: string,
  sourceId: string,
  database: CatalogDb = db,
): Promise<void> {
  await upsert(
    stableId,
    sourceId,
    (current) => ({ ...current, completedAt: Date.now(), progressSeconds: undefined }),
    database,
  )
}

/**
 * Correção manual de "assistido" (feature 019, D-004) — distinta de
 * `markCompleted` (automática, via reprodução real): marcar (`true`) grava
 * o mesmo par `completedAt`/`progressSeconds` que `markCompleted` já grava
 * (não inventa posição nem duração, FR-005); desmarcar (`false`) só limpa
 * `completedAt`, sem tocar `progressSeconds`.
 */
export async function setWatchedManually(
  stableId: string,
  sourceId: string,
  watched: boolean,
  database: CatalogDb = db,
): Promise<void> {
  if (watched) {
    await markCompleted(stableId, sourceId, database)
    return
  }
  await upsert(stableId, sourceId, (current) => ({ ...current, completedAt: undefined }), database)
}

export async function getGlobalFavorites(
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  // Pelo índice, do favoritado mais recente para o mais antigo. Registro sem
  // `favoritedAt` não está no índice — que é exatamente "não é favorito".
  return database.userStates.orderBy('favoritedAt').reverse().toArray()
}

/**
 * `sourceId` (feature 019, D-009) é opcional: informado, filtra pra uma
 * fonte só (uso do hub, FR-012); omitido, preserva o comportamento
 * original (todas as fontes juntas — `userStateRepository.test.ts`,
 * "should fetch continue watching across sources").
 */
export async function getContinueWatching(
  sourceId?: string,
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  const started = await database.userStates.orderBy('lastWatched').reverse().toArray()
  const filtered = sourceId === undefined ? started : started.filter((state) => state.sourceId === sourceId)
  return filtered.filter((state) => (state.progressSeconds ?? 0) > 0)
}
