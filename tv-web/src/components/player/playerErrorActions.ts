import type { MessageKey } from '../../lib/i18n/messages/pt'
import type { PlaybackActionId, PlaybackDiagnosis } from '../../lib/player/playbackDiagnosis'

/** Ações visíveis da tela de erro do player (feature 042, `logic/erros-acionaveis.md` §3). */
export type ErrorActionId = 'retry' | 'info' | 'edit' | 'back'

export const ERROR_ACTION_LABEL_KEY: Record<ErrorActionId, MessageKey> = {
  retry: 'common.retry',
  info: 'player.action.info',
  edit: 'player.action.edit',
  back: 'common.back',
}

const FROM_DIAGNOSIS: Record<PlaybackActionId, ErrorActionId> = {
  retry: 'retry',
  info: 'info',
  'edit-credentials': 'edit',
}

/**
 * Lista ordenada das ações da tela de erro: as do diagnóstico (a primeira é a
 * primária) filtradas pelo que de fato funciona agora — "Tentar de novo" só se
 * a falha for repetível, "Editar lista" só se a tela sabe abrir a edição
 * (nunca um botão sem efeito) — e sempre "Voltar" no fim (RETURN faz o mesmo).
 * Sem diagnóstico (falha anterior à feature), vale só repetir/voltar.
 */
export function buildErrorActions(input: {
  retryable: boolean
  diagnosis: PlaybackDiagnosis | undefined
  canEditSource: boolean
}): ErrorActionId[] {
  const fromDiagnosis: ErrorActionId[] = input.diagnosis
    ? input.diagnosis.actions.map((action) => FROM_DIAGNOSIS[action])
    : input.retryable
      ? ['retry']
      : []
  const visible = fromDiagnosis.filter((action) => {
    if (action === 'retry') return input.retryable
    if (action === 'edit') return input.canEditSource
    return true
  })
  return [...visible, 'back']
}
