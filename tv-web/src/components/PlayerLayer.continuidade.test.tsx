/**
 * Testes ADICIONAIS da feature 029 (fora dos contratos travados): a escolha de
 * áudio/legenda/atraso atravessa a troca de item DENTRO da mesma montagem
 * (zapping/CH± no Live) por idioma — e nunca vira aviso nem "escolha da
 * pessoa" quando é só a reaplicação.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import type { MediaTrack, PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory, TrackChoice } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

interface FakeSession {
  callbacks: PlayerAdapterCallbacks
  audioCalls: string[]
  textCalls: (string | null)[]
}

let sessions: FakeSession[]

/** Uma lista de faixas por sessão, na ordem em que as sessões nascem. */
function factory(tracksPerSession: MediaTrack[][]): PlayerAdapterFactory {
  sessions = []
  return (callbacks): PlayerAdapter => {
    const index = sessions.length
    const session: FakeSession = { callbacks, audioCalls: [], textCalls: [] }
    sessions.push(session)
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {},
      pause: () => {},
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (_ms, onSettled) => onSettled(),
      getTracks: () => (tracksPerSession[index] ?? []).map((t) => ({ ...t })),
      selectAudioTrack: (id) => {
        session.audioCalls.push(id)
        return true
      },
      selectTextTrack: (id) => {
        session.textCalls.push(id)
        return true
      },
      getStreamInfo: () => ({}),
    }
  }
}

function channel(itemId: string) {
  return {
    item_id: itemId,
    kind: 'channel' as const,
    url: 'http://usuario:senha@exemplo.invalid/live/1.ts',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: itemId,
    original_name: 'Canal',
    series_id: null,
    season_number: null,
    episode_number: null,
  }
}

function press(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  }
}

/** `fetchPlayback` resolve por microtask, não por timer — esvazia a fila dentro de `act` (relógio falso). */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

const S1: MediaTrack[] = [
  { id: 'a0', kind: 'audio', language: 'por', active: true },
  { id: 'a1', kind: 'audio', language: 'eng', active: false },
  { id: 't0', kind: 'text', language: 'por', active: false },
]

