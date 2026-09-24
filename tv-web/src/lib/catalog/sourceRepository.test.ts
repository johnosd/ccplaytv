import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { storeBatch } from './catalogRepository'
import { buildStableId, toggleFavorite } from './userStateRepository'
import {
  createSource,
  deleteSource,
  getSource,
  InvalidSourceError,
  listSources,
  markConnectionError,
  markSynced,
  readCredential,
  updateSource,
} from './sourceRepository'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-sources-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

const CREDENTIAL = {
  type: 'provider_credentials' as const,
  displayName: 'Minha lista',
  providerDns: 'exemplo.test:8080',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-teste',
}

describe('sourceRepository', () => {
  it('listagem nunca devolve usuário nem senha (FR-009)', async () => {
    await createSource(CREDENTIAL, database)

    const [view] = await listSources(database)
    const exposed = JSON.stringify(view)

    expect(exposed).not.toContain(CREDENTIAL.providerUsername)
    expect(exposed).not.toContain(CREDENTIAL.providerPassword)
    expect(Object.keys(view)).not.toContain('providerUsername')
    expect(Object.keys(view)).not.toContain('providerPassword')
  })

  it('devolve o endereço do painel, que é o que permite editar sem redigitar a senha', async () => {
    const id = await createSource(CREDENTIAL, database)

    const view = await getSource(id, database)

    expect(view?.providerDns).toBe('http://exemplo.test:8080')
  })

  it('normaliza o endereço antes de gravar', async () => {
    const id = await createSource(
      { ...CREDENTIAL, providerDns: 'http://exemplo.test/player_api.php' },
      database,
    )

    expect((await getSource(id, database))?.providerDns).toBe('http://exemplo.test')
  })

  it('recusa credencial embutida no endereço', async () => {
    await expect(
      createSource({ ...CREDENTIAL, providerDns: 'http://u:p@exemplo.test' }, database),
    ).rejects.toThrow()
  })

  it('recusa fonte de provedor sem os três campos', async () => {
    await expect(
      createSource({ ...CREDENTIAL, providerPassword: undefined }, database),
    ).rejects.toBeInstanceOf(InvalidSourceError)
  })

  it('a credencial só sai pela porta restrita', async () => {
    const id = await createSource(CREDENTIAL, database)

    const credential = await readCredential(id, database)

    expect(credential?.username).toBe(CREDENTIAL.providerUsername)
    expect(credential?.password).toBe(CREDENTIAL.providerPassword)
  })

  it('campo em branco na edição mantém o valor atual, nunca apaga', async () => {
    const id = await createSource(CREDENTIAL, database)

    await updateSource(id, { displayName: 'Outro nome', providerPassword: '' }, database)

    const credential = await readCredential(id, database)
    expect(credential?.password).toBe(CREDENTIAL.providerPassword)
    expect((await getSource(id, database))?.displayName).toBe('Outro nome')
  })

  it('alterar a credencial invalida a marca de migração (FR-020)', async () => {
    const id = await createSource(CREDENTIAL, database)
    await markSynced(id, { at: 1000, mode: 'xtream_api', allowedFormats: ['ts'] }, database)
    expect((await getSource(id, database))?.providerMigratedAt).toBe(1000)

    await updateSource(id, { providerPassword: 'outra-senha' }, database)

    const view = await getSource(id, database)
    expect(view?.providerMigratedAt).toBeUndefined()
    // O que o conector apurou sobre a conta anterior também deixa de valer.
    expect((await readCredential(id, database))?.allowedFormats).toBeUndefined()
  })

  it('trocar só o nome não invalida a migração', async () => {
    const id = await createSource(CREDENTIAL, database)
    await markSynced(id, { at: 1000, mode: 'xtream_api' }, database)

    await updateSource(id, { displayName: 'Nome novo' }, database)

    expect((await getSource(id, database))?.providerMigratedAt).toBe(1000)
  })

  it('remover a fonte leva junto catálogo e execuções', async () => {
    const id = await createSource(CREDENTIAL, database)
    await storeBatch(
      [
        {
          sourceId: id,
          generation: 1,
          name: 'Canal',
          originalName: 'Canal',
          group: 'Esportes',
          groupOrder: 0, kind: 'channel',
        },
      ],
      database,
    )
    await database.importRuns.add({
      id: 'run-1',
      sourceId: id,
      generation: 1,
      status: 'completed',
      step: 'done',
      entriesRead: 1,
      channelsStored: 1,
      discardedByType: 0,
      invalidCount: 0,
      truncatedByStorage: false,
      startedAt: 1,
    })

    await deleteSource(id, database)

    expect(await database.sources.count()).toBe(0)
    expect(await database.channels.count()).toBe(0)
    expect(await database.importRuns.count()).toBe(0)
  })

  it('remover a fonte apaga favoritos e retomada dela, preservando os de outra fonte (feature 013, FR-017/D-007)', async () => {
    const id = await createSource(CREDENTIAL, database)
    const otherId = await createSource({ ...CREDENTIAL, displayName: 'Outra lista' }, database)

    const stableId = buildStableId({ sourceId: id, kind: 'movie', providerStreamId: '1' })
    const otherStableId = buildStableId({ sourceId: otherId, kind: 'movie', providerStreamId: '1' })
    await toggleFavorite(stableId, id, true, database)
    await toggleFavorite(otherStableId, otherId, true, database)

    await deleteSource(id, database)

    expect(await database.userStates.get(stableId)).toBeUndefined()
    expect((await database.userStates.get(otherStableId))?.isFavorite).toBe(true)
  })

  it('falha de conexão não avança a marca de sincronização (FR-016)', async () => {
    const id = await createSource(CREDENTIAL, database)
    await markSynced(id, { at: 1000, mode: 'xtream_api' }, database)

    await markConnectionError(id, database)

    const view = await getSource(id, database)
    expect(view?.connectionState).toBe('synced')
    expect(view?.lastSuccessfulSyncAt).toBe(1000)
  })

  it('fonte por URL M3U exige a URL e não guarda credencial de provedor', async () => {
    const id = await createSource(
      { type: 'm3u_url', displayName: 'Lista', m3uUrl: 'http://exemplo.test/lista.m3u' },
      database,
    )

    expect((await getSource(id, database))?.m3uUrl).toBe('http://exemplo.test/lista.m3u')
    expect(await readCredential(id, database)).toBeUndefined()
    await expect(
      createSource({ type: 'm3u_url', displayName: 'Sem URL' }, database),
    ).rejects.toBeInstanceOf(InvalidSourceError)
  })
})
