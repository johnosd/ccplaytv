import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerOverlay } from './PlayerOverlay'
import * as catalogApi from '../catalog/catalogApi'
import type {
  PlayerAdapter,
  PlayerAdapterCallbacks,
  PlayerAdapterFactory,
} from '../../lib/player/PlayerService'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

/**
 * Captura os callbacks do adaptador para dirigir a sessão a partir do teste,
 * sem motor real — injetado pela prop `createAdapter`, a mesma costura que o
 * `PlayerService` expõe em `options.createAdapter`.
 *
 * Nota: espionar `resolveAdapterFactory` no módulo NÃO funciona aqui —
 * `createPlayerSession` chama a função pela ligação interna do módulo, que um
 * spy no export não intercepta.
 */
let driver: {
  callbacks: PlayerAdapterCallbacks | null
  closeCount: number
  openedUrls: string[]
}

function fakeFactory(rendersOnHardwarePlane = false): PlayerAdapterFactory {
  driver = { callbacks: null, closeCount: 0, openedUrls: [] }
  return (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    driver.callbacks = callbacks
    return {
      name: 'fake',
      rendersOnHardwarePlane,
      open: (url) => driver.openedUrls.push(url),
      close: () => {
        driver.closeCount += 1
      },
    }
  }
}

let createAdapter: PlayerAdapterFactory

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const PLAYBACK = {
  item_id: 'item-1',
  kind: 'channel' as const,
  url: 'http://usuario:senha@exemplo.invalid/live/1.ts',
  container_hint: 'ts',
}

