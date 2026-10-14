/**
 * Hash do PIN parental (feature 066): guardado só como hash com sal, nunca em texto. Regras em
 * `sdd/specs/066-categorias-controle-parental/logic/pin.md`. Desde a feature 067 o PIN é por lista — a API pública
 * (ligar, conferir, trocar, desligar, recuperar) mora em `listPin.ts`; aqui fica só o esquema de hash, que não pode
 * mudar: a migração do PIN único copia sal+hash (`067/logic/pin-por-lista.md` §2, D-003).
 *
 * Nada daqui loga, lança ou devolve o PIN.
 */

import type { CategoryRef } from '../catalog/categoryAccess'
import { sha256Hex } from './sha256'

/** Decisão da pessoa ao ligar o controle parental (confirmação da sugestão, FR-022). */
export interface CategoryDecision {
  category: CategoryRef
  locked: boolean
}

/** Dados de uma lista cadastrada para recuperar o PIN (FR-027). */
export type RecoveryInput = { username: string; password: string } | { url: string }

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** SHA-256 de `salt:pin`. `crypto.subtle` quando existe; senão o JS puro (R-002 da 066). */
export async function hashPin(pin: string, salt: string): Promise<string> {
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

/** Sal novo + hash do PIN, no formato gravado. */
export async function saltedPinHash(pin: string): Promise<{ salt: string; hash: string; algorithm: 'sha256'; createdAt: number }> {
  const salt = toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)))
  return { salt, hash: await hashPin(pin, salt), algorithm: 'sha256', createdAt: Date.now() }
}
