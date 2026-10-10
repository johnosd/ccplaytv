import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../../components/Button'
import { useOnlineStatus } from '../../../lib/onlineStatus'
import { useT } from '../../../lib/i18n/I18nProvider'
import { clamp } from '../../../lib/useRemoteNav'
import { useDeleteSource, useResyncSource, useSources } from '../../import/importApi'
import { DeleteSourceModal } from '../../sources/DeleteSourceModal'
import { SourceInfo } from '../SourcesPanel'
import type { ListSettingsFocus, ListSettingsTabProps } from '../tabs/settingsTab'

/** Editar · Ressincronizar · Excluir — a mesma ordem da antiga linha de Fontes IPTV (`logic/navegacao-lista.md` §2). */
const ACTIONS = ['edit', 'resync', 'delete'] as const
const LABELS = ['settings.sources.edit', 'settings.sources.resync', 'settings.sources.delete'] as const

/**
 * Conta & lista (feature 067, FR-004): as informações da lista e Editar/Ressincronizar/Excluir, sempre sobre a lista DA
 * TELA (D-005). Excluir confirma (e pede o PIN desta lista, se ela tiver) e devolve à origem a lista vizinha (D-009).
 */
export function AccountTab({ focused, initialFocus, source, activeSourceId, navigation, exitToTabs, showToast, handleRef }: ListSettingsTabProps): ReactNode {
  const t = useT()
  const online = useOnlineStatus()
  const sources = useSources().data?.sources ?? []
  const resyncSource = useResyncSource()
  const deleteSource = useDeleteSource()
  const initialCol = initialFocus?.tab === 'account' && initialFocus.action ? Math.max(0, ACTIONS.indexOf(initialFocus.action as (typeof ACTIONS)[number])) : 0
  const [col, setCol] = useState(initialCol)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function activate(target: number) {
    setCol(target)
    const from: ListSettingsFocus = { tab: 'account', action: ACTIONS[target] }
    if (target === 0) {
      navigation.onEditSource(source, from)
      return
    }
    if (target === 1) {
      if (resyncSource.isPending) return
      // Feature 042 (FR-004): ressincronizar precisa de internet — explica, não tenta.
      if (!online) {
        showToast(t('settings.sources.offlineResync'))
        return
      }
      showToast(t('settings.sources.resyncing'))
      resyncSource.mutate(source.id, {
        onSuccess: (result) => navigation.onResyncStarted(result.import_job_id, from),
        onError: () => showToast(t('settings.sources.resyncFailed')),
      })
      return
    }
    if (!deleteSource.isPending) setConfirmDelete(true)
  }

  function confirmDeletion() {
    // A vizinha é decidida antes de a lista mudar: a seguinte, senão a anterior, senão "Adicionar lista" (D-009).
    const index = sources.findIndex((candidate) => candidate.id === source.id)
    const nextFocusId = sources[index + 1]?.id ?? sources[index - 1]?.id ?? null
    setConfirmDelete(false)
    deleteSource.mutate(source.id, {
      onSuccess: () => navigation.onSourceDeleted(source.id, nextFocusId),
      onError: () => showToast(t('settings.sources.deleteFailed')),
    })
  }

  useImperativeHandle(handleRef, () => ({
    onEnter: () => setCol(0),
    onDirection: (direction) => {
      if (direction === 'left' && col === 0) {
        exitToTabs()
        return
      }
      if (direction === 'left') setCol((c) => clamp(c - 1, 0, ACTIONS.length - 1))
      if (direction === 'right') setCol((c) => clamp(c + 1, 0, ACTIONS.length - 1))
    },
    onSelect: () => activate(col),
  }))

  return (
    <div className="list-settings-panel">
      <SourceInfo source={source} active={source.id === activeSourceId} showEpg={false} />
      <div className="sources-panel-actions">
        {LABELS.map((labelKey, index) => (
          <Button
            key={labelKey}
            variant="secondary"
            loading={(index === 1 && resyncSource.isPending) || (index === 2 && deleteSource.isPending)}
            softDisabled={index === 1 && !online}
            focused={focused && !confirmDelete && col === index}
            onSelect={() => activate(index)}
          >
            {t(labelKey)}
            {index === 1 && !online && <span className="sr-only">{t('settings.sources.offlineNote')}</span>}
          </Button>
        ))}
      </div>
      {confirmDelete && <DeleteSourceModal source={source} onCancel={() => setConfirmDelete(false)} onConfirm={confirmDeletion} />}
    </div>
  )
}
