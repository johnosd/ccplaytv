import type { TmdbState, TmdbStatusView } from '../../lib/metadata/types'

/**
 * Regras puras da aba "Integrações & BYOK" (feature 032, US2,
 * `logic/integracoes-e-dock.md`). Fora de `IntegrationsPanel.tsx` para aquele
 * arquivo exportar só componentes.
 */

export type TmdbAction = 'configure' | 'test' | 'edit' | 'remove'

/** Sem chave só há "Configurar"; com chave, "Testar", "Editar" e "Remover" (`logic/integracoes-e-dock.md` §1). */
export function tmdbActions(status: TmdbStatusView | undefined): TmdbAction[] {
  return !status || status.state === 'not_configured' ? ['configure'] : ['test', 'edit', 'remove']
}

/** Cards ainda não construídos, na ordem da aba — reusam os mocks do dock (D-010). */
export const INTEGRATION_SOON_CARDS = [
  { id: 'dock-ai', title: 'Assistente de IA' },
  { id: 'dock-weather', title: 'Clima' },
  { id: 'dock-speedtest', title: 'Teste de velocidade' },
] as const

/** Linha 0 = card do TMDB; as demais, os cards "Em breve". */
export const INTEGRATIONS_ROW_COUNT = 1 + INTEGRATION_SOON_CARDS.length

/** Rótulo do estado no card (`logic/chave-tmdb.md` §7). */
export const TMDB_STATE_LABEL: Record<TmdbState, string> = {
  not_configured: 'Não configurado',
  connected: 'Conectado',
  refused: 'Chave recusada pelo TMDB',
  offline: 'Sem conexão com o TMDB',
  rate_limited: 'Limite de uso atingido; tentaremos mais tarde',
}

/** Nome acessível do ícone TMDB no dock da Home (`logic/chave-tmdb.md` §7). */
export const TMDB_DOCK_LABEL: Record<TmdbState, string> = {
  not_configured: 'TMDB — não configurado',
  connected: 'TMDB — conectado',
  refused: 'TMDB — chave recusada',
  offline: 'TMDB — sem conexão',
  rate_limited: 'TMDB — limite de uso',
}

export const TMDB_ACTION_LABEL: Record<TmdbAction, string> = {
  configure: 'Configurar',
  test: 'Testar',
  edit: 'Editar',
  remove: 'Remover',
}
