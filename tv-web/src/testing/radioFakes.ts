import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { PlayerAdapter, PlayerAdapterCallbacks } from '../lib/player/PlayerService'
import type { RadioDirectory, StationQuery } from '../lib/radio/radioDirectory'
import type { RadioCountry, RadioStation } from '../lib/radio/radioTypes'

/** Fakes dos testes da Rádio (feature 074) que não são contratos travados. */

export const RADIO_COUNTRIES: RadioCountry[] = [
  { code: 'PT', directoryName: 'Portugal', stationCount: 50 },
  { code: 'BR', directoryName: 'Brazil', stationCount: 500 },
  { code: 'AR', directoryName: 'Argentina', stationCount: 300 },
]

export function radioStation(uuid: string, name: string, countryCode = 'BR', extra: Partial<RadioStation> = {}): RadioStation {
  return {
    id: `radio-browser:${uuid}`,
    uuid,
    name,
    streamUrl: `https://stream.example/${uuid}`,
    countryCode,
    tags: ['pop', 'rock', 'news'],
    hls: false,
    popularity: 10,
    ...extra,
  }
}

export const BR_STATIONS = [radioStation('a', 'Rádio Alfa BR'), radioStation('b', 'Rádio Beta BR'), radioStation('c', 'Rádio Gama BR')]

export function fakeRadioDirectory(overrides: Partial<RadioDirectory> = {}) {
  const base = {
    listCountries: vi.fn(async (_signal?: AbortSignal) => RADIO_COUNTRIES),
    listStations: vi.fn(async (query: StationQuery, _signal?: AbortSignal) => (query.countryCode === 'BR' ? BR_STATIONS : [])),
    stationsByUuid: vi.fn(async (uuids: string[], _signal?: AbortSignal) => BR_STATIONS.filter((item) => uuids.includes(item.uuid))),
    reportClick: vi.fn((_uuid: string) => {}),
  }
  return { ...base, ...overrides } as typeof base
}

/** Motor falso: registra URLs abertas e fechamentos, e deixa o teste dirigir o estado. */
export function fakeRadioEngine() {
  const opened: string[] = []
  let closed = 0
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
      close: () => {
        closed += 1
      },
    }
  }
  return {
    factory,
    opened,
    get closed() {
      return closed
    },
    play: () => act(() => callbacks?.onStateChange('playing')),
    fail: () => act(() => callbacks?.onError({ code: null, message: 'falhou' })),
  }
}

export function radioKey(type: 'keydown' | 'keyup', key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
  })
}

/** Toque rápido do controle (OK age ao soltar quando há gesto de segurar). */
export function radioTap(key: string) {
  radioKey('keydown', key)
  radioKey('keyup', key)
}
