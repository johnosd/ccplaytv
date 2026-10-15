import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { dispatchNetwork, getNetworkState, useNetworkState } from './networkState'

let restoreOnLine: PropertyDescriptor | undefined
function setNavigatorOnLine(value: boolean) {
  restoreOnLine ??= Object.getOwnPropertyDescriptor(window.navigator, 'onLine')
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

afterEach(() => {
  if (restoreOnLine) Object.defineProperty(window.navigator, 'onLine', restoreOnLine)
  restoreOnLine = undefined
  act(() => {
    dispatchNetwork({ type: 'online' })
  })
  cleanup()
})

function Probe({ id }: { id: string }) {
  const { online, phase } = useNetworkState()
  return (
    <p data-testid={id}>
      {online ? 'online' : 'offline'}:{phase}
    </p>
  )
}

describe('store compartilhado do estado de rede (feature 042, FR-001, T048)', () => {
  it('dois consumidores veem o mesmo estado ao mesmo tempo (fonte única)', () => {
    setNavigatorOnLine(true)
    render(
      <>
        <Probe id="a" />
        <Probe id="b" />
      </>,
    )
    act(() => {
      setNavigatorOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('a')).toHaveTextContent('offline:offline')
    expect(screen.getByTestId('b')).toHaveTextContent('offline:offline')
  })

  it('verifying e suspenso/retomado são fases reais do app inteiro', () => {
    setNavigatorOnLine(true)
    render(<Probe id="a" />)
    act(() => {
      dispatchNetwork({ type: 'verify-start' })
    })
    expect(screen.getByTestId('a')).toHaveTextContent('online:verifying')
    act(() => {
      dispatchNetwork({ type: 'verify-done', ok: true })
      dispatchNetwork({ type: 'hidden' })
    })
    expect(screen.getByTestId('a')).toHaveTextContent('online:suspended')
    act(() => {
      dispatchNetwork({ type: 'visible' })
    })
    expect(screen.getByTestId('a')).toHaveTextContent('online:resumed')
  })

  it('assentado, navigator.onLine vence quando o evento se perdeu (TV que volta de standby)', () => {
    setNavigatorOnLine(true)
    act(() => {
      dispatchNetwork({ type: 'online' })
    })
    setNavigatorOnLine(false)
    expect(getNetworkState().online).toBe(false)
    expect(getNetworkState()).toBe(getNetworkState()) // idempotente
  })
})
