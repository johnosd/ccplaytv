import type { ReactNode } from 'react'
import { RefreshStatusLine } from '../../components/RefreshButton'
import { useT } from '../../lib/i18n/I18nProvider'
import type { RefreshAction } from '../../lib/portal/useRefreshAction'

/**
 * "Atualizar" da tela de listas (feature 071, FR-003): botão de canto ao lado de "Configurações", com o resultado
 * numa linha de status. Só renderizar com portal configurado; o foco e o SELECT vêm do `useRemoteNav` da tela.
 */
export function ProfilesRefreshCorner({ action, focused, onRun }: {
  action: RefreshAction
  focused: boolean
  onRun: () => void
}): ReactNode {
  const t = useT()
  return (
    <>
      <RefreshStatusLine action={action} scope="lists" />
      <button
        type="button"
        className={`profiles-settings-corner profiles-portal-corner${focused ? ' tv-focus' : ''}${action.paused ? ' is-soft-disabled' : ''}`}
        aria-busy={action.status === 'loading' || undefined}
        onClick={onRun}
      >
        {t('portal.refresh.label')}
      </button>
    </>
  )
}
