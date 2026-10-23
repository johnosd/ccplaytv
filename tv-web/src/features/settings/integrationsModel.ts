import { SUBTITLE_KEY_ROWS } from './subtitleKeysModel'
import type { ErrorCode } from '../../lib/errors/errorCatalog'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import type { TmdbState, TmdbStatusView } from '../../lib/metadata/types'

/**
 * Regras puras da aba "Integrações & BYOK" (feature 032, US2,
 * `logic/integracoes-e-dock.md`). Fora de `IntegrationsPanel.tsx` para aquele
 * arquivo exportar só componentes. Os textos vêm do catálogo (feature 054):
 * aqui só ficam as CHAVES, e quem desenha chama `t(chave)`.
 */

export type TmdbAction = 'configure' | 'test' | 'edit' | 'remove' | 'refresh'

/**
 * Sem chave só há "Configurar"; com chave, "Testar", "Editar" e "Remover" (`logic/integracoes-e-dock.md` §1). "Atualizar"
 * (feature 077) vem sempre por último: busca no portal a chave que a pessoa enviou por lá, sem sair desta aba.
 */
export function tmdbActions(status: TmdbStatusView | undefined): TmdbAction[] {
  return !status || status.state === 'not_configured' ? ['configure', 'refresh'] : ['test', 'edit', 'remove', 'refresh']
}

/** Cards ainda não construídos, na ordem da aba — reusam os mocks do dock (D-010). `titleKey` = título no catálogo. */
export const INTEGRATION_SOON_CARDS = [
  { id: 'dock-ai', titleKey: 'settings.integrations.soon.dock-ai' },
  { id: 'dock-weather', titleKey: 'settings.integrations.soon.dock-weather' },
] as const satisfies readonly { id: string; titleKey: MessageKey }[]

/**
 * Linha 0 = card do TMDB; depois, uma linha por fornecedor de legenda (feature 090, chave pessoal); depois os cards
 * "Em breve"; por último o teste de conexão.
 */
export const SUBTITLE_ROW_START = 1
export const SUBTITLE_ROW_COUNT = SUBTITLE_KEY_ROWS.length
export const SOON_ROW_START = SUBTITLE_ROW_START + SUBTITLE_ROW_COUNT
export const SPEED_TEST_ROW = SOON_ROW_START + INTEGRATION_SOON_CARDS.length
export const INTEGRATIONS_ROW_COUNT = SPEED_TEST_ROW + 1

/** Rótulo do estado no card (`logic/chave-tmdb.md` §7). */
export const TMDB_STATE_LABEL_KEY: Record<TmdbState, MessageKey> = {
  not_configured: 'settings.integrations.state.not_configured',
  connected: 'settings.integrations.state.connected',
  refused: 'settings.integrations.state.refused',
  offline: 'settings.integrations.state.offline',
  rate_limited: 'settings.integrations.state.rate_limited',
}

/**
 * Código discreto da tabela de erros para os estados de falha do TMDB (feature
 * 042, FR-011/FR-015). `connected`/`not_configured` não são erro — sem código.
 */
export const TMDB_STATE_CODE: Partial<Record<TmdbState, ErrorCode>> = {
  refused: 'API-401',
  offline: 'NET-02',
  rate_limited: 'API-429',
}

/** Nome acessível do ícone TMDB no dock da Home (`logic/chave-tmdb.md` §7). */
export const TMDB_DOCK_LABEL_KEY: Record<TmdbState, MessageKey> = {
  not_configured: 'settings.integrations.dock.not_configured',
  connected: 'settings.integrations.dock.connected',
  refused: 'settings.integrations.dock.refused',
  offline: 'settings.integrations.dock.offline',
  rate_limited: 'settings.integrations.dock.rate_limited',
}

export const TMDB_ACTION_LABEL_KEY: Record<TmdbAction, MessageKey> = {
  configure: 'settings.integrations.action.configure',
  test: 'settings.integrations.action.test',
  edit: 'settings.integrations.action.edit',
  remove: 'settings.integrations.action.remove',
  refresh: 'portal.refresh.label',
}