describe('PlayerLayer — continuidade da escolha entre itens (feature 029, FR-021/FR-022)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(async (id: string) => channel(id))
    void userStateRepository
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** Canal 1: áudio "Inglês", legenda "Português" e atraso +500 ms escolhidos pelo painel. */
  async function chooseInFirstChannel(tracksPerSession: MediaTrack[][], onTrackChoiceChange?: (c: TrackChoice) => void) {
    const createAdapter = factory(tracksPerSession)
    const view = render(
      <PlayerLayer itemId="c1" title="Canal 1" onClose={vi.fn()} createAdapter={createAdapter} onTrackChoiceChange={onTrackChoiceChange} />,
    )
    await flush()
    act(() => sessions[0].callbacks.onStateChange('playing'))

    press('ArrowRight', 2) // faixa → linha → "Áudio e legendas"
    press('Enter')
    press('ArrowDown') // Inglês
    press('Enter')
    press('ArrowDown', 3) // áudio-descrição → Desativadas → Português (legenda)
    press('Enter')
    press('ArrowDown', 4) // −1000 → −500 → Sem atraso → +500
    press('Enter')
    press('Escape')
    return { view, createAdapter }
  }

  const rerenderAs = (view: ReturnType<typeof render>, createAdapter: PlayerAdapterFactory, itemId: string, onChange?: (c: TrackChoice) => void) =>
    view.rerender(<PlayerLayer itemId={itemId} title={itemId} onClose={vi.fn()} createAdapter={createAdapter} onTrackChoiceChange={onChange} />)

  it('trocar de canal reaplica o áudio e a legenda pelo idioma (códigos e ids diferentes) e mantém o atraso', async () => {
    const S2: MediaTrack[] = [
      { id: 'y0', kind: 'audio', language: 'pt', active: true },
      { id: 'y1', kind: 'audio', language: 'en', active: false },
      { id: 'z0', kind: 'text', language: 'pt-BR', active: false },
    ]
    const { view, createAdapter } = await chooseInFirstChannel([S1, S2])
    expect(sessions[0].audioCalls).toEqual(['a1'])
    expect(sessions[0].textCalls).toEqual(['t0'])

    rerenderAs(view, createAdapter, 'c2')
    await flush()
    act(() => sessions[1].callbacks.onStateChange('playing'))

    expect(sessions[1].audioCalls).toEqual(['y1'])
    expect(sessions[1].textCalls).toEqual(['z0'])

    // O atraso de +500 ms veio junto: a linha só aparece depois dele.
    act(() => sessions[1].callbacks.onSubtitle?.({ text: 'Linha do canal 2', durationMs: 0 }))
    expect(screen.queryByText('Linha do canal 2')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByText('Linha do canal 2')).toBeInTheDocument()
  })

  it('idioma que o canal seguinte não tem cai no padrão do stream, sem aviso e sem chamar o motor', async () => {
    const S2: MediaTrack[] = [
      { id: 'y0', kind: 'audio', language: 'jpn', active: true },
      { id: 'z0', kind: 'text', language: 'jpn', active: false },
    ]
    const { view, createAdapter } = await chooseInFirstChannel([S1, S2])

    rerenderAs(view, createAdapter, 'c2')
    await flush()
    act(() => sessions[1].callbacks.onStateChange('playing'))

    expect(sessions[1].audioCalls).toEqual([])
    expect(sessions[1].textCalls).toEqual([])
    expect(screen.queryByText(/Não foi possível|indispon/)).not.toBeInTheDocument()
  })

  it('a reaplicação automática não conta como escolha da pessoa (onTrackChoiceChange fica quieto)', async () => {
    const S2: MediaTrack[] = [
      { id: 'y0', kind: 'audio', language: 'pt', active: true },
      { id: 'y1', kind: 'audio', language: 'en', active: false },
      { id: 'z0', kind: 'text', language: 'pt', active: false },
    ]
    const onChange = vi.fn<(choice: TrackChoice) => void>()
    const { view, createAdapter } = await chooseInFirstChannel([S1, S2], onChange)
    const callsAfterChoosing = onChange.mock.calls.length
    expect(callsAfterChoosing).toBeGreaterThan(0)

    rerenderAs(view, createAdapter, 'c2', onChange)
    await flush()
    act(() => sessions[1].callbacks.onStateChange('playing'))

    expect(sessions[1].audioCalls).toEqual(['y1']) // reaplicou...
    expect(onChange).toHaveBeenCalledTimes(callsAfterChoosing) // ...sem "escolher"
    expect(onChange).toHaveBeenLastCalledWith({ audioLanguage: 'en', textLanguage: 'pt', subtitleDelayMs: 500 })
  })

  it('só a primeira entrada em playing de cada sessão reaplica — rebuffering não mexe de novo nas faixas', async () => {
    const S2: MediaTrack[] = [
      { id: 'y0', kind: 'audio', language: 'pt', active: true },
      { id: 'y1', kind: 'audio', language: 'en', active: false },
    ]
    const { view, createAdapter } = await chooseInFirstChannel([S1, S2])
    rerenderAs(view, createAdapter, 'c2')
    await flush()
    act(() => sessions[1].callbacks.onStateChange('playing'))
    act(() => sessions[1].callbacks.onStateChange('buffering'))
    act(() => sessions[1].callbacks.onStateChange('playing'))

    expect(sessions[1].audioCalls).toEqual(['y1'])
  })

  it('motor sem API de faixas: nada é reaplicado nem lançado (a reprodução segue)', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(channel('c1'))
    let captured: PlayerAdapterCallbacks | null = null
    const bare: PlayerAdapterFactory = (callbacks) => {
      captured = callbacks
      return {
        name: 'fake',
        rendersOnHardwarePlane: false,
        capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
        open: () => {},
        close: () => {},
      }
    }
    render(
      <PlayerLayer
        itemId="c1"
        title="Canal"
        onClose={vi.fn()}
        createAdapter={bare}
        initialTrackChoice={{ audioLanguage: 'en', textLanguage: 'pt', subtitleDelayMs: 0 }}
      />,
    )
    await flush()
    // A primeira entrada em playing é onde a reaplicação rodaria: sem a API
    // no motor ela não pode lançar nem derrubar a reprodução.
    expect(() => act(() => (captured as PlayerAdapterCallbacks | null)?.onStateChange('playing'))).not.toThrow()
    expect(screen.getByRole('dialog', { name: 'Reproduzindo Canal' })).toBeInTheDocument()
    expect(screen.queryByText(/Não foi possível/)).not.toBeInTheDocument()
  })
})
