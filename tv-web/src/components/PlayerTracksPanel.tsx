import { useEffect, useRef } from 'react'
import type { TracksPanelModel, TracksRow } from './playerPanels'

export interface PlayerTracksPanelProps {
  model: TracksPanelModel
  /** Chave da linha focada (estado do `PlayerLayer`, ADR-009) — nunca foco DOM. */
  focusedKey: string
}

/**
 * Painel "Áudio e legendas" (feature 029, `logic/faixas-e-legendas.md` §3) —
 * desenho puro. Vive DENTRO do `.player-overlay` com o visual do `Modal`
 * (D-002): o `PlayerLayer` já intercepta o teclado antes de qualquer filho,
 * então um `Modal` aqui nunca receberia tecla. Quem decide o foco e o que o
 * SELECT faz é o `PlayerLayer`.
 */
export function PlayerTracksPanel({ model, focusedKey }: PlayerTracksPanelProps) {
  const focusedRef = useRef<HTMLButtonElement | null>(null)

  // A linha focada precisa estar à vista: o painel rola sozinho, sem barra
  // nativa (D-pad apenas). `?.` porque jsdom não implementa `scrollIntoView`.
  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [focusedKey])

  function renderRow(row: TracksRow, role: 'radio' | 'button') {
    const focused = row.key === focusedKey
    const stateProps =
      role === 'radio' ? { role: 'radio' as const, 'aria-checked': row.checked } : { 'aria-pressed': row.checked }
    return (
      <button
        key={row.key}
        ref={focused ? focusedRef : undefined}
        type="button"
        className={`player-panel-row${focused ? ' tv-focus' : ''}${row.disabled ? ' is-soft-disabled' : ''}${
          row.checked ? ' is-selected' : ''
        }`}
        aria-disabled={row.disabled ? 'true' : undefined}
        {...stateProps}
      >
        <span className="player-panel-row-mark" aria-hidden="true">
          {row.checked ? '●' : '○'}
        </span>
        <span>{row.label}</span>
      </button>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel player-panel no-scrollbar" role="dialog" aria-modal="true" aria-label="Áudio e legendas">
        <h2 className="modal-title">Áudio e legendas</h2>

        <h3 className="player-panel-heading">Áudio</h3>
        <div role="radiogroup" aria-label="Áudio" className="player-panel-group">
          {model.audioRows.map((row) => renderRow(row, 'radio'))}
        </div>
        {model.noAudioNote && <p className="player-panel-note">{model.noAudioNote}</p>}
        {renderRow(model.adRow, 'button')}

        <h3 className="player-panel-heading">Legendas</h3>
        <div role="radiogroup" aria-label="Legendas" className="player-panel-group">
          {model.textRows.map((row) => renderRow(row, 'radio'))}
        </div>
        {model.noTextNote && <p className="player-panel-note">{model.noTextNote}</p>}

        {model.delayRows.length > 0 && (
          <>
            <h3 className="player-panel-heading">Sincronização da legenda</h3>
            <div role="radiogroup" aria-label="Sincronização da legenda" className="player-panel-group">
              {model.delayRows.map((row) => renderRow(row, 'radio'))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
