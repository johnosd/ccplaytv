import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { deleteSource, getSource, markAccount, markSynced } from './sourceRepository'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-source-account-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

const SOURCE: SourceRecord = {
  id: 'fonte',
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.exemplo.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-teste',
  providerImportMode: 'xtream_api',
  connectionState: 'synced',
  activeGeneration: 3,
  createdAt: 1,
  updatedAt: 1,
}

describe('conta da fonte no repositório (feature 034)', () => {
  it('fonte antiga, sem nenhum campo de conta, não tem `account` na visão', async () => {
    await database.sources.add(SOURCE)
    const view = await getSource('fonte', database)
    expect(view?.account).toBeUndefined()
    expect(view?.lastUnavailableSections).toBeUndefined()
  })

  it('markAccount não toca connectionState, geração ativa nem updatedAt; expiresAt só muda quando vem no patch', async () => {
    await database.sources.add({ ...SOURCE, accountExpiresAt: 5000 })
    await markAccount('fonte', { status: 'refused', checkedAt: 777 }, database)
    const record = await database.sources.get('fonte')
    expect(record).toMatchObject({
      accountStatus: 'refused',
      accountCheckedAt: 777,
      accountExpiresAt: 5000,
      connectionState: 'synced',
      activeGeneration: 3,
      updatedAt: 1,
    })
    await markAccount('fonte', { status: 'active', expiresAt: null, checkedAt: 888 }, database)
    expect((await database.sources.get('fonte'))?.accountExpiresAt).toBeNull()
  })

  it('markSynced grava a conta e REGRAVA lastUnavailableSections sempre, inclusive como []', async () => {
    await database.sources.add({ ...SOURCE, lastUnavailableSections: ['series'] })
    await markSynced('fonte', { at: 10, mode: 'xtream_api', account: { status: 'active', expiresAt: 99, checkedAt: 10 }, unavailableSections: ['movie'] }, database)
    let view = await getSource('fonte', database)
    expect(view?.account).toEqual({ status: 'active', expiresAt: 99, checkedAt: 10 })
    expect(view?.lastUnavailableSections).toEqual(['movie'])

    await markSynced('fonte', { at: 20, mode: 'xtream_api' }, database)
    view = await getSource('fonte', database)
    expect(view?.lastUnavailableSections).toEqual([])
    // Sem `account` no mark (Modo limitado): a conta já guardada não é apagada.
    expect(view?.account).toEqual({ status: 'active', expiresAt: 99, checkedAt: 10 })
  })

  it('a visão da fonte nunca carrega credencial nem endereço do painel nos campos de conta', async () => {
    await database.sources.add({ ...SOURCE, accountStatus: 'active', accountExpiresAt: 1, accountCheckedAt: 2 })
    const view = await getSource('fonte', database)
    expect(JSON.stringify(view?.account)).not.toMatch(/senha-teste|usuario-teste|painel\.exemplo/)
    expect(Object.keys(view ?? {})).not.toContain('providerUsername')
    expect(Object.keys(view ?? {})).not.toContain('providerPassword')
  })

  it('excluir a fonte apaga o vencimento e a verificação junto (FR-021)', async () => {
    await database.sources.add({ ...SOURCE, accountStatus: 'active', accountExpiresAt: 1, accountCheckedAt: 2 })
    await deleteSource('fonte', database)
    expect(await database.sources.get('fonte')).toBeUndefined()
  })
})
