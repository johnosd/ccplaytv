/**
 * Contrato da feature 090 (legendas externas) — comportamento observável do `PlayerLayer` com a prop
 * `externalSubtitles` (serviço, memória e alvo falsos). Fixado aqui (`plan.md` D-001…D-012,
 * `logic/legenda-externa.md` §4–§5): "Buscar legenda online" é uma linha do painel "Áudio e legendas" logo depois do
 * grupo Legendas; abre o diálogo "Buscar legenda online" com os resultados como botões (nome começa pela versão);
 * aplicar volta ao painel com a linha "Externa…" marcada; nenhuma chamada sai sem SELECT; erro tem ação focável.
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'
import {
  SubtitleError,
  type ExternalSubtitlesDeps,
  type StoredExternalSubtitle,
  type SubtitleLanguage,
  type SubtitleResult,
  type SubtitleSearchRequest,
  type SubtitleSearchResponse,
  type SubtitleTarget,
} from '../lib/subtitles/types'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

interface FakeSession {
  callbacks: PlayerAdapterCallbacks
  closeCount: number
  pauseCount: number
}

let sessions: FakeSession[]

/** Motor SEM API de faixas (como o `<video>` do desktop): só a legenda externa abre o painel. */
function fakeFactory(): PlayerAdapterFactory {
  sessions = []
  return (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    const s: FakeSession = { callbacks, closeCount: 0, pauseCount: 0 }
    sessions.push(s)
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {
        s.closeCount += 1
      },
      pause: () => {
        s.pauseCount += 1
      },
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (_ms, onSettled) => onSettled(),
    }
  }
}

const TARGET: SubtitleTarget = { stableId: 'src1|movie|id:item-1', sourceId: 'src1', kind: 'movie', title: 'Matrix', year: 1999, tmdbId: 603 }
const SRT = '1\n00:00:01,000 --> 00:00:03,000\nOlá de fora\n'

