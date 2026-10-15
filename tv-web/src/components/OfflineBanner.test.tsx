import { afterEach, describe, expect, it } from 'vitest'
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
  // Feature 042 (D-007): o banner é só texto; a ação "Tentar de novo" vive na topbar.
  it('offline: aparece só como texto, sem botão; volta online: some sozinho', () => {
    setNavigatorOnLine(false)
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão com a internet.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    act(() => {
      setNavigatorOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('online desde o início: nunca aparece', () => {
    setNavigatorOnLine(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
