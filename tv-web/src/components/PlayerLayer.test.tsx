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

/**
 * Só `updateProgress`/`clearProgress` viram espiã — `buildStableId` (que
 * `stableIdOf` de `catalogApi.ts` usa por baixo) continua real. Evita
 * provar a identidade de retomada (feature 012, R-001) através de uma
 * escrita de verdade no IndexedDB: outros testes deste arquivo usam
 * `vi.useFakeTimers()`, e uma gravação real iniciada sob relógio falso
 * nunca completa — a conclusão da transação some para sempre (achado
 * nesta feature), e mais tarde estoura como rejeição não tratada
 * (`TransactionInactiveError`) quando o relógio real volta num teste
 * seguinte. A escrita em si (grava o número certo, sob a chave certa) já
 * está coberta por `progressRecorder.test.ts`, que chama o gravador direto
 * sem passar por React nem pelo motor fake.
 */
vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn() }
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
  source_id: 'src1',
  provider_stream_id: '1',
  original_name: 'Canal',
  series_id: null,
  season_number: null,
  episode_number: null,
}

/** Filme: capacidades resolvem tudo `true` — usado nos testes de interação (T018). */
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

/** Episódio: mesmas capacidades do filme (`FULL`), com identidade de série (feature 012). */
const EPISODE_PLAYBACK = {
  item_id: 'item-1',
  kind: 'episode' as const,
  url: 'http://usuario:senha@exemplo.invalid/series/1.mp4',
  container_hint: 'mp4',
  source_id: 'src1',
  provider_stream_id: '1',
  original_name: 'Piloto',
  series_id: 'srv-7',
  season_number: 1,
  episode_number: 1,
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

  describe('identidade de retomada por temporada/episódio (feature 012, R-001)', () => {
    it('episódio grava progresso sob o id de stableIdOf, com temporada/episódio na chave', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(EPISODE_PLAYBACK)
      render(<PlayerLayer itemId="item-1" title="Piloto" onClose={vi.fn()} createAdapter={createAdapter} />)

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => {
        driver.callbacks?.onStateChange('buffering')
        driver.callbacks?.onStateChange('playing')
      })
      act(() => {
        // 40s — acima do limiar inicial (RESUME_MIN_SECONDS=30), bem abaixo
        // do limiar final: dispara escrita imediata (primeira gravação).
        driver.callbacks?.onProgress?.({ positionMs: 40_000, durationMs: 1_200_000 })
      })

      const expectedId = catalogApi.stableIdOf(EPISODE_PLAYBACK)
      expect(expectedId).toBe('src1|episode|id:1|s1|e1')
      expect(userStateRepository.updateProgress).toHaveBeenCalledWith(expectedId, 'src1', 40, expect.anything())
    })

    it('sem providerStreamId, dois episódios da mesma série gravam sob ids distintos (temporada/episódio desambiguam)', async () => {
      const s1e2 = { ...EPISODE_PLAYBACK, provider_stream_id: null, episode_number: 2 }
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(s1e2)
      render(<PlayerLayer itemId="item-1" title="E2" onClose={vi.fn()} createAdapter={createAdapter} />)

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => driver.callbacks?.onStateChange('playing'))
      act(() => driver.callbacks?.onProgress?.({ positionMs: 90_000, durationMs: 1_200_000 }))

      const id1 = catalogApi.stableIdOf({ ...EPISODE_PLAYBACK, provider_stream_id: null })
      const id2 = catalogApi.stableIdOf(s1e2)
      expect(id1).not.toBe(id2)
      expect(userStateRepository.updateProgress).toHaveBeenCalledWith(id2, 'src1', 90, expect.anything())
      expect(userStateRepository.updateProgress).not.toHaveBeenCalledWith(id1, expect.anything(), expect.anything(), expect.anything())
    })
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

    // --- Achado na TV física (Fase 6): barra de progresso como 4º alvo de
    // foco, acima dos botões — CIMA entra nela, BAIXO sai. Esquerda/direita
    // continuam só entre os três botões (nunca alcançam a barra). ---

    it('esquerda/direita entre os botões nunca alcançam a barra, mesmo insistindo', async () => {
      const { container } = await renderPlaying()
      press('ArrowRight') // playPause(1) -> jumpForward(2)
      press('ArrowRight') // já no último botão — clampado, não avança pra barra

      expect(driver.jumpCalls).toEqual([])
      expect(container.querySelector('.player-time-bar')?.className).not.toContain('tv-focus')
      const buttons = screen.getAllByRole('button')
      expect(buttons[2].className).toContain('tv-focus') // continua em jumpForward
    })

    it('CIMA a partir de um botão entra na barra (4º alvo), sem saltar', async () => {
      const { container } = await renderPlaying()
      press('ArrowUp') // playPause -> seekBar

      expect(driver.jumpCalls).toEqual([])
      expect(container.querySelector('.player-time-bar')?.className).toContain('tv-focus')
    })

    it('com a BARRA focada, esquerda/direita buscam direto, sem mover o foco', async () => {
      const { container } = await renderPlaying()
      press('ArrowUp') // -> seekBar

      press('ArrowRight') // busca, não navega

      expect(driver.jumpCalls).toEqual([10_000])
      expect(container.querySelector('.player-time-bar')?.className).toContain('tv-focus') // continua na barra

      press('ArrowLeft') // busca pra trás, ainda sem sair da barra

      expect(driver.jumpCalls).toEqual([10_000, -10_000])
      expect(container.querySelector('.player-time-bar')?.className).toContain('tv-focus')
    })

    it('BAIXO com a barra focada volta o foco pro play/pause', async () => {
      const { container } = await renderPlaying()
      press('ArrowUp') // -> seekBar

      press('ArrowDown')

      expect(container.querySelector('.player-time-bar')?.className).not.toContain('tv-focus')
      const buttons = screen.getAllByRole('button')
      expect(buttons[1].className).toContain('tv-focus') // de volta ao play/pause
    })

    it('CIMA com a barra já focada não faz nada (já está no topo)', async () => {
      const { container } = await renderPlaying()
      press('ArrowUp') // -> seekBar
      press('ArrowUp') // já no topo

      expect(driver.jumpCalls).toEqual([])
      expect(container.querySelector('.player-time-bar')?.className).toContain('tv-focus')
    })

    it('SELECT com a barra focada não executa nenhuma ação (o gesto dela é esquerda/direita)', async () => {
      await renderPlaying()
      press('ArrowUp') // -> seekBar

      press('Enter')

      expect(driver.pauseCount).toBe(0)
      expect(driver.jumpCalls).toEqual([])
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

  // --- T039/T041: US3 — o filme termina ---

  describe('conclusão (US3)', () => {
    it('filme: estado completed fecha a camada e chama onClose, sem tela de erro', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE_PLAYBACK)
      const onClose = vi.fn()
      render(<PlayerLayer itemId="item-1" title="Filme" onClose={onClose} createAdapter={createAdapter} />)

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => {
        driver.callbacks?.onStateChange('buffering')
        driver.callbacks?.onStateChange('playing')
      })

      act(() => {
        driver.callbacks?.onCompleted?.()
      })

      // Feature 019, T023: `onExit('completed')` agora aguarda a escrita
      // (markCompleted) antes de chamar onClose — não é mais síncrono.
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
      expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    })

    it('canal ao vivo: onCompleted continua produzindo a tela de erro de transmissão interrompida (FR-021, não-regressão)', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
      const onClose = vi.fn()
      render(<PlayerLayer itemId="item-1" title="Item" onClose={onClose} createAdapter={createAdapter} />)

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => {
        driver.callbacks?.onStateChange('buffering')
        driver.callbacks?.onStateChange('playing')
      })

      act(() => {
        driver.callbacks?.onCompleted?.()
      })

      expect(await screen.findByText('A transmissão foi interrompida.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
      // Transmissão contínua não conclui — a camada continua aberta em erro,
      // não fechada como o filme.
      expect(onClose).not.toHaveBeenCalled()
    })

    // --- feature 012 (D-008): onCompleted substitui onClose na conclusão ---

    it('com onCompleted, a conclusão chama onCompleted e NÃO onClose', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(EPISODE_PLAYBACK)
      const onClose = vi.fn()
      const onCompleted = vi.fn()
      render(
        <PlayerLayer
          itemId="item-1"
          title="Episódio"
          onClose={onClose}
          onCompleted={onCompleted}
          createAdapter={createAdapter}
        />,
      )

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => {
        driver.callbacks?.onStateChange('buffering')
        driver.callbacks?.onStateChange('playing')
      })
      act(() => driver.callbacks?.onCompleted?.())

      await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1))
      expect(onClose).not.toHaveBeenCalled()
    })

    it('mesmo com onCompleted presente, RETURN e erro continuam chamando onClose', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(EPISODE_PLAYBACK)
      const onClose = vi.fn()
      const onCompleted = vi.fn()
      render(
        <PlayerLayer
          itemId="item-1"
          title="Episódio"
          onClose={onClose}
          onCompleted={onCompleted}
          createAdapter={createAdapter}
        />,
      )

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      press('Escape')

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onCompleted).not.toHaveBeenCalled()
    })

    it('sem onCompleted, o comportamento da 011 continua intacto (conclusão chama onClose)', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(EPISODE_PLAYBACK)
      const onClose = vi.fn()
      render(<PlayerLayer itemId="item-1" title="Episódio" onClose={onClose} createAdapter={createAdapter} />)

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => {
        driver.callbacks?.onStateChange('buffering')
        driver.callbacks?.onStateChange('playing')
      })
      act(() => driver.callbacks?.onCompleted?.())

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })
  })

  describe('suporte a zapping (feature 016, topLayer)', () => {
    it('T010: topLayer intercepta botões e não chama controles', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE_PLAYBACK)
      const topLayer = {
        content: <div data-testid="top-content">topLayer</div>,
        onDirection: vi.fn(),
        onSelect: vi.fn(),
        onBack: vi.fn(),
      }
      render(
        <PlayerLayer itemId="item-1" title="TopLayer Test" onClose={vi.fn()} createAdapter={createAdapter} topLayer={topLayer} />
      )
      
      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => {
        driver.callbacks?.onStateChange('buffering')
        driver.callbacks?.onStateChange('playing')
      })

      // Select interceptado
      press('Enter')
      expect(topLayer.onSelect).toHaveBeenCalledTimes(1)

      // Direção interceptada
      press('ArrowLeft')
      expect(topLayer.onDirection).toHaveBeenCalledWith('left')

      // Back interceptado
      press('Escape')
      expect(topLayer.onBack).toHaveBeenCalledTimes(1)

      // Não mostrou controles, não buscou, não pausou
      expect(screen.queryByTestId('player-controls')).not.toBeInTheDocument()
      expect(driver.seekCalls.length).toBe(0)
      expect(driver.jumpCalls.length).toBe(0)
      expect(driver.pauseCount).toBe(0)
    })

    it('T011: SELECT sem controles disponíveis e sem topLayer chama onIdleSelect', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK) // live channel, sem controles
      const onIdleSelect = vi.fn()
      render(
        <PlayerLayer itemId="item-1" title="Live" onClose={vi.fn()} createAdapter={createAdapter} onIdleSelect={onIdleSelect} />
      )

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => {
        driver.callbacks?.onStateChange('playing')
      })

      press('Enter')
      expect(onIdleSelect).toHaveBeenCalledTimes(1)
    })

    it('T012: onEnteredPlaying dispara só uma vez quando atinge playing pela primeira vez', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
      const onEnteredPlaying = vi.fn()
      render(
        <PlayerLayer itemId="item-1" title="Live" onClose={vi.fn()} createAdapter={createAdapter} onEnteredPlaying={onEnteredPlaying} />
      )

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => driver.callbacks?.onStateChange('buffering'))
      expect(onEnteredPlaying).not.toHaveBeenCalled()

      act(() => driver.callbacks?.onStateChange('playing'))
      expect(onEnteredPlaying).toHaveBeenCalledTimes(1)

      // rebuffering e de novo playing não deve disparar novamente
      act(() => driver.callbacks?.onStateChange('buffering'))
      act(() => driver.callbacks?.onStateChange('playing'))
      expect(onEnteredPlaying).toHaveBeenCalledTimes(1)
    })

    it('T013: onSessionError dispara com mensagem sanitizada e topLayer permanece', async () => {
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(PLAYBACK)
      const onSessionError = vi.fn()
      const topLayer = {
        content: <div data-testid="top-content">Meu Zapping</div>,
        onDirection: vi.fn(),
        onSelect: vi.fn(),
        onBack: vi.fn(),
      }
      render(
        <PlayerLayer 
          itemId="item-1" 
          title="Live" 
          onClose={vi.fn()} 
          createAdapter={createAdapter} 
          onSessionError={onSessionError} 
          topLayer={topLayer}
          genericErrorMessage="Erro 1234"
        />
      )

      await waitFor(() => expect(driver.callbacks).not.toBeNull())
      act(() => driver.callbacks?.onStateChange('playing'))
      
      // dispara erro
      act(() => {
        driver.callbacks?.onError?.({ code: null, message: 'Fatal AVPlay crash' })
        driver.callbacks?.onStateChange('error')
      })

      expect(onSessionError).toHaveBeenCalledWith('Fatal AVPlay crash') // O mock do fake repassa o erro
      
      // O top layer permanece
      expect(screen.getByTestId('top-content')).toBeInTheDocument()
    })
  })
})
