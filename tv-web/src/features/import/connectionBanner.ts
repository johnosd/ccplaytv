import { describeError, type ErrorCode } from '../../lib/errors/errorCatalog'

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

export function bannerFor(code: ErrorCode): ConnectionBanner {
  const { title, description, retryable } = describeError(code)
  return { code, title, description, retryable }
}

/** Rótulo do botão de ação depois de uma falha: só os códigos recuperáveis o trocam. */
export const RETRY_LABEL = 'Tentar de novo'
