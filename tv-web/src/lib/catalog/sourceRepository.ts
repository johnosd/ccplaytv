/**
 * Acesso às fontes cadastradas (`contracts/local-storage.md` §1).
 *
 * A regra que organiza este arquivo é a fronteira de segredo (D-005/FR-009):
 * **nada que a interface renderize carrega usuário ou senha.** Por isso o
 * tipo que sai daqui, `SourceView`, não tem esses campos — não é disciplina
 * de quem chama, é o tipo que impede.
 *
 * A credencial tem uma porta separada (`readCredential`), com um único
 * consumidor legítimo: o conector, ao importar, e a montagem de URL, ao
 * reproduzir. Ela não aparece em listagem, não entra em objeto de tela e
 * não é registrada em diagnóstico.
 */

import {
  db,
  type AccountStatusKind,
  type CatalogDb,
  type CatalogSection,
  type ConnectionState,
  type LimitedReason,
  type ProviderImportMode,
  type SourceRecord,
  type SourceType,
} from './db'
import { parsePanelUrl } from './m3uPanelUrl'
import { normalizeServerAddress } from './xtreamConnector'
import { epgManualHostOf, epgStatusOf } from '../epg/epgStatus'
import type { EpgStatus } from '../epg/types'
import type { SourceAccount } from './sourceAccount'
import type { ArchiveVariant, PanelClock } from './archiveUrl'
import { portalTables } from '../portal/portalTables'
import { notifyLocalSourceChanged } from '../portal/sourceChangeSignal'
import { sourceExtras, type CreateSourceInput, type UpdateSourceInput } from './sourceInput'
export type { CreateSourceInput, UpdateSourceInput } from './sourceInput'
export { deleteSource, sourceDeletionTables } from './sourceDeletion'

/** A fonte como as telas a veem — sem credencial, por construção. */
export interface SourceView {
  id: string
  type: SourceType
  displayName: string
  m3uUrl?: string
  /** Endereço do painel. Sozinho não autentica, e é o que permite editar sem redigitar a senha. */
  providerDns?: string
  providerImportMode?: ProviderImportMode
  /** Motivo do Modo limitado (feature 014, FR-020) — categoria fixa, nunca texto de erro cru. */
  limitedReason?: LimitedReason
  providerMigratedAt?: number
  connectionState: ConnectionState
  lastSuccessfulSyncAt?: number
  lastTruncatedByStorage?: boolean
  lastDiscardedByType?: number
  activeGeneration?: number
  /** Estado do EPG (feature 030) — derivado, sem nenhum endereço. */
  epg: EpgStatus
  /** Só o hostname do endereço XMLTV informado pela pessoa (FR-017) — nunca caminho, query ou credencial. */
  epgManualHost?: string
  /** Conta Xtream (feature 034) — vencimento e resultado da última verificação; nenhum segredo. */
  account?: SourceAccount
  /** Seções que não responderam na última sincronização bem-sucedida (feature 034, FR-018). */
  lastUnavailableSections?: CatalogSection[]
  createdAt: number
  updatedAt: number
}

/** Os três campos da conta como a visão os expõe; `undefined` enquanto a fonte nunca foi verificada. */
function accountOf(record: SourceRecord): SourceAccount | undefined {
  if (
    record.accountStatus === undefined &&
    record.accountExpiresAt === undefined &&
    record.accountCheckedAt === undefined
  ) {
    return undefined
  }
  const account: SourceAccount = {}
  if (record.accountStatus !== undefined) account.status = record.accountStatus
  if (record.accountExpiresAt !== undefined) account.expiresAt = record.accountExpiresAt
  if (record.accountCheckedAt !== undefined) account.checkedAt = record.accountCheckedAt
  return account
}

