/**
 * Contrato da feature 020 (Ciclo de Vida do Player na TV) — orquestração de
 * proteção de tela e `visibilitychange` dentro de `PlayerLayer`.
 *
 * Seletores fixados por este contrato (fonte de verdade — `plan.md` D-002 a
 * D-006 explicam o porquê): `screenSaver.ts` (`disableScreenSaver`/
 * `enableScreenSaver`), e o comportamento observável de `PlayerLayer` ao
 * receber `visibilitychange` via `document`.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import * as screenSaver from '../lib/player/screenSaver'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

/** Mesmo padrão de captura de `PlayerLayer.test.tsx` — sem exportar de lá,
 *  cada arquivo de contrato é auto-contido (regra do sdd-plan, passo 7.5). */
let driver: {
  callbacks: PlayerAdapterCallbacks | null
  closeCount: number
  pauseCount: number
  resumeCount: number
}

function fakeFactory(): PlayerAdapterFactory {
  driver = { callbacks: null, closeCount: 0, pauseCount: 0, resumeCount: 0 }
  return (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
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
      resume: () => {
        driver.resumeCount += 1
      },
    }
  }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** Canal ao vivo: `mediaCapabilities('channel')` nega tudo — sem pausa real (D-002). */
const CHANNEL_PLAYBACK = {
  item_id: 'item-1',
  kind: 'channel' as const,
  url: 'http://usuario:senha@exemplo.invalid/live/1.ts',
  container_hint: 'ts',
  source_id: 'src1',
  provider_stream_id: '1',
  original_name: 'Canal',
  series_id: null,
  season_number: null,
  episode_number: null,
}

/** Filme: `mediaCapabilities('movie')` resolve tudo — pausa real disponível. */
const MOVIE_PLAYBACK = {
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

let createAdapter: PlayerAdapterFactory

describe('PlayerLayer — ciclo de vida (feature 020)', () => {
  beforeEach(() => {
    createAdapter = fakeFactory()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    void userStateRepository
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('desliga a proteção de tela ao entrar em playing; religa ao pausar (FR-001/FR-002)', async () => {
    const disableSpy = vi.spyOn(screenSaver, 'disableScreenSaver')
    const enableSpy = vi.spyOn(screenSaver, 'enableScreenSaver')
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE_PLAYBACK)

    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={createAdapter} />)
    await waitFor(() => expect(driver.callbacks).not.toBeNull())

    act(() => driver.callbacks?.onStateChange('playing'))
    expect(disableSpy).toHaveBeenCalled()

    act(() => driver.callbacks?.onStateChange('paused'))
    expect(enableSpy).toHaveBeenCalled()
  })

  it('app oculto pausa um filme (capaz de pausar) sem fechar a sessão (FR-003, US2 AC1)', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE_PLAYBACK)
    const onClose = vi.fn()

    render(<PlayerLayer itemId="item-1" title="Filme" onClose={onClose} createAdapter={createAdapter} />)
    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => driver.callbacks?.onStateChange('playing'))

    setVisibility('hidden')

    expect(driver.pauseCount).toBe(1)
    expect(driver.closeCount).toBe(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('app oculto fecha a sessão de canal ao vivo, que não tem pausa real (FR-003/FR-007, D-002)', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(CHANNEL_PLAYBACK)
    const onClose = vi.fn()

    render(<PlayerLayer itemId="item-1" title="Canal" onClose={onClose} createAdapter={createAdapter} />)
    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => driver.callbacks?.onStateChange('playing'))

    setVisibility('hidden')

    expect(driver.closeCount).toBe(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('app volta a ficar visível: revalida a URL e mostra o erro existente se falhar (FR-004/FR-005, US2 AC2-3)', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValueOnce(MOVIE_PLAYBACK)
    const onClose = vi.fn()

    render(<PlayerLayer itemId="item-1" title="Filme" onClose={onClose} createAdapter={createAdapter} />)
    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => driver.callbacks?.onStateChange('playing'))

    setVisibility('hidden')
    expect(driver.pauseCount).toBe(1) // sessão continua aberta, só pausada

    vi.mocked(catalogApi.fetchPlayback).mockRejectedValueOnce(new Error('sessão expirada'))
    setVisibility('visible')

    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeInTheDocument())
    expect(vi.mocked(catalogApi.fetchPlayback)).toHaveBeenCalledTimes(2)
  })
})
