import { useQuery } from '@tanstack/react-query'
import { listSources } from '../../lib/catalog/sourceRepository'

/**
 * Nomes de host dos painéis IPTV cadastrados (feature 059, FR-024): a cor da capa
 * nunca é lida de uma imagem desses domínios (`isSafeCoverUrl`). Só o HOST sai
 * daqui — nunca caminho, query ou credencial — e nada disso é logado.
 */
export function panelHostsOf(sources: ReadonlyArray<{ providerDns?: string; m3uUrl?: string }>): string[] {
  const hosts = new Set<string>()
  for (const source of sources) {
    for (const address of [source.providerDns, source.m3uUrl]) {
      const host = hostOf(address)
      if (host) hosts.add(host)
    }
  }
  return [...hosts]
}

function hostOf(address: string | undefined): string | undefined {
  const value = address?.trim()
  if (!value) return undefined
  // O DNS do painel pode vir sem esquema ("painel.tv:8080").
  for (const candidate of [value, `http://${value}`]) {
    try {
      return new URL(candidate).hostname.toLowerCase() || undefined
    } catch {
      // tenta a próxima forma
    }
  }
  return undefined
}

/** `undefined` enquanto as fontes não foram lidas — a cor da capa espera (nunca arrisca antes). */
export function usePanelHosts(): string[] | undefined {
  const query = useQuery({
    // Sob `['sources']`: qualquer invalidação das fontes (cadastrar, editar, apagar) relê os hosts.
    queryKey: ['sources', 'panel-hosts'],
    queryFn: async () => panelHostsOf(await listSources()),
  })
  return query.data
}
