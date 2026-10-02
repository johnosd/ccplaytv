import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useOverflowEdges, type OverflowEdges } from './useOverflowEdges'

let seen: OverflowEdges[] = []
let rerender: (count: number) => void = () => {}

function Probe({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const edges = useOverflowEdges(ref, count)
  seen.push(edges)
  return <div ref={ref} data-testid="scroller" data-above={edges.above} data-below={edges.below} />
}

function setup(metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  seen = []
  const view = render(<Probe count={1} />)
  const el = view.getByTestId('scroller')
  const state = { ...metrics }
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => state.scrollTop, set: (v) => (state.scrollTop = v) })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => state.clientHeight })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => state.scrollHeight })
  rerender = (count) => view.rerender(<Probe count={count} />)
  // Mede de novo, agora que o elemento tem métricas.
  act(() => rerender(2))
  return { el, state }
}

const edges = (el: HTMLElement) => `${el.dataset.above}/${el.dataset.below}`

afterEach(cleanup)

describe('useOverflowEdges', () => {
  it('lista que cabe: nenhum lado', () => {
    const { el } = setup({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })
    expect(edges(el)).toBe('false/false')
  })

  it('topo de uma lista longa: só "below"', () => {
    const { el } = setup({ scrollTop: 0, clientHeight: 500, scrollHeight: 2000 })
    expect(edges(el)).toBe('false/true')
  })

  it('meio: ambos; fim: só "above"', () => {
    const { el, state } = setup({ scrollTop: 0, clientHeight: 500, scrollHeight: 2000 })
    state.scrollTop = 600
    act(() => {
      el.dispatchEvent(new Event('scroll'))
    })
    expect(edges(el)).toBe('true/true')

    state.scrollTop = 1500
    act(() => {
      el.dispatchEvent(new Event('scroll'))
    })
    expect(edges(el)).toBe('true/false')
  })

  it('só re-renderiza quando algum lado muda', () => {
    const { el, state } = setup({ scrollTop: 0, clientHeight: 500, scrollHeight: 2000 })
    const before = seen.length
    state.scrollTop = 5 // continua em "meio"? não: above vira true uma vez
    act(() => {
      el.dispatchEvent(new Event('scroll'))
    })
    const afterFirst = seen.length
    expect(afterFirst).toBeGreaterThan(before)
    state.scrollTop = 20 // mesmos lados (true/true): nenhum render novo
    act(() => {
      el.dispatchEvent(new Event('scroll'))
    })
    expect(seen.length).toBe(afterFirst)
  })

  it('muda a quantidade de itens (deps): recalcula', () => {
    const { el, state } = setup({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })
    expect(edges(el)).toBe('false/false')
    state.scrollHeight = 3000
    act(() => rerender(3))
    expect(edges(el)).toBe('false/true')
  })
})
