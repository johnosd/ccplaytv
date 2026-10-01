/**
 * Contrato da feature 031 (EPG — Guia completo) — travado em
 * `sdd/specs/031-epg-guia-completo/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Fixa a regra que preserva o contrato travado da 027 (que monta o
 * `PlayerLayer` sem nenhuma capacidade de guia e exige o botão "Guia — em
 * breve"): o controle "Guia" da linha do Live só é REAL quando a tela passa
 * `onGuide`. Mesmo padrão de `episodeStep`/`onChannelStep`.
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

/** Mesmo padrão de captura do contrato da 027, auto-contido (regra do sdd-plan, passo 7.5). */
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

async function startPlayingChannel(onGuide?: () => void) {
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
  render(
    <PlayerLayer
      itemId="item-1"
      title="Canal Exemplo"
      identity={{ title: 'Canal Exemplo', channelNumber: '12' }}
      onGuide={onGuide}
      onClose={vi.fn()}
      createAdapter={createAdapter}
    />,
  )
  await waitFor(() => expect(callbacks).not.toBeNull())
  act(() => callbacks?.onStateChange('playing'))
}

describe('PlayerLayer — contrato da feature 031', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // US3/AC1, FR-010, FR-011, Constitution: "Foco Visível e Sem Becos Sem Saída" (SELECT funcional)
  it('"Guia" é real e OK nele chama onGuide quando a tela sabe abrir o guia; sem onGuide continua "Guia — em breve" e não chama nada', async () => {
    const onGuide = vi.fn()
    await startPlayingChannel(onGuide)

    press('ArrowRight') // revela a linha: o foco cai em "Guia", o primeiro controle do Live
    expect(screen.getByRole('button', { name: 'Guia' })).toHaveClass('tv-focus')
    expect(screen.queryByRole('button', { name: 'Guia — em breve' })).not.toBeInTheDocument()
    press('Enter')
    expect(onGuide).toHaveBeenCalledTimes(1)

    // Sem a capacidade (o caso do contrato da 027): rótulo e comportamento de sempre.
    cleanup()
    const spy = vi.fn()
    await startPlayingChannel(undefined)
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Guia — em breve' })).toHaveClass('tv-focus')
    press('Enter')
    expect(spy).not.toHaveBeenCalled()
    expect(onGuide).toHaveBeenCalledTimes(1)
  })
})
