import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { useSources } from '../../import/importApi'
import { clamp } from '../../../lib/useRemoteNav'
import { ADD_SOURCE_ID, SourcesPanel } from '../SourcesPanel'
import type { SettingsTabProps } from './settingsTab'

/**
 * Fontes IPTV (feature 026, FR-023..FR-028): desde a feature 067 só a relação das listas, cada uma com um único
 * "Configurar" que abre Configurações da lista (FR-013), mais "Adicionar lista". Editar, Ressincronizar, Excluir e EPG
 * moram na tela da lista. O foco é por id da lista, nunca por índice.
 */
export function SourcesTab({
  focused,
  initialFocus,
  activeSourceId,
  navigation,
  exitToTabs,
  goToTopbar,
  handleRef,
}: SettingsTabProps): ReactNode {
  const sources = useSources().data?.sources ?? []
  const sourceIds = [...sources.map((source) => source.id), ADD_SOURCE_ID]

  const initialRowId =
    initialFocus?.zone === 'sources' ? initialFocus.sourceId : initialFocus?.zone === 'sources-add' ? ADD_SOURCE_ID : null
  const [rowId, setRowId] = useState<string | null>(initialRowId)
  const effectiveRowId = rowId !== null && sourceIds.includes(rowId) ? rowId : (sourceIds[0] ?? ADD_SOURCE_ID)

  /** Mesmo caminho para o teclado (foco corrente) e o clique de mouse (linha do evento). */
  function activateRow(targetRowId: string) {
    setRowId(targetRowId)
    if (targetRowId === ADD_SOURCE_ID) {
      navigation.onAddSource({ zone: 'sources-add' })
      return
    }
    const source = sources.find((candidate) => candidate.id === targetRowId)
    if (source) navigation.onConfigureSource?.(source, { zone: 'sources', sourceId: targetRowId, action: 'configure' })
  }

  useImperativeHandle(handleRef, () => ({
    onEnter: () => setRowId(null),
    onDirection: (direction) => {
      if (direction === 'left') {
        exitToTabs()
        return
      }
      if (direction === 'up' && effectiveRowId === sourceIds[0]) {
        goToTopbar()
        return
      }
      if (direction === 'up' || direction === 'down') {
        const next = clamp(sourceIds.indexOf(effectiveRowId) + (direction === 'down' ? 1 : -1), 0, sourceIds.length - 1)
        setRowId(sourceIds[next])
      }
    },
    onSelect: () => activateRow(effectiveRowId),
  }))

  return <SourcesPanel sources={sources} activeSourceId={activeSourceId} focusedRowId={focused ? effectiveRowId : undefined} onActivateRow={activateRow} />
}
