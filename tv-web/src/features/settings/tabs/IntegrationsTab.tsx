import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import { comingSoonToast } from '../../../lib/comingSoon'
import { useT } from '../../../lib/i18n/I18nProvider'
import { useRemoveTmdbKey, useTestTmdbKey, useTmdbStatus } from '../../catalog/catalogApi'
import { IntegrationsPanel } from '../IntegrationsPanel'
import { RemoveTmdbKeyModal } from '../RemoveTmdbKeyModal'
import { INTEGRATION_SOON_CARDS, INTEGRATIONS_ROW_COUNT, TMDB_STATE_LABEL_KEY, tmdbActions } from '../integrationsModel'
import type { SettingsTabProps } from './settingsTab'

/** Integrações & BYOK (feature 032): linha 0 = card do TMDB (colunas = ações), demais = "Em breve". */
export function IntegrationsTab({ focused, navigation, exitToTabs, goToTopbar, showToast, handleRef }: SettingsTabProps): ReactNode {
  const t = useT()
  const [row, setRow] = useState(0)
  const [col, setCol] = useState(0)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const tmdbStatusQuery = useTmdbStatus()
  const testTmdbKey = useTestTmdbKey()
  const removeTmdbKey = useRemoveTmdbKey()
  const actionList = tmdbActions(tmdbStatusQuery.data)
  const effectiveCol = clamp(col, 0, actionList.length - 1)

  /** Mesmo caminho para o teclado (foco corrente) e o clique de mouse (linha/coluna do evento). */
  function activate(targetRow: number, targetCol: number) {
    setRow(targetRow)
    setCol(targetCol)
    if (targetRow > 0) {
      showToast(comingSoonToast(INTEGRATION_SOON_CARDS[targetRow - 1].id, t))
      return
    }
    const action = actionList[targetCol]
    if (action === 'configure' || action === 'edit') {
      navigation.onOpenTmdbKey?.({ zone: 'panel', tab: 'integrations' })
      return
    }
    if (action === 'test') {
      if (testTmdbKey.isPending) return
      showToast(t('settings.integrations.testing'))
      testTmdbKey.mutate(undefined, {
        onSuccess: (status) => showToast(t(TMDB_STATE_LABEL_KEY[status.state])),
        onError: () => showToast(t(TMDB_STATE_LABEL_KEY.offline)),
      })
      return
    }
    if (action === 'remove') setConfirmRemove(true)
  }

  function confirmRemoval() {
    setConfirmRemove(false)
    removeTmdbKey.mutate(undefined, {
      onSuccess: () => {
        // Sem chave só resta "Configurar": a coluna volta ao começo.
        setCol(0)
        showToast(t('settings.integrations.removed'))
      },
      onError: () => showToast(t('settings.integrations.removeFailed')),
    })
  }

  useImperativeHandle(handleRef, () => ({
    onEnter: () => {
      setRow(0)
      setCol(0)
    },
    onDirection: (direction) => {
      if (direction === 'left') {
        if (row === 0 && effectiveCol > 0) setCol(effectiveCol - 1)
        else exitToTabs()
        return
      }
      if (direction === 'right') {
        if (row === 0) setCol(clamp(effectiveCol + 1, 0, actionList.length - 1))
        return
      }
      if (direction === 'up') {
        if (row === 0) goToTopbar()
        else setRow(row - 1)
        return
      }
      setRow(clamp(row + 1, 0, INTEGRATIONS_ROW_COUNT - 1))
    },
    onSelect: () => activate(row, effectiveCol),
  }))

  return (
    <>
      <IntegrationsPanel
        status={tmdbStatusQuery.data}
        focusedRow={focused ? row : undefined}
        focusedCol={effectiveCol}
        testing={testTmdbKey.isPending}
        onActivate={activate}
      />
      {confirmRemove && <RemoveTmdbKeyModal onCancel={() => setConfirmRemove(false)} onConfirm={confirmRemoval} />}
    </>
  )
}
