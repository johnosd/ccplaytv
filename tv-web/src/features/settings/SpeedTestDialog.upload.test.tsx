import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeAppLanguage } from '../../lib/i18n/appLanguage'
import { findUnnamedControls } from '../../testing/accessibleNames'
import type { SpeedTestResult } from '../../lib/network/speedTest'
import { SpeedTestDialog } from './SpeedTestDialog'

const result: SpeedTestResult = {
  version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000, downloadMbps: 30, latencyMs: 20, jitterMs: 2,
  status: 'complete', reason: 'completed', durationMs: 7000, requestedBytes: 26_000_009, receivedBytes: 26_000_009,
  latencySamples: 8, downloadSamples: 3, uploadMbps: 12.5, uploadSamples: 3, uploadRequestedBytes: 26_000_000, uploadSentBytes: 26_000_000,
}
afterEach(() => { cleanup(); writeAppLanguage('pt') })

describe('SpeedTestDialog — upload (feature 064)', () => {
  it('na etapa de upload mostra "Medindo upload…" e os MB enviados, com Cancelar focado', () => {
    render(<SpeedTestDialog phase="running" result={null} lastResult={null}
      progress={{ stage: 'upload', elapsedMs: 4200, requestedBytes: 26_000_009, receivedBytes: 26_000_009, sentBytes: 6_000_000 }}
      onStart={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Medindo upload…')).toBeInTheDocument()
    expect(screen.getByText('4,2 s · 6 MB enviados')).toBeInTheDocument()
    expect(screen.queryByText(/MB recebidos/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
  })

  it('no download continua mostrando os MB recebidos', () => {
    render(<SpeedTestDialog phase="running" result={null} lastResult={null}
      progress={{ stage: 'download', elapsedMs: 1000, requestedBytes: 6_000_009, receivedBytes: 3_000_000 }} onStart={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Medindo download…')).toBeInTheDocument()
    expect(screen.getByText('1 s · 3 MB recebidos')).toBeInTheDocument()
  })

  it('o resultado traz as quatro métricas e o aviso do novo teto, com as mesmas ações da 062', () => {
    render(<SpeedTestDialog phase="result" result={result} lastResult={null} onStart={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Upload').nextSibling).toHaveTextContent('12,5 Mbps')
    expect(screen.getByText('Resultado completo')).toBeInTheDocument()
    expect(screen.getByText(/Até 60 segundos ou 150 MB/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Repetir teste' })).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
    expect(findUnnamedControls(document.body)).toEqual([])
  })

  it('o último resultado antigo (sem upload) aparece com o upload "não medido"', () => {
    const { uploadMbps: _omit, ...legacy } = result
    void _omit
    render(<SpeedTestDialog phase="ready" result={null} lastResult={legacy} onStart={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Último teste')).toBeInTheDocument()
    expect(screen.getByText('Upload').nextSibling).toHaveTextContent('Não medido neste teste')
    expect(screen.getByRole('button', { name: 'Iniciar teste' })).toHaveClass('tv-focus')
  })
})
