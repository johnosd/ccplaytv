/**
 * Testes ADICIONAIS da feature 029 (fora dos contratos travados): bordas do
 * painel "Info do stream" dentro do `PlayerLayer` — motor sem dado técnico,
 * conexão que cai com o painel aberto, motor sem a API e nomes acessíveis.
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory, StreamInfo } from '../lib/player/PlayerService'
import { findUnnamedControls } from '../testing/accessibleNames'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

let callbacks: PlayerAdapterCallbacks | null

/** `info === undefined`: o motor NÃO tem a API (botão "— indisponível"). `null`: tem, mas não conseguiu informar. */
function factory(info: StreamInfo | null | undefined): PlayerAdapterFactory {
  callbacks = null
  return (cbs): PlayerAdapter => {
    callbacks = cbs
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {},
      pause: () => {},
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (_ms, onSettled) => onSettled(),
    }
    if (info !== undefined) adapter.getStreamInfo = () => info
    return adapter
  }
}

const MOVIE = {
  item_id: 'item-1',
  kind: 'movie' as const,
  url: 'http://usuario:senha@exemplo.invalid/x/1.mp4',
  container_hint: 'mp4',
  source_id: 'src1',
  provider_stream_id: '1',
  original_name: 'Filme',
  series_id: null,
  season_number: null,
  episode_number: null,
}

function press(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  }
}

async function start(info: StreamInfo | null | undefined) {
  vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE)
  const utils = render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory(info)} />)
  await waitFor(() => expect(callbacks).not.toBeNull())
  act(() => callbacks?.onStateChange('playing'))
  return utils
}

/** ▶⏸ → seis passos à direita chegam em "Info do stream" (a posição não depende da API do motor). */
function focusInfoButton() {
  press('ArrowRight', 6)
}

const infoDialog = () => screen.queryByRole('dialog', { name: 'Info do stream' })

describe('PlayerLayer — painel de info (feature 029, bordas)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    void userStateRepository
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('motor sem dado técnico (null ou vazio): só a Conexão e a frase de "não informou", com "Fechar" focável', async () => {
    for (const info of [null, {}]) {
      await start(info)
      focusInfoButton()
      press('Enter')

      const panel = within(screen.getByRole('dialog', { name: 'Info do stream' }))
      expect(panel.getByText('O aparelho não informou dados técnicos deste stream.')).toBeInTheDocument()
      expect(panel.getByText('Conexão')).toBeInTheDocument()
      expect(panel.getAllByRole('term')).toHaveLength(1)
      expect(panel.getByRole('button', { name: 'Fechar' })).toHaveClass('tv-focus')
      cleanup()
    }
  })

  it('a conexão cai com o painel aberto: passa a "Offline" sem fechar nada', async () => {
    await start({ width: 1280, height: 720 })
    focusInfoButton()
    press('Enter')
    const panel = () => within(screen.getByRole('dialog', { name: 'Info do stream' }))
    expect(panel().getByText('Online')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(panel().getByText('Offline')).toBeInTheDocument()
    expect(panel().getByText('1280 × 720')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(panel().getByText('Online')).toBeInTheDocument()
  })

  it('motor sem a API: "Info do stream — indisponível" explica ao SELECT e não abre painel', async () => {
    await start(undefined)
    focusInfoButton()
    const button = screen.getByRole('button', { name: 'Info do stream — indisponível' })
    expect(button).toHaveClass('tv-focus')
    expect(button).toHaveAttribute('aria-disabled', 'true')

    press('Enter')
    expect(screen.getByText('Este aparelho não informou dados técnicos deste stream.')).toBeInTheDocument()
    expect(infoDialog()).not.toBeInTheDocument()
  })

  it('RETURN fecha o painel e devolve o foco ao botão de origem, sem fechar o player', async () => {
    const onClose = vi.fn()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE)
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={onClose} createAdapter={factory({ width: 1920, height: 1080 })} />)
    await waitFor(() => expect(callbacks).not.toBeNull())
    act(() => callbacks?.onStateChange('playing'))
    focusInfoButton()
    press('Enter')
    expect(infoDialog()).toBeInTheDocument()

    press('Escape')
    expect(infoDialog()).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Info do stream' })).toHaveClass('tv-focus')
  })

  it('todos os controles do painel aberto têm nome acessível (FR-024)', async () => {
    const { container } = await start({ width: 1920, height: 1080, videoCodec: 'H264', bitrateKbps: 4000 })
    focusInfoButton()
    press('Enter')
    expect(infoDialog()).toBeInTheDocument()

    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})
