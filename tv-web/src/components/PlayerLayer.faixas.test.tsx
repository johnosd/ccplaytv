/**
 * Testes ADICIONAIS da feature 029 (fora dos contratos travados): bordas do
 * painel "Áudio e legendas" dentro do `PlayerLayer` — roteamento de teclas,
 * mensagens das linhas soft disabled, falha de troca, releitura de 1 s,
 * legenda sob o zapping, RETURN em camadas no Live e nomes acessíveis.
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
  TrackChoice,
} from '../lib/player/PlayerService'
import { findUnnamedControls } from '../testing/accessibleNames'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

const A_PT: MediaTrack = { id: 'a0', kind: 'audio', language: 'por', active: true }
const A_EN: MediaTrack = { id: 'a1', kind: 'audio', language: 'eng', active: false }
const T_PT: MediaTrack = { id: 't0', kind: 'text', language: 'por', active: false }

let driver: {
  callbacks: PlayerAdapterCallbacks | null
  tracks: MediaTrack[]
  selectAudioResult: boolean
  getTracksCalls: number
  closeCount: number
  pauseCount: number
}

function factory(tracks: MediaTrack[]): PlayerAdapterFactory {
  driver = { callbacks: null, tracks, selectAudioResult: true, getTracksCalls: 0, closeCount: 0, pauseCount: 0 }
  return (callbacks): PlayerAdapter => {
    driver.callbacks = callbacks
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {
        driver.closeCount += 1
      },
      pause: () => {
        driver.pauseCount += 1
      },
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (_ms, onSettled) => onSettled(),
      getTracks: () => {
        driver.getTracksCalls += 1
        return driver.tracks.map((t) => ({ ...t }))
      },
      selectAudioTrack: () => driver.selectAudioResult,
      selectTextTrack: () => true,
      getStreamInfo: () => ({}),
    }
  }
}

function playbackOf(kind: 'movie' | 'channel') {
  return {
    item_id: 'item-1',
    kind,
    url: 'http://usuario:senha@exemplo.invalid/x/1.mp4',
    container_hint: 'mp4',
    source_id: 'src1',
    provider_stream_id: '1',
    original_name: 'Item',
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

async function startPlaying() {
  await waitFor(() => expect(driver.callbacks).not.toBeNull())
  act(() => driver.callbacks?.onStateChange('playing'))
}

/** Filme: ▶⏸ está focado; dois passos à direita chegam em "Áudio e legendas". */
function openMoviePanel() {
  press('ArrowRight', 2)
  press('Enter')
}

const dialog = () => screen.queryByRole('dialog', { name: 'Áudio e legendas' })

