import type { ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { clamp } from '../../lib/useRemoteNav'

export interface PickerOption {
  key: string
  label: string
}

export interface OptionPickerModalProps {
  /** Nome do diálogo e título do seletor. */
  label: string
  options: readonly PickerOption[]
  selectedKey: string
  focusIndex: number
  onFocusIndexChange: (index: number) => void
  /** OK numa opção (por SELECT no foco ou clique). */
  onChoose: (index: number) => void
  /** RETURN: fecha sem gravar. */
  onBack: () => void
}

/**
 * Seletor de uma opção entre várias (radiogroup num `Modal`): ↑/↓ movem o foco,
 * OK escolhe, RETURN fecha sem gravar. Compartilhado por "Player & reprodução"
 * (feature 041) e pela linha "Idioma" (feature 054).
 */
export function OptionPickerModal({
  label,
  options,
  selectedKey,
  focusIndex,
  onFocusIndexChange,
  onChoose,
  onBack,
}: OptionPickerModalProps): ReactNode {
  return (
    <Modal
      ariaLabel={label}
      onBack={onBack}
      onDirection={(direction) => {
        if (direction === 'up' || direction === 'down') {
          onFocusIndexChange(clamp(focusIndex + (direction === 'down' ? 1 : -1), 0, options.length - 1))
        }
      }}
      onSelect={() => onChoose(focusIndex)}
    >
      <p className="modal-title">{label}</p>
      <div role="radiogroup" aria-label={label} className="player-panel-group">
        {options.map((option, index) => {
          const checked = option.key === selectedKey
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={checked}
              className={`player-panel-row${index === focusIndex ? ' tv-focus' : ''}${checked ? ' is-selected' : ''}`}
              onClick={() => onChoose(index)}
            >
              <span className="player-panel-row-mark" aria-hidden="true">
                {checked ? '●' : '○'}
              </span>
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