describe('PlayerOverlay', () => {
  beforeEach(() => {
    createAdapter = fakeFactory()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // --- T028: RETURN durante o preparo cancela sem deixar estado pendente ---

  it('RETURN durante o preparo encerra a sessão e avisa quem abriu', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const onClose = vi.fn()
    const { container } = render(
      <PlayerOverlay itemId="item-1" channelName="Canal" onClose={onClose} createAdapter={createAdapter} />,
    )

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    expect(screen.getByText('Preparando…')).toBeInTheDocument()

    // Esperando o vídeo não há o que decidir, então a camada não tem controle
    // focável — desvio aceito e documentado em D-010 (emenda de 17/09/2026),
    // pelo mesmo motivo do estado `playing`. O que não pode faltar é a saída.
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(0)

    press('Escape')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ao desmontar, fecha a sessão do motor — sem áudio residual', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const { unmount } = render(
      <PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />,
    )

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    unmount()

    expect(driver.closeCount).toBe(1)
  })

  // --- T028b: o estado `playing` não tem elemento focável, mas tem saída ---

  it('no estado playing, sem elemento focável, RETURN continua encerrando', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const onClose = vi.fn()
    const { container } = render(
      <PlayerOverlay itemId="item-1" channelName="Canal" onClose={onClose} createAdapter={createAdapter} />,
    )

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onStateChange('buffering')
      driver.callbacks?.onStateChange('playing')
    })

    // Por desenho não há controles nesta fatia (D-010) — o vídeo ocupa a tela.
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(0)

    // ...mas o controle remoto nunca fica preso.
    press('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // --- T034/T035: erro com duas saídas focáveis ---

  it('falha de reprodução mostra "Tentar de novo" e "Voltar", com foco inicial', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    render(<PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />)

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onError({ code: null, message: 'Não foi possível reproduzir este canal.' })
    })

    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    const back = screen.getByRole('button', { name: 'Voltar' })
    expect(retry).toBeInTheDocument()
    expect(back).toBeInTheDocument()
    // Foco inicial cai numa das duas — nenhum estado fica sem saída focável.
    expect(document.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('"Voltar" a partir do erro devolve o controle a quem abriu', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const onClose = vi.fn()
    render(<PlayerOverlay itemId="item-1" channelName="Canal" onClose={onClose} createAdapter={createAdapter} />)

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onError({ code: null, message: 'falhou' })
    })
    await screen.findByRole('button', { name: 'Voltar' })

    press('ArrowRight')
    press('Enter')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // --- T036: nada de segredo na tela ---

  it('a tela de erro não mostra URL, host nem credenciais', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const { container } = render(
      <PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />,
    )

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onError({ code: null, message: 'Não foi possível reproduzir este canal.' })
    })
    await screen.findByRole('button', { name: 'Voltar' })

    const text = container.textContent ?? ''
    expect(text).not.toContain('senha')
    expect(text).not.toContain('usuario')
    expect(text).not.toContain('exemplo.invalid')
    expect(text).not.toContain('http')
  })

  // --- T037: retentativa busca de novo pelo id, sem reusar a URL ---

  it('"Tentar de novo" refaz a busca pelo id do item, sem reusar a URL anterior', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    render(<PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />)

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onError({ code: null, message: 'falhou' })
    })
    await screen.findByRole('button', { name: 'Tentar de novo' })

    expect(catalogApi.fetchPlayback).toHaveBeenCalledTimes(1)

    press('Enter')

    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledTimes(2))
    expect(vi.mocked(catalogApi.fetchPlayback).mock.calls[1][0]).toBe('item-1')
  })

  // --- A-004: a corrida entre listar e reproduzir (409) ---

  it('409 explica indisponibilidade e não oferece "Tentar de novo"', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockRejectedValue(
      new catalogApi.CatalogApiError(409, 'Item sem URL de reprodução disponível.'),
    )
    render(<PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />)

    await screen.findByText(/não tem uma fonte de reprodução disponível/)
    // Retentar não resolveria: o item simplesmente não tem URL.
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })

  it('falha de rede ao buscar a reprodução é retentável', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockRejectedValue(new Error('rede'))
    render(<PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />)

    await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByText(/Não foi possível reproduzir este canal/)).toBeInTheDocument()
  })

  // --- Plano de hardware: sem liberar a área, o canal toca sem imagem ---

  function planeVisible(): boolean {
    return document.documentElement.classList.contains('video-plane-visible')
  }

  it('com motor de plano de hardware, libera a área do vídeo ao reproduzir', async () => {
    createAdapter = fakeFactory(true)
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    render(<PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />)

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    // Preparando ainda é fundo preto: não há vídeo para revelar.
    expect(planeVisible()).toBe(false)

    act(() => {
      driver.callbacks?.onStateChange('buffering')
      driver.callbacks?.onStateChange('playing')
    })

    expect(planeVisible()).toBe(true)
  })

  it('com o motor <video> do desktop, o fundo preto permanece', async () => {
    createAdapter = fakeFactory(false)
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    render(<PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />)

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onStateChange('buffering')
      driver.callbacks?.onStateChange('playing')
    })

    expect(planeVisible()).toBe(false)
  })

  it('ao desmontar, devolve o fundo — classe esquecida deixaria o app inteiro transparente', async () => {
    createAdapter = fakeFactory(true)
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const { unmount } = render(
      <PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />,
    )

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onStateChange('buffering')
      driver.callbacks?.onStateChange('playing')
    })
    expect(planeVisible()).toBe(true)

    unmount()

    expect(planeVisible()).toBe(false)
  })

  it('ao cair em erro durante a reprodução, devolve o fundo para a tela ficar legível', async () => {
    createAdapter = fakeFactory(true)
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    render(<PlayerOverlay itemId="item-1" channelName="Canal" onClose={() => {}} createAdapter={createAdapter} />)

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onStateChange('buffering')
      driver.callbacks?.onStateChange('playing')
    })
    expect(planeVisible()).toBe(true)

    act(() => {
      driver.callbacks?.onError({ code: null, message: 'A transmissão foi interrompida.' })
    })
    await screen.findByRole('button', { name: 'Voltar' })

    expect(planeVisible()).toBe(false)
  })
})
