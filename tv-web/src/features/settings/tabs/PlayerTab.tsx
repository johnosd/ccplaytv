import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '../../../components/Modal'
import { readPlayerPreferences, writePlayerPreferences } from '../../../lib/player/playerPreferences'
import { clamp } from '../../../lib/useRemoteNav'
import { PlayerPreferencesPanel } from '../PlayerPreferencesPanel'
import { PREFERENCE_ROWS, selectedOptionIndex } from '../playerPreferencesModel'
import type { SettingsTabProps } from './settingsTab'

/**
 * Player & reprodução (feature 041, US3 — `logic/aspecto-qualidade.md` §4):
 * as preferências do aparelho. Não lê a lista ativa (FR-011). O seletor de
 * cada linha é um `Modal` (feature 022): OK grava e devolve o foco à linha,
 * RETURN fecha sem gravar. Foco por estado (ADR-009).
 */
export function PlayerTab({ focused, exitToTabs, goToTopbar, handleRef }: SettingsTabProps): ReactNode {
  const [preferences, setPreferences] = useState(() => readPlayerPreferences())
  const [row, setRow] = useState(0)
  const [picker, setPicker] = useState<{ row: number; focusIndex: number } | null>(null)
  // `onSelect` é chamado pelo teclado da tela, que pode vir antes do commit: o
  // seletor lê a linha pelo ref (mesma razão dos refs do chrome do player).
  const rowRef = useRef(row)
  useEffect(() => {
    rowRef.current = row
  }, [row])

  function openPicker(target: number) {
    setPicker({ row: target, focusIndex: selectedOptionIndex(PREFERENCE_ROWS[target], preferences) })
  }

  function choose(rowIndex: number, optionIndex: number) {
    const option = PREFERENCE_ROWS[rowIndex].options[optionIndex]
    setPreferences(writePlayerPreferences(option.patch))
    setPicker(null)
  }

  useImperativeHandle(handleRef, () => ({
    onEnter: () => setRow(0),
    onDirection: (direction) => {
      if (direction === 'left') {
        exitToTabs()
        return
      }
      if (direction === 'up' && row === 0) {
        goToTopbar()
        return
      }
      if (direction === 'up' || direction === 'down') {
        setRow((r) => clamp(r + (direction === 'down' ? 1 : -1), 0, PREFERENCE_ROWS.length - 1))
      }
    },
    onSelect: () => openPicker(rowRef.current),
  }))

  const pickerRow = picker ? PREFERENCE_ROWS[picker.row] : null

  return (
    <>
      <PlayerPreferencesPanel
        preferences={preferences}
        focusedRow={focused && !picker ? row : undefined}
        onActivateRow={(target) => {
          setRow(target)
          openPicker(target)
        }}
      />
      {picker && pickerRow && (
        <Modal
          ariaLabel={pickerRow.label}
          onBack={() => setPicker(null)}
          onDirection={(direction) => {
            if (direction === 'up' || direction === 'down') {
              setPicker({
                ...picker,
                focusIndex: clamp(picker.focusIndex + (direction === 'down' ? 1 : -1), 0, pickerRow.options.length - 1),
              })
            }
          }}
          onSelect={() => choose(picker.row, picker.focusIndex)}
        >
          <p className="modal-title">{pickerRow.label}</p>
          <div role="radiogroup" aria-label={pickerRow.label} className="player-panel-group">
            {pickerRow.options.map((option, index) => {
              const checked = option.key === pickerRow.selectedKey(preferences)
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  className={`player-panel-row${index === picker.focusIndex ? ' tv-focus' : ''}${checked ? ' is-selected' : ''}`}
                  onClick={() => choose(picker.row, index)}
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
      )}
    </>
  )
}
