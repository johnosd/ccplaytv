// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../catalog/db'
import { notifyCategoryAccessChanged } from '../catalog/categoryAccess'
import { deleteSource } from '../catalog/sourceRepository'
import { disableParentalControl, enableParentalControl, pinActiveHint, syncPinHints } from './listPin'

/** Feature 067 (T012, R-006): espelho síncrono "esta lista tem PIN" — só ids, por lista, realinhado ao abrir o app. */

afterEach(async () => {
  await Promise.all([db.table('parentalPins').clear(), db.sources.clear()])
  notifyCategoryAccessChanged()
  localStorage.clear()
})

describe('listPin — espelho por lista', () => {
  it('ligar marca só a própria lista; desligar desmarca só ela; nada além de ids fica no armazenamento', async () => {
    await enableParentalControl('sala', '1357', [])
    await enableParentalControl('quarto', '2468', [])
    expect(pinActiveHint('sala')).toBe(true)
    expect(pinActiveHint('quarto')).toBe(true)
    expect(pinActiveHint('outra')).toBe(false)

    await disableParentalControl('sala')
    expect(pinActiveHint('sala')).toBe(false)
    expect(pinActiveHint('quarto')).toBe(true)
    const stored = JSON.stringify({ ...localStorage })
    expect(stored).not.toContain('1357')
    expect(stored).not.toContain('2468')
  })

  it('syncPinHints realinha com o IndexedDB, tira a lista excluída e apaga o espelho global da 066', async () => {
    await db.sources.put({ id: 'quarto', type: 'm3u_url', displayName: 'Quarto', connectionState: 'synced', createdAt: 0, updatedAt: 0 })
    await enableParentalControl('quarto', '2468', [])
    localStorage.setItem('ccplay.parental.pinActive', '1')
    localStorage.setItem('ccplay.parental.pinSources', JSON.stringify(['quarto', 'fantasma']))

    await syncPinHints()
    expect(pinActiveHint('fantasma')).toBe(false)
    expect(pinActiveHint('quarto')).toBe(true)
    expect(localStorage.getItem('ccplay.parental.pinActive')).toBeNull()

    await deleteSource('quarto')
    await syncPinHints()
    expect(pinActiveHint('quarto')).toBe(false)
  })

  it('armazenamento corrompido não derruba nada: lê como "sem PIN"', () => {
    localStorage.setItem('ccplay.parental.pinSources', '{não é json')
    expect(pinActiveHint('sala')).toBe(false)
  })
})
