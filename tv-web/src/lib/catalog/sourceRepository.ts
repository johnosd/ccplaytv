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
  type CatalogDb,
  type ConnectionState,
  type ProviderImportMode,
  type SourceRecord,
  type SourceType,
} from './db'
import { deleteAllForSource } from './catalogRepository'
import { normalizeServerAddress } from './xtreamConnector'

/** A fonte como as telas a veem — sem credencial, por construção. */
export interface SourceView {
  id: string
  type: SourceType
  displayName: string
  m3uUrl?: string
  /** Endereço do painel. Sozinho não autentica, e é o que permite editar sem redigitar a senha. */
  providerDns?: string
  providerImportMode?: ProviderImportMode
  providerMigratedAt?: number
  connectionState: ConnectionState
  lastSuccessfulSyncAt?: number
  activeGeneration?: number
  createdAt: number
  updatedAt: number
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
    providerMigratedAt: record.providerMigratedAt,
    connectionState: record.connectionState,
    lastSuccessfulSyncAt: record.lastSuccessfulSyncAt,
    activeGeneration: record.activeGeneration,
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

export interface CreateSourceInput {
  type: SourceType
  displayName: string
  m3uUrl?: string
  providerDns?: string
  providerUsername?: string
  providerPassword?: string
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
): Promise<string> {
  const now = Date.now()
  const record: SourceRecord = {
    id: newId(),
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

  await database.sources.add(record)
  return record.id
}

export interface UpdateSourceInput {
  displayName?: string
  m3uUrl?: string
  providerDns?: string
  providerUsername?: string
  providerPassword?: string
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

  await database.sources.update(id, changes)
  return getSource(id, database)
}

/** Remove a fonte e tudo que dependia dela — catálogo de todas as gerações e execuções. */
export async function deleteSource(id: string, database: CatalogDb = db): Promise<void> {
  await deleteAllForSource(id, database)
  await database.importRuns.where('[sourceId+status]').between([id, ''], [id, '￿']).delete()
  await database.sources.delete(id)
}

export interface SyncMark {
  at: number
  mode?: ProviderImportMode
  allowedFormats?: string[]
  truncatedByStorage?: boolean
  discardedByType?: number
}

/**
 * Registra sincronização bem-sucedida.
 *
 * Só é chamada no sucesso. Falha **não** avança a marca (FR-016): uma
 * atualização que não deu certo não pode fazer o catálogo parecer recente.
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
  }
  if (mark.mode !== undefined) {
    patch.providerImportMode = mark.mode
    patch.providerMigratedAt = mark.at
  }
  if (mark.allowedFormats !== undefined) patch.providerAllowedFormats = mark.allowedFormats
  if (mark.truncatedByStorage !== undefined) patch.lastTruncatedByStorage = mark.truncatedByStorage
  if (mark.discardedByType !== undefined) patch.lastDiscardedByType = mark.discardedByType

  await database.sources.update(id, patch)
}

/**
 * Marca que a última consulta falhou, **sem** tocar na marca de
 * sincronização nem no catálogo ativo — o que já foi importado continua
 * valendo e continua tocando.
 */
export async function markConnectionError(id: string, database: CatalogDb = db): Promise<void> {
  await database.sources.update(id, { connectionState: 'error', updatedAt: Date.now() })
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
 */
export async function readCredential(
  id: string,
  database: CatalogDb = db,
): Promise<ProviderCredential | undefined> {
  const record = await database.sources.get(id)
  if (!record?.providerDns || !record.providerUsername || !record.providerPassword) return undefined
  return {
    dns: record.providerDns,
    username: record.providerUsername,
    password: record.providerPassword,
    allowedFormats: record.providerAllowedFormats,
  }
}
