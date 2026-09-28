import type { SourceOut } from '../import/importApi'

/**
 * Formatação de exibição de uma lista (fonte), compartilhada entre a tela de
 * perfis e Configurações › Fontes IPTV (feature 026, D-007) — extraído de
 * `ProfilesScreen.tsx` sem mudar comportamento.
 */

export function formatStatus(source: SourceOut): string {
  if (source.connection_state === 'error') return 'Erro na última sincronização'
  if (source.connection_state === 'never_synced' || !source.last_successful_sync_at) {
    return 'Nunca sincronizada'
  }
  return `Sincronizada em ${new Date(source.last_successful_sync_at).toLocaleString('pt-BR')}`
}

/** Tipo da lista para o cartão (FR-002). Nunca o endereço nem a credencial (FR-048/FR-024). */
export function formatType(source: SourceOut): string {
  return source.type === 'provider_credentials' ? 'Xtream' : 'M3U'
}
