import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { checkSourceAccount, type AccountCheckResult } from '../../lib/catalog/accountCheck'
import { accessFromAccount, formatAccountDate, type AccessDecision } from '../../lib/catalog/sourceAccount'
import { useRemoteNav } from '../../lib/useRemoteNav'
import type { SourceOut } from '../import/importApi'

/**
 * Tela entre "Quem está assistindo?" e o Início quando a conta da lista
 * precisa ser verificada ou está vencida/recusada (feature 034, US2;
 * constitution 1.7.0, exceção de "Sem Conta Obrigatória") —
 * `sdd/specs/034-fontes-estado-expiracao/logic/conta-da-fonte.md` §5.
 *
 * Impedir a entrada não apaga nada (D-007): só decide se o Início abre. Foco é
 * estado (ADR-009); RETURN nunca espera a rede (FR-024). Nenhum endereço,
 * usuário ou senha em texto, `aria-*` ou `title` (FR-019).
 */
export interface SourceAccessGateProps {
  source: SourceOut
  /** Decisão calculada ao escolher a lista — nunca `open` (essa nem monta a tela). */
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

type Phase = 'checking' | 'blocked' | 'rechecking'
type Blocked = { reason: 'expired' | 'refused'; expiresAt?: number | null }

const BLOCKED_ACTIONS = ['Editar lista', 'Verificar de novo', 'Voltar'] as const
const CHECKING_ACTIONS = ['Voltar'] as const

export function SourceAccessGate({
  source,
  decision,
  onOpen,
  onEdit,
  onBack,
  checkAccount = checkSourceAccount,
}: SourceAccessGateProps): ReactNode {
  const [phase, setPhase] = useState<Phase>(decision.action === 'check' ? 'checking' : 'blocked')
  const [blocked, setBlocked] = useState<Blocked | null>(
    decision.action === 'blocked' ? { reason: decision.reason, expiresAt: decision.expiresAt } : null,
  )
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [focus, setFocus] = useState(0)
  // Uma consulta por vez (single-flight, mesmo padrão da 011/033): uma segunda
  // seleção enquanto uma está em voo é ignorada, nunca enfileirada.
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const startedInitial = useRef(false)

  async function runCheck(next: 'blocked' | 'checking'): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const result = await checkAccount(source.id)
      if (!mounted.current) return
      const outcome = accessFromAccount(
        { provider_import_mode: source.provider_import_mode, account: result.account },
        Date.now(),
      )
      if (outcome.action === 'open') {
        onOpen(source)
        return
      }
      if (outcome.action === 'blocked') {
        setBlocked({ reason: outcome.reason, expiresAt: outcome.expiresAt })
        // Decidido pelo dado guardado porque o painel não respondeu (FR-011).
        setUnconfirmed(!result.fresh)
      }
      if (next === 'checking') setFocus(0)
      setPhase('blocked')
    } finally {
      inFlight.current = false
    }
  }

  // `StrictMode` monta duas vezes em desenvolvimento: `startedInitial` evita
  // disparar a consulta inicial duas vezes, e `mounted` descarta o resultado
  // de uma tela que já saiu.
  useEffect(() => {
    mounted.current = true
    if (phase === 'checking' && !startedInitial.current) {
      startedInitial.current = true
      void runCheck('checking')
    }
    return () => {
      mounted.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a consulta inicial, uma vez por montagem
  }, [])

  const actions = phase === 'checking' ? CHECKING_ACTIONS : BLOCKED_ACTIONS
  const current = Math.min(focus, actions.length - 1)

  function activate(label: string): void {
    if (label === 'Voltar') onBack()
    else if (label === 'Editar lista') onEdit(source)
    else if (label === 'Verificar de novo' && !inFlight.current) {
      setPhase('rechecking')
      void runCheck('blocked')
    }
  }

  useRemoteNav({
    onDirection: (direction) => {
      if (direction === 'left') setFocus(Math.max(0, current - 1))
      if (direction === 'right') setFocus(Math.min(actions.length - 1, current + 1))
    },
    onSelect: () => activate(actions[current]),
    onBack,
  })

  const message =
    phase === 'checking'
      ? 'Verificando a conta da lista…'
      : blocked?.reason === 'refused'
        ? 'O provedor recusou o usuário ou a senha desta lista.'
        : typeof blocked?.expiresAt === 'number'
          ? `A assinatura desta lista venceu em ${formatAccountDate(blocked.expiresAt)}.`
          : 'A assinatura desta lista venceu.'

  return (
    <section className="screen source-access" aria-labelledby="source-access-title">
      <h1 id="source-access-title" className="screen-title">
        {source.display_name}
      </h1>
      <p className="source-access-message">{message}</p>
      {phase !== 'checking' && unconfirmed && (
        <p className="source-access-note">
          Não foi possível confirmar agora — o aparelho está sem conexão com o provedor.
        </p>
      )}
      {phase !== 'blocked' && <Spinner size={32} />}
      <div className="source-access-actions" role="group" aria-label="Ações da lista">
        {actions.map((label, index) => (
          <Button
            key={label}
            variant={label === 'Editar lista' ? 'primary' : 'secondary'}
            focused={index === current}
            onSelect={() => activate(label)}
          >
            {label}
          </Button>
        ))}
      </div>
    </section>
  )
}
