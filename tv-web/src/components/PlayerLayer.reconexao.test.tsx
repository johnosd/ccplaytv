/**
 * Feature 042, testes da fase (além dos contratos): bordas da reconexão
 * automática e do gate da retomada (`logic/rede-e-lifecycle.md` §3/§4).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import { RECONNECT_DELAYS_MS, RECONNECT_STABLE_MS } from '../lib/player/reconnectPolicy'
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

interface AdapterEntry {
  callbacks: PlayerAdapterCallbacks
  startAtMs: number | undefined
  pauseCount: number
  jumps: number[]
}
let adapters: AdapterEntry[]

function fakeFactory(): PlayerAdapterFactory {
  adapters = []
  return (callbacks) => {
    const entry: AdapterEntry = { callbacks, startAtMs: undefined, pauseCount: 0, jumps: [] }
    adapters.push(entry)
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: (_url, _region, startAtMs) => {
        entry.startAtMs = startAtMs
      },
      close: () => {},
      pause: () => {
        entry.pauseCount += 1
      },
      resume: () => {},
      seekTo: (_ms, done) => done(),
      jumpBy: (ms, done) => {
        entry.jumps.push(ms)
        done()
      },
    }
    return adapter
  }
}

function playbackOf(kind: 'channel' | 'movie', itemId = 'item-1') {
  return {
    item_id: itemId,
    kind,
    url: 'http://usuario:senha@exemplo.invalid/x/1.ts',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: '1',
    original_name: 'Item',
    series_id: null,
    season_number: null,
    episode_number: null,
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

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const FAIL = { code: 'PLAYER_ERROR_CONNECTION_FAILED' }

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

async function mountPlaying(kind: 'channel' | 'movie') {
  vi.useFakeTimers()
  vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf(kind))
  const view = render(<PlayerLayer itemId="item-1" title="Item" onClose={vi.fn()} createAdapter={fakeFactory()} />)
  await tick(0)
  act(() => adapters[0].callbacks.onStateChange('playing'))
  return view
}

describe('PlayerLayer — reconexão (feature 042)', () => {
  it('canal ao vivo que caiu: reabre o canal, sem posição para retomar', async () => {
    await mountPlaying('channel')
    act(() => adapters[0].callbacks.onError(FAIL))
    await tick(RECONNECT_DELAYS_MS[0])
    expect(adapters).toHaveLength(2)
    expect(adapters[1].startAtMs).toBeUndefined()
  })

  it('um stream que nunca tocou vai direto ao erro, sem reconectar (canal morto não faz esperar 17 s)', async () => {
    vi.useFakeTimers()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('channel'))
    render(<PlayerLayer itemId="item-1" title="Item" onClose={vi.fn()} createAdapter={fakeFactory()} />)
    await tick(0)
    act(() => adapters[0].callbacks.onError(FAIL))
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    await tick(60_000)
    expect(adapters).toHaveLength(1)
  })

  it('trocar de item durante a espera descarta a reconexão pendente (e a posição do anterior não vaza)', async () => {
    const view = await mountPlaying('movie')
    act(() => adapters[0].callbacks.onProgress?.({ positionMs: 42_000, durationMs: 600_000 }))
    act(() => adapters[0].callbacks.onError(FAIL))
    expect(screen.getByText(/Reconectando/)).toBeInTheDocument()

    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie', 'item-2'))
    view.rerender(<PlayerLayer itemId="item-2" title="Outro" onClose={vi.fn()} createAdapter={fakeFactory()} />)
    await tick(0)
    const opened = adapters.length // a fábrica nova começa do zero
    expect(opened).toBe(1)
    expect(adapters[0].startAtMs).toBeUndefined() // nada de 42 000 ms do outro filme

    await tick(RECONNECT_DELAYS_MS[0] + 1_000)
    expect(adapters).toHaveLength(1) // o timer do item anterior morreu
  })

  it('30 s ininterruptos em playing zeram a contagem: a próxima queda volta a esperar o 1º intervalo', async () => {
    await mountPlaying('movie')
    act(() => adapters[0].callbacks.onError(FAIL))
    await tick(RECONNECT_DELAYS_MS[0])
    act(() => adapters[1].callbacks.onStateChange('playing'))
    await tick(RECONNECT_STABLE_MS + 1)

    act(() => adapters[1].callbacks.onError(FAIL))
    await tick(RECONNECT_DELAYS_MS[0]) // sem a regra seria o 2º intervalo (5 s)
    expect(adapters).toHaveLength(3)
  })

  it('sem os 30 s, a contagem continua: a 2ª queda espera o 2º intervalo', async () => {
    await mountPlaying('movie')
    act(() => adapters[0].callbacks.onError(FAIL))
    await tick(RECONNECT_DELAYS_MS[0])
    act(() => adapters[1].callbacks.onStateChange('playing'))
    await tick(5_000)

    act(() => adapters[1].callbacks.onError(FAIL))
    await tick(RECONNECT_DELAYS_MS[0])
    expect(adapters).toHaveLength(2) // ainda esperando
    await tick(RECONNECT_DELAYS_MS[1] - RECONNECT_DELAYS_MS[0])
    expect(adapters).toHaveLength(3)
  })

  it('"Tentar de novo" manual zera a contagem automática', async () => {
    await mountPlaying('movie')
    act(() => adapters[0].callbacks.onError(FAIL))
    for (let i = 0; i < RECONNECT_DELAYS_MS.length; i += 1) {
      await tick(RECONNECT_DELAYS_MS[i])
      act(() => adapters[i + 1].callbacks.onError(FAIL))
    }
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    })
    press('Enter')
    await tick(0)
    const last = adapters.length - 1
    act(() => adapters[last].callbacks.onStateChange('playing'))
    act(() => adapters[last].callbacks.onError(FAIL))
    await tick(RECONNECT_DELAYS_MS[0])
    expect(adapters).toHaveLength(last + 2) // recomeçou do 1º intervalo
  })
})

describe('PlayerLayer — saída em "Reconectando…" (feature 042, T050)', () => {
  // "Reconectando…" não tem elemento focável por desenho (é uma espera de ≤ 10 s):
  // a saída é o RETURN, que fecha o player e descarta a reconexão pendente.
  it('RETURN durante a espera fecha o player e nenhuma nova sessão abre depois', async () => {
    vi.useFakeTimers()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const onClose = vi.fn()
    render(<PlayerLayer itemId="item-1" title="Item" onClose={onClose} createAdapter={fakeFactory()} />)
    await tick(0)
    act(() => adapters[0].callbacks.onStateChange('playing'))
    act(() => adapters[0].callbacks.onError(FAIL))
    expect(screen.getByText(/Reconectando/)).toBeInTheDocument()

    press('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)

    cleanup() // o chamador desmonta a camada ao fechar
    await tick(RECONNECT_DELAYS_MS[0] + 1_000)
    expect(adapters).toHaveLength(1)
  })
})

describe('PlayerLayer — gate da retomada (feature 042)', () => {
  it('com a verificação em andamento, PAUSAR e SALTAR continuam permitidos e RETURN fecha o player', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const onClose = vi.fn()
    // Verificação que nunca termina: o gate fica em 'verifying'.
    vi.mocked(verifyNetwork).mockReturnValue(new Promise<boolean>(() => {}))
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={onClose} createAdapter={fakeFactory()} />)
    await waitFor(() => expect(adapters).toHaveLength(1))
    act(() => adapters[0].callbacks.onStateChange('playing'))
    act(() => adapters[0].callbacks.onProgress?.({ positionMs: 30_000, durationMs: 600_000 }))

    setVisibility('visible') // o evento chega com a sessão tocando: o gate abre
    await waitFor(() => expect(screen.getByText('Verificando rede…')).toBeInTheDocument())

    press('MediaPause')
    expect(adapters[0].pauseCount).toBe(1) // pausar nunca é bloqueado

    press('MediaFastForward')
    await waitFor(() => expect(adapters[0].jumps).toContain(10_000)) // saltar segue livre

    press('Escape')
    expect(onClose).toHaveBeenCalled()
  })

  it('o aviso de "sem conexão" é lido como status e tem o botão focado', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    vi.mocked(verifyNetwork).mockResolvedValue(false)
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={fakeFactory()} />)
    await waitFor(() => expect(adapters).toHaveLength(1))
    act(() => adapters[0].callbacks.onStateChange('playing'))
    setVisibility('hidden')
    act(() => adapters[0].callbacks.onStateChange('paused'))
    setVisibility('visible')

    const button = await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(button).toHaveClass('tv-focus')
    expect(screen.getByText('Sem conexão. O filme continua pausado.')).toBeInTheDocument()
  })
})
