/**
 * Feature 058 (T036, `logic/arquivo.md` §6): "Do início" na linha do Live —
 * logo depois de "Guia", só com a prop; desabilitado explica; sem a prop a
 * linha é a de sempre.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

let callbacks: PlayerAdapterCallbacks | null = null

const factory: PlayerAdapterFactory = (cb): PlayerAdapter => {
  callbacks = cb
  return {
    name: 'fake',
    rendersOnHardwarePlane: false,
    capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
    open: () => {},
    close: () => {},
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

async function renderLive(startOver?: { enabled: boolean; onSelect: () => void } | null) {
  render(<PlayerLayer itemId="ch-1" title="Canal Um" onClose={vi.fn()} onGuide={vi.fn()} createAdapter={factory} startOver={startOver} />)
  await waitFor(() => expect(callbacks).not.toBeNull())
  act(() => callbacks!.onStateChange('playing'))
  press('ArrowRight') // revela a linha com o foco em "Guia"
}

const rowLabels = () => Array.from(document.querySelectorAll('.player-chrome-row button')).map((b) => b.getAttribute('aria-label'))

describe('PlayerLayer — "Do início" (feature 058)', () => {
  beforeEach(() => {
    callbacks = null
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
      item_id: 'ch-1',
      kind: 'channel',
      url: 'http://exemplo.invalid/1.ts',
      container_hint: 'ts',
      source_id: 'src',
      provider_stream_id: '1',
      original_name: 'Canal Um',
      series_id: null,
      season_number: null,
      episode_number: null,
    })
  })
  afterEach(() => cleanup())

  it('entra logo depois de "Guia" e OK chama onSelect', async () => {
    const onSelect = vi.fn()
    await renderLive({ enabled: true, onSelect })
    expect(rowLabels().slice(0, 2)).toEqual(['Guia', 'Do início'])
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Do início' })).toHaveClass('tv-focus')
    press('Enter')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('sem programa atual: soft disabled, OK só explica e não toca nada', async () => {
    const onSelect = vi.fn()
    await renderLive({ enabled: false, onSelect })
    const control = screen.getByRole('button', { name: 'Do início — sem programação agora' })
    expect(control).toHaveAttribute('aria-disabled', 'true')
    press('ArrowRight')
    press('Enter')
    expect(onSelect).not.toHaveBeenCalled()
    expect(await screen.findByText('Este canal está sem programação agora.')).toBeInTheDocument()
  })

  it('sem a prop (canal sem arquivo) a linha é a de sempre', async () => {
    await renderLive(null)
    expect(rowLabels()[1]).not.toMatch(/Do início/)
    expect(screen.queryByRole('button', { name: /Do início/ })).toBeNull()
  })
})
