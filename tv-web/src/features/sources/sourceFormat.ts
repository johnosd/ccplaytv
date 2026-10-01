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

/**
 * Estado do EPG da lista para a linha de Configurações (feature 030, FR-015),
 * só com dado real: nunca o endereço, nunca a credencial. `syncing` vem do
 * executor — "Sincronizando EPG" não existe no disco.
 */
export function formatEpgStatus(source: SourceOut, syncing: boolean): string {
  if (syncing) return 'Sincronizando EPG'
  const epg = source.epg
  switch (epg?.state) {
    case 'disabled':
      return 'EPG desativado'
    case 'error':
      return 'Erro no EPG · EPG-02'
    case 'linked':
      return epg.lastSyncAt
        ? `EPG vinculado · atualizado em ${new Date(epg.lastSyncAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : 'EPG vinculado'
    case 'never_synced':
      return 'EPG ainda não sincronizado'
    default:
      return 'EPG não configurado'
  }
}

/** Tipo da lista para o cartão (FR-002). Nunca o endereço nem a credencial (FR-048/FR-024). */
export function formatType(source: SourceOut): string {
  return source.type === 'provider_credentials' ? 'Xtream' : 'M3U'
}
