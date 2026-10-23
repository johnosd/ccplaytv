import type { MessageKey } from '../../lib/i18n/messages/pt'
import { BYOK_PROVIDERS, type SubtitleKeyStatus } from '../../lib/subtitles/subtitleCredentials'
import type { SubtitleProvider } from '../../lib/subtitles/types'

/**
 * Regras puras da seção "Legendas" da aba Integrações (feature 090, US3, `logic/legenda-externa.md` §10.2). Fora do
 * componente para ele exportar só componentes. Os textos vêm do catálogo: aqui só ficam as CHAVES.
 */

export type SubtitleKeyAction = 'add' | 'edit' | 'useMine' | 'test' | 'remove'

/** As linhas da seção, na ordem da tela: os fornecedores que aceitam chave pessoal direto da TV. */
export const SUBTITLE_KEY_ROWS: readonly SubtitleProvider[] = BYOK_PROVIDERS

export const SUBTITLE_PROVIDER_NAME: Record<SubtitleProvider, string> = { opensubtitles: 'OpenSubtitles', subdl: 'SubDL' }

/** Sem chave só há "Adicionar"; com chave em uso, "Testar/Trocar/Remover"; guardada mas não usada, "Usar a minha chave". */
export function subtitleKeyActions(status: SubtitleKeyStatus | undefined): SubtitleKeyAction[] {
  if (!status || status.state === 'none') return ['add']
  return status.chosen ? ['test', 'edit', 'remove'] : ['useMine', 'edit', 'remove']
}

export const SUBTITLE_KEY_ACTION_LABEL: Record<SubtitleKeyAction, MessageKey> = {
  add: 'subtitles.keys.add',
  edit: 'subtitles.keys.edit',
  useMine: 'subtitles.keys.useMine',
  test: 'subtitles.keys.test',
  remove: 'subtitles.keys.remove',
}

/** Rótulo do estado. `hasDefault` = o padrão do ccplayTv existe nesta TV (portal visível). */
export function subtitleKeyStateLabel(status: SubtitleKeyStatus | undefined, hasDefault: boolean): MessageKey {
  if (!status || status.state === 'none') return hasDefault ? 'subtitles.keys.state.default' : 'subtitles.keys.state.none'
  if (!status.chosen) return 'subtitles.keys.state.unused'
  if (status.state === 'rejected') return 'subtitles.keys.state.rejected'
  if (status.state === 'rate_limited') return 'subtitles.keys.state.rate_limited'
  return 'subtitles.keys.state.valid'
}
