/**
 * Uma sincronização de EPG, ponta a ponta (feature 030, `logic/sincronizacao-epg.md`):
 * resolve o endereço (FR-001) → baixa (gzip ou não, FR-002) → lê em fluxo
 * (FR-003) → grava como nova geração (FR-004) → registra o estado.
 *
 * Roda no Worker de EPG (ou na thread principal, se o Worker não subir —
 * mesmo plano B do `importRunner.ts`). **Não** faz single-flight: isso é do
 * executor na thread principal (`epgRunner.ts`, FR-010), que é quem sabe o
 * que está em andamento.
 *
 * STUB do sdd-plan — o sdd-execute implementa (T013–T016).
 */
import { db, type CatalogDb } from '../catalog/db'
import type { EpgErrorKind } from './types'

export interface SyncEpgOptions {
  database?: CatalogDb
  /** Instante injetado — define a janela guardada (FR-004). */
  now?: () => number
  /** Injetável para teste; padrão `fetch` global. */
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export interface SyncEpgResult {
  /** `skipped` = sem endereço configurado, EPG desativado ou fonte inexistente. */
  outcome: 'synced' | 'failed' | 'skipped'
  errorKind?: EpgErrorKind
  programCount?: number
}

export async function syncEpg(_sourceId: string, _options: SyncEpgOptions = {}): Promise<SyncEpgResult> {
  void db
  throw new Error('not implemented')
}
