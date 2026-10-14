import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord, type SourceRecord } from '../catalog/db'
import { renewCategoryItems, storeCategories } from '../catalog/catalogRepository'
import { listVisibleCategories, relockSession, setCategoryPreference } from '../catalog/categoryAccess'
import { deleteSource } from '../catalog/sourceRepository'
import { disableParentalControl, enableParentalControl, hasPin, recoverPinWithSource, verifyPin } from './listPin'
import { migrateLegacyPin } from './pinMigration'
import { sha256Hex } from './sha256'

/**
 * Teste de CONTRATO da feature 067 — PIN parental por lista (US3) e a migração do PIN único da 066 (FR-024). Travado em
 * `sdd/specs/067-configuracoes-lista-global/contract-tests.lock`; o sdd-execute só pode fazê-lo passar.
 * Regras: `logic/pin-por-lista.md`.
 */

let database: CatalogDb

const movie = (sourceId: string, id: string, groupOrder: number): CatalogRecord => ({
  sourceId, generation: 1, kind: 'movie', name: `Filme ${id}`, originalName: `Filme ${id}`, groupOrder, providerStreamId: id, addedAt: 1,
})

async function seedSource(source: Partial<SourceRecord> & { id: string }, categories: Array<{ name: string; pid: string }>) {
  await database.sources.put({ type: 'provider_credentials', displayName: source.id, connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0, ...source })
  const ids = await storeCategories(
    categories.map((category, order) => ({ sourceId: source.id, generation: 1, kind: 'movie' as const, fetchMode: 'on_demand' as const, name: category.name, order, providerCategoryId: category.pid })),
    database,
  )
  for (const [order, category] of categories.entries()) {
    await renewCategoryItems({ sourceId: source.id, generation: 1, kind: 'movie', categoryId: ids[order], groupOrder: order }, [movie(source.id, `${category.pid}-1`, order)], 1, database)
  }
}

const ref = (sourceId: string, name: string, pid: string) => ({ sourceId, kind: 'movie' as const, providerCategoryId: pid, name })

async function lockedNames(sourceId: string): Promise<Array<string | undefined>> {
  return (await listVisibleCategories(sourceId, 'movie', database)).filter((category) => category.locked).map((category) => category.name)
}

async function everythingStored(): Promise<string> {
  const dumps = await Promise.all(database.tables.map(async (table) => JSON.stringify(await table.toArray())))
  return dumps.join('\n')
}

beforeEach(() => {
  database = new CatalogDb(`TestDB_067_pin_${Math.random()}`)
})

afterEach(async () => {
  relockSession()
  vi.restoreAllMocks()
  await database.delete()
  database.close()
})

describe('067 — PIN por lista (contrato)', () => {
  it('US3/AC1..AC5, FR-017/FR-018/FR-023/FR-025: cada lista tem o seu PIN; o de uma não vale na outra; desligar e excluir mexem só na própria lista', async () => {
    await seedSource({ id: 'sala', providerDns: 'http://painel.test', providerUsername: 'joao', providerPassword: 's3nh4-forte' }, [{ name: 'Noite', pid: '9' }])
    await seedSource({ id: 'quarto', type: 'm3u_url', m3uUrl: 'http://lista.test/quarto.m3u' }, [{ name: 'Noite', pid: '9' }])
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await enableParentalControl('sala', '1111', [{ category: ref('sala', 'Noite', '9'), locked: true }], database)
    expect(await hasPin('sala', database)).toBe(true)
    expect(await hasPin('quarto', database)).toBe(false)
    expect(await lockedNames('quarto')).toEqual([])

    await enableParentalControl('quarto', '2222', [{ category: ref('quarto', 'Noite', '9'), locked: true }], database)
    expect(await verifyPin('sala', '1111', database)).toBe(true)
    expect(await verifyPin('sala', '2222', database)).toBe(false)
    expect(await verifyPin('quarto', '1111', database)).toBe(false)
    expect(await verifyPin('quarto', '2222', database)).toBe(true)

    // "Esqueci o PIN" confere só os dados da própria lista.
    expect(await recoverPinWithSource('sala', { url: 'http://lista.test/quarto.m3u' }, database)).toBe(false)
    expect(await recoverPinWithSource('quarto', { username: 'joao', password: 's3nh4-forte' }, database)).toBe(false)
    expect(await recoverPinWithSource('sala', { username: 'joao', password: 's3nh4-forte' }, database)).toBe(true)
    expect(await recoverPinWithSource('quarto', { url: 'http://lista.test/quarto.m3u' }, database)).toBe(true)

    await disableParentalControl('sala', database)
    expect(await hasPin('sala', database)).toBe(false)
    expect(await lockedNames('sala')).toEqual([])
    expect(await hasPin('quarto', database)).toBe(true)
    expect(await lockedNames('quarto')).toEqual(['Noite'])

    await deleteSource('quarto', database)
    expect(await hasPin('quarto', database)).toBe(false)
    expect(await verifyPin('quarto', '2222', database)).toBe(false)

    const stored = await everythingStored()
    expect(stored).not.toContain('1111')
    expect(stored).not.toContain('2222')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('FR-024/SC-005: o PIN único da 066 vira o PIN de cada lista com categoria bloqueada (explícita ou por nome adulto); as outras ficam sem PIN; idempotente', async () => {
    await seedSource({ id: 'explicita' }, [{ name: 'Ação', pid: '1' }, { name: 'Noite', pid: '9' }])
    await seedSource({ id: 'adulta' }, [{ name: 'Ação', pid: '1' }, { name: 'XXX Adultos', pid: '2' }])
    await seedSource({ id: 'recusada' }, [{ name: 'Ação', pid: '1' }, { name: 'Filmes 18+', pid: '3' }])
    await seedSource({ id: 'liberada' }, [{ name: 'Adultos', pid: '4' }])
    await setCategoryPreference(ref('explicita', 'Noite', '9'), { locked: true }, database)
    await setCategoryPreference(ref('recusada', 'Filmes 18+', '3'), { declinedSuggestion: true }, database)
    await setCategoryPreference(ref('liberada', 'Adultos', '4'), { locked: false }, database)

    // O registro exatamente como a 066 o grava: SHA-256 de `sal:pin`, chave fixa 'pin'.
    const salt = '0f1e2d3c4b5a69788796a5b4c3d2e1f0'
    const hash = sha256Hex(new TextEncoder().encode(`${salt}:4321`))
    await database.table('parentalPin').put({ id: 'pin', salt, hash, algorithm: 'sha256', createdAt: 0 })

    await migrateLegacyPin(database)

    expect(await hasPin('explicita', database)).toBe(true)
    expect(await verifyPin('explicita', '4321', database)).toBe(true)
    expect(await hasPin('adulta', database)).toBe(true)
    expect(await verifyPin('adulta', '4321', database)).toBe(true)
    expect(await hasPin('recusada', database)).toBe(false)
    expect(await hasPin('liberada', database)).toBe(false)
    expect(await database.table('parentalPin').get('pin')).toBeUndefined()

    // Nada que estava bloqueado fica sem proteção.
    expect(await lockedNames('explicita')).toEqual(['Noite'])
    expect(await lockedNames('adulta')).toEqual(['XXX Adultos'])
    expect(await lockedNames('recusada')).toEqual([])

    await migrateLegacyPin(database)
    expect(await verifyPin('explicita', '4321', database)).toBe(true)
    expect(await hasPin('recusada', database)).toBe(false)
  })
})
