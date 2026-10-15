import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isKeyRepeatBurst,
  KEY_REPEAT_QUIET_MS,
  resetKeyRepeatTracker,
  subscribeKeyRepeatBurst,
  useKeyRepeatBurst,
} from './keyRepeat'

function key(type: 'keydown' | 'keyup', init: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

describe('useKeyRepeatBurst (feature 046)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetKeyRepeatTracker()
    vi.useRealTimers()
  })

  it('começa sem rajada, e toque isolado (repeat:false) nunca é rajada', () => {
    const { result } = renderHook(() => useKeyRepeatBurst())
    expect(result.current).toBe(false)
    key('keydown', { key: 'ArrowDown', repeat: false })
    expect(result.current).toBe(false)
  })

  it('seta com repeat:true inicia a rajada; keyup da seta a encerra', () => {
    const { result } = renderHook(() => useKeyRepeatBurst())
    key('keydown', { key: 'ArrowDown', repeat: true })
    expect(result.current).toBe(true)
    key('keyup', { key: 'ArrowDown' })
    expect(result.current).toBe(false)
  })

  it('outra tecla encerra a rajada; repeat de tecla que não é seta não a inicia', () => {
    const { result } = renderHook(() => useKeyRepeatBurst())
    key('keydown', { key: 'Enter', repeat: true })
    expect(result.current).toBe(false)
    key('keydown', { key: 'ArrowRight', repeat: true })
    expect(result.current).toBe(true)
    key('keydown', { key: 'Enter', repeat: false })
    expect(result.current).toBe(false)
  })

  it('sem novo evento por KEY_REPEAT_QUIET_MS a rajada acaba sozinha (keyup perdido)', () => {
    const { result } = renderHook(() => useKeyRepeatBurst())
    key('keydown', { key: 'ArrowUp', repeat: true })
    act(() => {
      vi.advanceTimersByTime(KEY_REPEAT_QUIET_MS - 1)
    })
    expect(result.current).toBe(true)
    key('keydown', { key: 'ArrowUp', repeat: true }) // novo evento renova o silêncio
    act(() => {
      vi.advanceTimersByTime(KEY_REPEAT_QUIET_MS - 1)
    })
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(result.current).toBe(false)
  })

  it('blur da janela encerra a rajada', () => {
    const { result } = renderHook(() => useKeyRepeatBurst())
    key('keydown', { key: 'ArrowDown', repeat: true })
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(result.current).toBe(false)
  })

  it('enxerga a tecla mesmo quando um listener em captura no document a interrompe (Modal)', () => {
    const stop = (event: Event) => event.stopImmediatePropagation()
    document.addEventListener('keydown', stop, true)
    try {
      const { result } = renderHook(() => useKeyRepeatBurst())
      key('keydown', { key: 'ArrowDown', repeat: true }, document.body)
      expect(result.current).toBe(true)
    } finally {
      document.removeEventListener('keydown', stop, true)
    }
  })

  it('é só leitura: nunca chama preventDefault na tecla', () => {
    renderHook(() => useKeyRepeatBurst())
    const event = key('keydown', { key: 'ArrowDown', repeat: true })
    expect(event.defaultPrevented).toBe(false)
  })

  it('subscribeKeyRepeatBurst avisa cada borda de forma síncrona, sem depender de render', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeKeyRepeatBurst((fast) => seen.push(fast))
    key('keydown', { key: 'ArrowDown', repeat: true })
    expect(isKeyRepeatBurst()).toBe(true)
    key('keyup', { key: 'ArrowDown' })
    expect(seen).toEqual([true, false])
    unsubscribe()
    key('keydown', { key: 'ArrowDown', repeat: true })
    expect(seen).toEqual([true, false])
  })

  it('remove os listeners quando o último assinante sai', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useKeyRepeatBurst())
    expect(add).toHaveBeenCalledWith('keydown', expect.any(Function), expect.anything())
    unmount()
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), expect.anything())
    add.mockRestore()
    remove.mockRestore()
  })
})
