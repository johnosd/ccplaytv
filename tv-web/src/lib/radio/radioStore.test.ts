import { afterEach, describe, expect, it } from 'vitest'
import { RadioDb } from './radioDb'
import {
  COUNTRIES_FRESH_MS,
  readCachedCountries,
  readCachedStations,
  STATIONS_FRESH_MS,
  writeCachedCountries,
  writeCachedStations,
} from './radioCache'
import { isRadioFavorite, listRadioFavorites, refreshRadioFavorite, toggleRadioFavorite } from './radioFavorites'
import type { RadioStation } from './radioTypes'

let counter = 0
const opened: RadioDb[] = []

function freshDb(): RadioDb {
  counter += 1
  const database = new RadioDb(`radio-test-${counter}`)
  opened.push(database)
  return database
}

afterEach(async () => {
  for (const database of opened.splice(0)) await database.delete()
})

function station(uuid: string, name = uuid, streamUrl = `https://s.example/${uuid}`): RadioStation {
  return { id: `radio-browser:${uuid}`, uuid, name, streamUrl, countryCode: 'BR', tags: [], hls: false, popularity: 1 }
}

describe('radioCache', () => {
  it('países: fresco por 7 dias, depois vencido mas ainda legível', async () => {
    const database = freshDb()
    await writeCachedCountries([{ code: 'BR', directoryName: 'Brazil', stationCount: 3 }], 1000, database)
    expect((await readCachedCountries(1000 + COUNTRIES_FRESH_MS - 1, database))?.fresh).toBe(true)
    const stale = await readCachedCountries(1000 + COUNTRIES_FRESH_MS, database)
    expect(stale?.fresh).toBe(false)
    expect(stale?.value[0].code).toBe('BR')
  })

  it('estações: por entrada, frescas por 6 horas', async () => {
    const database = freshDb()
    await writeCachedStations('country:BR', [station('a')], 0, database)
    expect(await readCachedStations('country:PT', 0, database)).toBeNull()
    expect((await readCachedStations('country:BR', STATIONS_FRESH_MS - 1, database))?.fresh).toBe(true)
    expect((await readCachedStations('country:BR', STATIONS_FRESH_MS, database))?.fresh).toBe(false)
  })
})

describe('radioFavorites', () => {
  it('alterna pela identidade, ordena do mais recente e guarda o retrato', async () => {
    const database = freshDb()
    expect(await toggleRadioFavorite(station('a', 'A'), 10, database)).toBe(true)
    expect(await toggleRadioFavorite(station('b', 'B'), 20, database)).toBe(true)
    expect((await listRadioFavorites(database)).map((item) => item.id)).toEqual(['radio-browser:b', 'radio-browser:a'])
    expect(await isRadioFavorite('radio-browser:a', database)).toBe(true)

    expect(await toggleRadioFavorite(station('a', 'A'), 30, database)).toBe(false)
    expect(await isRadioFavorite('radio-browser:a', database)).toBe(false)
    expect((await listRadioFavorites(database)).map((item) => item.id)).toEqual(['radio-browser:b'])
  })

  it('refresh atualiza nome e URL sem mudar a data; sem favorito não cria', async () => {
    const database = freshDb()
    await toggleRadioFavorite(station('a', 'Velho'), 10, database)
    await refreshRadioFavorite(station('a', 'Novo', 'https://moved.example/a'), database)
    await refreshRadioFavorite(station('z'), database)
    const [favorite, ...others] = await listRadioFavorites(database)
    expect(others).toHaveLength(0)
    expect(favorite).toMatchObject({ name: 'Novo', lastStreamUrl: 'https://moved.example/a', favoritedAt: 10 })
  })
})