function toView(record: SourceRecord): SourceView {
  // Desestruturação explícita, não `delete` sobre uma cópia: um campo novo
  // em `SourceRecord` não vaza por esquecimento — ele simplesmente não
  // aparece aqui até alguém decidir que deve aparecer.
  return {
    id: record.id,
    type: record.type,
    displayName: record.displayName,
    m3uUrl: record.m3uUrl,
    providerDns: record.providerDns,
    providerImportMode: record.providerImportMode,
    limitedReason: record.limitedReason,
    providerMigratedAt: record.providerMigratedAt,
    connectionState: record.connectionState,
    lastSuccessfulSyncAt: record.lastSuccessfulSyncAt,
    lastTruncatedByStorage: record.lastTruncatedByStorage,
    lastDiscardedByType: record.lastDiscardedByType,
    activeGeneration: record.activeGeneration,
    epg: epgStatusOf(record),
    epgManualHost: epgManualHostOf(record),
    account: accountOf(record),
    lastUnavailableSections: record.lastUnavailableSections,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export async function listSources(database: CatalogDb = db): Promise<SourceView[]> {
  const records = await database.sources.toArray()
  return records.sort((a, b) => a.createdAt - b.createdAt).map(toView)
}

export async function getSource(
  id: string,
  database: CatalogDb = db,
): Promise<SourceView | undefined> {
  const record = await database.sources.get(id)
  return record ? toView(record) : undefined
}

export class InvalidSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSourceError'
  }
}

function newId(): string {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) return random
  // A TV de referência tem `crypto.randomUUID`, mas o alvo é Chromium 108 e
  // contexto não seguro (`file://`) pode não expor — um id local não precisa
  // ser criptográfico, só não colidir.
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function createSource(
  input: CreateSourceInput,
  database: CatalogDb = db,
  options: { sourceId?: string } = {},
): Promise<string> {
  const now = Date.now()
  const record: SourceRecord = {
    id: options.sourceId ?? newId(),
    type: input.type,
    displayName: input.displayName.trim(),
    connectionState: 'never_synced',
    createdAt: now,
    updatedAt: now,
  }

  if (input.type === 'provider_credentials') {
    if (!input.providerDns || !input.providerUsername || !input.providerPassword) {
      throw new InvalidSourceError('Endereço, usuário e senha são obrigatórios.')
    }
    // Normaliza antes de gravar, e é aqui que credencial embutida na URL é
    // recusada — guardar um endereço com senha dentro espalharia o segredo
    // por um campo que a tela exibe.
    record.providerDns = normalizeServerAddress(input.providerDns)
    record.providerUsername = input.providerUsername
    record.providerPassword = input.providerPassword
  } else {
    if (!input.m3uUrl?.trim()) throw new InvalidSourceError('URL da lista é obrigatória.')
    record.m3uUrl = input.m3uUrl.trim()
  }

  Object.assign(record, sourceExtras(input))
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(record.id)) throw new InvalidSourceError('Identificador inválido.')
  const tables = portalTables(database)
  await database.transaction('rw', database.sources, tables.revisions, async () => {
    if (await tables.revisions.get(record.id)) throw new InvalidSourceError('Identificador já utilizado.')
    await database.sources.add(record)
    await tables.revisions.put({ sourceId: record.id, revision: 1 })
  })
  // 071/FR-008: lista nova sobe ao site no ato (uma tentativa; o agente decide e a fila é durável).
  notifyLocalSourceChanged()
  return record.id
}

/**
 * Atualização parcial: campo ausente **ou vazio** mantém o valor atual.
 *
 * É o que permite a tela de edição trazer o endereço preenchido e a senha
 * em branco. Campo em branco ali significa "não mexi nisso", nunca "apague".
 */
