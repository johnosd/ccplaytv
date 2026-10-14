import { useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import { comingSoonToast } from '../../../lib/comingSoon'
import { useT } from '../../../lib/i18n/I18nProvider'
import { useRemoveTmdbKey, useTestTmdbKey, useTmdbStatus } from '../../catalog/catalogApi'
import { IntegrationsPanel } from '../IntegrationsPanel'
import { RemoveTmdbKeyModal } from '../RemoveTmdbKeyModal'
import { INTEGRATION_SOON_CARDS, INTEGRATIONS_ROW_COUNT, SPEED_TEST_ROW, TMDB_STATE_LABEL_KEY, tmdbActions } from '../integrationsModel'
import { useSpeedTest } from '../useSpeedTest'
import { SpeedTestDialog } from '../SpeedTestDialog'
import { LAST_SPEED_TEST_QUERY_KEY, useLastSpeedTest } from '../../../lib/network/useLastSpeedTest'
import type { SettingsTabProps } from './settingsTab'

/** Linha 0 = ações TMDB; IA/clima placeholders; diagnóstico de conexão na última linha. */
export function IntegrationsTab({ focused, initialFocus, navigation, exitToTabs, goToTopbar, showToast, handleRef }: SettingsTabProps): ReactNode {
  const t = useT()
  const [row, setRow] = useState(initialFocus?.zone === 'panel' && initialFocus.service === 'speedtest' ? SPEED_TEST_ROW : 0)
  const [col, setCol] = useState(0)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [speedDialog, setSpeedDialog] = useState(false)
  const queryClient = useQueryClient()
  const lastSpeedTest = useLastSpeedTest()
  const onSaved = useCallback(() => { void queryClient.invalidateQueries({ queryKey: LAST_SPEED_TEST_QUERY_KEY }) }, [queryClient])
  const speedTest = useSpeedTest({ onSaved })
  async function closeSpeedDialog() { await speedTest.cancel(); setSpeedDialog(false) }
  useEffect(() => {
    if (focused && !speedDialog && !confirmRemove) {
      const focusedEl = document.querySelector('.integrations-panel .tv-focus')
      const panel = focusedEl?.closest('.settings-panel')
      // Última linha (teste de conexão): `scrollIntoView({ block: 'nearest' })` encostava o botão na borda do
      // painel e o anel de foco saía cortado. Rolar até o fim deixa o respiro do card à vista e é
      // determinístico (um `scroll-padding` aqui reajustava 1 px a cada foco, por causa do `scale` do foco).
      if (row === SPEED_TEST_ROW && panel) panel.scrollTop = panel.scrollHeight
      else focusedEl?.scrollIntoView({ block: 'nearest' })
    }
    // `lastSpeedTest.data`: o card do teste de conexão cresce quando o último resultado chega do
    // IndexedDB (a leitura é assíncrona), então o foco precisa ser trazido à vista de novo.
  }, [focused, row, speedDialog, confirmRemove, lastSpeedTest.data])
  const tmdbStatusQuery = useTmdbStatus()
  const testTmdbKey = useTestTmdbKey()
  const removeTmdbKey = useRemoveTmdbKey()
  const actionList = tmdbActions(tmdbStatusQuery.data)
  const effectiveCol = clamp(col, 0, actionList.length - 1)

  /** Mesmo caminho para o teclado (foco corrente) e o clique de mouse (linha/coluna do evento). */
  function activate(targetRow: number, targetCol: number) {
    setRow(targetRow)
    setCol(targetCol)
    if (targetRow === SPEED_TEST_ROW) { setSpeedDialog(true); return }
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
        focusedRow={focused && !speedDialog && !confirmRemove ? row : undefined}
        focusedCol={effectiveCol}
        testing={testTmdbKey.isPending}
        onActivate={activate}
        lastSpeedTest={lastSpeedTest.data ?? undefined}
        speedTestReadFailed={speedTest.storageUnavailable || lastSpeedTest.isError}
      />
      {confirmRemove && <RemoveTmdbKeyModal onCancel={() => setConfirmRemove(false)} onConfirm={confirmRemoval} />}
      {speedDialog && <SpeedTestDialog {...speedTest} onStart={() => { void speedTest.start() }} onClose={() => { void closeSpeedDialog() }} />}
    </>
  )
}
