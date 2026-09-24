import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
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
  seekCalls: number[]
  jumpCalls: number[]
  pauseCount: number
  resumeCount: number
}

function fakeFactory(rendersOnHardwarePlane = false): PlayerAdapterFactory {
  driver = {
    callbacks: null,
    closeCount: 0,
    openedUrls: [],
    seekCalls: [],
    jumpCalls: [],
    pauseCount: 0,
    resumeCount: 0,
  }
  return (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    driver.callbacks = callbacks
    return {
      name: 'fake',
      rendersOnHardwarePlane,
      // Motor declara tudo; a mídia de cada teste (PLAYBACK/MOVIE_PLAYBACK)
      // é que decide o que a sessão de fato resolve (D-001).
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: (url) => driver.openedUrls.push(url),
      close: () => {
        driver.closeCount += 1
      },
      pause: () => {
        driver.pauseCount += 1
      },
      resume: () => {
        driver.resumeCount += 1
      },
      seekTo: (ms, onSettled) => {
        driver.seekCalls.push(ms)
        onSettled()
      },
      jumpBy: (ms, onSettled) => {
        driver.jumpCalls.push(ms)
        onSettled()
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

/** Canal ao vivo: capacidades resolvem tudo `false` (media nega). */
const PLAYBACK = {
  item_id: 'item-1',
  kind: 'channel' as const,
  url: 'http://usuario:senha@exemplo.invalid/live/1.ts',
  container_hint: 'ts',
}

/** Filme: capacidades resolvem tudo `true` — usado nos testes de interação (T018). */
const MOVIE_PLAYBACK = {
  item_id: 'item-1',
  kind: 'movie' as const,
  url: 'http://usuario:senha@exemplo.invalid/movie/1.mp4',
  container_hint: 'mp4',
}

describe('PlayerLayer', () => {
  beforeEach(() => {
    createAdapter = fakeFactory()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('RETURN durante o preparo encerra a sessão e avisa quem abriu', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const onClose = vi.fn()
    const { container } = render(
      <PlayerLayer itemId="item-1" title="Item" onClose={onClose} createAdapter={createAdapter} />,
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
      <PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />,
    )

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    unmount()

    expect(driver.closeCount).toBe(1)
  })

  it('canal ao vivo em playing não tem elemento focável (sem capacidade nenhuma), mas RETURN continua encerrando', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const onClose = vi.fn()
    const { container } = render(
      <PlayerLayer itemId="item-1" title="Item" onClose={onClose} createAdapter={createAdapter} />,
    )

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onStateChange('buffering')
      driver.callbacks?.onStateChange('playing')
    })

    // Sem canPause/canSeek, playerControlsActions([]) é vazio — a barra não
    // existe, exatamente como antes desta feature (FR-022).
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(0)

    // ...mas o controle remoto nunca fica preso.
    press('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('falha de reprodução mostra "Tentar de novo" e "Voltar", com foco inicial', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    render(<PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />)

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onError({ code: null, message: 'Não foi possível reproduzir isto.' })
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
    render(<PlayerLayer itemId="item-1" title="Item" onClose={onClose} createAdapter={createAdapter} />)

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onError({ code: null, message: 'falhou' })
    })
    await screen.findByRole('button', { name: 'Voltar' })

    press('ArrowRight')
    press('Enter')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a tela de erro não mostra URL, host nem credenciais', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    const { container } = render(
      <PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />,
    )

    await waitFor(() => expect(driver.callbacks).not.toBeNull())
    act(() => {
      driver.callbacks?.onError({ code: null, message: 'Não foi possível reproduzir isto.' })
    })
    await screen.findByRole('button', { name: 'Voltar' })

    const text = container.textContent ?? ''
    expect(text).not.toContain('senha')
    expect(text).not.toContain('usuario')
    expect(text).not.toContain('exemplo.invalid')
    expect(text).not.toContain('http')
  })

  it('"Tentar de novo" refaz a busca pelo id do item, sem reusar a URL anterior', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    render(<PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />)

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

  // --- FR-011: distinguir "sem fonte" (409, não-retentável) de "falhou" ---

  it('409 explica indisponibilidade e não oferece "Tentar de novo" (FR-011)', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockRejectedValue(
      new catalogApi.CatalogApiError(409, 'Item sem URL de reprodução disponível.'),
    )
    render(<PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />)

    await screen.findByText(/não tem uma fonte de reprodução disponível/)
    // Retentar não resolveria: o item simplesmente não tem URL.
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })

  it('falha de rede ao buscar a reprodução é retentável, com mensagem distinta do 409 (FR-011)', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockRejectedValue(new Error('rede'))
    render(<PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />)

    await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByText(/Não foi possível reproduzir isto/)).toBeInTheDocument()
  })

  it('mensagens de indisponibilidade/erro são configuráveis por prop, sem citar URL/host/credencial', async () => {
    // É como a Live TV preserva a redação exata de hoje (T021/FR-022) sem
    // duplicar a máquina de estados inteira.
    vi.mocked(catalogApi.fetchPlayback).mockRejectedValue(new Error('rede'))
    render(
      <PlayerLayer
        itemId="item-1"
        title="Canal"
        onClose={() => {}}
        createAdapter={createAdapter}
        genericErrorMessage="Não foi possível reproduzir este canal."
      />,
    )

    expect(await screen.findByText('Não foi possível reproduzir este canal.')).toBeInTheDocument()
  })

  // --- Plano de hardware: sem liberar a área, o canal toca sem imagem ---

  function planeVisible(): boolean {
    return document.documentElement.classList.contains('video-plane-visible')
  }

  it('com motor de plano de hardware, libera a área do vídeo ao reproduzir', async () => {
    createAdapter = fakeFactory(true)
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
    render(<PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />)

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
    render(<PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />)

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
      <PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />,
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
    render(<PlayerLayer itemId="item-1" title="Item" onClose={() => {}} createAdapter={createAdapter} />)

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

  // --- T018: interação dos controles (logic/reproducao-vod.md §4, guia Samsung 06 §1) ---

  describe('interação dos controles (filme)', () => {
    async function renderPlaying() {
      // Fake timers desde antes do render: o temporizador de ocultar
      // (`scheduleHide`) já é armado assim que a sessão nasce, dentro do
      // efeito de montagem — instalar o clock falso depois deixaria esse
      // primeiro agendamento num `setTimeout` real, órfão do avanço de
      // relógio que os testes abaixo fazem.
      vi.useFakeTimers()
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE_PLAYBACK)
      const onClose = vi.fn()
      const utils = render(
        <PlayerLayer itemId="item-1" title="Filme" onClose={onClose} createAdapter={createAdapter} />,
      )
      // `waitFor` da testing-library reagenda sua checagem por `setInterval`,
      // que sob fake timers nunca dispara sozinho. A promessa de
      // `fetchPlayback` resolve por microtask, não por timer — basta
      // esvaziar a fila de microtasks dentro de `act`.
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(driver.callbacks).not.toBeNull()
      act(() => {
        driver.callbacks?.onStateChange('buffering')
        driver.callbacks?.onStateChange('playing')
        driver.callbacks?.onProgress?.({ positionMs: 60_000, durationMs: 600_000 })
      })
      return { ...utils, onClose }
    }

    it('controles começam visíveis, com foco no play/pause', async () => {
      await renderPlaying()
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(3) // jumpBack, playPause, jumpForward
      expect(buttons[1].className).toContain('tv-focus') // play/pause é o índice 1
    })

    it('com controles OCULTOS, esquerda/direita SALTAM e revelam a barra', async () => {
      await renderPlaying()
      press('ArrowRight') // qualquer tecla aqui só reafirma "visível" — força ocultar primeiro
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.queryAllByRole('button')).toHaveLength(0) // ocultos

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      })

      expect(driver.jumpCalls).toEqual([10_000])
      expect(screen.getAllByRole('button')).toHaveLength(3) // revelou de novo
    })

    it('com controles VISÍVEIS, esquerda/direita NAVEGAM entre ações, sem saltar', async () => {
      await renderPlaying()
      press('ArrowRight') // move o foco de playPause (1) pra jumpForward (2)

      expect(driver.jumpCalls).toEqual([]) // não saltou
      const buttons = screen.getAllByRole('button')
      expect(buttons[2].className).toContain('tv-focus')
    })

    it('SELECT com controles ocultos revela, sem executar a ação', async () => {
      await renderPlaying()
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.queryAllByRole('button')).toHaveLength(0)

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })

      expect(driver.pauseCount).toBe(0)
      expect(screen.getAllByRole('button')).toHaveLength(3)
    })

    it('SELECT com controles visíveis executa a ação focada (play/pause)', async () => {
      await renderPlaying()
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
      expect(driver.pauseCount).toBe(1)
    })

    it('oculta sozinho após 5s sem interação', async () => {
      await renderPlaying()
      expect(screen.getAllByRole('button')).toHaveLength(3)

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })

    it('NÃO oculta sozinho enquanto pausado', async () => {
      await renderPlaying()
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) // pausa
      })
      act(() => {
        driver.callbacks?.onStateChange('paused')
      })

      act(() => {
        vi.advanceTimersByTime(10_000)
      })

      expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    })

    it('RETURN encerra mesmo com os controles ocultos', async () => {
      const { onClose } = await renderPlaying()
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.queryAllByRole('button')).toHaveLength(0)

      press('Escape')

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
