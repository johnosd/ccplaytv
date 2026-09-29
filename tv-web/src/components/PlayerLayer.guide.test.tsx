/**
 * Feature 031, US3 — o `PlayerLayer` sob um `topLayer` de guia: CH± chegam
 * à camada (D-011), Stop continua fechando o player, e o controle "Guia"
 * sem `onGuide` só explica. Testes da fase, fora da trava.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer, type PlayerLayerTopLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

let callbacks: PlayerAdapterCallbacks | null = null

const createAdapter: PlayerAdapterFactory = (cb: PlayerAdapterCallbacks): PlayerAdapter => {
  callbacks = cb
  return {
    name: 'fake',
    rendersOnHardwarePlane: false,
    capabilities: { canPause: false, canSeek: false, reportsPosition: false, reportsDuration: false },
    open: () => {},
    close: () => {},
    pause: () => {},
    resume: () => {},
    seekTo: (_ms, onSettled) => onSettled(),
    jumpBy: (_ms, onSettled) => onSettled(),
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function makeTopLayer(overrides: Partial<PlayerLayerTopLayer> = {}): PlayerLayerTopLayer {
  return { content: <div data-testid="guia">guia</div>, onDirection: vi.fn(), onSelect: vi.fn(), onBack: vi.fn(), ...overrides }
}

async function startChannel(props: { topLayer?: PlayerLayerTopLayer | null; onGuide?: () => void; onClose?: () => void }) {
  callbacks = null
  vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
    item_id: 'item-1',
    kind: 'channel',
    url: 'http://usuario:senha@exemplo.invalid/x/1.ts',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: '1',
    original_name: 'Canal',
    series_id: null,
    season_number: null,
    episode_number: null,
  })
  const utils = render(
    <PlayerLayer
      itemId="item-1"
      title="Canal Exemplo"
      identity={{ title: 'Canal Exemplo', channelNumber: '12' }}
      onClose={props.onClose ?? vi.fn()}
      onGuide={props.onGuide}
      topLayer={props.topLayer}
      createAdapter={createAdapter}
    />,
  )
  await waitFor(() => expect(callbacks).not.toBeNull())
  act(() => callbacks?.onStateChange('playing'))
  return utils
}

describe('PlayerLayer — guia como topLayer (feature 031)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('CH+/CH− chegam ao topLayer que os pede, e as setas/OK/RETURN seguem para ele', async () => {
    const topLayer = makeTopLayer({ onMediaKey: vi.fn() })
    await startChannel({ topLayer })
    expect(screen.getByTestId('guia')).toBeInTheDocument()

    press('ChannelUp')
    press('ChannelDown')
    expect(topLayer.onMediaKey).toHaveBeenNthCalledWith(1, 'ChannelUp')
    expect(topLayer.onMediaKey).toHaveBeenNthCalledWith(2, 'ChannelDown')

    press('ArrowDown')
    press('Enter')
    press('Escape')
    expect(topLayer.onDirection).toHaveBeenCalledWith('down')
    expect(topLayer.onSelect).toHaveBeenCalledTimes(1)
    expect(topLayer.onBack).toHaveBeenCalledTimes(1)
  })

  it('topLayer sem onMediaKey (zapping) ignora CH± como sempre; Stop fecha o player inteiro', async () => {
    const onClose = vi.fn()
    const topLayer = makeTopLayer()
    await startChannel({ topLayer, onClose })

    press('ChannelUp')
    expect(onClose).not.toHaveBeenCalled()
    press('MediaStop')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sem onGuide, OK em "Guia — em breve" explica com um aviso e não abre nada', async () => {
    await startChannel({})
    press('ArrowRight') // revela a linha: foco em "Guia"
    expect(screen.getByRole('button', { name: 'Guia — em breve' })).toHaveClass('tv-focus')
    press('Enter')
    expect(await screen.findByText('O guia não está disponível neste player.')).toBeInTheDocument()
  })
})
