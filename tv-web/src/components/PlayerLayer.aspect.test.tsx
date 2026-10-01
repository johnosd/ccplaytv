import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import type {
  AspectMode,
  PlayerAdapter,
  PlayerAdapterCallbacks,
  PlayerAdapterFactory,
  ViewChoice,
} from '../lib/player/PlayerService'

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
  aspectCalls: AspectMode[]
}

let sessions: Fake[]

function factory(options: { modes?: AspectMode[]; accept?: () => boolean }): PlayerAdapterFactory {
  sessions = []
  return (callbacks) => {
    const s: Fake = { callbacks, aspectCalls: [] }
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
    }
    if (options.modes) {
      adapter.getAspectModes = () => [...options.modes!]
      adapter.setAspectMode = (mode) => {
        s.aspectCalls.push(mode)
        return options.accept ? options.accept() : true
      }
    }
    return adapter
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function playback(kind: 'channel' | 'movie', itemId = 'item-1') {
  return {
    item_id: itemId,
    kind,
    url: 'http://exemplo.invalid/x',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: itemId,
    original_name: 'Item',
    series_id: null,
    season_number: null,
    episode_number: null,
  }
}

async function startPlaying(index = 0) {
  await waitFor(() => expect(sessions[index]).toBeDefined())
  act(() => sessions[index].callbacks.onStateChange('playing'))
}

describe('PlayerLayer — aspecto: casos de borda (feature 041)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
  })
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('falha ao aplicar: toast, a marcação continua no que o motor fez e nada vira escolha da pessoa', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playback('movie'))
    let accept = true
    const onViewChoiceChange = vi.fn<(c: ViewChoice) => void>()
    render(
      <PlayerLayer
        itemId="item-1"
        title="Filme"
        onClose={vi.fn()}
        createAdapter={factory({ modes: ['fit', 'fill'], accept: () => accept })}
        onViewChoiceChange={onViewChoiceChange}
      />,
    )
    await startPlaying() // a reaplicação (fit) é aceita
    for (let i = 0; i < 4; i += 1) press('ArrowRight')
    press('Enter') // abre Aspecto
    accept = false
    press('ArrowDown')
    press('Enter') // Preencher — o motor recusa
    expect(screen.getByText('Não foi possível mudar o aspecto.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Ajustar' })).toHaveAttribute('aria-checked', 'true')
    expect(onViewChoiceChange).not.toHaveBeenCalled()
  })

  it('motor sem modo nenhum: "Aspecto — indisponível" só explica, sem painel', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playback('movie'))
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory({})} />)
    await startPlaying()
    for (let i = 0; i < 4; i += 1) press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Aspecto — indisponível' })).toHaveClass('tv-focus')
    press('Enter')
    expect(screen.queryByRole('dialog', { name: 'Aspecto' })).not.toBeInTheDocument()
    expect(screen.getByText('Este aparelho não permite ajustar o aspecto.')).toBeInTheDocument()
  })

  it('initialViewChoice (autoplay da série) vence a preferência e é aplicado na sessão nova', async () => {
    window.localStorage.setItem('ccplaytv:player-preferences', JSON.stringify({ aspect: 'fill' }))
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playback('movie'))
    render(
      <PlayerLayer
        itemId="item-1"
        title="Ep"
        onClose={vi.fn()}
        createAdapter={factory({ modes: ['fit', 'fill', 'original', 'zoom'] })}
        initialViewChoice={{ aspect: 'zoom', quality: 'auto' }}
      />,
    )
    await startPlaying()
    expect(sessions[0].aspectCalls).toEqual(['zoom'])
  })

  it('preferência de um modo que o motor não tem cai em "Ajustar", sem aviso', async () => {
    window.localStorage.setItem('ccplaytv:player-preferences', JSON.stringify({ aspect: 'original' }))
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playback('movie'))
    render(<PlayerLayer itemId="item-1" title="F" onClose={vi.fn()} createAdapter={factory({ modes: ['fit', 'fill'] })} />)
    await startPlaying()
    expect(sessions[0].aspectCalls).toEqual(['fit'])
    expect(screen.queryByText('Não foi possível mudar o aspecto.')).not.toBeInTheDocument()
    expect(screen.queryByText('Este aparelho não permite ajustar o aspecto.')).not.toBeInTheDocument()
  })

  it('tela de erro: não há Aspecto nem Qualidade', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playback('movie'))
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory({ modes: ['fit'] })} />)
    await waitFor(() => expect(sessions[0]).toBeDefined())
    act(() => sessions[0].callbacks.onError({ code: null }))
    expect(screen.queryByRole('button', { name: /Aspecto|Qualidade/ })).not.toBeInTheDocument()
  })
})
