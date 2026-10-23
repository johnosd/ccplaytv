import { useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import { comingSoonToast } from '../../../lib/comingSoon'
import { useT } from '../../../lib/i18n/I18nProvider'
import { useRemoveTmdbKey, useTestTmdbKey, useTmdbStatus } from '../../catalog/catalogApi'
import { IntegrationsPanel } from '../IntegrationsPanel'
import { RemoveTmdbKeyModal } from '../RemoveTmdbKeyModal'
import {
  INTEGRATION_SOON_CARDS,
  INTEGRATIONS_ROW_COUNT,
  SOON_ROW_START,
  SPEED_TEST_ROW,
  SUBTITLE_ROW_START,
  TMDB_STATE_LABEL_KEY,
  tmdbActions,
} from '../integrationsModel'
import { SUBTITLE_KEY_ROWS, subtitleKeyActions, subtitleKeyStateLabel } from '../subtitleKeysModel'
import { SubtitleKeyDialog } from '../SubtitleKeyDialog'
import { useSubtitleKeys } from '../useSubtitleKeys'
import { SubtitleKeysSection } from './SubtitleKeysSection'
import { portalSurfacesVisible } from '../../../lib/portal/portalRuntime'
import type { SubtitleProvider } from '../../../lib/subtitles/types'
import { useRefreshAction } from '../../../lib/portal/useRefreshAction'
import { useSpeedTest } from '../useSpeedTest'
import { SpeedTestDialog } from '../SpeedTestDialog'
import { LAST_SPEED_TEST_QUERY_KEY, useLastSpeedTest } from '../../../lib/network/useLastSpeedTest'
import type { SettingsTabProps } from './settingsTab'

/** Linha 0 = ações TMDB; linhas de legenda (chave pessoal); IA/clima placeholders; diagnóstico de conexão na última. */
export function IntegrationsTab({ focused, initialFocus, navigation, exitToTabs, goToTopbar, showToast, handleRef }: SettingsTabProps): ReactNode {
  const t = useT()
  const [row, setRow] = useState(initialFocus?.zone === 'panel' && initialFocus.service === 'speedtest' ? SPEED_TEST_ROW : 0)
  const [col, setCol] = useState(0)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [speedDialog, setSpeedDialog] = useState(false)
  const [keyDialog, setKeyDialog] = useState<SubtitleProvider | null>(null)
  const subtitleKeys = useSubtitleKeys()
  const queryClient = useQueryClient()
  const lastSpeedTest = useLastSpeedTest()
  const onSaved = useCallback(() => { void queryClient.invalidateQueries({ queryKey: LAST_SPEED_TEST_QUERY_KEY }) }, [queryClient])
  const speedTest = useSpeedTest({ onSaved })
  async function closeSpeedDialog() { await speedTest.cancel(); setSpeedDialog(false) }
  useEffect(() => {
    if (focused && !speedDialog && !confirmRemove && !keyDialog) {
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
  }, [focused, row, speedDialog, confirmRemove, keyDialog, lastSpeedTest.data])
  const tmdbStatusQuery = useTmdbStatus()
  const testTmdbKey = useTestTmdbKey()
  const removeTmdbKey = useRemoveTmdbKey()
  const refresh = useRefreshAction('tmdb')
  const actionList = tmdbActions(tmdbStatusQuery.data)
  /** Quantas ações a linha tem: TMDB e fornecedores de legenda têm várias colunas; os demais, uma. */
  function columnsOf(targetRow: number): number {
    if (targetRow === 0) return actionList.length
    if (targetRow >= SUBTITLE_ROW_START && targetRow < SOON_ROW_START) {
      const provider = SUBTITLE_KEY_ROWS[targetRow - SUBTITLE_ROW_START]
      return subtitleKeyActions(subtitleKeys.statuses.find((item) => item.provider === provider)).length
    }
    return 1
  }
  const effectiveCol = clamp(col, 0, columnsOf(row) - 1)

  function activateSubtitleKey(index: number, targetCol: number) {
    const provider = SUBTITLE_KEY_ROWS[index]
    const action = subtitleKeyActions(subtitleKeys.statuses.find((item) => item.provider === provider))[targetCol]
    if (action === 'add' || action === 'edit') setKeyDialog(provider)
    else if (action === 'useMine') void subtitleKeys.useMine(provider)
    else if (action === 'remove') {
      void subtitleKeys.remove(provider).then(() => {
        setCol(0)
        showToast(t('subtitles.keys.removed'))
      })
    } else if (action === 'test' && !subtitleKeys.testing) {
      showToast(t('subtitles.keys.testing'))
      void subtitleKeys.test(provider).then((status) => showToast(t(subtitleKeyStateLabel(status, portalSurfacesVisible()))))
    }
  }

  /** Mesmo caminho para o teclado (foco corrente) e o clique de mouse (linha/coluna do evento). */
  function activate(targetRow: number, targetCol: number) {
    setRow(targetRow)
    setCol(targetCol)
    if (targetRow === SPEED_TEST_ROW) { setSpeedDialog(true); return }
    if (targetRow >= SUBTITLE_ROW_START && targetRow < SOON_ROW_START) {
      activateSubtitleKey(targetRow - SUBTITLE_ROW_START, targetCol)
      return
    }
    if (targetRow > 0) {
      showToast(comingSoonToast(INTEGRATION_SOON_CARDS[targetRow - SOON_ROW_START].id, t))
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
    if (action === 'refresh') {
      // 077: busca a chave que a pessoa enviou pelo portal e relê o estado do cartão ao terminar.
      void refresh.run().then(() => queryClient.invalidateQueries({ queryKey: ['tmdb-status'] }))
    }
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
        if (columnsOf(row) > 1 && effectiveCol > 0) setCol(effectiveCol - 1)
        else exitToTabs()
        return
      }
      if (direction === 'right') {
        if (columnsOf(row) > 1) setCol(clamp(effectiveCol + 1, 0, columnsOf(row) - 1))
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
        focusedRow={focused && !speedDialog && !confirmRemove && !keyDialog ? row : undefined}
        focusedCol={effectiveCol}
        testing={testTmdbKey.isPending}
        onActivate={activate}
        refresh={refresh}
        lastSpeedTest={lastSpeedTest.data ?? undefined}
        speedTestReadFailed={speedTest.storageUnavailable || lastSpeedTest.isError}
        subtitleKeys={
          <SubtitleKeysSection
            statuses={subtitleKeys.statuses}
            hasDefault={portalSurfacesVisible()}
            focusedRow={focused && !speedDialog && !confirmRemove && !keyDialog && row >= SUBTITLE_ROW_START && row < SOON_ROW_START ? row - SUBTITLE_ROW_START : undefined}
            focusedCol={effectiveCol}
            testing={subtitleKeys.testing}
            onActivate={(index, targetCol) => activate(SUBTITLE_ROW_START + index, targetCol)}
          />
        }
      />
      {confirmRemove && <RemoveTmdbKeyModal onCancel={() => setConfirmRemove(false)} onConfirm={confirmRemoval} />}
      {keyDialog && (
        <SubtitleKeyDialog
          provider={keyDialog}
          onCancel={() => setKeyDialog(null)}
          onSaved={() => {
            setKeyDialog(null)
            subtitleKeys.refresh()
            showToast(t('subtitles.keys.state.valid'))
          }}
        />
      )}
      {speedDialog && <SpeedTestDialog {...speedTest} onStart={() => { void speedTest.start() }} onClose={() => { void closeSpeedDialog() }} />}
    </>
  )
}
