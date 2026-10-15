import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import { comingSoonToast } from '../../../lib/comingSoon'
import { useLanguage, useT } from '../../../lib/i18n/I18nProvider'
import { writeAppLanguage } from '../../../lib/i18n/appLanguage'
import { APP_LANGUAGES, APP_LANGUAGE_NATIVE_NAME } from '../../../lib/i18n/languages'
import { applyMotionPreference, readReducedMotionPreference, writeReducedMotionPreference } from '../../../lib/motionPreference'
import { ACCESSIBILITY_LANGUAGE_ROW, AccessibilityPanel, ACCESSIBILITY_ROW_COUNT } from '../AccessibilityPanel'
import { OptionPickerModal } from '../OptionPickerModal'
import type { SettingsTabProps } from './settingsTab'

const A11Y_MOCK_IDS = ['a11y-voice-guide', 'a11y-high-contrast', 'a11y-subtitles'] as const

const LANGUAGE_OPTIONS = APP_LANGUAGES.map((code) => ({ key: code, label: APP_LANGUAGE_NATIVE_NAME[code] }))

/** Acessibilidade & sistema (feature 026, FR-029): "Reduzir movimento" e "Idioma" (054) reais, o resto "Em breve". */
export function AccessibilityTab({ focused, exitToTabs, goToTopbar, showToast, handleRef }: SettingsTabProps): ReactNode {
  const t = useT()
  const language = useLanguage()
  const [row, setRow] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(() => readReducedMotionPreference())
  // O seletor de idioma é um Modal: OK grava e devolve o foco à linha, RETURN fecha sem gravar.
  const [picker, setPicker] = useState<{ focusIndex: number } | null>(null)

  function toggleReducedMotion() {
    const next = !reducedMotion
    writeReducedMotionPreference(next)
    applyMotionPreference()
    setReducedMotion(next)
  }

  function openLanguagePicker() {
    setPicker({ focusIndex: Math.max(0, APP_LANGUAGES.indexOf(language)) })
  }

  function activateRow(targetRow: number) {
    setRow(targetRow)
    if (targetRow === 0) {
      toggleReducedMotion()
      return
    }
    if (targetRow === ACCESSIBILITY_LANGUAGE_ROW) {
      openLanguagePicker()
      return
    }
    showToast(comingSoonToast(A11Y_MOCK_IDS[targetRow - 2], t))
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

  return (
    <>
      <AccessibilityPanel
        reducedMotion={reducedMotion}
        focusedRow={focused && !picker ? row : undefined}
        onActivateRow={activateRow}
      />
      {picker && (
        <OptionPickerModal
          label={t('settings.language.label')}
          options={LANGUAGE_OPTIONS}
          selectedKey={language}
          focusIndex={picker.focusIndex}
          onFocusIndexChange={(focusIndex) => setPicker({ focusIndex })}
          onChoose={(index) => {
            writeAppLanguage(APP_LANGUAGES[index])
            setPicker(null)
          }}
          onBack={() => setPicker(null)}
        />
      )}
    </>
  )
}
