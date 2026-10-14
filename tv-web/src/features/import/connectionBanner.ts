import { describeError, type ErrorCode } from '../../lib/errors/errorCatalog'
import { pt } from '../../lib/i18n/messages/pt'
import { createTranslator, type Translator } from '../../lib/i18n/translate'

/**
 * Conteúdo da faixa de erro do formulário de lista (feature 045, D-006).
 * Só texto da tabela da 042 + o código — **nunca** URL, usuário, senha nem a
 * mensagem crua de um erro.
 */
export interface ConnectionBanner {
  code: ErrorCode
  title: string
  description: string
  /** `true` quando tentar de novo pode resolver: o botão de ação vira "Tentar de novo". */
  retryable: boolean
}

export function bannerFor(code: ErrorCode, t: Translator = createTranslator('pt')): ConnectionBanner {
  const { title, description, retryable } = describeError(code, t)
  return { code, title, description, retryable }
}

/** Rótulo do botão de ação depois de uma falha: só os códigos recuperáveis o trocam (common.retry). */
export const RETRY_LABEL_KEY = 'common.retry' as const
/** O mesmo rótulo em português (testes); a tela usa `t(RETRY_LABEL_KEY)`. */
export const RETRY_LABEL = pt[RETRY_LABEL_KEY]
