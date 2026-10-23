/**
 * Rótulo de estado do player ("Preparando…", "Reconectando 1/3…", "Verificando conexão…"), extraído do `PlayerLayer`
 * na feature 090 sem mudar nada — só para a camada caber no teto de linhas da catraca com a legenda externa.
 */
import type { MessageKey } from '../../lib/i18n/messages/pt'
import type { Translator } from '../../lib/i18n/translate'
import { STATE_LABEL_KEY } from './playerMessages'
import type { Phase, ResumeGate } from './playerLayerTypes'

export function playerStatusLabel(phase: Phase, resumeGate: ResumeGate, t: Translator): string {
  if (phase.kind === 'resolving') return t('player.state.preparing')
  if (phase.kind === 'reconnecting') return t('player.msg.reconnecting', { attempt: phase.attempt, max: phase.max })
  if (phase.kind !== 'session') return ''
  if (resumeGate === 'verifying') return t('offline.verifying')
  const key = STATE_LABEL_KEY[phase.state]
  return key ? t(key as MessageKey) : ''
}
