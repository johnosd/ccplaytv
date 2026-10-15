import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory, QualityOption } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

interface Fake {
  callbacks: PlayerAdapterCallbacks
  qualityCalls: (string | null)[]
}
let sessions: Fake[]
let current: QualityOption[]
let accept: boolean

function factory(): PlayerAdapterFactory {
  sessions = []
  return (callbacks) => {
    const s: Fake = { callbacks, qualityCalls: [] }
    sessions.push(s)
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {},
      pause: () => {},
      resume: () => {},
      seekTo: (_ms, done) => done(),
      jumpBy: (_ms, done) => done(),
      getQualities: () => current.map((q) => ({ ...q })),
      selectQuality: (id) => {
        s.qualityCalls.push(id)
        return accept
      },
    }
    return adapter
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function playback(kind: 'channel' | 'movie') {
  return {
    item_id: 'item-1',
    kind,
    url: 'http://exemplo.invalid/x',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: 'item-1',
    original_name: 'Item',
    series_id: null,
    season_number: null,
    episode_number: null,
  }
}

async function startPlaying() {
  await waitFor(() => expect(sessions[0]).toBeDefined())
  act(() => sessions[0].callbacks.onStateChange('playing'))
}

/** ⏪ ▶⏸ ⏩ Áudio Qualidade — três passos à direita de ▶⏸ (filme). */
async function openQualityPanel() {
  await startPlaying()
  for (let i = 0; i < 3; i += 1) press('ArrowRight')
  press('Enter')
}

describe('PlayerLayer — qualidade: casos de borda (feature 041)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playback('movie'))
    current = [
      { id: 'v0', height: 1080 },
      { id: 'v1', height: 720 },
    ]
    accept = true
  })
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('falha na troca: aviso curto, segue na anterior e a marcação não muda (FR-007)', async () => {
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory()} />)
    await openQualityPanel()
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true')
    accept = false
    press('ArrowDown')
    press('Enter') // 1080p — o motor recusa
    expect(screen.getByText('Não foi possível mudar a qualidade.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '1080p' })).toHaveAttribute('aria-checked', 'false')
  })

  it('a variante escolhida some do stream: cai para Auto sem contar como escolha da pessoa', async () => {
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory()} />)
    await openQualityPanel()
    press('ArrowDown')
    press('Enter') // 1080p aceito
    expect(screen.getByRole('radio', { name: '1080p' })).toHaveAttribute('aria-checked', 'true')

    current = [
      { id: 'v1', height: 720 },
      { id: 'v2', height: 480 },
    ]
    // A releitura do painel aberto é de 1 s (usePanelRefresh); espera-a em tempo real.
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true'), { timeout: 3000 })
    expect(sessions[0].qualityCalls.at(-1)).toBeNull()
  })

  it('preferência "Máxima" numa sequência com altura não anunciada na sessão nova vira Auto, sem chamar o motor', async () => {
    window.localStorage.setItem('ccplaytv:player-preferences', JSON.stringify({ quality: 'max' }))
    current = [{ id: 'v0', height: 720 }] // uma só: a regra devolve null
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory()} />)
    await startPlaying()
    expect(sessions[0].qualityCalls).toEqual([])
  })

  it('canal ao vivo: ←/→ chegam em "Qualidade" real quando o stream anuncia variantes', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playback('channel'))
    render(<PlayerLayer itemId="item-1" title="Canal" onClose={vi.fn()} createAdapter={factory()} />)
    await startPlaying()
    for (let i = 0; i < 3; i += 1) press('ArrowRight') // Guia → Áudio → Qualidade
    expect(screen.getByRole('button', { name: 'Qualidade' })).toHaveClass('tv-focus')
  })
})
