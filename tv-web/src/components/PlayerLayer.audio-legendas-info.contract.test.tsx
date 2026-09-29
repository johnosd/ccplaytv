/**
 * Contrato da feature 029 (Player: trilhas de áudio, legendas e info do
 * stream) — comportamento observável de `PlayerLayer` com um motor que
 * informa faixas/info pelos métodos opcionais novos de `PlayerAdapter`.
 *
 * Fixado por este contrato (`plan.md` D-001 a D-011,
 * `logic/faixas-e-legendas.md`): rótulos dos botões ("Áudio e legendas",
 * "Info do stream", "… — indisponível"), nomes do painel e dos grupos
 * ("Áudio", "Legendas"), a ordem vertical do painel (áudio → áudio-descrição
 * → legendas → sincronização), legenda desativada por padrão, reaplicação
 * por idioma e os rótulos/formatos do painel de info.
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import type {
  MediaTrack,
  PlayerAdapter,
  PlayerAdapterCallbacks,
  PlayerAdapterFactory,
  StreamInfo,
  TrackChoice,
} from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

/** Uma sessão do motor falso — uma por `createAdapter()` chamado. */
interface FakeSession {
  callbacks: PlayerAdapterCallbacks
  tracks: MediaTrack[]
  selectAudioCalls: string[]
  selectTextCalls: (string | null)[]
  streamInfoCalls: number
  closeCount: number
  jumpCalls: number[]
  pauseCount: number
}

interface FakeOptions {
  /** Faixas de cada sessão, na ordem em que as sessões nascem. Ausente = motor SEM a API de faixas. */
  tracksPerSession?: MediaTrack[][]
  /** Info técnica devolvida a cada leitura. Ausente = motor SEM a API de info. */
  streamInfo?: () => StreamInfo
}

let sessions: FakeSession[]

function fakeFactory({ tracksPerSession, streamInfo }: FakeOptions): PlayerAdapterFactory {
  sessions = []
  return (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    const s: FakeSession = {
      callbacks,
      tracks: (tracksPerSession?.[sessions.length] ?? []).map((t) => ({ ...t })),
      selectAudioCalls: [],
      selectTextCalls: [],
      streamInfoCalls: 0,
      closeCount: 0,
      jumpCalls: [],
      pauseCount: 0,
    }
    sessions.push(s)
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {
        s.closeCount += 1
      },
      pause: () => {
        s.pauseCount += 1
      },
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (ms, onSettled) => {
        s.jumpCalls.push(ms)
        onSettled()
      },
    }
    if (tracksPerSession) {
      adapter.getTracks = () => s.tracks.map((t) => ({ ...t }))
      adapter.selectAudioTrack = (id) => {
        s.selectAudioCalls.push(id)
        s.tracks = s.tracks.map((t) => (t.kind === 'audio' ? { ...t, active: t.id === id } : t))
        return true
      }
      adapter.selectTextTrack = (id) => {
        s.selectTextCalls.push(id)
        return true
      }
    }
    if (streamInfo) {
      adapter.getStreamInfo = () => {
        s.streamInfoCalls += 1
        return streamInfo()
      }
    }
    return adapter
  }
}

const AUDIO_PT: MediaTrack = { id: 'a0', kind: 'audio', language: 'por', active: true }
const AUDIO_EN: MediaTrack = { id: 'a1', kind: 'audio', language: 'eng', codec: 'AAC', channels: 6, active: false }
const TEXT_PT: MediaTrack = { id: 't0', kind: 'text', language: 'por', active: false }

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function pressTimes(key: string, times: number) {
  for (let i = 0; i < times; i += 1) press(key)
}

function playbackOf(kind: 'channel' | 'movie', itemId = 'item-1') {
  return {
    item_id: itemId,
    kind,
    url: 'http://usuario:senha@exemplo.invalid/x/1.ts',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: itemId,
    original_name: 'Item',
    series_id: null,
    season_number: null,
    episode_number: null,
  }
}

/** Sessão de índice `index` chegou a tocar (tempo real, `waitFor`). */
async function startPlaying(index = 0) {
  await waitFor(() => expect(sessions[index]).toBeDefined())
  act(() => sessions[index].callbacks.onStateChange('playing'))
}

