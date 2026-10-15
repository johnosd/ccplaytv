/**
 * Contrato da feature 027 (Player chrome V14 com auto-hide e teclas de
 * mídia) — comportamento observável de `PlayerLayer` com as props novas
 * `identity`, `onChannelStep` e `episodeStep`.
 *
 * Fixado por este contrato (`plan.md` D-002 a D-008, `logic/chrome-player.md`):
 * rótulos acessíveis dos controles ("Pausar"/"Reproduzir", "Guia — em
 * breve", "Episódio anterior", "Próximo episódio"), a ordem da linha do VOD
 * (episódio anterior, ⏪, ▶⏸, ⏩, próximo episódio, demais controles), os
 * textos de limite e as teclas de mídia pelo nome DOM. "Velocidade" saiu na
 * feature 041 (emenda aprovada, R-012 do plan.md da 027).
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

/** Mesmo padrão de captura de `PlayerLayer.test.tsx`, auto-contido (regra do sdd-plan, passo 7.5). */
let driver: {
  callbacks: PlayerAdapterCallbacks | null
  closeCount: number
  jumpCalls: number[]
  pauseCount: number
  resumeCount: number
}

function fakeFactory(): PlayerAdapterFactory {
  driver = { callbacks: null, closeCount: 0, jumpCalls: [], pauseCount: 0, resumeCount: 0 }
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
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (ms, onSettled) => {
        driver.jumpCalls.push(ms)
        onSettled()
      },
    }
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function playbackOf(kind: 'channel' | 'movie' | 'episode') {
  return {
    item_id: 'item-1',
    kind,
    url: 'http://usuario:senha@exemplo.invalid/x/1.ts',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: '1',
    original_name: 'Item',
    series_id: kind === 'episode' ? 'srv-7' : null,
    season_number: kind === 'episode' ? 1 : null,
    episode_number: kind === 'episode' ? 1 : null,
  }
}

async function startPlaying() {
  await waitFor(() => expect(driver.callbacks).not.toBeNull())
  act(() => driver.callbacks?.onStateChange('playing'))
}

let createAdapter: PlayerAdapterFactory

