import { act, cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { BackupTab } from './BackupTab'
import { SETTINGS_TABS } from './settingsTabs'
import type { SettingsTabHandle, SettingsTabProps } from './settingsTab'

afterEach(cleanup)

function renderTab() {
  const handleRef = createRef<SettingsTabHandle>()
  const props: SettingsTabProps = { focused: true, activeSourceId: null, exitToTabs: vi.fn(), goToTopbar: vi.fn(), showToast: vi.fn(), handleRef,
    navigation: { onAddSource: vi.fn(), onEditSource: vi.fn(), onResyncStarted: vi.fn(), onSourceDeleted: vi.fn() } }
  render(<BackupTab {...props} />)
  return { props, handleRef }
}
const press = (handleRef: { current: SettingsTabHandle | null }, direction: 'up' | 'down' | 'left' | 'right') => act(() => handleRef.current!.onDirection(direction))
const focusedName = () => document.querySelector('.tv-focus')?.textContent

it('a aba Backup vem logo depois de Portal & licença', () => {
  const ids = SETTINGS_TABS.map(tab => tab.id)
  expect(ids.indexOf('backup')).toBe(ids.indexOf('portal') + 1)
})

it('↓ percorre as três ações e para na última; ↑ no topo sobe à topbar; ← volta às abas', () => {
  const { props, handleRef } = renderTab()
  act(() => handleRef.current!.onEnter())
  expect(focusedName()).toBe('Fazer backup agora')
  press(handleRef, 'down'); press(handleRef, 'down'); press(handleRef, 'down')
  expect(focusedName()).toBe('Apagar backup')
  press(handleRef, 'up'); press(handleRef, 'up')
  expect(focusedName()).toBe('Fazer backup agora')
  press(handleRef, 'up')
  expect(props.goToTopbar).toHaveBeenCalledTimes(1)
  press(handleRef, 'left')
  expect(props.exitToTabs).toHaveBeenCalledTimes(1)
})

it('sem portal configurado a aba mostra o motivo e tem um elemento focado', () => {
  renderTab()
  expect(screen.getByText(/O portal ainda não está disponível neste app/)).toBeInTheDocument()
  expect(document.querySelector('.tv-focus')?.tagName).toBe('BUTTON')
})
