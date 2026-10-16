/**
 * Contratos da feature 074 (Rádio global) — travados pelo sdd-plan. O sdd-execute só pode fazê-los passar.
 * Só pela interface pública: props da tela, texto visível, `listRadioFavorites()` e os colaboradores injetados
 * (diretório falso e motor de reprodução falso).
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioScreen } from './RadioScreen'
import { resetRadioSessionMemory } from './radioSessionMemory'
import { listRadioFavorites } from '../../lib/radio/radioFavorites'
import type { RadioDirectory, StationQuery } from '../../lib/radio/radioDirectory'
import type { RadioCountry, RadioStation } from '../../lib/radio/radioTypes'
import type { PlayerAdapter, PlayerAdapterCallbacks } from '../../lib/player/PlayerService'
import { FAVORITE_COLOR_KEY } from '../../lib/tizenColorKey'

const COUNTRIES: RadioCountry[] = [
  { code: 'PT', directoryName: 'Portugal', stationCount: 50 },
  { code: 'BR', directoryName: 'Brazil', stationCount: 500 },
  { code: 'AR', directoryName: 'Argentina', stationCount: 300 },
]

function station(uuid: string, name: string, countryCode: string, streamUrl = `https://stream.example/${uuid}`): RadioStation {
  return { id: `radio-browser:${uuid}`, uuid, name, streamUrl, countryCode, tags: ['pop'], hls: false, popularity: 10 }
}

const BR_STATIONS = [station('a', 'Rádio Alfa BR', 'BR'), station('b', 'Rádio Beta BR', 'BR')]
const AR_STATIONS = [station('c', 'Radio Gama AR', 'AR')]
const PT_STATIONS = [station('d', 'Rádio Delta PT', 'PT')]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fakeDirectory(overrides: Partial<RadioDirectory> = {}) {
  const byCountry: Record<string, RadioStation[]> = { BR: BR_STATIONS, AR: AR_STATIONS, PT: PT_STATIONS }
  const base = {
    listCountries: vi.fn(async (_signal?: AbortSignal) => COUNTRIES),
    listStations: vi.fn(async (query: StationQuery, _signal?: AbortSignal) => byCountry[query.countryCode ?? ''] ?? []),
    stationsByUuid: vi.fn(async (uuids: string[], _signal?: AbortSignal) => BR_STATIONS.filter((item) => uuids.includes(item.uuid))),
    reportClick: vi.fn((_uuid: string) => {}),
  }
  return { ...base, ...overrides } as typeof base
}

/** Motor falso: registra cada URL aberta. */
function fakeEngine() {
  const opened: string[] = []
  let callbacks: PlayerAdapterCallbacks | null = null
  const factory = (cb: PlayerAdapterCallbacks): PlayerAdapter => {
    callbacks = cb
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: false, canSeek: false, reportsPosition: false, reportsDuration: false },
      open: (url) => {
        opened.push(url)
      },
      close: () => {},
    }
  }
  return { factory, opened, play: () => act(() => callbacks?.onStateChange('playing')) }
}

