import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as catalogApi from '../features/catalog/catalogApi'
import { APP_LANGUAGE_STORAGE_KEY, resetAppLanguageForTests, writeAppLanguage } from '../lib/i18n/appLanguage'
import { createTranslator } from '../lib/i18n/translate'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'
import { trackLabels, type MediaTrack } from '../lib/player/tracks'
import { buildTracksPanel } from './playerPanels'
import { chromeControls } from './chromeControls'
import { PlayerLayer } from './PlayerLayer'

/** Feature 054, Fase 7: player em outros idiomas — trocar o idioma NÃO reinicia a reprodução (FR-014). */

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})
vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn() }
})

const MOVIE = {
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

let callbacks: PlayerAdapterCallbacks | null = null
let closeCount = 0
let created = 0

const factory: PlayerAdapterFactory = (cb): PlayerAdapter => {
  created += 1
  callbacks = cb
  return {
    name: 'fake',
    rendersOnHardwarePlane: false,
    capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
    open: () => {},
    close: () => {
      closeCount += 1
    },
    pause: () => {},
    resume: () => {},
    seekTo: (_ms, done) => done(),
    jumpBy: (_ms, done) => done(),
  }
}

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
  callbacks = null
  closeCount = 0
  created = 0
  vi.mocked(catalogApi.fetchPlayback).mockReset()
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
})

describe('player em outros idiomas (feature 054)', () => {
  it('FR-014: trocar o idioma com a reprodução ativa traduz a camada e NÃO recria nem fecha o motor', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE)
    render(<PlayerLayer itemId="item-1" title="Meu filme" onClose={vi.fn()} createAdapter={factory} />)
    await waitFor(() => expect(callbacks).not.toBeNull())
    expect(screen.getByRole('dialog', { name: 'Reproduzindo Meu filme' })).toBeInTheDocument()

    act(() => {
      writeAppLanguage('en')
    })

    expect(screen.getByRole('dialog', { name: 'Playing Meu filme' })).toBeInTheDocument()
    expect(screen.getByText('Preparing…')).toBeInTheDocument()
    expect(created).toBe(1)
    expect(closeCount).toBe(0)
  })

  it('erro de reprodução em espanhol: mensagem do catálogo de erros, ações traduzidas e saída focável', async () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'es')
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE)
    render(<PlayerLayer itemId="item-1" title="Meu filme" onClose={vi.fn()} createAdapter={factory} />)
    await waitFor(() => expect(callbacks).not.toBeNull())
    act(() => {
      callbacks?.onError({ code: 'PLAYER_ERROR_NOT_SUPPORTED_FILE', message: 'x' })
    })
    expect(screen.getByRole('dialog', { name: /Error de reproducción, código PLAY-02/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Info técnica' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
  })

  it('painéis puros: controles, faixas e info por idioma; nomes de idioma de faixa vêm da tabela do idioma do app', () => {
    const en = createTranslator('en')
    const es = createTranslator('es')
    const caps = { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true }
    expect(chromeControls('vod', caps, false, null, { tracks: true, info: false, aspect: true, quality: 'single' }, en).map((c) => c.label)).toEqual([
      'Back 10 seconds',
      'Pause',
      'Forward 10 seconds',
      'Audio and subtitles',
      'Quality — only one available',
      'Aspect',
      'Stream info — unavailable',
    ])
    const tracks: MediaTrack[] = [
      { id: '0', kind: 'audio', language: 'por', channels: 2, active: true },
      { id: '1', kind: 'audio', language: 'eng', channels: 6, active: false },
    ]
    expect(trackLabels(tracks, es)).toEqual(['Portugués • Estéreo', 'Inglés • 5.1'])
    expect(buildTracksPanel(tracks, { audioLanguage: null, textLanguage: null, subtitleDelayMs: 0 }, en).noTextNote).toBe(
      'No subtitles in this content',
    )
  })
})
