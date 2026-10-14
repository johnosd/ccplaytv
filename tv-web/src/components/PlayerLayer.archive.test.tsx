/**
 * Feature 058 (T032, `logic/arquivo.md` §4): a sondagem de variante é a
 * própria abertura — a 1ª variante que falha antes de tocar troca pela outra
 * uma vez; as duas falhando → `PLAY-06` com "Ao vivo"/"Voltar"; a que tocou é
 * lembrada na fonte.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn(), fetchArchivePlayback: vi.fn(), rememberArchiveVariant: vi.fn() }
})

let sessions: { callbacks: PlayerAdapterCallbacks; url: string | null }[]

function fakeFactory(): PlayerAdapterFactory {
  sessions = []
  return (callbacks): PlayerAdapter => {
    const s = { callbacks, url: null as string | null }
    sessions.push(s)
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: (url) => {
        s.url = url
      },
      close: () => {},
      pause: () => {},
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (_ms, onSettled) => onSettled(),
    }
  }
}

const START = Date.now() - 3 * 3_600_000
const END = START + 60 * 60_000

function archivePlayback(variant: 'rest' | 'php') {
  return {
    item_id: 'ch-7',
    kind: 'archive' as const,
    url: `http://exemplo.invalid/${variant}`,
    container_hint: null,
    source_id: 'src1',
    provider_stream_id: '7',
    original_name: 'Canal Sete',
    series_id: null,
    season_number: null,
    episode_number: null,
    archive_variant: variant,
  }
}

function renderArchive(onGoLive = vi.fn()) {
  render(
    <PlayerLayer
      itemId="ch-7"
      title="Canal Sete"
      archive={{ start: START, end: END, title: 'Programa' }}
      onClose={vi.fn()}
      onGoLive={onGoLive}
      onArchiveEnded={vi.fn()}
      createAdapter={fakeFactory()}
    />,
  )
  return onGoLive
}

describe('PlayerLayer — variante do arquivo (feature 058)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchArchivePlayback).mockReset()
    vi.mocked(catalogApi.rememberArchiveVariant).mockReset()
    vi.mocked(catalogApi.rememberArchiveVariant).mockResolvedValue(undefined)
    vi.mocked(catalogApi.fetchArchivePlayback).mockImplementation(async (_id, _program, options) =>
      archivePlayback(options?.variant ?? 'rest'),
    )
  })
  afterEach(() => {
    cleanup()
  })

  it('a 1ª variante falha antes de tocar → 2ª tentativa com { variant }; a que tocou é lembrada', async () => {
    renderArchive()
    await waitFor(() => expect(sessions[0]?.url).toBe('http://exemplo.invalid/rest'))
    act(() => sessions[0].callbacks.onError({ code: null }))
    await waitFor(() => expect(sessions[1]?.url).toBe('http://exemplo.invalid/php'))
    expect(catalogApi.fetchArchivePlayback).toHaveBeenLastCalledWith('ch-7', { start: START, end: END }, { variant: 'php' })
    act(() => sessions[1].callbacks.onStateChange('playing'))
    expect(catalogApi.rememberArchiveVariant).toHaveBeenCalledWith('src1', 'php')
  })

  it('as duas variantes falham → PLAY-06 com "Ao vivo" (focado) e "Voltar"; "Ao vivo" chama onGoLive', async () => {
    const onGoLive = renderArchive()
    await waitFor(() => expect(sessions[0]?.url).not.toBeNull())
    act(() => sessions[0].callbacks.onError({ code: null }))
    await waitFor(() => expect(sessions[1]?.url).not.toBeNull())
    act(() => sessions[1].callbacks.onError({ code: null }))
    await waitFor(() => expect(screen.getByTestId('player-error-code')).toHaveTextContent('PLAY-06'))
    expect(screen.getByText('O arquivo deste programa não respondeu.')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Ao vivo', 'Voltar'])
    expect(screen.getByRole('button', { name: 'Ao vivo' })).toHaveClass('tv-focus')
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onGoLive).toHaveBeenCalledTimes(1)
    expect(catalogApi.rememberArchiveVariant).not.toHaveBeenCalled()
  })

  it('um arquivo que já tocou e caiu não troca de variante', async () => {
    renderArchive()
    await waitFor(() => expect(sessions[0]?.url).not.toBeNull())
    act(() => sessions[0].callbacks.onStateChange('playing'))
    act(() => sessions[0].callbacks.onError({ code: 'PLAYER_ERROR_NETWORK' }))
    await waitFor(() => expect(screen.getByText(/Reconectando|Tentando/i)).toBeInTheDocument())
    expect(catalogApi.fetchArchivePlayback).toHaveBeenCalledTimes(1)
  })
})