export async function updateSource(
  id: string,
  input: UpdateSourceInput,
  database: CatalogDb = db,
): Promise<SourceView | undefined> {
  const tables = portalTables(database)
  const updated = await database.transaction('rw', database.sources, tables.revisions, database.epgPrograms, async () => {
    const record = await database.sources.get(id)
    if (!record) return undefined

    const changes: Partial<SourceRecord> = { updatedAt: Date.now() }
    if (input.displayName?.trim()) changes.displayName = input.displayName.trim()
    if (input.m3uUrl?.trim()) changes.m3uUrl = input.m3uUrl.trim()
    if (input.providerDns?.trim()) changes.providerDns = normalizeServerAddress(input.providerDns)
    if (input.providerUsername?.trim()) changes.providerUsername = input.providerUsername
    if (input.providerPassword) changes.providerPassword = input.providerPassword

    const credentialChanged =
      changes.providerDns !== undefined ||
      changes.providerUsername !== undefined ||
      changes.providerPassword !== undefined
    if (credentialChanged) {
      // Credencial nova é conta possivelmente diferente: o que o conector
      // apurou sobre a anterior (migração, formatos permitidos) deixa de
      // valer (FR-020).
      changes.providerMigratedAt = undefined
      changes.providerAllowedFormats = undefined
    }

    Object.assign(changes, sourceExtras(input))
    if (input.epgDisabled === true) {
      await database.epgPrograms.where('sourceId').equals(id).delete()
      changes.epgActiveGeneration = undefined
    }
    const previous = await tables.revisions.get(id)
    if (previous?.tombstone) throw new InvalidSourceError('Lista removida.')
    await database.sources.update(id, changes)
    await tables.revisions.put({ ...previous, sourceId: id, revision: (previous?.revision ?? 0) + 1 })
    return getSource(id, database)
  })
  if (updated) notifyLocalSourceChanged()
  return updated
}

export interface SyncMark {
  at: number
  mode?: ProviderImportMode
  /** Motivo do Modo limitado (feature 014). Só faz sentido junto de `mode: 'legacy_m3u'`. */
  limitedReason?: LimitedReason
  allowedFormats?: string[]
  truncatedByStorage?: boolean
  discardedByType?: number
  /** `url-tvg`/`x-tvg-url` do cabeçalho M3U (feature 030). Gravado sempre, inclusive como ausente. */
  epgDeclaredUrl?: string
  /** Feature 034: a conta que o painel confirmou nesta sincronização (só fonte Xtream). */
  account?: { status: 'active'; expiresAt: number | null; checkedAt: number }
  /** Feature 034: seções que não responderam. Regravado sempre, inclusive como `[]`. */
  unavailableSections?: CatalogSection[]
  /** Feature 058: relógio do painel lido nesta verificação (`server_info`). Só regravado quando vem. */
  clock?: PanelClock
}

/** O que o painel disse da conta (feature 034). `expiresAt` só é regravado quando vem no patch. */
export interface AccountMark {
  status: AccountStatusKind
  expiresAt?: number | null
  checkedAt: number
  /** Feature 058: relógio do painel lido nesta verificação. Só regravado quando vem. */
  clock?: PanelClock
}

/**
 * Feature 058 (`data-model.md` §4): os dois campos do relógio são regravados
 * juntos — um painel que deixou de declarar o fuso não pode ficar com o antigo
 * ao lado de um deslocamento novo.
 */
function applyClock(patch: Partial<SourceRecord>, clock: PanelClock | undefined): void {
  if (!clock) return
  patch.panelTimezone = clock.timezone
  patch.panelUtcOffsetMinutes = clock.utcOffsetMinutes
}

/**
 * Feature 058 (R4 da research): a variante de URL de arquivo que **tocou** nesta
 * fonte — nunca gravada por falha. Ausente/indefinida = nada a lembrar.
 */
export async function rememberArchiveVariant(
  id: string,
  variant: ArchiveVariant | undefined,
  database: CatalogDb = db,
): Promise<void> {
  if (variant !== 'rest' && variant !== 'php') return
  const source = await database.sources.get(id)
  if (!source || source.archiveVariant === variant) return
  await database.sources.update(id, { archiveVariant: variant })
}

/**
 * Grava o resultado de uma verificação da conta (sincronização ou consulta
 * leve). **Não** toca `connectionState`, a geração ativa nem o catálogo: um
 * bloqueio por conta nunca apaga estado local (constitution 1.7.0, D-007).
 */
export async function markAccount(id: string, mark: AccountMark, database: CatalogDb = db): Promise<void> {
  const patch: Partial<SourceRecord> = { accountStatus: mark.status, accountCheckedAt: mark.checkedAt }
  if (mark.expiresAt !== undefined) patch.accountExpiresAt = mark.expiresAt
  applyClock(patch, mark.clock)
  await database.sources.update(id, patch)
}

