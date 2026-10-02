/**
 * Feature 042, US2 (testes da fase, além dos contratos): tela de erro do
 * player com causa, código, ações (≤ 3 + Voltar) e "Info técnica" sanitizada.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import * as sourceAccess from '../lib/player/playbackSourceAccess'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})
vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})
vi.mock('../lib/player/playbackSourceAccess', () => ({ readPlaybackSourceAccess: vi.fn() }))

let callbacks: PlayerAdapterCallbacks | null

function fakeFactory(): PlayerAdapterFactory {
  callbacks = null
  return (cb): PlayerAdapter => {
    callbacks = cb
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {},
    }
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

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

function focusedLabel(): string | null {
  return document.querySelector('.player-actions .tv-focus')?.textContent ?? null
}

function labels(): string[] {
  return Array.from(document.querySelectorAll('.player-message .player-action')).map((el) => el.textContent ?? '')
}

async function mount(props: Partial<React.ComponentProps<typeof PlayerLayer>> = {}) {
  vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(MOVIE)
  const onClose = vi.fn()
  render(<PlayerLayer itemId="item-1" title="Filme" onClose={onClose} createAdapter={fakeFactory()} {...props} />)
  await waitFor(() => expect(callbacks).not.toBeNull())
  // Aguarda a leitura do estado da conta (assíncrona) antes da falha.
  await act(async () => {})
  return { onClose }
}

beforeEach(() => {
  vi.mocked(catalogApi.fetchPlayback).mockReset()
  vi.mocked(sourceAccess.readPlaybackSourceAccess).mockReset()
  vi.mocked(sourceAccess.readPlaybackSourceAccess).mockResolvedValue(null)
  void userStateRepository
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PlayerLayer — erro de reprodução acionável (feature 042, US2)', () => {
  it('sem rede: NET-01, "Tentar de novo" focado e sem reconexão', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    await mount()
    act(() => callbacks?.onError({ code: 'PLAYER_ERROR_CONNECTION_FAILED' }))
    expect(screen.getByTestId('player-error-code')).toHaveTextContent('NET-01')
    expect(labels()).toEqual(['Tentar de novo', 'Voltar'])
    expect(focusedLabel()).toBe('Tentar de novo')
  })

  it('formato não suportado: PLAY-02, a ação primária é "Info técnica" e não há "Tentar de novo"', async () => {
    await mount()
    act(() => callbacks?.onError({ code: 'PLAYER_ERROR_NOT_SUPPORTED_FILE' }))
    expect(screen.getByTestId('player-error-code')).toHaveTextContent('PLAY-02')
    expect(labels()).toEqual(['Info técnica', 'Voltar'])
    expect(focusedLabel()).toBe('Info técnica')
  })

  it('causa desconhecida: PLAY-04 com Tentar de novo, Info técnica e Voltar (a mensagem da tela é mantida)', async () => {
    await mount({ genericErrorMessage: 'Não foi possível reproduzir este filme.' })
    act(() => callbacks?.onError({ code: 'ALGO_DESCONHECIDO' }))
    // Um stream que nunca tocou vai direto ao erro (nada de reconexão).
    expect(screen.getByTestId('player-error-code')).toHaveTextContent('PLAY-04')
    expect(screen.getByText('Não foi possível reproduzir este filme.')).toBeInTheDocument()
    expect(labels()).toEqual(['Tentar de novo', 'Info técnica', 'Voltar'])
  })

  it('credencial recusada: SRC-401; "Editar lista" só existe com onEditSource e chama com o id da lista', async () => {
    vi.mocked(sourceAccess.readPlaybackSourceAccess).mockResolvedValue('refused')
    const onEditSource = vi.fn()
    await mount({ onEditSource })
    act(() => callbacks?.onError({ code: 'ALGO_DESCONHECIDO' }))
    expect(screen.getByTestId('player-error-code')).toHaveTextContent('SRC-401')
    expect(labels()).toEqual(['Editar lista', 'Info técnica', 'Voltar'])
    expect(focusedLabel()).toBe('Editar lista')
    press('Enter')
    expect(onEditSource).toHaveBeenCalledWith('src1')
  })

  it('sem onEditSource a ação "Editar lista" não aparece (nunca um botão sem efeito)', async () => {
    vi.mocked(sourceAccess.readPlaybackSourceAccess).mockResolvedValue('expired')
    await mount()
    act(() => callbacks?.onError({ code: null }))
    expect(screen.getByTestId('player-error-code')).toHaveTextContent('SRC-402')
    expect(labels()).toEqual(['Info técnica', 'Voltar'])
  })

  it('Info técnica: abre com 5 campos, sem URL/usuário/senha; RETURN fecha o painel e o seguinte fecha o player', async () => {
    const { onClose } = await mount()
    act(() => callbacks?.onError({ code: 'http://usuario:senha@exemplo.invalid/live/1.ts?token=abc' }))
    expect(labels()).toEqual(['Tentar de novo', 'Info técnica', 'Voltar'])

    press('ArrowRight') // Info técnica
    press('Enter')
    const panel = screen.getByRole('dialog', { name: 'Info técnica do erro' })
    expect(panel).toHaveTextContent('PLAY-04')
    expect(panel.querySelectorAll('dt')).toHaveLength(5)

    const everything = document.body.innerHTML
    for (const secret of ['usuario', 'senha', 'exemplo.invalid', 'token', 'abc123']) {
      expect(everything).not.toContain(secret)
    }

    press('Escape') // fecha só o painel
    expect(screen.queryByRole('dialog', { name: 'Info técnica do erro' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    press('Escape') // agora fecha o player
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a tela de erro e os atributos de acessibilidade nunca carregam URL nem credencial (SC-004)', async () => {
    await mount()
    act(() => callbacks?.onError({ code: 'PLAYER_ERROR_NOT_SUPPORTED_FILE', message: 'Falha.' }))
    const html = document.body.innerHTML
    for (const secret of ['usuario', 'senha', 'exemplo.invalid', 'http://']) {
      expect(html).not.toContain(secret)
    }
    expect(screen.getByRole('dialog', { name: /Erro de reprodução, código PLAY-02/ })).toBeInTheDocument()
  })

  it('409 (item sem fonte): SRC-409 e só "Voltar"', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockRejectedValue(new catalogApi.CatalogApiError(409, 'indisponível'))
    render(<PlayerLayer itemId="item-1" title="Filme" onClose={vi.fn()} createAdapter={fakeFactory()} />)
    await screen.findByTestId('player-error-code')
    expect(screen.getByTestId('player-error-code')).toHaveTextContent('SRC-409')
    expect(labels()).toEqual(['Voltar'])
  })
})
