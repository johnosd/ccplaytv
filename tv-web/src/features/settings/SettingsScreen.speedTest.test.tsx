import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from './SettingsScreen'
import { db } from '../../lib/catalog/db'
import { prefetchGate } from '../../lib/catalog/prefetch'
import type { SpeedTestResult } from '../../lib/network/speedTest'

function press(key: string) { act(() => fireEvent.keyDown(document.body, { key })) }
function mount(service?: 'speedtest') {
  const props = { activeSourceId: null, initialFocus: { zone: 'panel', tab: 'integrations', service } as const,
    onAddSource: vi.fn(), onEditSource: vi.fn(), onResyncStarted: vi.fn(), onSourceDeleted: vi.fn(), onBack: vi.fn() }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={query}><SettingsScreen {...props} /></QueryClientProvider>)
  return props
}
function open() { for (let i = 0; i < 3; i += 1) press('ArrowDown'); press('Enter') }
afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await db.networkDiagnostics.clear() })

describe('Configurações — teste de conexão sem fonte', () => {
  it('atalho do dock seleciona card por serviço, sem abrir diálogo nem medir', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    mount('speedtest')
    expect(screen.getByRole('button', { name: 'Abrir teste' })).toHaveClass('tv-focus')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchImpl).not.toHaveBeenCalled()
    press('Enter')
    expect(screen.getByRole('button', { name: 'Iniciar teste' })).toHaveClass('tv-focus')
  })
  it('foco/abertura só leem dados locais; RETURN fecha dialog e restaura card antes de sair', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const props = mount()
    open()
    expect(screen.getByRole('button', { name: 'Iniciar teste' })).toHaveClass('tv-focus')
    expect(fetchImpl).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }) })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'Teste de conexão' })).getByRole('button', { name: 'Abrir teste' })).toHaveClass('tv-focus')
    expect(props.onBack).not.toHaveBeenCalled()
    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('hold de reprodução bloqueia início, com Fechar focado, sem tocar fetch', async () => {
    const release = prefetchGate.acquirePlayback()
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    try {
      mount(); open(); press('Enter')
      expect(await screen.findByText('Encerre a reprodução antes de iniciar o teste.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass('tv-focus')
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally { release() }
  })

  it('falha total oferece repetir e conserva último resultado local', async () => {
    const last: SpeedTestResult = {
      version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000, downloadMbps: 30, latencyMs: 20, jitterMs: 2,
      status: 'complete', reason: 'completed', durationMs: 3500, requestedBytes: 26_000_009, receivedBytes: 26_000_009, latencySamples: 8, downloadSamples: 3,
    }
    await db.networkDiagnostics.put({ ...last, id: 'last' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('untrusted details') }))
    mount(); open()
    await screen.findByText('Último teste')
    press('Enter')
    expect(await screen.findByRole('button', { name: 'Repetir teste' })).toHaveClass('tv-focus')
    expect(await db.networkDiagnostics.get('last')).toEqual({ ...last, id: 'last' })
    expect(document.body.textContent).not.toContain('untrusted details')
  })
})
