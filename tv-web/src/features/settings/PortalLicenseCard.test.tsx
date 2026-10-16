import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { LicenseSnapshot } from '../../lib/licensing/licenseMonitor'
import { PortalLicenseCard } from './PortalLicenseCard'

afterEach(cleanup)
const idle = { status: 'idle', paused: false, run: vi.fn() } as never
const soon = Date.now() + 86400000
const snapshot = (value: Partial<LicenseSnapshot>) => ({ decision: { allowed: true }, ...value }) as LicenseSnapshot

it('mostra estado, validade, oferta, Comprar licença e Atualizar — e nada do código de recuperação', () => {
  const { container } = render(<PortalLicenseCard license={snapshot({ state: 'trial', expiresAt: soon })} refresh={idle} connected onSelect={vi.fn()} />)
  expect(screen.getByRole('heading', { name: 'Licença' })).toBeInTheDocument()
  expect(screen.getByText('Licença: Período de teste')).toBeInTheDocument()
  expect(screen.getByText(/Validade até:/)).toBeInTheDocument()
  expect(screen.getByText(/R\$ 35 por 12 meses/)).toBeInTheDocument()
  expect(Array.from(container.querySelectorAll('button')).map(button => button.textContent)).toEqual(['Comprar licença', 'Atualizar'])
  expect(container.textContent).not.toMatch(/••••|código/i)
})

it('com licença ativa o botão de compra diz Renovar licença; vencida mostra o estado vencida', () => {
  const { rerender } = render(<PortalLicenseCard license={snapshot({ state: 'active', expiresAt: soon })} refresh={idle} connected onSelect={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Renovar licença' })).toBeInTheDocument()
  rerender(<PortalLicenseCard license={{ decision: { allowed: false, reason: 'expired' }, state: 'trial' } as LicenseSnapshot} refresh={idle} connected onSelect={vi.fn()} />)
  expect(screen.getByText('Licença: Licença vencida')).toBeInTheDocument()
})

it('cada botão chama onSelect com o seu id e Comprar fica soft-disabled sem conexão', () => {
  const onSelect = vi.fn()
  render(<PortalLicenseCard license={snapshot({ state: 'trial' })} refresh={idle} connected={false} onSelect={onSelect} focusedId="refresh" />)
  expect(screen.getByRole('button', { name: 'Comprar licença' })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveClass('tv-focus')
  fireEvent.click(screen.getByRole('button', { name: 'Comprar licença' }))
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  expect(onSelect.mock.calls).toEqual([['purchase'], ['refresh']])
})