function keydown(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function keyup(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

/** Toque rápido do controle: OK age ao soltar (o segurar OK é favoritar). */
function tap(key: string) {
  keydown(key)
  keyup(key)
}

beforeEach(() => {
  window.localStorage.clear()
  resetRadioSessionMemory()
})

afterEach(() => {
  cleanup()
})

describe('RadioScreen — contratos da feature 074', () => {
  // US1/AC2 + AC4; FR-008, FR-011, FR-012, FR-013 (TV em pt-BR → abre no Brasil; OK toca e a barra mostra a estação).
  it('abre no país da TV com as estações dele e OK toca a estação focada, mostrando-a em "Tocando agora"', async () => {
    const directory = fakeDirectory()
    const engine = fakeEngine()
    render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={engine.factory} />)

    expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()
    expect(directory.listStations).toHaveBeenCalledWith(expect.objectContaining({ countryCode: 'BR' }), expect.anything())
    expect(engine.opened).toHaveLength(0) // abrir a tela nunca toca

    tap('Enter')
    engine.play()

    expect(engine.opened).toEqual(['https://stream.example/a'])
    const nowPlaying = screen.getByRole('region', { name: 'Tocando agora' })
    expect(within(nowPlaying).getByText('Rádio Alfa BR')).toBeInTheDocument()
  })

  // FR-007, FR-012, SC-003; Constitution: focar não toca nem consulta serviço externo.
  it('mover o foco pela trilha de países não consulta o diretório nem toca nada', async () => {
    const directory = fakeDirectory()
    const engine = fakeEngine()
    render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={engine.factory} />)
    expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()

    tap('Escape') // da lista de estações para a trilha (foco no Brasil)
    const callsBefore = directory.listStations.mock.calls.length
    tap('ArrowDown')
    tap('ArrowDown')
    tap('ArrowUp')
    tap('ArrowDown')

    expect(directory.listStations.mock.calls.length).toBe(callsBefore)
    expect(engine.opened).toHaveLength(0)
    expect(screen.getByText('Rádio Alfa BR')).toBeInTheDocument() // a grade continua no Brasil
  })

  // FR-014 (uma resposta atrasada nunca substitui a escolha mais recente); logic/radio-tela.md §3.
  it('a resposta atrasada de um país escolhido antes nunca substitui o país escolhido por último', async () => {
    const ar = deferred<RadioStation[]>()
    const pt = deferred<RadioStation[]>()
    const directory = fakeDirectory({
      listStations: vi.fn((query: StationQuery) => {
        if (query.countryCode === 'AR') return ar.promise
        if (query.countryCode === 'PT') return pt.promise
        return Promise.resolve(BR_STATIONS)
      }),
    })
    render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={fakeEngine().factory} />)
    expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()

    // Trilha: ★ Favoritos, Mais ouvidas no mundo, Brasil (país da TV), depois por quantidade: Argentina, Portugal.
    tap('Escape')
    tap('ArrowDown') // Argentina
    tap('Enter')
    tap('Escape')
    tap('ArrowDown') // Portugal
    tap('Enter')

    await act(async () => {
      pt.resolve(PT_STATIONS)
    })
    await act(async () => {
      ar.resolve(AR_STATIONS)
    })

    expect(await screen.findByText('Rádio Delta PT')).toBeInTheDocument()
    expect(screen.queryByText('Radio Gama AR')).not.toBeInTheDocument()
  })

  // US2/AC1 + AC3; FR-020, FR-022, FR-023; Constitution: identidade de reprodução não depende da URL.
  it('favorito é guardado pela identidade da estação e, depois de reabrir, toca a versão atual do diretório', async () => {
    const engine = fakeEngine()
    const first = render(<RadioScreen onBack={() => {}} directory={fakeDirectory()} createAdapter={engine.factory} />)
    expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()

    keydown(FAVORITE_COLOR_KEY) // tecla amarela na estação focada
    keyup(FAVORITE_COLOR_KEY)
    expect(engine.opened).toHaveLength(0) // favoritar nunca toca

    await waitFor(async () => {
      const favorites = await listRadioFavorites()
      expect(favorites.map((item) => item.id)).toEqual(['radio-browser:a'])
    })
    first.unmount()

    const moved = station('a', 'Rádio Alfa BR', 'BR', 'https://moved.example/a')
    const directory = fakeDirectory({ stationsByUuid: vi.fn(async () => [moved]) })
    render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={engine.factory} />)
    expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()

    tap('Escape') // trilha, no Brasil
    tap('ArrowUp') // Mais ouvidas no mundo
    tap('ArrowUp') // ★ Favoritos
    tap('Enter')
    expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()
    tap('Enter')

    await waitFor(() => expect(engine.opened).toEqual(['https://moved.example/a']))
    expect(directory.stationsByUuid).toHaveBeenCalledWith(['a'], expect.anything())
  })
})
