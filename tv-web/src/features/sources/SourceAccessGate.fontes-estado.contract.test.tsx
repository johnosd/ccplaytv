import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceAccessGate } from './SourceAccessGate'
import type { SourceOut } from '../import/importApi'

afterEach(cleanup)

const EXPIRED_AT = new Date(2026, 8, 20, 12).getTime() // 20/09/2026

const SOURCE: SourceOut = {
  id: 'src-xtream',
  type: 'provider_credentials',
  display_name: 'Lista da sala',
  connection_state: 'synced',
  last_successful_sync_at: '2026-09-20T12:00:00.000Z',
  provider_import_mode: 'xtream_api',
  limited_reason: null,
  provider_dns: 'painel.exemplo.test',
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
  account: { status: 'active', expiresAt: EXPIRED_AT, checkedAt: EXPIRED_AT },
}

function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('Tela de acesso à lista — contrato da feature 034', () => {
  // US2 AC1/AC2/AC5; FR-010, FR-011, FR-012, FR-013; Constitution: foco sem beco, segredo fora da tela
  it('lista vencida mostra o motivo com a data, foca "Editar lista", reconsulta em "Verificar de novo" e volta com RETURN', async () => {
    const onOpen = vi.fn()
    const onEdit = vi.fn()
    const onBack = vi.fn()
    const checkAccount = vi.fn().mockResolvedValue({
      fresh: true,
      account: { status: 'active', expiresAt: new Date(2026, 11, 1).getTime(), checkedAt: Date.now() },
    })

    const view = render(
      <SourceAccessGate
        source={SOURCE}
        decision={{ action: 'blocked', reason: 'expired', expiresAt: EXPIRED_AT }}
        onOpen={onOpen}
        onEdit={onEdit}
        onBack={onBack}
        checkAccount={checkAccount}
      />,
      { wrapper },
    )

    expect(screen.getByText(/venceu em 20\/09\/2026/)).toBeInTheDocument()
    const edit = screen.getByRole('button', { name: 'Editar lista' })
    expect(edit).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    // Nenhum dado de conexão na tela (constitution, "Segredos Fora dos Clientes e dos Logs").
    expect(view.container.textContent).not.toContain('painel.exemplo.test')

    press('Escape')
    expect(onBack).toHaveBeenCalledTimes(1)

    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toHaveClass('tv-focus')
    await act(async () => {
      press('Enter')
    })
    expect(checkAccount).toHaveBeenCalledWith('src-xtream')
    expect(onOpen).toHaveBeenCalledWith(SOURCE)
    expect(onEdit).not.toHaveBeenCalled()
  })
})
