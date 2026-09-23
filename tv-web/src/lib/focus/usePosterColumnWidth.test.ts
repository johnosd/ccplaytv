import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePosterColumnWidth } from './usePosterColumnWidth'

describe('usePosterColumnWidth (feature 009, logic/virtualizacao-foco.md §5, research.md R0-2)', () => {
  let observeCallback: ResizeObserverCallback | undefined
  let disconnect: ReturnType<typeof vi.fn>
  let observe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    observeCallback = undefined
    disconnect = vi.fn()
    observe = vi.fn()

    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        observeCallback = callback
      }
      observe = observe
      unobserve = vi.fn()
      disconnect = disconnect
    }

    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sem medição ainda (ResizeObserver não disparou), devolve 0 sem lançar', () => {
    const containerRef = { current: document.createElement('div') }

    const { result } = renderHook(() => usePosterColumnWidth(containerRef, 6))

    expect(result.current).toBe(0)
    expect(observe).toHaveBeenCalledWith(containerRef.current)
  })

  it('divide a largura medida do contêiner pelo número de colunas', () => {
    const containerRef = { current: document.createElement('div') }

    const { result } = renderHook(() => usePosterColumnWidth(containerRef, 6))

    act(() => {
      observeCallback?.(
        [{ contentRect: { width: 1200 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      )
    })

    expect(result.current).toBe(200)
  })

  it('desconecta o observer ao desmontar', () => {
    const containerRef = { current: document.createElement('div') }

    const { unmount } = renderHook(() => usePosterColumnWidth(containerRef, 6))
    unmount()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('sem contêiner montado ainda, não tenta observar nada', () => {
    const containerRef = { current: null }

    renderHook(() => usePosterColumnWidth(containerRef, 6))

    expect(observe).not.toHaveBeenCalled()
  })
})
