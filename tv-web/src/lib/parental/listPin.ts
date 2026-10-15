/**
 * PIN parental por lista (feature 067, US3 — FR-017..FR-026). Cada lista tem o seu PIN, ou nenhum; o PIN de uma lista
 * nunca vale para outra. Regras em `sdd/specs/067-configuracoes-lista-global/logic/pin-por-lista.md`.
 *
 * Nada daqui loga, lança ou devolve o PIN nem os dados de lista conferidos.
 */

import { db, type CatalogDb } from '../catalog/db'
import { categoryPreferences, parentalPins } from '../catalog/parentalTables'
import { notifyCategoryAccessChanged, preferenceKey, relockSession } from '../catalog/categoryAccess'
import { hashPin, saltedPinHash, type CategoryDecision, type RecoveryInput } from './pin'

export type { CategoryDecision, RecoveryInput } from './pin'

/**
 * Espelho síncrono de "estas listas têm PIN" (R-006 da 067, herdeiro do R-013 da 066) — só ids, nunca PIN nem hash.
 * Serve a quem precisa decidir na hora, sem esperar o IndexedDB (remover lista sem PIN continua imediato, contratos
 * 023/026). Só o banco do app o escreve; `hasPin`/`syncPinHints` o realinham. Mexer nele só burla o PIN para quem já
 * acessa o armazenamento, fora da ameaça do controle parental (R-007 da 066).
 */
const PIN_SOURCES_KEY = 'ccplay.parental.pinSources'
/** Espelho global da 066, substituído pelo de cima. */
const LEGACY_HINT_KEY = 'ccplay.parental.pinActive'

function readHints(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PIN_SOURCES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeHints(ids: Iterable<string>): void {
  const list = [...new Set(ids)]
  try {
    if (list.length === 0) localStorage.removeItem(PIN_SOURCES_KEY)
    else localStorage.setItem(PIN_SOURCES_KEY, JSON.stringify(list))
  } catch {
    // Sem armazenamento local: quem lê o espelho cai no `false` e a tela continua usando `hasPin`/`verifyPin`.
  }
}

function writeHint(sourceId: string, active: boolean, database: CatalogDb): void {
  if (database !== db) return
  const ids = new Set(readHints())
  if (active) ids.add(sourceId)
  else ids.delete(sourceId)
  writeHints(ids)
}

/** Leitura síncrona do espelho desta lista; `false` sem armazenamento. A verdade continua sendo `hasPin`. */
export function pinActiveHint(sourceId: string): boolean {
  return readHints().includes(sourceId)
}

/** Realinha o espelho inteiro com o IndexedDB (ao abrir o app) e apaga o espelho global da 066. */
export async function syncPinHints(database: CatalogDb = db): Promise<void> {
  if (database !== db) return
  const ids = (await parentalPins(database).toCollection().primaryKeys()) as string[]
  try {
    localStorage.removeItem(LEGACY_HINT_KEY)
  } catch {
    // Sem armazenamento local: nada a limpar.
  }
  writeHints(ids)
}

/** Existe PIN nesta lista? Também realinha o espelho síncrono desta lista (`pinActiveHint`). */
export async function hasPin(sourceId: string, database: CatalogDb = db): Promise<boolean> {
  const active = (await parentalPins(database).get(sourceId)) !== undefined
  writeHint(sourceId, active, database)
  return active
}

/** Confere o PIN contra o PIN **desta** lista; lista sem PIN → `false`. */
export async function verifyPin(sourceId: string, pin: string, database: CatalogDb = db): Promise<boolean> {
  const record = await parentalPins(database).get(sourceId)
  if (!record) return false
  return (await hashPin(pin, record.salt)) === record.hash
}

/** Liga o controle parental desta lista: grava o PIN dela e as decisões numa transação só (FR-018, FR-019, D-007 da 066). */
export async function enableParentalControl(
  sourceId: string,
  pin: string,
  decisions: CategoryDecision[],
  database: CatalogDb = db,
): Promise<void> {
  // O hash é calculado antes: uma espera fora do IndexedDB dentro da transação a encerraria.
  const record = { sourceId, ...(await saltedPinHash(pin)) }
  const pins = parentalPins(database)
  const prefs = categoryPreferences(database)
  await database.transaction('rw', pins, prefs, async () => {
    await pins.put(record)
    // Só decisões desta lista: ligar o controle aqui nunca bloqueia nada de outra lista.
    for (const { category, locked } of decisions.filter((decision) => decision.category.sourceId === sourceId)) {
      const key = preferenceKey(category)
      const current = await prefs.get(key)
      const [, kind, matchKey] = key
      await prefs.put({
        ...current,
        sourceId,
        kind,
        matchKey,
        locked,
        // Recusar uma sugestão fica lembrado mesmo depois de desligar e religar (FR-024 da 066).
        ...(locked ? {} : { declinedSuggestion: true }),
        updatedAt: Date.now(),
      })
    }
  })
  writeHint(sourceId, true, database)
  notifyCategoryAccessChanged()
}

/** Troca o PIN desta lista (depois de verificado ou de uma recuperação aceita). Bloqueios ficam. */
export async function changePin(sourceId: string, newPin: string, database: CatalogDb = db): Promise<void> {
  await parentalPins(database).put({ sourceId, ...(await saltedPinHash(newPin)) })
  writeHint(sourceId, true, database)
}

/** Apaga o PIN e os bloqueios **desta** lista; escondidas e recusas ficam; as outras listas não mudam (FR-018). */
export async function disableParentalControl(sourceId: string, database: CatalogDb = db): Promise<void> {
  const pins = parentalPins(database)
  const prefs = categoryPreferences(database)
  await database.transaction('rw', pins, prefs, async () => {
    await pins.delete(sourceId)
    await prefs
      .where('sourceId')
      .equals(sourceId)
      .modify((pref) => {
        delete pref.locked
      })
  })
  writeHint(sourceId, false, database)
  relockSession()
  notifyCategoryAccessChanged()
}

/** Confere, só no aparelho, os dados **desta** lista (FR-023) — nunca os de outra. */
export async function recoverPinWithSource(
  sourceId: string,
  input: RecoveryInput,
  database: CatalogDb = db,
): Promise<boolean> {
  const source = await database.sources.get(sourceId)
  if (!source) return false
  if ('url' in input) {
    const url = input.url.trim()
    return url !== '' && source.m3uUrl?.trim() === url
  }
  const username = input.username.trim()
  const password = input.password.trim()
  if (username === '' || password === '') return false
  return (
    source.type === 'provider_credentials' &&
    source.providerUsername?.trim() === username &&
    source.providerPassword?.trim() === password
  )
}
