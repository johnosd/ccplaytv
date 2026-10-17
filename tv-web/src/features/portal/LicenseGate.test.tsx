import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LicenseGate } from './LicenseGate'

const fixture = vi.hoisted(() => ({
  allowed: false, listeners: new Set<() => void>(), denied: new Set<(sourceId?: string) => void>(),
  refresh: vi.fn(async (): Promise<{ ok: boolean; code?: string }> => ({ ok: true })),
}))
vi.mock('../../lib/licensing/licenseRuntime', () => ({ commercialBuild: true,
  licenseMonitor: {
    check: () => (fixture.allowed ? { allowed: true, reason: 'valid' } : { allowed: false, reason: 'expired' }),
    getSnapshot: () => ({ decision: { allowed: fixture.allowed, reason: 'expired' }, state: 'trial' }),
    subscribe: (listener: () => void) => { fixture.listeners.add(listener); return () => { fixture.listeners.delete(listener) } },
  },
  onListEntryDenied: (listener: (sourceId?: string) => void) => { fixture.denied.add(listener); return () => { fixture.denied.delete(listener) } },
}))
vi.mock('../../lib/portal/portalRuntime', () => ({ refreshPortal: fixture.refresh }))
afterEach(() => { cleanup(); fixture.allowed = false; fixture.listeners.clear(); fixture.denied.clear(); vi.clearAllMocks() })

function open(onResume = vi.fn()) {
  render(<LicenseGate onStop={vi.fn()} onResume={onResume} />)
  act(() => { for (const listener of fixture.denied) listener('lista-negada') })
  return onResume
}

// FR-007, US2/AC2: compra confirmada + Atualizar libera e retoma a entrada negada
it('Atualizar libera a licença, fecha o bloqueio e retoma a lista que foi negada', async () => {
  const onResume = open()
  expect(screen.getByRole('dialog', { name: 'Licença necessária para abrir a lista' })).toBeInTheDocument()
  expect(screen.getByText('Seu período de teste acabou')).toBeInTheDocument()
  fixture.refresh.mockImplementationOnce(async () => {
    fixture.allowed = true
    for (const listener of fixture.listeners) listener()
    return { ok: true }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  await waitFor(() => expect(onResume).toHaveBeenCalledWith('lista-negada'))
  expect(fixture.refresh).toHaveBeenCalledWith('license')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

// 073/US1, D-010, D-011: Comprar licença é a ação inicial, abre a tela de Pix (o bloqueio sai, um Modal por vez),
// Voltar devolve o foco a Comprar e o pagamento aprovado retoma a lista negada.
it('Comprar licença abre a tela de Pix; Voltar volta com foco em Comprar; aprovado retoma a lista negada', async () => {
  const charge = { orderId: 'pedido-1', state: 'pending' as const, qrCode: '000201fixture6304ABCD', expiresAt: 1_800_000,
    serverTime: 0, priceMinor: 3500 as const, termMonths: 12 as const }
  const purchase = {
    open: vi.fn(async () => charge),
    refresh: vi.fn(async () => {
      fixture.allowed = true
      for (const listener of fixture.listeners) listener()
      return { charge: { ...charge, state: 'approved' as const, qrCode: undefined }, licensed: true }
    }),
  }
  const onResume = vi.fn()
  render(<LicenseGate onStop={vi.fn()} onResume={onResume} purchase={purchase} />)
  act(() => { for (const listener of fixture.denied) listener('lista-negada') })
  expect(screen.getByRole('button', { name: 'Comprar licença' })).toHaveClass('tv-focus')
  expect(purchase.open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Comprar licença' }))
  expect(await screen.findByRole('dialog', { name: 'Comprar licença com Pix' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Licença necessária para abrir a lista' })).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
  expect(await screen.findByRole('dialog', { name: 'Licença necessária para abrir a lista' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Comprar licença' })).toHaveClass('tv-focus')
  fireEvent.click(screen.getByRole('button', { name: 'Comprar licença' }))
  await screen.findByText('000201fixture6304ABCD')
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  await waitFor(() => expect(onResume).toHaveBeenCalledWith('lista-negada'), { timeout: 3000 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

// US2/AC3: nenhuma compra confirmada mantém o bloqueio, com o estado visível e os botões focáveis
it('sem compra: o bloqueio permanece, explica e não retoma a entrada', async () => {
  const onResume = open()
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  expect(await screen.findByText('Ainda não encontramos uma licença ativa para esta TV.', {}, { timeout: 4000 })).toBeInTheDocument()
  expect(onResume).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
})
