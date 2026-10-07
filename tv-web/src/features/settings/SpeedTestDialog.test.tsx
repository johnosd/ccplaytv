import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeAppLanguage } from '../../lib/i18n/appLanguage'
import { findUnnamedControls } from '../../testing/accessibleNames'
import type { SpeedTestResult } from '../../lib/network/speedTest'
import { SpeedTestDialog } from './SpeedTestDialog'

const partial: SpeedTestResult = {
  version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000, downloadMbps: null, latencyMs: 10, jitterMs: 0,
  status: 'partial', reason: 'time_limit', durationMs: 30_000, requestedBytes: 1_000_009, receivedBytes: 1033, latencySamples: 8, downloadSamples: 0,
}
afterEach(() => { cleanup(); writeAppLanguage('pt') })

describe('SpeedTestDialog — dados e idiomas', () => {
  it('parcial mostra ausência, jitter zero medido, data/destino e aviso de guarda', () => {
    render(<SpeedTestDialog phase="result" result={partial} lastResult={null} storageUnavailable onStart={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Amostra insuficiente')).toBeInTheDocument()
    expect(screen.getByText('0 ms')).toBeInTheDocument()
    expect(screen.getByText('Resultado parcial')).toBeInTheDocument()
    expect(screen.getByText('Limite de 30 segundos atingido.')).toBeInTheDocument()
    expect(screen.getByText('Destino: Cloudflare')).toBeInTheDocument()
    expect(document.querySelector('time')).toHaveAttribute('datetime', new Date(partial.measuredAt).toISOString())
    expect(screen.getByText(/Armazenamento indisponível/)).toBeInTheDocument()
    expect(findUnnamedControls(document.body)).toEqual([])
    expect(document.body.textContent).not.toMatch(/4K|Ótima/)
  })

  it('pt/en/es preservam métricas, ações e foco ao trocar idioma', () => {
    const onClose = vi.fn()
    render(<SpeedTestDialog phase="ready" result={null} lastResult={partial} onStart={vi.fn()} onClose={onClose} />)
    for (const [locale, start, last] of [['pt', 'Iniciar teste', 'Último teste'], ['en', 'Start test', 'Last test'], ['es', 'Iniciar prueba', 'Última prueba']] as const) {
      act(() => writeAppLanguage(locale))
      expect(screen.getByRole('button', { name: start })).toHaveClass('tv-focus')
      expect(screen.getByText(last)).toBeInTheDocument()
      expect(screen.getByText('0 ms')).toBeInTheDocument()
      expect(findUnnamedControls(document.body)).toEqual([])
    }
    act(() => fireEvent.keyDown(document.body, { key: 'ArrowRight' }))
    act(() => fireEvent.keyDown(document.body, { key: 'Enter' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('impedimento tem Fechar e erro tem repetição manual/saída', () => {
    const props = { result: null, lastResult: null, onStart: vi.fn(), onClose: vi.fn() }
    const view = render(<SpeedTestDialog {...props} phase="blocked" error="playback_active" />)
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass('tv-focus')
    expect(screen.queryByRole('button', { name: 'Repetir teste' })).not.toBeInTheDocument()
    view.rerender(<SpeedTestDialog {...props} phase="error" error="rate_limited" />)
    expect(screen.getByRole('button', { name: 'Repetir teste' })).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })
})
