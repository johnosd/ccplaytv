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

// US2/AC3: nenhuma compra confirmada mantém o bloqueio, com o estado visível e os botões focáveis
it('sem compra: o bloqueio permanece, explica e não retoma a entrada', async () => {
  const onResume = open()
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  expect(await screen.findByText('Ainda não encontramos uma licença ativa para esta TV.', {}, { timeout: 4000 })).toBeInTheDocument()
  expect(onResume).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
})
