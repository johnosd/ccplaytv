/**
 * PIN parental por lista (feature 067, US3 — FR-017..FR-026). Cada lista tem o seu PIN, ou nenhum; o PIN de uma lista
 * nunca vale para outra. Regras em `sdd/specs/067-configuracoes-lista-global/logic/pin-por-lista.md`.
 *
 * STUB do sdd-plan: as assinaturas são o contrato público (os testes travados as importam); os corpos são do
 * sdd-execute. Nada daqui loga, lança ou devolve o PIN nem os dados de lista conferidos.
 */

import { db, type CatalogDb } from '../catalog/db'
import type { CategoryDecision, RecoveryInput } from './pin'

export type { CategoryDecision, RecoveryInput } from './pin'

/** Existe PIN nesta lista? Também realinha o espelho síncrono desta lista (`pinActiveHint`). */
export async function hasPin(sourceId: string, database: CatalogDb = db): Promise<boolean> {
  void sourceId
  void database
  throw new Error('not implemented')
}

/** Confere o PIN contra o PIN **desta** lista; lista sem PIN → `false`. */
export async function verifyPin(sourceId: string, pin: string, database: CatalogDb = db): Promise<boolean> {
  void sourceId
  void pin
  void database
  throw new Error('not implemented')
}

/** Liga o controle parental desta lista: grava o PIN dela e as decisões numa transação só (FR-018, FR-019). */
export async function enableParentalControl(
  sourceId: string,
  pin: string,
  decisions: CategoryDecision[],
  database: CatalogDb = db,
): Promise<void> {
  void sourceId
  void pin
  void decisions
  void database
  throw new Error('not implemented')
}

/** Troca o PIN desta lista (depois de verificado ou de uma recuperação aceita). Bloqueios ficam. */
export async function changePin(sourceId: string, newPin: string, database: CatalogDb = db): Promise<void> {
  void sourceId
  void newPin
  void database
  throw new Error('not implemented')
}

/** Apaga o PIN e os bloqueios **desta** lista; escondidas e recusas ficam; as outras listas não mudam (FR-018). */
export async function disableParentalControl(sourceId: string, database: CatalogDb = db): Promise<void> {
  void sourceId
  void database
  throw new Error('not implemented')
}

/** Confere, só no aparelho, os dados **desta** lista (FR-023) — nunca os de outra. */
export async function recoverPinWithSource(
  sourceId: string,
  input: RecoveryInput,
  database: CatalogDb = db,
): Promise<boolean> {
  void sourceId
  void input
  void database
  throw new Error('not implemented')
}

/** Leitura síncrona do espelho "esta lista tem PIN" (R-006 da 067, herdeiro do R-013 da 066). `false` sem armazenamento. */
export function pinActiveHint(sourceId: string): boolean {
  void sourceId
  throw new Error('not implemented')
}
