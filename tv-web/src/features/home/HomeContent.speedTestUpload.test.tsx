import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeContent, type HomeContentProps } from './HomeContent'
import { db } from '../../lib/catalog/db'
import type { SpeedTestResult } from '../../lib/network/speedTest'

afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await db.networkDiagnostics.clear() })

const withUpload: SpeedTestResult = {
  version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000, downloadMbps: 30, latencyMs: 20, jitterMs: 2,
  status: 'complete', reason: 'completed', durationMs: 7000, requestedBytes: 26_000_009, receivedBytes: 26_000_009,
  latencySamples: 8, downloadSamples: 3, uploadMbps: 12.5, uploadSamples: 3, uploadRequestedBytes: 26_000_000, uploadSentBytes: 26_000_000,
}

describe('dock de conexão — feature 064 não muda a Home', () => {
  it('com um resultado que tem upload, a dica do dock continua só com o download (decisão do usuário)', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    await db.networkDiagnostics.put({ ...withUpload, id: 'last' })
    const props: HomeContentProps = { sourceId: 'speedtest-up', initialFocus: { zone: 'dock', service: 'dock-speedtest' },
      onBack: vi.fn(), onNavigate: vi.fn(), onOpenItem: vi.fn(), onOpenChannel: vi.fn(), onOpenFavorites: vi.fn(),
      onPlay: vi.fn(), onOpenIntegrations: vi.fn() }
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={query}><HomeContent {...props} /></QueryClientProvider>)
    const dock = await screen.findByRole('button', { name: /Teste de conexão · 30 Mbps/ })
    expect(dock).toHaveClass('tv-focus')
    expect(dock.getAttribute('aria-label')).not.toMatch(/12[.,]5|upload/i)
    expect(document.querySelector('.home-dock-summary')?.textContent).not.toMatch(/12[.,]5|upload/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
