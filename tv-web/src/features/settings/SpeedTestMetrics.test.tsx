import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { writeAppLanguage } from '../../lib/i18n/appLanguage'
import type { SpeedTestResult } from '../../lib/network/speedTest'
import { SpeedTestMetrics } from './SpeedTestMetrics'

const complete: SpeedTestResult = {
  version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000, downloadMbps: 81.1, latencyMs: 91.4, jitterMs: 2.5,
  status: 'complete', reason: 'completed', durationMs: 7000, requestedBytes: 26_000_009, receivedBytes: 26_000_009,
  latencySamples: 8, downloadSamples: 3, uploadMbps: 12.5, uploadSamples: 3, uploadRequestedBytes: 26_000_000, uploadSentBytes: 26_000_000,
}
const { uploadMbps: _unused, ...legacy } = complete
void _unused

afterEach(() => { cleanup(); writeAppLanguage('pt') })

describe('SpeedTestMetrics — as quatro métricas (feature 064)', () => {
  it('mostra download, upload, latência e jitter com unidade', () => {
    render(<SpeedTestMetrics result={complete} />)
    expect(screen.getByText('Download').nextSibling).toHaveTextContent('81,1 Mbps')
    expect(screen.getByText('Upload').nextSibling).toHaveTextContent('12,5 Mbps')
    expect(screen.getByText('Latência HTTP').nextSibling).toHaveTextContent('91,4 ms')
    expect(screen.getByText('Jitter').nextSibling).toHaveTextContent('2,5 ms')
  })

  it('upload tentado sem amostra é "Amostra insuficiente"; resultado antigo é "Não medido neste teste"; nunca zero', () => {
    const { rerender } = render(<SpeedTestMetrics result={{ ...complete, uploadMbps: null, uploadSamples: 0, status: 'partial' }} />)
    expect(screen.getByText('Upload').nextSibling).toHaveTextContent('Amostra insuficiente')
    rerender(<SpeedTestMetrics result={legacy} />)
    expect(screen.getByText('Upload').nextSibling).toHaveTextContent('Não medido neste teste')
    expect(document.body.textContent).not.toMatch(/\b0 Mbps/)
  })

  it('pt/en/es traduzem os rótulos e os estados sem alterar os valores', () => {
    render(<SpeedTestMetrics result={legacy} />)
    for (const [locale, upload, notMeasured] of [['en', 'Upload', 'Not measured in this test'], ['es', 'Subida', 'No medido en esta prueba']] as const) {
      act(() => writeAppLanguage(locale))
      expect(screen.getByText(upload).nextSibling).toHaveTextContent(notMeasured)
      expect(screen.getByText(/81[.,]1 Mbps/)).toBeInTheDocument()
    }
  })

  it('usa o rótulo acessível quando recebe um', () => {
    render(<SpeedTestMetrics result={complete} label="Último teste" />)
    expect(screen.getByLabelText('Último teste')).toBeInTheDocument()
  })
})
