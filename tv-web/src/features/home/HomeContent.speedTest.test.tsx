import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeContent, type HomeContentProps } from './HomeContent'
import { db } from '../../lib/catalog/db'
import { LAST_SPEED_TEST_QUERY_KEY } from '../../lib/network/useLastSpeedTest'
import type { SpeedTestResult } from '../../lib/network/speedTest'

afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await db.networkDiagnostics.clear() })
const last: SpeedTestResult = { version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000,
  downloadMbps: 30, latencyMs: 20, jitterMs: 2, status: 'complete', reason: 'completed', durationMs: 3500,
  requestedBytes: 26_000_009, receivedBytes: 26_000_009, latencySamples: 8, downloadSamples: 3 }

describe('dock de conexão — leitura local global', () => {
  it('restaura serviço por id, encaminha SELECT, atualiza resumo salvo e mantém resumo ao trocar lista', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const props: HomeContentProps = { sourceId: 'speedtest-a', initialFocus: { zone: 'dock', service: 'dock-speedtest' },
      onBack: vi.fn(), onNavigate: vi.fn(), onOpenItem: vi.fn(), onOpenChannel: vi.fn(), onOpenFavorites: vi.fn(),
      onPlay: vi.fn(), onOpenIntegrations: vi.fn() }
    const view = (sourceId: string) => <QueryClientProvider client={query}><HomeContent {...props} sourceId={sourceId} /></QueryClientProvider>
    const { rerender } = render(view('speedtest-a'))
    const dock = await screen.findByRole('button', { name: 'Teste de conexão · Nenhum teste salvo' })
    expect(dock).toHaveClass('tv-focus')
    expect(dock).not.toHaveAttribute('aria-disabled', 'true')
    act(() => fireEvent.keyDown(document.body, { key: 'Enter' }))
    expect(props.onOpenIntegrations).toHaveBeenCalledWith({ zone: 'dock', service: 'dock-speedtest' })
    await db.networkDiagnostics.put({ ...last, id: 'last' })
    await act(async () => { await query.invalidateQueries({ queryKey: LAST_SPEED_TEST_QUERY_KEY }) })
    expect(await screen.findByRole('button', { name: /Teste de conexão · 30 Mbps/ })).toHaveClass('tv-focus')
    rerender(view('speedtest-b'))
    await waitFor(() => expect(screen.getByRole('button', { name: /Teste de conexão · 30 Mbps/ })).toHaveClass('tv-focus'))
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
