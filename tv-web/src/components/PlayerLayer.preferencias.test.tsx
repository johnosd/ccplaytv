import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import { writePlayerPreferences } from '../lib/player/playerPreferences'
import type { MediaTrack, PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

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
  audio: string[]
  text: (string | null)[]
}
let sessions: Fake[]

function factory(tracks: MediaTrack[]): PlayerAdapterFactory {
  sessions = []
  return (callbacks) => {
    const s: Fake = { callbacks, audio: [], text: [] }
    sessions.push(s)
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {},
      getTracks: () => tracks.map((t) => ({ ...t })),
      selectAudioTrack: (id) => {
        s.audio.push(id)
        return true
      },
      selectTextTrack: (id) => {
        s.text.push(id)
        return true
      },
    }
    return adapter
  }
}

const TRACKS: MediaTrack[] = [
  { id: 'a0', kind: 'audio', language: 'pt', active: true },
  { id: 'a1', kind: 'audio', language: 'en', active: false },
  { id: 't0', kind: 'text', language: 'pt', active: false },
]

function playback() {
  return {
    item_id: 'item-1',
    kind: 'movie' as const,
    url: 'http://exemplo.invalid/x',
    container_hint: 'mp4',
    source_id: 'src1',
    provider_stream_id: 'item-1',
    original_name: 'Item',
    series_id: null,
    season_number: null,
    episode_number: null,
  }
}

async function play(tracks: MediaTrack[]) {
  render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={factory(tracks)} />)
  await waitFor(() => expect(sessions[0]).toBeDefined())
  act(() => sessions[0].callbacks.onStateChange('playing'))
}

describe('PlayerLayer — preferências de áudio e legenda (feature 041, FR-012/FR-013)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playback())
  })
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('preferência presente no conteúdo: áudio e legenda aplicados na primeira entrada em playing', async () => {
    writePlayerPreferences({ audioLanguage: 'en', textLanguage: 'pt' })
    await play(TRACKS)
    expect(sessions[0].audio).toEqual(['a1'])
    expect(sessions[0].text).toEqual(['t0'])
  })

  it('idioma ausente no conteúdo: nada selecionado e nenhum aviso (FR-013)', async () => {
    writePlayerPreferences({ audioLanguage: 'ja', textLanguage: 'ko' })
    await play(TRACKS)
    expect(sessions[0].audio).toEqual([])
    expect(sessions[0].text).toEqual([])
    expect(document.querySelector('.toast')).toBeNull()
    expect(screen.queryByText(/não foi possível|indispon/i)).not.toBeInTheDocument()
  })

  it('sem preferência (fábrica): o padrão do stream e legenda desligada, como na 029', async () => {
    await play(TRACKS)
    expect(sessions[0].audio).toEqual([])
    expect(sessions[0].text).toEqual([])
  })
})