function fakeDeps() {
  const saved = new Map<string, StoredExternalSubtitle>()
  const deps = {
    service: {
      search: vi.fn(async (_request: SubtitleSearchRequest, _signal: AbortSignal): Promise<SubtitleSearchResponse> => ({
        results: [
          { id: 'os:9001', provider: 'opensubtitles', language: 'pt-BR', release: 'Matrix.1999.1080p.BluRay', downloads: 1234, hearingImpaired: false },
          { id: 'sd:3197651-3213944', provider: 'subdl', language: 'pt-BR', release: 'The.Matrix.1999.WEBRip.iTunes', hearingImpaired: false },
        ] satisfies SubtitleResult[],
        unavailable: [],
      })),
      download: vi.fn(async (_resultId: string, _language: SubtitleLanguage, _signal: AbortSignal) => SRT),
    },
    store: {
      load: vi.fn(async (stableId: string) => saved.get(stableId) ?? null),
      save: vi.fn(async (entry: StoredExternalSubtitle) => {
        saved.set(entry.stableId, entry)
        return true
      }),
      update: vi.fn(async () => {}),
    },
    resolveTarget: vi.fn(async () => TARGET),
  } satisfies ExternalSubtitlesDeps
  return deps
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function pressTimes(key: string, times: number) {
  for (let i = 0; i < times; i += 1) press(key)
}

function playbackOf(itemId = 'item-1') {
  return {
    item_id: itemId,
    kind: 'movie' as const,
    url: 'http://usuario:senha@exemplo.invalid/movie/1.mp4',
    container_hint: 'mp4',
    source_id: 'src1',
    provider_stream_id: itemId,
    original_name: 'Matrix (1999) [4K]',
    series_id: null,
    season_number: null,
    episode_number: null,
  }
}

async function startPlaying() {
  await waitFor(() => expect(sessions[0]).toBeDefined())
  act(() => sessions[0].callbacks.onStateChange('playing'))
}

/** Revela a linha do VOD e abre "Áudio e legendas" (dois passos à direita de ▶⏸), depois desce até "Buscar legenda online". */
async function openSearchRow() {
  pressTimes('ArrowRight', 2)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Áudio e legendas' })).toHaveClass('tv-focus'))
  press('Enter')
  const panel = screen.getByRole('dialog', { name: 'Áudio e legendas' })
  // Sem faixas do motor: Áudio-descrição (soft disabled) → Desativadas → Buscar legenda online.
  pressTimes('ArrowDown', 2)
  expect(within(panel).getByRole('button', { name: 'Buscar legenda online' })).toHaveClass('tv-focus')
}

describe('PlayerLayer — legendas externas (feature 090)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf())
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // US1/AC1+AC3, FR-001, FR-002, FR-006, FR-007, FR-008, SC-002: nada sai sem SELECT; buscar, escolher e ver a fala no tempo da mídia, sem mexer na reprodução.
  it('filme: nenhuma chamada até SELECT em "Buscar legenda online"; escolher um resultado aplica a legenda, marca "Externa" e a fala segue a posição da mídia', async () => {
    const deps = fakeDeps()
    render(
      <PlayerLayer itemId="item-1" title="Matrix" identity={{ title: 'Matrix' }} onClose={vi.fn()} createAdapter={fakeFactory()} externalSubtitles={deps} />,
    )
    await startPlaying()
    await openSearchRow()
    expect(deps.service.search).not.toHaveBeenCalled()
    expect(deps.service.download).not.toHaveBeenCalled()

    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Buscar legenda online' })
    expect(deps.service.search).toHaveBeenCalledTimes(1)
    expect(deps.service.search.mock.calls[0][0]).toEqual({ language: 'pt-BR', tmdbId: 603 })
    const result = await within(dialog).findByRole('button', { name: /^Matrix\.1999\.1080p\.BluRay/ })
    await waitFor(() => expect(result).toHaveClass('tv-focus'))
    // Lista única dos dois fornecedores, cada resultado dizendo de onde vem (ADR-021, SubDL incluído).
    expect(result).toHaveAccessibleName(/OpenSubtitles/)
    expect(within(dialog).getByRole('button', { name: /^The\.Matrix\.1999\.WEBRip\.iTunes.*SubDL/ })).toBeInTheDocument()

    press('Enter')
    await waitFor(() => expect(deps.service.download).toHaveBeenCalledTimes(1))
    expect(deps.service.download.mock.calls[0].slice(0, 2)).toEqual(['os:9001', 'pt-BR'])
    const panel = await screen.findByRole('dialog', { name: 'Áudio e legendas' })
    await waitFor(() => expect(within(panel).getByRole('radio', { name: /^Externa/ })).toHaveAttribute('aria-checked', 'true'))

    act(() => sessions[0].callbacks.onProgress?.({ positionMs: 1500, durationMs: 120_000 }))
    expect(await screen.findByText('Olá de fora')).toBeInTheDocument()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].closeCount).toBe(0)
    expect(sessions[0].pauseCount).toBe(0)
  })

  // FR-015, edge case "sem rede"; Constitution: Foco Visível e Sem Becos Sem Saída — o erro tem uma ação focável que de fato age.
  it('falha da busca mostra o erro com "Tentar de novo" focado, e SELECT nele busca de novo', async () => {
    const deps = fakeDeps()
    deps.service.search.mockRejectedValueOnce(new SubtitleError('offline'))
    render(
      <PlayerLayer itemId="item-1" title="Matrix" identity={{ title: 'Matrix' }} onClose={vi.fn()} createAdapter={fakeFactory()} externalSubtitles={deps} />,
    )
    await startPlaying()
    await openSearchRow()

    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Buscar legenda online' })
    const retry = await within(dialog).findByRole('button', { name: 'Tentar de novo' })
    await waitFor(() => expect(retry).toHaveClass('tv-focus'))

    press('Enter')
    await waitFor(() => expect(deps.service.search).toHaveBeenCalledTimes(2))
    expect(await within(dialog).findByRole('button', { name: /^Matrix\.1999\.1080p\.BluRay/ })).toBeInTheDocument()
  })
})
