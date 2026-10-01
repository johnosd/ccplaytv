import type { ReactNode } from 'react'
import type { SourceOut } from '../import/importApi'
import type { AccessDecision } from '../../lib/catalog/sourceAccount'
import type { AccountCheckResult } from '../../lib/catalog/accountCheck'

/**
 * Tela entre "Quem está assistindo?" e o Início quando a conta da lista
 * precisa ser verificada ou está vencida/recusada (feature 034, US2;
 * constitution 1.7.0, exceção de "Sem Conta Obrigatória"). Stub deixado pelo
 * `sdd-plan` — ver `sdd/specs/034-fontes-estado-expiracao/logic/conta-da-fonte.md` §5.
 */
export interface SourceAccessGateProps {
  source: SourceOut
  /** Decisão calculada pelo App ao escolher a lista — nunca `open` (essa nem monta a tela). */
  decision: Exclude<AccessDecision, { action: 'open' }>
  /** Conta válida: segue para o Início da lista. */
  onOpen: (source: SourceOut) => void
  /** "Editar lista". */
  onEdit: (source: SourceOut) => void
  /** "Voltar" e RETURN: volta a "Quem está assistindo?" com o foco no cartão desta lista. */
  onBack: () => void
  /** Colaborador injetável; padrão = a consulta leve real (`checkSourceAccount`). */
  checkAccount?: (sourceId: string) => Promise<AccountCheckResult>
}

export function SourceAccessGate(props: SourceAccessGateProps): ReactNode {
  void props
  throw new Error('not implemented')
}
