/**
 * PIN parental (feature 066): um por aparelho, guardado só como hash com sal,
 * nunca em texto. Regras em `sdd/specs/066-categorias-controle-parental/logic/pin.md`.
 *
 * Nada daqui loga, lança ou devolve o PIN nem os dados de lista conferidos.
 */

import { db, type CatalogDb } from '../catalog/db'
import { categoryPreferences, parentalPin, type ParentalPinRecord } from '../catalog/parentalTables'
import { notifyCategoryAccessChanged, preferenceKey, relockSession, type CategoryRef } from '../catalog/categoryAccess'
import { sha256Hex } from './sha256'

/** Decisão da pessoa ao ligar o controle parental (confirmação da sugestão, FR-022). */
export interface CategoryDecision {
  category: CategoryRef
  locked: boolean
}

/** Dados de uma lista cadastrada para recuperar o PIN (FR-027). */
export type RecoveryInput = { username: string; password: string } | { url: string }

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** SHA-256 de `salt:pin`. `crypto.subtle` quando existe; senão o JS puro (R-002). */
async function hashPin(pin: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`)
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes)))
    } catch {
      // Contexto sem permissão para `subtle`: segue pelo caminho de reserva.
    }
  }
  return sha256Hex(bytes)
}

async function pinRecord(pin: string): Promise<ParentalPinRecord> {
  const salt = toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)))
  return { id: 'pin', salt, hash: await hashPin(pin, salt), algorithm: 'sha256', createdAt: Date.now() }
}

/**
 * Espelho síncrono de "existe PIN" (feature 066, R-013) — só um booleano, nunca o PIN nem o hash. Serve a quem precisa
 * decidir na hora, sem esperar o IndexedDB (remover lista: o contrato da 026 exige a remoção imediata sem PIN). Só o
 * banco do app o escreve; `hasPin` o realinha. Mexer nele só burla o PIN para quem já tem acesso ao armazenamento,
 * fora da ameaça do controle parental (R-007).
 */
const PIN_HINT_KEY = 'ccplay.parental.pinActive'

function writePinHint(active: boolean, database: CatalogDb): void {
  if (database !== db) return
  try {
    if (active) localStorage.setItem(PIN_HINT_KEY, '1')
    else localStorage.removeItem(PIN_HINT_KEY)
  } catch {
    // Sem armazenamento local: quem lê o espelho cai no `false` e a tela continua usando `hasPin`/`verifyPin`.
  }
}

/** Leitura síncrona do espelho; `false` sem armazenamento. A verdade continua sendo `hasPin`. */
export function pinActiveHint(): boolean {
  try {
    return localStorage.getItem(PIN_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export async function hasPin(database: CatalogDb = db): Promise<boolean> {
  const active = (await parentalPin(database).get('pin')) !== undefined
  writePinHint(active, database)
  return active
}

export async function verifyPin(pin: string, database: CatalogDb = db): Promise<boolean> {
  const record = await parentalPin(database).get('pin')
  if (!record) return false
  return (await hashPin(pin, record.salt)) === record.hash
}

/** Liga o controle parental: grava o PIN e as decisões numa transação só (FR-010, FR-022, D-007). */
export async function enableParentalControl(
  pin: string,
  decisions: CategoryDecision[],
  database: CatalogDb = db,
): Promise<void> {
  // O hash é calculado antes: uma espera fora do IndexedDB dentro da transação a encerraria.
  const record = await pinRecord(pin)
  const pins = parentalPin(database)
  const prefs = categoryPreferences(database)
  await database.transaction('rw', pins, prefs, async () => {
    await pins.put(record)
    for (const { category, locked } of decisions) {
      const key = preferenceKey(category)
      const current = await prefs.get(key)
      const [sourceId, kind, matchKey] = key
      await prefs.put({
        ...current,
        sourceId,
        kind,
        matchKey,
        locked,
        // Recusar uma sugestão fica lembrado mesmo depois de desligar e religar (FR-024).
        ...(locked ? {} : { declinedSuggestion: true }),
        updatedAt: Date.now(),
      })
    }
  })
  writePinHint(true, database)
  notifyCategoryAccessChanged()
}

/** Troca o PIN (depois de verificado ou de uma recuperação aceita). Bloqueios ficam. */
export async function changePin(newPin: string, database: CatalogDb = db): Promise<void> {
  await parentalPin(database).put(await pinRecord(newPin))
}

/** Apaga o PIN e todos os bloqueios; escondidas e recusas ficam (FR-019). */
export async function disableParentalControl(database: CatalogDb = db): Promise<void> {
  const pins = parentalPin(database)
  const prefs = categoryPreferences(database)
  await database.transaction('rw', pins, prefs, async () => {
    await pins.delete('pin')
    await prefs.toCollection().modify((pref) => {
      delete pref.locked
    })
  })
  writePinHint(false, database)
  relockSession()
  notifyCategoryAccessChanged()
}

/** Confere, só no aparelho, os dados de alguma lista cadastrada (FR-027..FR-030). */
export async function recoverPinWithSource(input: RecoveryInput, database: CatalogDb = db): Promise<boolean> {
  const sources = await database.sources.toArray()
  if ('url' in input) {
    const url = input.url.trim()
    return url !== '' && sources.some((source) => source.m3uUrl?.trim() === url)
  }
  const username = input.username.trim()
  const password = input.password.trim()
  if (username === '' || password === '') return false
  return sources.some(
    (source) =>
      source.type === 'provider_credentials' &&
      source.providerUsername?.trim() === username &&
      source.providerPassword?.trim() === password,
  )
}
