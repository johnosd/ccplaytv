import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useT } from '../../../lib/i18n/I18nProvider'
import { readPlayerPreferences, writePlayerPreferences } from '../../../lib/player/playerPreferences'
import { clamp } from '../../../lib/useRemoteNav'
import { OptionPickerModal } from '../OptionPickerModal'
import { PlayerPreferencesPanel } from '../PlayerPreferencesPanel'
import { buildPreferenceRows, selectedOptionIndex } from '../playerPreferencesModel'
import type { SettingsTabProps } from './settingsTab'

/**
 * Player & reprodução (feature 041, US3 — `logic/aspecto-qualidade.md` §4):
 * as preferências do aparelho. Não lê a lista ativa (FR-011). O seletor de
 * cada linha é um `Modal` (feature 022): OK grava e devolve o foco à linha,
 * RETURN fecha sem gravar. Foco por estado (ADR-009).
 */
export function PlayerTab({ focused, exitToTabs, goToTopbar, handleRef }: SettingsTabProps): ReactNode {
  const t = useT()
  const rows = useMemo(() => buildPreferenceRows(t), [t])
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
    setPicker({ row: target, focusIndex: selectedOptionIndex(rows[target], preferences) })
  }

  function choose(rowIndex: number, optionIndex: number) {
    const option = rows[rowIndex].options[optionIndex]
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
        setRow((r) => clamp(r + (direction === 'down' ? 1 : -1), 0, rows.length - 1))
      }
    },
    onSelect: () => openPicker(rowRef.current),
  }))

  const pickerRow = picker ? rows[picker.row] : null

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
        <OptionPickerModal
          label={pickerRow.label}
          options={pickerRow.options}
          selectedKey={pickerRow.selectedKey(preferences)}
          focusIndex={picker.focusIndex}
          onFocusIndexChange={(focusIndex) => setPicker({ ...picker, focusIndex })}
          onChoose={(optionIndex) => choose(picker.row, optionIndex)}
          onBack={() => setPicker(null)}
        />
      )}
    </>
  )
}
