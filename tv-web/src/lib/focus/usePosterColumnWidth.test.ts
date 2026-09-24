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

  it('sem contêiner anexado ainda, devolve 0 sem lançar e não tenta observar nada', () => {
    const { result } = renderHook(() => usePosterColumnWidth(6))

    expect(result.current.columnWidth).toBe(0)
    expect(observe).not.toHaveBeenCalled()
  })

  it('mede assim que o callback ref é chamado com um nó — mesmo que isso não aconteça na montagem', () => {
    // Reproduz o caso real (achado na TV física): o contêiner só passa a
    // existir depois que o conteúdo carrega, várias renderizações depois
    // da montagem do componente — nunca no primeiro render.
    const { result } = renderHook(() => usePosterColumnWidth(6))

    expect(observe).not.toHaveBeenCalled()

    const node = document.createElement('div')
    act(() => {
      result.current.setContainerRef(node)
    })

    expect(observe).toHaveBeenCalledWith(node)

    act(() => {
      observeCallback?.([{ contentRect: { width: 1200 } } as ResizeObserverEntry], {} as ResizeObserver)
    })

    expect(result.current.columnWidth).toBe(200)
  })

  it('trocar de nó desconecta o observer antigo antes de observar o novo', () => {
    const { result } = renderHook(() => usePosterColumnWidth(6))

    const first = document.createElement('div')
    act(() => result.current.setContainerRef(first))
    expect(observe).toHaveBeenCalledTimes(1)

    const second = document.createElement('div')
    act(() => result.current.setContainerRef(second))

    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledTimes(2)
    expect(observe).toHaveBeenLastCalledWith(second)
  })

  it('desanexar (nó null) desconecta o observer', () => {
    const { result } = renderHook(() => usePosterColumnWidth(6))

    const node = document.createElement('div')
    act(() => result.current.setContainerRef(node))
    act(() => result.current.setContainerRef(null))

    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('desconecta o observer ao desmontar o componente', () => {
    const { result, unmount } = renderHook(() => usePosterColumnWidth(6))

    const node = document.createElement('div')
    act(() => result.current.setContainerRef(node))
    unmount()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
