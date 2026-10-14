import type { ReactNode } from 'react'
import { Button, type ButtonVariant } from './Button'
import { useT } from '../lib/i18n/I18nProvider'
import type { RefreshScope } from '../lib/portal/portalAgent'
import { refreshMessageKey, type RefreshAction } from '../lib/portal/useRefreshAction'
import './portalRefresh.css'

/**
 * Botão Atualizar (feature 071, FR-003): SELECT = uma consulta; focar nunca consulta. Soft disabled durante a
 * pausa de 10 s (continua focável, DS §11) e o resultado fica num `role="status"` logo abaixo. Quem renderiza
 * decide o foco (`focused`) e chama `action.run` no `onSelect` do `useRemoteNav` da própria tela.
 */
export function RefreshButton({ action, focused, variant = 'secondary', label, onRun }: {
  action: RefreshAction
  focused?: boolean
  /** Substitui ction.run() quando a tela precisa agir sobre o resultado (ex.: voltar à lista com foco na nova). */
  onRun?: () => void
  variant?: ButtonVariant
  /** Rótulo próprio (ex.: "Recarregar" na tela Adicionar, contrato 070 C1). */
  label?: string
}): ReactNode {
  const t = useT()
  return <Button variant={variant} focused={focused} loading={action.status === 'loading'} softDisabled={action.paused}
    onSelect={() => { if (onRun) onRun(); else void action.run() }}>
    {label ?? t('portal.refresh.label')}
  </Button>
}

/** Linha de resultado do Atualizar; vazia (e fora do DOM) quando não houve aperto. */
export function RefreshStatusLine({ action, scope }: { action: RefreshAction; scope: RefreshScope }): ReactNode {
  const t = useT()
  const key = refreshMessageKey(action.status, scope)
  if (!key) return null
  return <p className="portal-refresh-status" role="status">
    {t(key)}{action.status === 'failed' && action.code ? ' ' + t('portal.failureCode', { code: action.code }) : ''}
  </p>
}