/**
 * Registra sincronização bem-sucedida.
 *
 * Só é chamada no sucesso. Falha **não** avança a marca (FR-016): uma
 * atualização que não deu certo não pode fazer o catálogo parecer recente.
 *
 * `providerImportMode` e `limitedReason` são gravados **sempre**, inclusive
 * como ausentes (feature 014, D-010/FR-023) — uma ressincronização que
 * volta a falar o protocolo completo precisa apagar o Modo limitado
 * anterior, não só deixar de mencioná-lo. `providerMigratedAt` continua
 * condicional: só muda quando `mode` vem definido.
 */
export async function markSynced(
  id: string,
  mark: SyncMark,
  database: CatalogDb = db,
): Promise<void> {
  const patch: Partial<SourceRecord> = {
    connectionState: 'synced',
    lastSuccessfulSyncAt: mark.at,
    updatedAt: mark.at,
    providerImportMode: mark.mode,
    limitedReason: mark.limitedReason,
    // Feature 030: como o modo limitado, regravado sempre — uma lista que
    // perdeu o `url-tvg` não pode manter o endereço antigo. E a marca de que
    // esta importação já captura o id de EPG dos canais (D-007).
    epgDeclaredUrl: mark.epgDeclaredUrl,
    epgIdsCapturedAt: mark.at,
    // Feature 034 (data-model §1): regravado sempre, inclusive `[]`.
    lastUnavailableSections: mark.unavailableSections ?? [],
  }
  if (mark.account) {
    patch.accountStatus = mark.account.status
    patch.accountExpiresAt = mark.account.expiresAt
    patch.accountCheckedAt = mark.account.checkedAt
  }
  if (mark.mode !== undefined) patch.providerMigratedAt = mark.at
  if (mark.allowedFormats !== undefined) patch.providerAllowedFormats = mark.allowedFormats
  if (mark.truncatedByStorage !== undefined) patch.lastTruncatedByStorage = mark.truncatedByStorage
  if (mark.discardedByType !== undefined) patch.lastDiscardedByType = mark.discardedByType
  applyClock(patch, mark.clock)

  await database.sources.update(id, patch)
}

/**
 * Marca que a última consulta falhou, **sem** tocar na marca de
 * sincronização nem no catálogo ativo — o que já foi importado continua
 * valendo e continua tocando.
 *
 * FR-016: "nem transformar uma fonte saudável em fonte com erro".
 * Portanto, se a fonte já estiver 'synced', ela continua 'synced' e o catálogo
 * não é escondido/invalidado na interface. Apenas falhas na primeira
 * tentativa (ou já em erro) marcam como 'error'.
 */
export async function markConnectionError(id: string, database: CatalogDb = db): Promise<void> {
  const source = await database.sources.get(id)
  if (!source) return
  
  if (source.connectionState !== 'synced') {
    await database.sources.update(id, { connectionState: 'error', updatedAt: Date.now() })
  }
}

export interface ProviderCredential {
  dns: string
  username: string
  password: string
  allowedFormats?: string[]
}

/**
 * **Porta restrita.** Só o conector (ao importar) e a montagem de URL (ao
 * reproduzir) chamam isto. O resultado nunca entra em estado de tela, em
 * log, em diagnóstico ou em qualquer objeto que atravesse a interface.
 *
 * Para `type: 'm3u_url'`, a credencial é **derivada** da própria URL
 * guardada (feature 014, D-001/D-003) sempre que ela estiver no formato de
 * painel — nunca copiada para `providerUsername`/`providerPassword`:
 * editar a URL muda a credencial sozinha, sem risco de duas cópias
 * divergirem. `allowedFormats` ainda vem de `providerAllowedFormats`, que
 * `markSynced` grava do mesmo jeito para os dois tipos de fonte.
 */
export async function readCredential(
  id: string,
  database: CatalogDb = db,
): Promise<ProviderCredential | undefined> {
  const record = await database.sources.get(id)
  if (!record) return undefined

  if (record.type === 'm3u_url') {
    const panel = record.m3uUrl ? parsePanelUrl(record.m3uUrl) : undefined
    if (!panel) return undefined
    return { ...panel, allowedFormats: record.providerAllowedFormats }
  }

  if (!record.providerDns || !record.providerUsername || !record.providerPassword) return undefined
  return {
    dns: record.providerDns,
    username: record.providerUsername,
    password: record.providerPassword,
    allowedFormats: record.providerAllowedFormats,
  }
}