describe('PlayerLayer — áudio, legendas e info do stream (feature 029)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    void userStateRepository
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // US1/AC1-2-5; FR-001, FR-003, FR-006, FR-010: painel real com as faixas do motor, troca sem mexer na reprodução, RETURN devolve o foco.
  it('filme: "Áudio e legendas" abre o painel com a faixa ativa marcada e focada; trocar o áudio não reinicia nada; RETURN volta ao botão', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const createAdapter = fakeFactory({ tracksPerSession: [[AUDIO_PT, AUDIO_EN, TEXT_PT]] })
    render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying()

    // Linha do VOD: ⏪ ▶⏸ ⏩ Áudio … — dois passos à direita de ▶⏸.
    pressTimes('ArrowRight', 2)
    expect(screen.getByRole('button', { name: 'Áudio e legendas' })).toHaveClass('tv-focus')
    press('Enter')

    const panel = screen.getByRole('dialog', { name: 'Áudio e legendas' })
    const audio = within(within(panel).getByRole('radiogroup', { name: 'Áudio' }))
    const pt = audio.getByRole('radio', { name: /^Português/ })
    const en = audio.getByRole('radio', { name: /^Inglês/ })
    expect(pt).toHaveAttribute('aria-checked', 'true')
    expect(pt).toHaveClass('tv-focus')
    expect(en).toHaveAttribute('aria-checked', 'false')

    press('ArrowDown')
    expect(audio.getByRole('radio', { name: /^Inglês/ })).toHaveClass('tv-focus')
    press('Enter')
    expect(sessions[0].selectAudioCalls).toEqual(['a1'])
    expect(audio.getByRole('radio', { name: /^Inglês/ })).toHaveAttribute('aria-checked', 'true')
    expect(audio.getByRole('radio', { name: /^Português/ })).toHaveAttribute('aria-checked', 'false')
    expect(sessions[0].jumpCalls).toEqual([])
    expect(sessions[0].pauseCount).toBe(0)
    expect(sessions[0].closeCount).toBe(0)
    expect(sessions).toHaveLength(1)

    press('Escape')
    expect(screen.queryByRole('dialog', { name: 'Áudio e legendas' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Áudio e legendas' })).toHaveClass('tv-focus')
  })

  // US1/AC3; FR-004, FR-007, D-005: legenda começa desativada (linha do motor ignorada), ligar exibe o texto, "Desativadas" apaga.
  it('filme: legenda começa desativada; escolher a faixa embutida exibe a linha do motor e "Desativadas" a apaga', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const createAdapter = fakeFactory({ tracksPerSession: [[AUDIO_PT, TEXT_PT]] })
    render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying()

    act(() => sessions[0].callbacks.onSubtitle?.({ text: 'Linha antes de ligar', durationMs: 3000 }))
    expect(screen.queryByText('Linha antes de ligar')).not.toBeInTheDocument()

    pressTimes('ArrowRight', 2)
    press('Enter')
    const panel = screen.getByRole('dialog', { name: 'Áudio e legendas' })
    const subtitles = within(within(panel).getByRole('radiogroup', { name: 'Legendas' }))
    expect(subtitles.getByRole('radio', { name: 'Desativadas' })).toHaveAttribute('aria-checked', 'true')

    // Ordem vertical: Português (áudio) → Áudio-descrição → Desativadas → Português (legenda).
    pressTimes('ArrowDown', 3)
    expect(subtitles.getByRole('radio', { name: /^Português/ })).toHaveClass('tv-focus')
    press('Enter')
    expect(sessions[0].selectTextCalls.at(-1)).toBe('t0')
    expect(subtitles.getByRole('radio', { name: /^Português/ })).toHaveAttribute('aria-checked', 'true')

    act(() => sessions[0].callbacks.onSubtitle?.({ text: 'Olá, mundo', durationMs: 3000 }))
    expect(await screen.findByText('Olá, mundo')).toBeInTheDocument()

    press('ArrowUp')
    press('Enter')
    expect(sessions[0].selectTextCalls.at(-1)).toBeNull()
    expect(screen.queryByText('Olá, mundo')).not.toBeInTheDocument()
  })

  // FR-002, FR-004, FR-001 (Live); Constitution: Foco Visível e Sem Becos Sem Saída — sem API de faixas não abre painel vazio; faixa única informa em vez de esconder.
  it('sem API de faixas o botão é soft disabled e só explica; no canal com uma faixa só o painel diz "Nenhuma legenda neste conteúdo"', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    let createAdapter = fakeFactory({})
    render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying()

    pressTimes('ArrowRight', 2)
    const unavailable = screen.getByRole('button', { name: 'Áudio e legendas — indisponível' })
    expect(unavailable).toHaveClass('tv-focus')
    expect(unavailable).toHaveAttribute('aria-disabled', 'true')
    press('Enter')
    expect(screen.queryByRole('dialog', { name: 'Áudio e legendas' })).not.toBeInTheDocument()
    expect(screen.getByText('Este aparelho não informou as faixas deste conteúdo.')).toBeInTheDocument()

    cleanup()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('channel'))
    createAdapter = fakeFactory({ tracksPerSession: [[AUDIO_PT]] })
    render(
      <PlayerLayer itemId="item-1" title="Canal" identity={{ title: 'Canal', channelNumber: '7' }} onClose={vi.fn()} createAdapter={createAdapter} />,
    )
    await startPlaying()

    // Live: → revela a linha (foco em Guia), → de novo chega em "Áudio e legendas".
    pressTimes('ArrowRight', 2)
    expect(screen.getByRole('button', { name: 'Áudio e legendas' })).toHaveClass('tv-focus')
    press('Enter')
    const panel = screen.getByRole('dialog', { name: 'Áudio e legendas' })
    expect(within(panel).getByRole('radio', { name: /^Português/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(panel).getByText('Nenhuma legenda neste conteúdo')).toBeInTheDocument()
  })

  // FR-021, FR-022, FR-023, D-008: reaplica por IDIOMA (ids e códigos mudam entre sessões); montagem nova sem escolha não herda nada; `initialTrackChoice` atravessa uma desmontagem.
  it('escolha de áudio atravessa a troca de item por idioma, não vaza para uma montagem nova e volta via initialTrackChoice', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(async (id: string) => playbackOf('movie', id))
    const nextTracks: MediaTrack[] = [
      { id: 'b0', kind: 'audio', language: 'pt', active: true },
      { id: 'b1', kind: 'audio', language: 'en', active: false },
    ]
    const createAdapter = fakeFactory({ tracksPerSession: [[AUDIO_PT, AUDIO_EN], nextTracks, nextTracks, nextTracks] })
    const onTrackChoiceChange = vi.fn<(choice: TrackChoice) => void>()
    const view = render(
      <PlayerLayer itemId="item-1" title="E1" onClose={vi.fn()} createAdapter={createAdapter} onTrackChoiceChange={onTrackChoiceChange} />,
    )
    await startPlaying(0)
    pressTimes('ArrowRight', 2)
    press('Enter')
    press('ArrowDown')
    press('Enter') // Inglês na sessão 1
    press('Escape')
    expect(onTrackChoiceChange).toHaveBeenCalled()

    view.rerender(
      <PlayerLayer itemId="item-2" title="E2" onClose={vi.fn()} createAdapter={createAdapter} onTrackChoiceChange={onTrackChoiceChange} />,
    )
    await startPlaying(1)
    expect(sessions[1].selectAudioCalls).toEqual(['b1'])

    view.unmount()
    render(<PlayerLayer itemId="item-3" title="Outro" onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying(2)
    expect(sessions[2].selectAudioCalls).toEqual([])

    cleanup()
    const lastChoice = onTrackChoiceChange.mock.calls.at(-1)?.[0] ?? null
    render(<PlayerLayer itemId="item-4" title="E3" onClose={vi.fn()} createAdapter={createAdapter} initialTrackChoice={lastChoice} />)
    await startPlaying(3)
    expect(sessions[3].selectAudioCalls).toEqual(['b1'])
  })

  // US2/AC1-2-4; FR-013, FR-014, FR-015, FR-016, FR-017, FR-018; Constitution: Segredos Fora dos Clientes e dos Logs.
  it('info: só os campos que o motor informou, relidos a cada ~1 s enquanto aberto, sem URL nem credencial; "Fechar" para a releitura e volta ao botão', async () => {
    // Relógio falso desde antes do render (mesmo motivo de `PlayerLayer.test.tsx`, T018).
    vi.useFakeTimers()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    let bitrateKbps = 4000
    const createAdapter = fakeFactory({
      tracksPerSession: [[AUDIO_PT]],
      streamInfo: () => ({ width: 1920, height: 1080, videoCodec: 'H264', bitrateKbps }),
    })
    render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={vi.fn()} createAdapter={createAdapter} />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(sessions[0]).toBeDefined()
    act(() => sessions[0].callbacks.onStateChange('playing'))

    // Linha: ⏪ ▶⏸ ⏩ Áudio Qualidade Velocidade Aspecto Info — seis passos à direita de ▶⏸.
    pressTimes('ArrowRight', 6)
    expect(screen.getByRole('button', { name: 'Info do stream' })).toHaveClass('tv-focus')
    press('Enter')

    const panel = within(screen.getByRole('dialog', { name: 'Info do stream' }))
    expect(panel.getByText('Resolução')).toBeInTheDocument()
    expect(panel.getByText('1920 × 1080')).toBeInTheDocument()
    expect(panel.getByText('Codec de vídeo')).toBeInTheDocument()
    expect(panel.getByText('H264')).toBeInTheDocument()
    expect(panel.getByText('4,0 Mbps')).toBeInTheDocument()
    expect(panel.getByText('Conexão')).toBeInTheDocument()
    expect(panel.getByText('Online')).toBeInTheDocument()
    for (const absent of ['Quadros por segundo', 'Buffer', 'Protocolo']) {
      expect(panel.queryByText(absent)).not.toBeInTheDocument()
    }
    expect(document.body.textContent ?? '').not.toMatch(/exemplo\.invalid|senha|usuario/)

    bitrateKbps = 5000
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(panel.getByText('5,0 Mbps')).toBeInTheDocument()

    expect(panel.getByRole('button', { name: 'Fechar' })).toHaveClass('tv-focus')
    press('Enter')
    expect(screen.queryByRole('dialog', { name: 'Info do stream' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Info do stream' })).toHaveClass('tv-focus')

    const readsAtClose = sessions[0].streamInfoCalls
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(sessions[0].streamInfoCalls).toBe(readsAtClose)
  })
})
