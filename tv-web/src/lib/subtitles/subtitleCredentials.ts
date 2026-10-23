/**
 * Chaves PESSOAIS de legenda (BYOK) — feature 090, US3, constitution 1.16.0 exceção (l), `logic/legenda-externa.md`
 * §10.2, `data-model.md` §1b. A chave que a pessoa digitou na TV mora aqui, no IndexedDB, e só sai daqui para o `fetch`
 * do próprio fornecedor (`readSubtitleKey`). Fora do backup 072, fora de `deleteSource`, nunca em log, erro, estado de
 * tela ou serviço do ccplayTv. Nenhum `console.*` neste módulo e nenhum erro de rede é repassado.
 *
 * Mesmo padrão de `saveTmdbKey`: testa no fornecedor antes de gravar; recusa (ou qualquer falha do teste) não troca nada.
 */
import { db, type CatalogDb } from '../catalog/db'
import { testProviderKey, type FetchLike } from './directProviders'
import { subtitleCredentials, type SubtitleCredentialRecord } from './subtitleTables'
import type { SubtitleProvider } from './types'

/**
 * Fornecedores que aceitam chave pessoal DIRETO da TV. No Chromium do PC o OpenSubtitles recusa o preflight de `file://`
 * (`evidencias/cors-direto-pc.json`), mas na TV física ele passa — busca, `POST /download` com `X-User-Agent` e arquivo —
 * (`evidencias/cors-direto-tv-2026-10-23.md`, R-022): os dois fornecedores entram.
 */
export const BYOK_PROVIDERS: readonly SubtitleProvider[] = ['opensubtitles', 'subdl']

/** Formato amplo: só barra o que nunca seria uma chave (espaço, aspas, quebra de linha). */
const KEY_FORMAT = /^[A-Za-z0-9._-]{8,200}$/

export interface SubtitleKeyOptions {
  database?: CatalogDb
  fetchImpl?: FetchLike
  signal?: AbortSignal
  now?: () => number
}

export type SaveSubtitleKeyFailure = 'invalid_format' | 'refused' | 'rate_limited' | 'offline'
export type SaveSubtitleKeyResult = { ok: true; status: SubtitleKeyStatus } | { ok: false; reason: SaveSubtitleKeyFailure }

/** O que a interface pode ver: nunca a chave inteira (`••••` + 4 últimos). */
export interface SubtitleKeyStatus {
  provider: SubtitleProvider
  state: SubtitleCredentialRecord['state'] | 'none'
  chosen: boolean
  maskedKey?: string
  lastTestedAt?: number
}

function toStatus(provider: SubtitleProvider, record: SubtitleCredentialRecord | undefined): SubtitleKeyStatus {
  if (!record) return { provider, state: 'none', chosen: false }
  return {
    provider,
    state: record.state,
    chosen: record.chosen,
    maskedKey: `••••${record.key.slice(-4)}`,
    lastTestedAt: record.lastTestedAt,
  }
}

export async function getSubtitleKeyStatus(provider: SubtitleProvider, options: SubtitleKeyOptions = {}): Promise<SubtitleKeyStatus> {
  return toStatus(provider, await subtitleCredentials(options.database ?? db).get(provider))
}

export async function listSubtitleKeyStatus(options: SubtitleKeyOptions = {}): Promise<SubtitleKeyStatus[]> {
  const table = subtitleCredentials(options.database ?? db)
  return Promise.all(BYOK_PROVIDERS.map(async (provider) => toStatus(provider, await table.get(provider))))
}

/**
 * Trim, formato, teste no fornecedor e só então grava (já escolhida para uso). Recusa — ou qualquer falha do teste —
 * nunca é gravada, e a chave anterior (se houver) fica como estava.
 */
export async function saveSubtitleKey(provider: SubtitleProvider, rawKey: string, options: SubtitleKeyOptions = {}): Promise<SaveSubtitleKeyResult> {
  const key = rawKey.trim()
  if (!BYOK_PROVIDERS.includes(provider)) return { ok: false, reason: 'refused' }
  if (!KEY_FORMAT.test(key)) return { ok: false, reason: 'invalid_format' }
  const outcome = await testProviderKey(provider, key, options.fetchImpl, options.signal)
  if (outcome === 'rejected') return { ok: false, reason: 'refused' }
  if (outcome === 'rate_limited') return { ok: false, reason: 'rate_limited' }
  if (outcome === 'offline' || options.signal?.aborted) return { ok: false, reason: 'offline' }
  const record: SubtitleCredentialRecord = { provider, key, state: 'valid', lastTestedAt: (options.now ?? Date.now)(), chosen: true }
  await subtitleCredentials(options.database ?? db).put(record)
  return { ok: true, status: toStatus(provider, record) }
}

/** "Testar": refaz o teste com a chave guardada e atualiza o estado. Nunca apaga a chave. */
export async function testSubtitleKey(provider: SubtitleProvider, options: SubtitleKeyOptions = {}): Promise<SubtitleKeyStatus> {
  const table = subtitleCredentials(options.database ?? db)
  const record = await table.get(provider)
  if (!record) return toStatus(provider, undefined)
  const outcome = await testProviderKey(provider, record.key, options.fetchImpl, options.signal)
  if (outcome === 'offline' || options.signal?.aborted) return toStatus(provider, record)
  const next: SubtitleCredentialRecord = {
    ...record,
    state: outcome === 'valid' ? 'valid' : outcome,
    lastTestedAt: (options.now ?? Date.now)(),
  }
  await table.update(provider, { state: next.state, lastTestedAt: next.lastTestedAt })
  return toStatus(provider, next)
}

export async function removeSubtitleKey(provider: SubtitleProvider, options: SubtitleKeyOptions = {}): Promise<void> {
  await subtitleCredentials(options.database ?? db).delete(provider)
}

/** "Usar o padrão do ccplayTv" (`false`) ou voltar à chave pessoal (`true`) — sem apagar a chave. */
export async function setSubtitleKeyChosen(provider: SubtitleProvider, chosen: boolean, options: SubtitleKeyOptions = {}): Promise<void> {
  await subtitleCredentials(options.database ?? db).update(provider, { chosen })
}

/** Resultado de um uso real (busca/download): a aba Integrações reflete o problema sem teste manual. */
export async function markSubtitleKeyState(
  provider: SubtitleProvider,
  state: SubtitleCredentialRecord['state'],
  options: SubtitleKeyOptions = {},
): Promise<void> {
  await subtitleCredentials(options.database ?? db).update(provider, { state, lastTestedAt: (options.now ?? Date.now)() })
}

/**
 * **Só para `subtitleSearch.ts`.** As chaves ESCOLHIDAS, cruas, por fornecedor — lidas na ação da pessoa (D-012), nunca
 * na montagem. Quem chama não as guarda em estado de tela, log, query key ou mensagem.
 */
export async function readChosenSubtitleKeys(options: SubtitleKeyOptions = {}): Promise<Partial<Record<SubtitleProvider, string>>> {
  const rows = await subtitleCredentials(options.database ?? db).toArray()
  const keys: Partial<Record<SubtitleProvider, string>> = {}
  for (const row of rows) if (row.chosen && BYOK_PROVIDERS.includes(row.provider)) keys[row.provider] = row.key
  return keys
}
