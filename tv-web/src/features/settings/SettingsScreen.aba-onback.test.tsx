import { cleanup, fireEvent, render } from '@testing-library/react'
import { useImperativeHandle } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen'
import type { SettingsTabProps } from './tabs/settingsTab'

/**
 * Feature 076 (D-002): RETURN no painel é oferecido primeiro à aba (`SettingsTabHandle.onBack`); `true` consome e a
 * tela não sai. Abas sem `onBack`, retorno `false` e a zona das abas seguem como sempre. Abas falsas: o que se testa
 * é a consulta da `SettingsScreen`, não uma aba real.
 */
const tab = vi.hoisted(() => ({ onBack: undefined as undefined | (() => boolean) }))
vi.mock('./tabs/settingsTabs', () => {
  function FakePanel({ handleRef }: SettingsTabProps) {
    useImperativeHandle(handleRef, () => ({ onEnter: () => {}, onDirection: () => {}, onSelect: () => {}, onBack: tab.onBack }))
    return <div>painel falso</div>
  }
  return { SETTINGS_TABS: [{ id: 'sources', labelKey: 'settings.tab.sources', icon: 'live', Panel: FakePanel }] }
})

const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })

function renderSettings() {
  const props: SettingsScreenProps = {
    activeSourceId: null, onAddSource: vi.fn(), onEditSource: vi.fn(), onResyncStarted: vi.fn(), onSourceDeleted: vi.fn(), onBack: vi.fn(),
  }
  render(<SettingsScreen {...props} />)
  return props
}
const enterPanel = () => { press('Enter') }

beforeEach(() => { tab.onBack = undefined })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('SettingsScreen — RETURN oferecido à aba (feature 076)', () => {
  it('no painel, a aba que consome o RETURN (true) impede a saída da tela', () => {
    const onBack = vi.fn(() => true)
    tab.onBack = onBack
    const props = renderSettings()
    enterPanel()
    press('Escape')
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(props.onBack).not.toHaveBeenCalled()
  })

  it('no painel, a aba que devolve false ou não tem onBack deixa a tela sair', () => {
    tab.onBack = () => false
    const props = renderSettings()
    enterPanel()
    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)
    cleanup()
    tab.onBack = undefined
    const second = renderSettings()
    enterPanel()
    press('Escape')
    expect(second.onBack).toHaveBeenCalledTimes(1)
  })

  it('na coluna de abas a aba não é consultada e a tela sai', () => {
    const onBack = vi.fn(() => true)
    tab.onBack = onBack
    const props = renderSettings()
    press('Escape')
    expect(onBack).not.toHaveBeenCalled()
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })
})
