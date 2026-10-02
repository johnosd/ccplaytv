import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { useDeleteSource, useResyncSource, useSources, type SourceOut } from '../../import/importApi'
import { useOnlineStatus } from '../../../lib/onlineStatus'
import { clamp } from '../../../lib/useRemoteNav'
import { DeleteSourceModal } from '../../sources/DeleteSourceModal'
import { ADD_SOURCE_ID, SourcesPanel, SOURCES_ACTION_COUNT } from '../SourcesPanel'
import type { SettingsFocus, SettingsTabProps } from './settingsTab'

const SOURCES_ACTIONS = ['edit', 'resync', 'delete', 'epg'] as const

function actionToCol(action: 'edit' | 'resync' | 'delete' | 'epg'): number {
  return SOURCES_ACTIONS.indexOf(action)
}

/** Fontes IPTV (feature 026, FR-023..FR-028; EPG da lista, feature 030). */
export function SourcesTab({
  focused,
  initialFocus,
  activeSourceId,
  navigation,
  exitToTabs,
  goToTopbar,
  showToast,
  handleRef,
}: SettingsTabProps): ReactNode {
  const online = useOnlineStatus()
  const sourcesQuery = useSources()
  const sources = sourcesQuery.data?.sources ?? []
  const sourceIds = [...sources.map((source) => source.id), ADD_SOURCE_ID]

  const initialRowId =
    initialFocus?.zone === 'sources' ? initialFocus.sourceId : initialFocus?.zone === 'sources-add' ? ADD_SOURCE_ID : null
  const [rowId, setRowId] = useState<string | null>(initialRowId)
  const [col, setCol] = useState(initialFocus?.zone === 'sources' ? actionToCol(initialFocus.action) : 0)
  const [confirmDelete, setConfirmDelete] = useState<SourceOut | null>(null)

  const resyncSource = useResyncSource()
  const deleteSource = useDeleteSource()

  const effectiveRowId = rowId !== null && sourceIds.includes(rowId) ? rowId : (sourceIds[0] ?? ADD_SOURCE_ID)
  const effectiveColMax = effectiveRowId === ADD_SOURCE_ID ? 0 : SOURCES_ACTION_COUNT - 1
  const effectiveCol = clamp(col, 0, effectiveColMax)

  function confirmSourceDeletion() {
    if (!confirmDelete) return
    const { id } = confirmDelete
    const realIdx = sources.findIndex((source) => source.id === id)
    const nextId = sources[realIdx + 1]?.id ?? sources[realIdx - 1]?.id ?? ADD_SOURCE_ID
    setConfirmDelete(null)
    deleteSource.mutate(id, {
      onSuccess: () => {
        setRowId(nextId)
        navigation.onSourceDeleted(id)
      },
      onError: () => showToast('Não foi possível excluir a lista.'),
    })
  }

  /** Mesmo caminho para o teclado (foco corrente) e o clique de mouse (linha/coluna do evento). */
  function activateRow(targetRowId: string, targetCol: number) {
    setRowId(targetRowId)
    setCol(targetCol)
    if (targetRowId === ADD_SOURCE_ID) {
      navigation.onAddSource({ zone: 'sources-add' })
      return
    }
    const source = sources.find((candidate) => candidate.id === targetRowId)
    if (!source) return
    const from: SettingsFocus = { zone: 'sources', sourceId: targetRowId, action: SOURCES_ACTIONS[targetCol] }
    if (targetCol === 0) {
      navigation.onEditSource(source, from)
      return
    }
    if (targetCol === 1) {
      if (resyncSource.isPending) return
      // Feature 042 (FR-004): ressincronizar precisa de internet — explica, não tenta.
      if (!online) {
        showToast('Sem conexão. Ressincronizar precisa de internet.')
        return
      }
      showToast('Ressincronizando lista…')
      resyncSource.mutate(source.id, {
        onSuccess: (result) => navigation.onResyncStarted(result.import_job_id, from),
        onError: () => showToast('Não foi possível ressincronizar a lista.'),
      })
      return
    }
    if (targetCol === 2) {
      if (deleteSource.isPending) return
      setConfirmDelete(source)
      return
    }
    // targetCol === 3: EPG da lista (feature 030) — tela própria, sem toast.
    navigation.onOpenEpg?.(source, from)
  }

  useImperativeHandle(handleRef, () => ({
    onEnter: () => {
      setRowId(null)
      setCol(0)
    },
    onDirection: (direction) => {
      if (direction === 'left' && effectiveCol === 0) {
        exitToTabs()
        return
      }
      if (direction === 'up' && effectiveRowId === sourceIds[0]) {
        goToTopbar()
        return
      }
      if (direction === 'left') setCol((c) => clamp(c - 1, 0, effectiveColMax))
      if (direction === 'right') setCol((c) => clamp(c + 1, 0, effectiveColMax))
      if (direction === 'up' || direction === 'down') {
        const idx = sourceIds.indexOf(effectiveRowId)
        const next = clamp(idx + (direction === 'down' ? 1 : -1), 0, sourceIds.length - 1)
        setRowId(sourceIds[next])
      }
    },
    onSelect: () => activateRow(effectiveRowId, effectiveCol),
  }))

  return (
    <>
      <SourcesPanel
        sources={sources}
        activeSourceId={activeSourceId}
        focusedRowId={focused ? effectiveRowId : undefined}
        focusedCol={effectiveCol}
        resyncPending={resyncSource.isPending}
        deletePending={deleteSource.isPending}
        offline={!online}
        onActivateRow={activateRow}
      />
      {confirmDelete && (
        <DeleteSourceModal source={confirmDelete} onCancel={() => setConfirmDelete(null)} onConfirm={confirmSourceDeletion} />
      )}
    </>
  )
}