describe('PlayerLayer — chrome V14 (feature 027)', () => {
  beforeEach(() => {
    createAdapter = fakeFactory()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    void userStateRepository
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // US1/AC1 + US5/AC1, FR-007/FR-020/FR-021: controles reais pelo contrato de capacidades + soft disabled que só explica.
  it('filme: chrome com título, Play/Pause focado e Qualidade/Aspecto sem suporte do motor; selecionar um deles avisa sem mexer na reprodução', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    render(
      <PlayerLayer itemId="item-1" title="Filme Exemplo" identity={{ title: 'Filme Exemplo' }} onClose={vi.fn()} createAdapter={createAdapter} />,
    )
    await startPlaying()

    expect(screen.getByText('Filme Exemplo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pausar' })).toHaveClass('tv-focus')
    // Emenda da feature 029 (aprovada pelo usuário, 2026-09-28): Áudio e legendas e Info do stream deixaram de ser mock.
    // Emenda da feature 041 (aprovada pelo usuário, 2026-10-01): "Velocidade" saiu; Qualidade/Aspecto são reais e,
    // com este motor falso (sem as APIs), ficam soft disabled com o motivo.
    for (const name of ['Qualidade — indisponível', 'Aspecto — indisponível']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    expect(screen.queryByRole('button', { name: /Velocidade/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Episódio anterior|Próximo episódio/ })).not.toBeInTheDocument()

    // Linha: ⏪ ▶⏸ ⏩ | Áudio Qualidade Aspecto Info — quatro passos à direita de ▶⏸ chegam em "Aspecto".
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Aspecto — indisponível' })).toHaveClass('tv-focus')
    press('Enter')
    expect(screen.getByText('Este aparelho não permite ajustar o aspecto.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Aspecto' })).not.toBeInTheDocument()
    expect(driver.pauseCount).toBe(0)
    expect(driver.jumpCalls).toEqual([])
  })

  // US2/AC1-2-5, FR-009/FR-010/FR-013/FR-022/FR-034: faixa de identidade, ↑/↓ trocam direto, OK abre o zapping, ←/→ revelam a linha.
  it('canal: faixa "AO VIVO" com número e nome; ↓ pede o próximo canal, OK abre o zapping, → revela a linha sem "Velocidade"', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('channel'))
    const onChannelStep = vi.fn(() => true)
    const onIdleSelect = vi.fn()
    render(
      <PlayerLayer
        itemId="item-1"
        title="Canal Exemplo"
        identity={{ title: 'Canal Exemplo', channelNumber: '12' }}
        onChannelStep={onChannelStep}
        onIdleSelect={onIdleSelect}
        onClose={vi.fn()}
        createAdapter={createAdapter}
      />,
    )
    await startPlaying()

    expect(screen.getByText('AO VIVO')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Canal Exemplo')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0) // faixa: nenhum controle focável

    press('ArrowDown')
    expect(onChannelStep).toHaveBeenCalledWith('next')
    press('ArrowUp')
    expect(onChannelStep).toHaveBeenLastCalledWith('previous')

    press('Enter')
    expect(onIdleSelect).toHaveBeenCalledTimes(1)

    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Guia — em breve' })).toHaveClass('tv-focus')
    expect(screen.queryByRole('button', { name: /Velocidade/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pausar|Reproduzir/ })).not.toBeInTheDocument()
  })

  // US2/AC3, FR-011: no limite não há volta ao início — só o aviso, sem trocar.
  it('canal: ↓ no último canal da lista avisa o limite e a faixa continua mostrando o mesmo canal', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('channel'))
    const onChannelStep = vi.fn(() => false)
    render(
      <PlayerLayer
        itemId="item-1"
        title="Canal Exemplo"
        identity={{ title: 'Canal Exemplo', channelNumber: '12' }}
        onChannelStep={onChannelStep}
        onClose={vi.fn()}
        createAdapter={createAdapter}
      />,
    )
    await startPlaying()

    press('ArrowDown')
    expect(onChannelStep).toHaveBeenCalledWith('next')
    expect(screen.getByText('Este é o último canal desta lista.')).toBeInTheDocument()
    expect(screen.getByText('Canal Exemplo')).toBeInTheDocument()
    expect(driver.closeCount).toBe(0)
  })

  // US3/AC1-3-4, FR-024/FR-025/FR-026: teclas de mídia agem sobre a sessão e Stop sai como RETURN.
  it('filme: MediaPlayPause pausa e foca Play/Pause; MediaFastForward salta 10 s; MediaStop fecha como RETURN', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const onClose = vi.fn()
    render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={onClose} createAdapter={createAdapter} />)
    await startPlaying()

    press('ArrowRight') // tira o foco de Play/Pause
    press('MediaPlayPause')
    expect(driver.pauseCount).toBe(1)
    act(() => driver.callbacks?.onStateChange('paused'))
    expect(screen.getByRole('button', { name: 'Reproduzir' })).toHaveClass('tv-focus')

    press('MediaPlay')
    expect(driver.resumeCount).toBe(1)
    act(() => driver.callbacks?.onStateChange('playing'))
    press('MediaPlay') // idempotente: já tocando
    expect(driver.resumeCount).toBe(1)
    expect(driver.pauseCount).toBe(1)

    press('MediaFastForward')
    expect(driver.jumpCalls).toEqual([10_000])

    press('MediaStop')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // US4/AC1-3, FR-016/FR-017: anterior soft disabled no primeiro episódio; próximo pede a troca.
  it('episódio: "Episódio anterior" no limite só avisa; "Próximo episódio" pede a troca', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('episode'))
    const onStep = vi.fn()
    render(
      <PlayerLayer
        itemId="item-1"
        title="Piloto"
        identity={{ title: 'Série Exemplo', subtitle: 'T1:E1 • Piloto' }}
        episodeStep={{ hasPrevious: false, hasNext: true, onStep }}
        onClose={vi.fn()}
        createAdapter={createAdapter}
      />,
    )
    await startPlaying()

    expect(screen.getByText('Série Exemplo')).toBeInTheDocument()
    expect(screen.getByText('T1:E1 • Piloto')).toBeInTheDocument()

    // Linha: [Episódio anterior] ⏪ ▶⏸ ⏩ [Próximo episódio] … — foco começa em ▶⏸.
    press('ArrowLeft')
    press('ArrowLeft')
    const previous = screen.getByRole('button', { name: /Episódio anterior/ })
    expect(previous).toHaveClass('tv-focus')
    expect(previous).toHaveClass('is-soft-disabled')
    press('Enter')
    expect(onStep).not.toHaveBeenCalled()
    expect(screen.getByText('Este é o primeiro episódio disponível.')).toBeInTheDocument()

    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Próximo episódio' })).toHaveClass('tv-focus')
    press('Enter')
    expect(onStep).toHaveBeenCalledWith('next')
  })
})