describe('PlayerLayer — painel de faixas (feature 029, bordas)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    void userStateRepository
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('MediaStop com o painel aberto fecha o player; as demais teclas de mídia esperam', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const onClose = vi.fn()
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={onClose} createAdapter={factory([A_PT, A_EN])} />)
    await startPlaying()
    openMoviePanel()
    expect(dialog()).toBeInTheDocument()

    press('MediaPlayPause')
    expect(driver.pauseCount).toBe(0)
    expect(dialog()).toBeInTheDocument()

    press('MediaStop')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('erro de reprodução fecha o painel e mostra a tela de erro', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory([A_PT])} />)
    await startPlaying()
    openMoviePanel()
    expect(dialog()).toBeInTheDocument()

    // Feature 042: sem rede não reconecta — vai direto à tela de erro (NET-01, com "Tentar de novo").
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => driver.callbacks?.onError({ code: null }))
    onLine.mockRestore()
    expect(dialog()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('troca de áudio recusada pelo motor: aviso e a marcação continua na faixa realmente ativa (FR-009)', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory([A_PT, A_EN])} />)
    await startPlaying()
    driver.selectAudioResult = false
    openMoviePanel()

    press('ArrowDown')
    press('Enter')
    expect(screen.getByText('Não foi possível trocar o áudio.')).toBeInTheDocument()
    const audio = within(within(screen.getByRole('dialog', { name: 'Áudio e legendas' })).getByRole('radiogroup', { name: 'Áudio' }))
    expect(audio.getByRole('radio', { name: /^Português/ })).toHaveAttribute('aria-checked', 'true')
    expect(audio.getByRole('radio', { name: /^Inglês/ })).toHaveAttribute('aria-checked', 'false')
    expect(dialog()).toBeInTheDocument()
  })

  it('linhas soft disabled explicam ao SELECT; só atrasar é real e a escolha sobe por onTrackChoiceChange', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const onTrackChoiceChange = vi.fn<(choice: TrackChoice) => void>()
    render(
      <PlayerLayer
        itemId="item-1"
        title="Filme"
        onClose={vi.fn()}
        createAdapter={factory([A_PT, T_PT])}
        onTrackChoiceChange={onTrackChoiceChange}
      />,
    )
    await startPlaying()
    openMoviePanel()

    // Áudio-descrição sem faixa marcada pelo motor (FR-011).
    press('ArrowDown')
    press('Enter')
    expect(screen.getByText('Este conteúdo não oferece áudio-descrição.')).toBeInTheDocument()

    // Sincronização com a legenda desativada (FR-020): a primeira linha de atraso.
    press('ArrowDown', 3)
    press('Enter')
    expect(screen.getByText('Ative uma legenda para ajustar a sincronização.')).toBeInTheDocument()
    expect(onTrackChoiceChange).not.toHaveBeenCalled()

    // Liga a legenda; adiantar segue impossível (D-006), atrasar é real (FR-019).
    press('ArrowUp')
    press('Enter')
    press('ArrowDown')
    press('Enter')
    expect(screen.getByText('Adiantar a legenda não é possível para legendas embutidas.')).toBeInTheDocument()
    press('ArrowDown', 3)
    press('Enter')
    const sync = within(screen.getByRole('radiogroup', { name: 'Sincronização da legenda' }))
    expect(sync.getByRole('radio', { name: '+500 ms' })).toHaveAttribute('aria-checked', 'true')
    expect(onTrackChoiceChange).toHaveBeenLastCalledWith({ audioLanguage: null, textLanguage: 'pt', subtitleDelayMs: 500 })
  })

  it('releitura de 1 s enquanto aberto (faixa nova aparece) e nenhuma depois de fechar', async () => {
    vi.useFakeTimers()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory([A_PT])} />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => driver.callbacks?.onStateChange('playing'))
    openMoviePanel()
    const audio = () => within(within(screen.getByRole('dialog', { name: 'Áudio e legendas' })).getByRole('radiogroup', { name: 'Áudio' }))
    expect(audio().queryByRole('radio', { name: /^Inglês/ })).toBeNull()

    driver.tracks = [A_PT, A_EN]
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(audio().getByRole('radio', { name: /^Inglês/ })).toBeInTheDocument()

    press('Escape')
    const readsAtClose = driver.getTracksCalls
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(driver.getTracksCalls).toBe(readsAtClose)
  })

  it('a legenda some sob o zapping (topLayer) e o painel não abre por baixo dele', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const createAdapter = factory([A_PT, T_PT])
    const view = render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying()
    openMoviePanel()
    press('ArrowDown', 3)
    press('Enter') // liga a legenda
    press('Escape')
    act(() => driver.callbacks?.onSubtitle?.({ text: 'Legenda visível', durationMs: 0 }))
    expect(screen.getByText('Legenda visível')).toBeInTheDocument()

    const topLayer = { content: <div>Zapping</div>, onDirection: vi.fn(), onSelect: vi.fn(), onBack: vi.fn() }
    view.rerender(
      <PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={createAdapter} topLayer={topLayer} />,
    )
    expect(screen.queryByText('Legenda visível')).not.toBeInTheDocument()
    press('Enter')
    expect(topLayer.onSelect).toHaveBeenCalledTimes(1)
    expect(dialog()).not.toBeInTheDocument()
  })

  it('Live: RETURN do painel volta à LINHA (com "Áudio e legendas" focado), não à faixa nem fecha o player', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('channel'))
    const onClose = vi.fn()
    render(
      <PlayerLayer
        itemId="item-1"
        title="Canal"
        identity={{ title: 'Canal', channelNumber: '7' }}
        onClose={onClose}
        createAdapter={factory([A_PT, A_EN])}
      />,
    )
    await startPlaying()
    press('ArrowRight', 2)
    press('Enter')
    expect(dialog()).toBeInTheDocument()

    press('Escape')
    expect(dialog()).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Áudio e legendas' })).toHaveClass('tv-focus')
  })

  it('todos os controles do painel aberto têm nome acessível e os soft disabled anunciam (FR-024)', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const { container } = render(
      <PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory([A_PT, A_EN, T_PT])} />,
    )
    await startPlaying()
    openMoviePanel()
    expect(dialog()).toBeInTheDocument()

    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})
