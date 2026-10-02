import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TopbarItem } from '../../navigation/appNav'
import { TopBar } from './TopBar'

vi.mock('../../lib/network/verifyNetwork', () => ({ verifyNetwork: vi.fn() }))
import { verifyNetwork } from '../../lib/network/verifyNetwork'

let restoreOnLine: PropertyDescriptor | undefined

function setNavigatorOnLine(value: boolean) {
  restoreOnLine ??= Object.getOwnPropertyDescriptor(window.navigator, 'onLine')
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

function Harness({ initial = 'home', onFocusItem }: { initial?: TopbarItem; onFocusItem?: (item: TopbarItem) => void }) {
  const [focused, setFocused] = useState<TopbarItem>(initial)
  return (
    <TopBar
      sourceName="Sala"
      active
      focusedItem={focused}
      onFocusItem={(item) => {
        onFocusItem?.(item)
        setFocused(item)
      }}
      onExitDown={vi.fn()}
      onNavigate={vi.fn()}
      onOpenProfiles={vi.fn()}
      onBack={vi.fn()}
    />
  )
}

function focusedLabel(): string | null {
  const el = document.querySelector('.tv-focus')
  return el ? (el.getAttribute('aria-label') ?? el.textContent) : null
}

beforeEach(() => {
  vi.mocked(verifyNetwork).mockReset()
})

afterEach(() => {
  if (restoreOnLine) Object.defineProperty(window.navigator, 'onLine', restoreOnLine)
  restoreOnLine = undefined
  cleanup()
})

describe('TopBar — "Tentar de novo" da conexão (feature 042, D-007)', () => {
  it('online: o item não existe e a ordem de foco termina em Configurações', () => {
    setNavigatorOnLine(true)
    render(<Harness initial="settings" />)
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).not.toBeInTheDocument()
    press('ArrowRight')
    expect(focusedLabel()).toBe('Configurações')
  })

  it('offline: o item é o ÚLTIMO da ordem e o controle remoto o alcança', () => {
    setNavigatorOnLine(false)
    render(<Harness initial="settings" />)
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument()
    press('ArrowRight')
    expect(focusedLabel()).toBe('Tentar de novo: verificar a conexão')
    press('ArrowRight')
    expect(focusedLabel()).toBe('Tentar de novo: verificar a conexão') // clamp na ponta
  })

  it('OK no item verifica a rede; sem rede o banner diz que continua sem conexão e o foco fica', async () => {
    setNavigatorOnLine(false)
    vi.mocked(verifyNetwork).mockResolvedValue(false)
    render(<Harness initial="connection" />)
    await act(async () => {
      press('Enter')
    })
    expect(verifyNetwork).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument()
    expect(focusedLabel()).toBe('Tentar de novo: verificar a conexão')
  })

  it('a rede volta com o foco no item: ele some e o foco cai em Início (nunca num item que sumiu)', () => {
    setNavigatorOnLine(false)
    const onFocusItem = vi.fn()
    render(<Harness initial="connection" onFocusItem={onFocusItem} />)
    act(() => {
      setNavigatorOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).not.toBeInTheDocument()
    expect(onFocusItem).toHaveBeenCalledWith('home')
    expect(focusedLabel()).toBe('Início')
  })
})
