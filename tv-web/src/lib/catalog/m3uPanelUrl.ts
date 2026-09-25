/**
 * Reconhece, numa URL M3U, o endereço de um painel Xtream, o usuário e a
 * senha (feature 014, FR-001, D-001).
 *
 * A maioria das URLs M3U de painel IPTV tem a forma
 * `…/get.php?username=…&password=…` — o mesmo formato que `legacyM3uUrl`
 * (`xtreamConnector.ts`) monta no sentido inverso para o Modo limitado.
 * Reconhecer aqui não confirma nada por si só: quem chama ainda precisa
 * consultar o painel (`resolveAccountStatus`) antes de tratar a fonte como
 * Xtream — ver `confirmPanel` em `importPipeline.ts`.
 */

import { normalizeServerAddress, ProviderIncompatibleError } from './xtreamConnector'

export interface PanelCredential {
  dns: string
  username: string
  password: string
}

/**
 * `undefined` quando a URL não está no formato de painel — não é erro,
 * é o sinal de que a fonte vai pelo caminho do conteúdo guardado (D-001).
 * Nunca lança.
 */
export function parsePanelUrl(raw: string): PanelCredential | undefined {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return undefined
  }
  if (!url.pathname.endsWith('/get.php')) return undefined

  const username = url.searchParams.get('username') ?? ''
  const password = url.searchParams.get('password') ?? ''
  if (!username || !password) return undefined

  const base = `${url.protocol}//${url.host}${url.pathname.slice(0, -'/get.php'.length)}`
  try {
    return { dns: normalizeServerAddress(base), username, password }
  } catch (error) {
    // Endereço com forma estranha (ex.: usuário/senha embutidos no host) —
    // `normalizeServerAddress` já recusa isso para credencial de provedor
    // normal; aqui só decide que a URL não é reconhecível como painel.
    if (error instanceof ProviderIncompatibleError) return undefined
    throw error
  }
}
