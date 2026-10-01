import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourcesPanel } from './SourcesPanel'
import type { SourceOut } from '../import/importApi'
import { findUnnamedControls } from '../../testing/accessibleNames'

function withQuery({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const DAY = 24 * 60 * 60 * 1000
const noon = (daysFromNow: number) => {
  const d = new Date(Date.now() + daysFromNow * DAY)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}

function makeSource(id: string, overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id,
    type: 'provider_credentials',
    display_name: `Lista ${id}`,
    connection_state: 'synced',
    last_successful_sync_at: '2026-09-20T12:00:00.000Z',
    provider_import_mode: 'xtream_api',
    limited_reason: null,
    provider_dns: 'http://painel.exemplo.test',
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

function renderPanel(sources: SourceOut[]) {
  return render(<SourcesPanel
      sources={sources}
      activeSourceId={null}
      focusedCol={0}
      resyncPending={false}
      deletePending={false}
      onActivateRow={vi.fn()}
    />, { wrapper: withQuery })
}

afterEach(cleanup)

const row = (id: string) => screen.getByRole('group', { name: `Lista Lista ${id}` })

describe('SourcesPanel — conta da lista (feature 034, US1)', () => {
  it('vencimento longe: "Conta válida até …" e nenhum chip', () => {
    renderPanel([makeSource('a', { account: { status: 'active', expiresAt: noon(60), checkedAt: Date.now() } })])
    expect(within(row('a')).getByText(/^Conta válida até \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument()
    expect(row('a').querySelector('.sources-panel-chip')).toBeNull()
  })

  it('vence em 3 dias: texto e chip âmbar com o rótulo', () => {
    renderPanel([makeSource('a', { account: { status: 'active', expiresAt: noon(3), checkedAt: Date.now() } })])
    const chip = within(row('a')).getByText('Vence em 3 dias')
    expect(chip).toHaveClass('sources-panel-chip--warning')
    expect(within(row('a')).getByText(/^Conta válida até/)).toBeInTheDocument()
  })

  it('expirada: chip de erro "Conta expirada" e o texto com a data', () => {
    renderPanel([makeSource('a', { account: { status: 'active', expiresAt: noon(-2), checkedAt: Date.now() } })])
    expect(within(row('a')).getByText('Conta expirada')).toHaveClass('sources-panel-chip--error')
    expect(within(row('a')).getByText(/^Conta expirada em \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument()
  })

  it('sem data: "Sem data de vencimento", sem chip', () => {
    renderPanel([makeSource('a', { account: { status: 'active', expiresAt: null, checkedAt: Date.now() } })])
    expect(within(row('a')).getByText('Sem data de vencimento')).toBeInTheDocument()
    expect(row('a').querySelector('.sources-panel-chip')).toBeNull()
  })

  it('M3U avulsa e Modo limitado não mostram nada de conta (FR-022), e o estado do EPG continua como estava (FR-023)', () => {
    renderPanel([
      makeSource('m3u', { type: 'm3u_url', provider_import_mode: null, account: { status: 'refused', checkedAt: 1 } }),
      makeSource('lim', { provider_import_mode: 'legacy_m3u', limited_reason: 'protocol_unavailable', account: { status: 'refused', checkedAt: 1 } }),
    ])
    expect(screen.queryByText(/Credencial inválida|Conta/)).not.toBeInTheDocument()
    expect(within(row('m3u')).getByText('EPG não configurado')).toBeInTheDocument()
  })

  it('nenhum endereço, usuário ou senha na linha, e todo controle tem nome', () => {
    const { container } = renderPanel([makeSource('a', { account: { status: 'refused', checkedAt: 1 } })])
    expect(within(row('a')).getByText('Credencial inválida', { selector: '.sources-panel-chip' })).toBeInTheDocument()
    const everything = container.innerHTML
    expect(everything).not.toMatch(/painel\.exemplo|senha|usuario/i)
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})
