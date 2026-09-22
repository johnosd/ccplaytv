import { useState } from 'react'
import {
  useDeleteSource,
  useResyncSource,
  useSources,
  type SourceOut,
} from '../import/importApi'
import { AddSourceScreen } from '../import/AddSourceScreen'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { exitApp } from '../../lib/tizenExit'

export interface HomeScreenProps {
  onAddSource: () => void
  onOpenSource: (source: SourceOut) => void
  onEditSource: (source: SourceOut) => void
  onResyncStarted: (jobId: string) => void
  onSourceCreated: (result: { sourceId: string; jobId: string }) => void
  /** TEMPORÁRIO (feature 005, US1): some na fase Polish, junto com a tela. */
  onOpenBench: () => void
}

function formatStatus(source: SourceOut): string {
  if (source.connection_state === 'error') return 'Erro na última sincronização'
  if (source.connection_state === 'never_synced' || !source.last_successful_sync_at) {
    return 'Nunca sincronizada'
  }
  return `Sincronizada em ${new Date(source.last_successful_sync_at).toLocaleString('pt-BR')}`
}

export function HomeScreen({
  onAddSource,
  onOpenSource,
  onEditSource,
  onResyncStarted,
  onSourceCreated,
  onOpenBench,
}: HomeScreenProps) {
  const { data, isLoading, isError } = useSources()
  const deleteSource = useDeleteSource()
  const resyncSource = useResyncSource()
  const { toastMessage, showToast } = useToast()
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const sources = data?.sources ?? []
  const hasSources = !isLoading && !isError && sources.length > 0
  const isEmpty = !isLoading && !isError && sources.length === 0
  // + card "Adicionar lista" + card temporário de diagnóstico (US1).
  const total = sources.length + 2
  const addCardIdx = sources.length
  const benchCardIdx = sources.length + 1

  const [focusRow, setFocusRow] = useState<0 | 1>(0)
  const [focusCol, setFocusCol] = useState(0)
  const [activeCardIdx, setActiveCardIdx] = useState(0)

  useRemoteNav({
    onDirection: (dir) => {
      if (!hasSources) return
      if (focusRow === 0) {
        if (dir === 'left') setFocusCol((c) => clamp(c - 1, 0, total - 1))
        if (dir === 'right') setFocusCol((c) => clamp(c + 1, 0, total - 1))
        if (dir === 'down' && focusCol < sources.length) {
          setFocusRow(1)
          setActiveCardIdx(focusCol)
        }
      } else {
        if (dir === 'up') setFocusRow(0)
        if (dir === 'left') setFocusCol((c) => clamp(c - 1, 0, 2))
        if (dir === 'right') setFocusCol((c) => clamp(c + 1, 0, 2))
      }
    },
    onSelect: () => {
      // O gate da US1 roda justamente com o backend desligado, e é aí que
      // esta tela cai no estado de erro. Sem esta saída, a medição ficaria
      // inalcançável exatamente na configuração que ela precisa medir.
      if (isError) {
        onOpenBench()
        return
      }
      if (!hasSources) return
      if (focusRow === 0) {
        if (focusCol === addCardIdx) {
          onAddSource()
          return
        }
        if (focusCol === benchCardIdx) {
          onOpenBench()
          return
        }
        const source = sources[focusCol]
        if (source) onOpenSource(source)
        return
      }

      const source = sources[activeCardIdx]
      if (!source) return
      if (focusCol === 0) {
        showToast('Ressincronizando lista...')
        resyncSource.mutate(source.id, {
          onSuccess: (result) => onResyncStarted(result.import_job_id),
        })
      } else if (focusCol === 1) {
        onEditSource(source)
      } else {
        deleteSource.mutate(source.id)
        setFocusRow(0)
        setFocusCol(0)
      }
    },
  })

  if (isLoading) {
    return (
      <div className="screen">
        <p className="screen-subtitle">Carregando suas listas…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="screen">
        <p className="form-error">
          Não foi possível carregar suas listas. Verifique a conexão com o backend e tente
          novamente.
        </p>
        {/* TEMPORÁRIO (feature 005, US1): sai na fase Polish. */}
        <button type="button" className="home-empty-button tv-focus" onClick={onOpenBench}>
          Diagnóstico de importação
        </button>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <>
        <AddSourceScreen
          onSourceCreated={onSourceCreated}
          onBack={() => setShowExitConfirm(true)}
        />
        {showExitConfirm && (
          <ConfirmDialog
            message="Sair do CCPlayTv?"
            confirmLabel="Sair"
            cancelLabel="Cancelar"
            onConfirm={exitApp}
            onCancel={() => setShowExitConfirm(false)}
          />
        )}
      </>
    )
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Minhas Listas</h1>
      <p className="screen-subtitle">Selecione uma lista para navegar, ou adicione uma nova</p>

      <div className="source-row">
        {sources.map((source, i) => {
          const focused = focusRow === 0 && focusCol === i
          const actionsVisible = focusRow === 1 && activeCardIdx === i
          return (
            <div className="source-card-wrap" key={source.id}>
              <div className={`source-card${focused ? ' tv-focus' : ''}`}>
                <div className="source-card-icon" />
                <div className="source-card-name">{source.display_name}</div>
                <div className="source-card-status">{formatStatus(source)}</div>
                {source.provider_import_mode === 'legacy_m3u' && (
                  <div className="source-card-badge">Modo limitado</div>
                )}
                {source.last_truncated_by_storage && (
                  <div className="source-card-badge" style={{ marginTop: 4 }}>A lista não coube inteira</div>
                )}
                {source.last_discarded_by_type > 0 && (
                  <div className="source-card-badge" style={{ marginTop: 4 }}>Só canais foram importados</div>
                )}
              </div>
              {actionsVisible && (
                <div className="source-actions">
                  <div className={`source-action${focusCol === 0 ? ' tv-focus' : ''}`}>
                    ↻ Ressincronizar
                  </div>
                  <div className={`source-action${focusCol === 1 ? ' tv-focus' : ''}`}>✎ Editar</div>
                  <div className={`source-action${focusCol === 2 ? ' tv-focus' : ''}`}>🗑 Excluir</div>
                </div>
              )}
            </div>
          )
        })}
        <div className="source-card-wrap">
          <div
            className={`add-card${focusRow === 0 && focusCol === addCardIdx ? ' tv-focus' : ''}`}
          >
            <div className="add-card-plus">+</div>
            <div className="add-card-label">Adicionar lista</div>
          </div>
        </div>
        {/* TEMPORÁRIO (feature 005, US1): sai na fase Polish. */}
        <div className="source-card-wrap">
          <div
            className={`add-card${focusRow === 0 && focusCol === benchCardIdx ? ' tv-focus' : ''}`}
          >
            <div className="add-card-plus">⏱</div>
            <div className="add-card-label">Diagnóstico</div>
          </div>
        </div>
      </div>

      <Toast message={toastMessage} />
    </div>
  )
}
