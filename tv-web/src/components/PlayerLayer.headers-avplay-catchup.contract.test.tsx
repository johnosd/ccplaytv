/**
 * Contrato da feature 058 (headers da lista no motor e catch-up Xtream) —
 * comportamento observável de `PlayerLayer` com um motor falso.
 *
 * Fixado por este contrato (`plan.md` D-001..D-012, `logic/headers.md`,
 * `logic/arquivo.md`): os headers do item chegam ao `open` do motor; uma
 * falha com header RECUSADO pelo motor diz que a lista exige um header que a
 * TV não envia, sem nunca mostrar o valor; a prop `archive` toca o programa
 * por `fetchArchivePlayback` (nunca `fetchPlayback`), com selo "Arquivo",
 * linha do tempo do EPG, controle "Ao vivo", fim → `onArchiveEnded` e nenhum
 * registro de progresso/histórico.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import type {
  PlayerAdapter,
  PlayerAdapterCallbacks,
  PlayerAdapterFactory,
  RequestHeaderName,
  RequestHeaders,
} from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn(), fetchArchivePlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

interface FakeSession {
  callbacks: PlayerAdapterCallbacks
  url: string | null
  headers: RequestHeaders | undefined
}

let sessions: FakeSession[]

/** Motor falso. `refuseHeaders`: recusa todo header pedido (como um firmware sem suporte). */
function fakeFactory({ refuseHeaders }: { refuseHeaders: boolean }): PlayerAdapterFactory {
  sessions = []
  return (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    const s: FakeSession = { callbacks, url: null, headers: undefined }
    sessions.push(s)
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: (url, _region, _startAtMs, headers) => {
        s.url = url
        s.headers = headers
      },
      requestHeadersReport: () => {
        const names: RequestHeaderName[] = []
        if (s.headers?.userAgent !== undefined) names.push('User-Agent')
        if (s.headers?.referer !== undefined) names.push('Referer')
        return refuseHeaders ? { applied: [], refused: names } : { applied: names, refused: [] }
      },
      close: () => {},
      pause: () => {},
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (_ms, onSettled) => onSettled(),
    }
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const SECRET_UA = 'AgenteSecreto/9.9'
const SECRET_REFERER = 'http://referer-secreto.invalid/painel'

function channelPlayback(headers?: RequestHeaders) {
  return {
    item_id: 'ch-7',
    kind: 'channel' as const,
    url: 'http://usuario:senha@exemplo.invalid/live/7.ts',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: null,
    original_name: 'Canal Sete',
    series_id: null,
    season_number: null,
    episode_number: null,
    ...(headers ? { headers } : {}),
  }
}

/** Texto visível + todos os atributos — onde um valor de header nunca pode aparecer (FR-006). */
function everythingRendered(): string {
  const attrs = Array.from(document.querySelectorAll('*')).flatMap((el) => Array.from(el.attributes).map((a) => a.value))
  return `${document.body.textContent ?? ''} ${attrs.join(' ')}`
}

describe('PlayerLayer — headers da lista e arquivo (feature 058)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(catalogApi.fetchArchivePlayback).mockReset()
    vi.mocked(userStateRepository.updateProgress).mockReset()
    vi.mocked(userStateRepository.markCompleted).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // US1-AC1/AC3/AC4; FR-001, FR-002, FR-004, FR-006; Constitution: Segredos Fora dos Clientes e dos Logs.
  it('headers do item chegam ao motor; falha com header recusado explica o header sem mostrar o valor; sem headers, o erro é o de sempre', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(channelPlayback({ userAgent: SECRET_UA, referer: SECRET_REFERER }))
    const refusing = fakeFactory({ refuseHeaders: true })
    render(
      <PlayerLayer itemId="ch-7" title="Canal Sete" onClose={vi.fn()} createAdapter={refusing} genericErrorMessage="Erro genérico do canal." />,
    )
    await waitFor(() => expect(sessions[0]?.url).not.toBeNull())
    expect(sessions[0].headers).toEqual({ userAgent: SECRET_UA, referer: SECRET_REFERER })

    act(() => sessions[0].callbacks.onError({ code: null }))
    await waitFor(() => expect(screen.getByText(/header que esta TV não envia/)).toBeInTheDocument())
    expect(screen.queryByText('Erro genérico do canal.')).not.toBeInTheDocument()
    expect(everythingRendered()).not.toContain(SECRET_UA)
    expect(everythingRendered()).not.toContain('referer-secreto')

    cleanup()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(channelPlayback())
    const plain = fakeFactory({ refuseHeaders: true })
    render(
      <PlayerLayer itemId="ch-7" title="Canal Sete" onClose={vi.fn()} createAdapter={plain} genericErrorMessage="Erro genérico do canal." />,
    )
    await waitFor(() => expect(sessions[0]?.url).not.toBeNull())
    expect(sessions[0].headers ?? {}).toEqual({})
    act(() => sessions[0].callbacks.onError({ code: null }))
    await waitFor(() => expect(screen.getByText('Erro genérico do canal.')).toBeInTheDocument())
    expect(screen.queryByText(/header que esta TV não envia/)).not.toBeInTheDocument()
  })

  // US2-AC2/AC3/AC4/AC5; FR-010, FR-011, FR-012, FR-013, FR-019; Constitution: Identidade de Reprodução Não Depende da URL.
  it('arquivo: toca pela URL de arquivo, mostra "Arquivo" e a duração do EPG, "Ao vivo" chama onGoLive, o fim chama onArchiveEnded e nada vai para o histórico', async () => {
    const start = Date.now() - 3 * 3_600_000
    const end = start + 90 * 60_000
    vi.mocked(catalogApi.fetchArchivePlayback).mockResolvedValue({
      ...channelPlayback(),
      kind: 'archive',
      url: 'http://usuario:senha@exemplo.invalid/timeshift/u/p/90/x/7.ts',
    })
    const createAdapter = fakeFactory({ refuseHeaders: false })
    const onClose = vi.fn()
    const onArchiveEnded = vi.fn()
    const onGoLive = vi.fn()
    render(
      <PlayerLayer
        itemId="ch-7"
        title="Canal Sete"
        identity={{ title: 'Canal Sete' }}
        archive={{ start, end, title: 'Jogo da tarde' }}
        onClose={onClose}
        onArchiveEnded={onArchiveEnded}
        onGoLive={onGoLive}
        createAdapter={createAdapter}
      />,
    )
    await waitFor(() => expect(sessions[0]?.url).toBe('http://usuario:senha@exemplo.invalid/timeshift/u/p/90/x/7.ts'))
    expect(catalogApi.fetchArchivePlayback).toHaveBeenCalledWith('ch-7', { start, end })
    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()

    // O motor não informa duração: a barra usa a do programa no EPG (1h30).
    act(() => {
      sessions[0].callbacks.onStateChange('playing')
      sessions[0].callbacks.onProgress?.({ positionMs: 60_000 })
    })
    await waitFor(() => expect(screen.getByText('1h30')).toBeInTheDocument())
    expect(screen.getByText('Arquivo')).toBeInTheDocument()
    expect(screen.queryByText('AO VIVO')).not.toBeInTheDocument()
    expect(screen.getByText('Jogo da tarde')).toBeInTheDocument()

    // Linha do arquivo: ⏪ ▶⏸ ⏩ Ao vivo … — o foco abre em ▶⏸; dois passos à direita.
    expect(screen.getByRole('button', { name: 'Pausar' })).toHaveClass('tv-focus')
    press('ArrowRight')
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Ao vivo' })).toHaveClass('tv-focus')
    press('Enter')
    expect(onGoLive).toHaveBeenCalledTimes(1)

    act(() => sessions[0].callbacks.onCompleted?.())
    await waitFor(() => expect(onArchiveEnded).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
    expect(userStateRepository.updateProgress).not.toHaveBeenCalled()
    expect(userStateRepository.markCompleted).not.toHaveBeenCalled()
  })
})
