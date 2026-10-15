import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRemoteNav } from './useRemoteNav'
import { REMOVE_COLOR_KEY, REMOVE_COLOR_KEYCODE } from './tizenColorKey'

function keydown(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init })
  document.dispatchEvent(event)
  return event
}

describe('useRemoteNav — onRemoveKey (tecla vermelha, feature 036)', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('reconhece a tecla vermelha pelo nome e pelo keyCode 403', () => {
    vi.useFakeTimers()
    const onRemoveKey = vi.fn()
    renderHook(() => useRemoteNav({ onRemoveKey }))

    expect(keydown({ key: REMOVE_COLOR_KEY }).defaultPrevented).toBe(true)
    vi.advanceTimersByTime(500)
    keydown({ keyCode: REMOVE_COLOR_KEYCODE })

    expect(onRemoveKey).toHaveBeenCalledTimes(2)
  })

  it('sem handler, a tecla continua não mapeada: nenhum preventDefault', () => {
    renderHook(() => useRemoteNav({ onBack: () => {} }))
    expect(keydown({ key: REMOVE_COLOR_KEY }).defaultPrevented).toBe(false)
  })

  it('segurar (auto-repetição) chama uma vez só dentro do debounce (FR-021)', () => {
    vi.useFakeTimers()
    const onRemoveKey = vi.fn()
    renderHook(() => useRemoteNav({ onRemoveKey }))

    keydown({ key: REMOVE_COLOR_KEY })
    vi.advanceTimersByTime(100)
    keydown({ key: REMOVE_COLOR_KEY, repeat: true })
    vi.advanceTimersByTime(100)
    keydown({ key: REMOVE_COLOR_KEY, repeat: true })

    expect(onRemoveKey).toHaveBeenCalledTimes(1)
  })
})
