import { useEffect, useRef } from 'react'
import type { ChoicePanelModel } from './playerViewPanels'

export interface PlayerChoicePanelProps {
  model: ChoicePanelModel
  /** Chave da linha focada (estado do `PlayerLayer`, ADR-009) — nunca foco DOM. */
  focusedKey: string
}

/**
 * Painel de escolha única do player — "Aspecto" e "Qualidade" (feature 041,
 * `logic/aspecto-qualidade.md` §1.4). Desenho puro, no mesmo molde de
 * `PlayerTracksPanel` (029): vive dentro do `.player-overlay` com o visual do
 * `Modal`, porque o `PlayerLayer` já captura o teclado e um `Modal` aqui nunca
 * receberia tecla. Quem decide o foco e o que o SELECT faz é o `PlayerLayer`.
 */
export function PlayerChoicePanel({ model, focusedKey }: PlayerChoicePanelProps) {
  const focusedRef = useRef<HTMLButtonElement | null>(null)

  // `?.` porque jsdom não implementa `scrollIntoView`.
  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [focusedKey])

  return (
    <div className="modal-overlay">
      <div className="modal-panel player-panel no-scrollbar" role="dialog" aria-modal="true" aria-label={model.title}>
        <h2 className="modal-title">{model.title}</h2>
        <div role="radiogroup" aria-label={model.title} className="player-panel-group">
          {model.rows.map((row) => {
            const focused = row.key === focusedKey
            return (
              <button
                key={row.key}
                ref={focused ? focusedRef : undefined}
                type="button"
                role="radio"
                aria-checked={row.checked}
                className={`player-panel-row${focused ? ' tv-focus' : ''}${row.checked ? ' is-selected' : ''}`}
              >
                <span className="player-panel-row-mark" aria-hidden="true">
                  {row.checked ? '●' : '○'}
                </span>
                <span>{row.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
