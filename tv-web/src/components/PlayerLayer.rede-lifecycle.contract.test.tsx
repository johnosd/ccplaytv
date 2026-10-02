/**
 * Contrato da feature 042 (rede, lifecycle e erros acionáveis) — comportamento
 * observável de `PlayerLayer`: reconexão automática limitada e retomada do
 * app oculto sem rede (`logic/rede-e-lifecycle.md` §3/§4).
 *
 * Fixa o botão "Tentar de novo" (rótulo do app, não "Tentar novamente"), o
 * texto "Reconectando…", o limite de 3 tentativas com `RECONNECT_DELAYS_MS`,
 * a retomada do VOD pela última posição e o colaborador `verifyNetwork`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import { RECONNECT_DELAYS_MS } from '../lib/player/reconnectPolicy'
import { verifyNetwork } from '../lib/network/verifyNetwork'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

vi.mock('../lib/network/verifyNetwork', () => ({ verifyNetwork: vi.fn() }))

/** Um adaptador por sessão aberta — reconectar cria uma sessão nova (a anterior fecha antes: AVPlay é singleton). */
interface AdapterEntry {
  callbacks: PlayerAdapterCallbacks
  startAtMs: number | undefined
  closeCount: number
  pauseCount: number
  resumeCount: number
}
let adapters: AdapterEntry[]

function fakeFactory(): PlayerAdapterFactory {
  adapters = []
  return (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    const entry: AdapterEntry = { callbacks, startAtMs: undefined, closeCount: 0, pauseCount: 0, resumeCount: 0 }
    adapters.push(entry)
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: (_url, _region, startAtMs) => {
        entry.startAtMs = startAtMs
      },
      close: () => {
        entry.closeCount += 1
      },
      pause: () => {
        entry.pauseCount += 1
      },
      resume: () => {
        entry.resumeCount += 1
      },
    }
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const MOVIE_PLAYBACK = {
  item_id: 'item-1',
  kind: 'movie' as const,
  url: 'http://usuario:senha@exemplo.invalid/movie/1.mp4',
  container_hint: 'mp4',
  source_id: 'src1',
  provider_stream_id: '1',
  original_name: 'Filme',
  series_id: null,
  season_number: null,
  episode_number: null,
}

const CONNECTION_FAILED = { code: 'PLAYER_ERROR_CONNECTION_FAILED' }

describe('PlayerLayer — rede e lifecycle (feature 042)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(verifyNetwork).mockReset()
    vi.mocked(verifyNetwork).mockResolvedValue(true)
    void userStateRepository
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  // US1/AC2, FR-008/FR-009/FR-010: 3 tentativas automáticas, VOD retoma da última posição, sem 4ª e sem laço.
  it('filme: reconecta sozinho até 3 vezes retomando da última posição; depois mostra "Tentar de novo" e para', async () => {
    vi.useFakeTimers()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE_PLAYBACK)
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={fakeFactory()} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(adapters).toHaveLength(1)

    act(() => adapters[0].callbacks.onStateChange('playing'))
    act(() => adapters[0].callbacks.onProgress?.({ positionMs: 42_000, durationMs: 600_000 }))
    act(() => adapters[0].callbacks.onError(CONNECTION_FAILED))

    expect(screen.getByText(/Reconectando/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()

    for (let i = 0; i < RECONNECT_DELAYS_MS.length; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[i])
      })
      expect(adapters).toHaveLength(i + 2)
      expect(adapters[i + 1].startAtMs).toBe(42_000) // nunca do zero
      act(() => adapters[i + 1].callbacks.onError(CONNECTION_FAILED))
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(adapters).toHaveLength(4) // a 4ª nunca vem sozinha
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByText(/Reconectando/)).toBeNull()
  })

  // US1/AC4, FR-006/FR-007: sem rede ao voltar, fica pausado, não confirma a URL e só libera o play depois da verificação.
  it('filme pausado ao ocultar: voltando sem rede NÃO retoma; "Tentar de novo" com rede reconfirma a URL e libera o play', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE_PLAYBACK)
    vi.mocked(verifyNetwork).mockResolvedValue(false)
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={fakeFactory()} />)
    await waitFor(() => expect(adapters).toHaveLength(1))
    act(() => adapters[0].callbacks.onStateChange('playing'))
    act(() => adapters[0].callbacks.onProgress?.({ positionMs: 30_000, durationMs: 600_000 }))

    setVisibility('hidden')
    expect(adapters[0].pauseCount).toBe(1)
    act(() => adapters[0].callbacks.onStateChange('paused'))

    setVisibility('visible')
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(verifyNetwork).toHaveBeenCalled()
    expect(catalogApi.fetchPlayback).toHaveBeenCalledTimes(1) // só a abertura: sem rede, nada de reconfirmar

    press('MediaPlay')
    expect(adapters[0].resumeCount).toBe(0) // pausado na mesma posição, não retoma sozinho

    vi.mocked(verifyNetwork).mockResolvedValue(true)
    await act(async () => {
      fireEvent.click(retry)
    })
    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledTimes(2)) // reconfirma a URL (feature 020)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull())

    press('MediaPlay')
    expect(adapters[0].resumeCount).toBe(1)
    expect(adapters).toHaveLength(1) // nunca uma segunda sessão
  })
})
