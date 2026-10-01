import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import { getComingSoon } from '../../../lib/comingSoon'
import { applyMotionPreference, readReducedMotionPreference, writeReducedMotionPreference } from '../../../lib/motionPreference'
import { AccessibilityPanel, ACCESSIBILITY_ROW_COUNT } from '../AccessibilityPanel'
import type { SettingsTabProps } from './settingsTab'

const A11Y_MOCK_IDS = ['a11y-voice-guide', 'a11y-high-contrast', 'a11y-subtitles'] as const

/** Acessibilidade & sistema (feature 026, FR-029): "Reduzir movimento" real, o resto "Em breve". */
export function AccessibilityTab({ focused, exitToTabs, goToTopbar, showToast, handleRef }: SettingsTabProps): ReactNode {
  const [row, setRow] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(() => readReducedMotionPreference())

  function toggleReducedMotion() {
    const next = !reducedMotion
    writeReducedMotionPreference(next)
    applyMotionPreference()
    setReducedMotion(next)
  }

  function activateRow(targetRow: number) {
    setRow(targetRow)
    if (targetRow === 0) {
      toggleReducedMotion()
      return
    }
    showToast(`Em breve — ${getComingSoon(A11Y_MOCK_IDS[targetRow - 1]).message}`)
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
        setRow((r) => clamp(r + (direction === 'down' ? 1 : -1), 0, ACCESSIBILITY_ROW_COUNT - 1))
      }
    },
    onSelect: () => activateRow(row),
  }))

  return <AccessibilityPanel reducedMotion={reducedMotion} focusedRow={focused ? row : undefined} onActivateRow={activateRow} />
}
