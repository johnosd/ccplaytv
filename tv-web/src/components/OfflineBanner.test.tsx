import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner'

let restoreOnLine: PropertyDescriptor | undefined

function setNavigatorOnLine(value: boolean) {
  restoreOnLine ??= Object.getOwnPropertyDescriptor(window.navigator, 'onLine')
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

afterEach(() => {
  if (restoreOnLine) Object.defineProperty(window.navigator, 'onLine', restoreOnLine)
  restoreOnLine = undefined
  cleanup()
})

describe('OfflineBanner', () => {
  it('offline: aparece com ação de testar conexão; volta online: some sozinho', () => {
    setNavigatorOnLine(false)
    render(<OfflineBanner onTestConnection={vi.fn()} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Testar conexão' })).toBeInTheDocument()

    act(() => {
      setNavigatorOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('online desde o início: nunca aparece', () => {
    setNavigatorOnLine(true)
    render(<OfflineBanner onTestConnection={vi.fn()} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
