import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from './SettingsScreen'
import { db } from '../../lib/catalog/db'
import type { SpeedTestResult } from '../../lib/network/speedTest'

function mount() {
  const props = { activeSourceId: null, initialFocus: { zone: 'panel', tab: 'integrations', service: 'speedtest' } as const,
    onAddSource: vi.fn(), onEditSource: vi.fn(), onResyncStarted: vi.fn(), onSourceDeleted: vi.fn(), onBack: vi.fn() }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={query}><SettingsScreen {...props} /></QueryClientProvider>)
}

const LAST: SpeedTestResult = {
  version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000, downloadMbps: 87.6, latencyMs: 21, jitterMs: 2.5,
  status: 'complete', reason: 'completed', durationMs: 3500, requestedBytes: 26_000_009, receivedBytes: 26_000_009, latencySamples: 8, downloadSamples: 3,
}

afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await db.networkDiagnostics.clear() })

describe('Configurações — card do teste de conexão mostra o último resultado salvo', () => {
  it('download, latência e jitter do último teste aparecem no card, sem abrir o diálogo nem medir', async () => {
    await db.networkDiagnostics.put({ ...LAST, id: 'last' })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    mount()
    const card = screen.getByRole('region', { name: 'Teste de conexão' })
    const metrics = await within(card).findByLabelText('Último teste')
    expect(within(metrics).getByText('Download').nextSibling).toHaveTextContent('87,6 Mbps')
    expect(within(metrics).getByText('Latência HTTP').nextSibling).toHaveTextContent('21 ms')
    expect(within(metrics).getByText('Jitter').nextSibling).toHaveTextContent('2,5 ms')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('resultado parcial mostra "Amostra insuficiente" no que não foi medido, nunca um número inventado', async () => {
    await db.networkDiagnostics.put({ ...LAST, downloadMbps: null, status: 'partial', reason: 'time_limit', downloadSamples: 0, id: 'last' })
    mount()
    const metrics = await within(screen.getByRole('region', { name: 'Teste de conexão' })).findByLabelText('Último teste')
    expect(within(metrics).getByText('Download').nextSibling).toHaveTextContent('Amostra insuficiente')
    expect(within(metrics).getByText('Latência HTTP').nextSibling).toHaveTextContent('21 ms')
  })

  it('feature 064: o card mostra o upload, "não medido" no resultado antigo e "amostra insuficiente" no upload tentado sem amostra', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const withUpload = { ...LAST, uploadMbps: 12.5, uploadSamples: 3, uploadRequestedBytes: 26_000_000, uploadSentBytes: 26_000_000 }
    await db.networkDiagnostics.put({ ...withUpload, id: 'last' })
    mount()
    const card = screen.getByRole('region', { name: 'Teste de conexão' })
    let metrics = await within(card).findByLabelText('Último teste')
    expect(within(metrics).getByText('Upload').nextSibling).toHaveTextContent('12,5 Mbps')
    cleanup()

    // Resultado de antes da feature (sem os campos de upload): continua visível, com o upload "não medido".
    await db.networkDiagnostics.put({ ...LAST, id: 'last' })
    mount()
    metrics = await within(screen.getByRole('region', { name: 'Teste de conexão' })).findByLabelText('Último teste')
    expect(within(metrics).getByText('Upload').nextSibling).toHaveTextContent('Não medido neste teste')
    expect(within(metrics).getByText('Download').nextSibling).toHaveTextContent('87,6 Mbps')
    cleanup()

    // Upload tentado sem amostra: diferente de "não medido", e nunca zero.
    await db.networkDiagnostics.put({ ...withUpload, uploadMbps: null, uploadSamples: 0, uploadSentBytes: 0, status: 'partial', reason: 'measurement_error', id: 'last' })
    mount()
    metrics = await within(screen.getByRole('region', { name: 'Teste de conexão' })).findByLabelText('Último teste')
    expect(within(metrics).getByText('Upload').nextSibling).toHaveTextContent('Amostra insuficiente')
    expect(metrics.textContent).not.toMatch(/\b0 Mbps/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sem teste salvo o card diz isso e não mostra métricas', async () => {
    mount()
    const card = screen.getByRole('region', { name: 'Teste de conexão' })
    expect(await within(card).findByText('Nenhum teste salvo neste aparelho.')).toBeInTheDocument()
    expect(within(card).queryByText('Download')).not.toBeInTheDocument()
  })
})
