import type { ConnectionCheckInput } from '../../lib/catalog/sourceConnectionCheck'
import { readCredential as readStoredCredential } from '../../lib/catalog/sourceRepository'

/**
 * Decide **se** e **com quê** confirmar a conexão do formulário de lista
 * (feature 045, FR-011, D-008, `logic/verificacao-conexao.md` §5).
 *
 * Em edição, campo em branco significa "manter o atual": o valor guardado é
 * lido **aqui dentro**, nunca vai a estado de tela, query key, log ou banner.
 * `null` = nada a confirmar (ou nada confiável para confirmar): quem chama
 * segue como sempre seguiu.
 */

export type ConnectionMode = 'url' | 'provider'

export interface ConnectionDraft {
  mode: ConnectionMode
  m3uUrl: string
  dns: string
  username: string
  password: string
}

export interface ExistingSourceRef {
  id: string
  /** Endereço do servidor já guardado (não é segredo por si só); `undefined` numa lista M3U. */
  providerDns?: string | null
}

export async function connectionInputFor(
  draft: ConnectionDraft,
  existing?: ExistingSourceRef,
  readCredential: typeof readStoredCredential = readStoredCredential,
): Promise<ConnectionCheckInput | null> {
  if (draft.mode === 'url') {
    const url = draft.m3uUrl.trim()
    if (url === '') return null
    return { type: 'm3u_url', url }
  }

  const dns = draft.dns.trim()
  if (!existing) return { type: 'provider_credentials', dns, username: draft.username, password: draft.password }

  const changed = dns !== (existing.providerDns ?? '').trim() || draft.username !== '' || draft.password !== ''
  if (!changed) return null

  let { username, password } = draft
  if (username === '' || password === '') {
    const stored = await readCredential(existing.id)
    if (!stored) return null
    if (username === '') username = stored.username
    if (password === '') password = stored.password
  }
  return { type: 'provider_credentials', dns: dns === '' ? (existing.providerDns ?? '') : dns, username, password }
}
