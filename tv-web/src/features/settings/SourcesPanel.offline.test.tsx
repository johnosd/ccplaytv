import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SourcesPanel } from './SourcesPanel'
import type { SourceOut } from '../import/importApi'

afterEach(cleanup)

const SOURCE = {
  id: 'fonte-1',
  display_name: 'Sala',
  type: 'provider_credentials',
  connection_state: 'synced',
  provider_import_mode: 'on_demand',
} as unknown as SourceOut

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

describe('SourcesPanel — Ressincronizar sem conexão (feature 042, FR-004)', () => {
  it('offline: soft disabled, com o motivo no nome acessível, e continua ativável para explicar', () => {
    const onActivateRow = vi.fn()
    render(
      wrap(
        <SourcesPanel
          sources={[SOURCE]}
          activeSourceId={null}
          focusedCol={1}
          resyncPending={false}
          deletePending={false}
          offline
          onActivateRow={onActivateRow}
        />,
      ),
    )
    const button = screen.getByRole('button', { name: /Ressincronizar, indisponível sem conexão/ })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveClass('is-soft-disabled')
    fireEvent.click(button)
    expect(onActivateRow).toHaveBeenCalledWith('fonte-1', 1)
  })

  it('online: sem marcação de indisponível', () => {
    render(
      wrap(
        <SourcesPanel
          sources={[SOURCE]}
          activeSourceId={null}
          focusedCol={0}
          resyncPending={false}
          deletePending={false}
          onActivateRow={vi.fn()}
        />,
      ),
    )
    const button = screen.getByRole('button', { name: 'Ressincronizar' })
    expect(button).not.toHaveAttribute('aria-disabled')
  })
})
