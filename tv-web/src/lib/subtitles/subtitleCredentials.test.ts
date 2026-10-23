import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { deleteSource } from '../catalog/sourceDeletion'
import type { FetchLike } from './directProviders'
import {
  getSubtitleKeyStatus,
  listSubtitleKeyStatus,
  markSubtitleKeyState,
  readChosenSubtitleKeys,
  removeSubtitleKey,
  saveSubtitleKey,
  setSubtitleKeyChosen,
  testSubtitleKey,
} from './subtitleCredentials'
import { subtitleCredentials } from './subtitleTables'

const KEY = 'chave-pessoal-ficticia-090'
const NEW_KEY = 'outra-chave-ficticia-090-nova'
const opened: CatalogDb[] = []

function newDb() {
  const database = new CatalogDb('test-090-keys-' + crypto.randomUUID())
  opened.push(database)
  return database
}

afterEach(async () => {
  for (const database of opened.splice(0)) await database.delete()
})

/** Fornecedor que responde sempre com o mesmo status (corpo válido para o SubDL). */
const answering = (status: number): FetchLike => async () => new Response(JSON.stringify({ status: true, subtitles: [], data: [] }), { status })

describe('chaves pessoais de legenda (US3)', () => {
  it('chave recusada não grava e não troca a que já existia', async () => {
    const database = newDb()
    expect((await saveSubtitleKey('subdl', KEY, { database, fetchImpl: answering(200) })).ok).toBe(true)
    const refused = await saveSubtitleKey('subdl', NEW_KEY, { database, fetchImpl: answering(401) })
    expect(refused).toEqual({ ok: false, reason: 'refused' })
    expect((await readChosenSubtitleKeys({ database })).subdl).toBe(KEY)
  })

  it('formato impossível, limite e sem rede também não gravam', async () => {
    const database = newDb()
    expect(await saveSubtitleKey('subdl', 'curta', { database, fetchImpl: answering(200) })).toEqual({ ok: false, reason: 'invalid_format' })
    expect(await saveSubtitleKey('subdl', 'tem espaço no meio da chave', { database, fetchImpl: answering(200) })).toEqual({
      ok: false,
      reason: 'invalid_format',
    })
    expect(await saveSubtitleKey('subdl', KEY, { database, fetchImpl: answering(429) })).toEqual({ ok: false, reason: 'rate_limited' })
    expect(await saveSubtitleKey('subdl', KEY, { database, fetchImpl: async () => { throw new Error('sem rede') } })).toEqual({ ok: false, reason: 'offline' })
    expect(await subtitleCredentials(database).count()).toBe(0)
  })

  it('chave aceita grava (com trim), já escolhida; a interface só vê a versão mascarada', async () => {
    const database = newDb()
    const result = await saveSubtitleKey('opensubtitles', `  ${KEY}\n`, { database, fetchImpl: answering(200), now: () => 1234 })
    expect(result).toMatchObject({ ok: true, status: { provider: 'opensubtitles', state: 'valid', chosen: true, lastTestedAt: 1234 } })
    const status = await getSubtitleKeyStatus('opensubtitles', { database })
    expect(status.maskedKey).toBe(`••••${KEY.slice(-4)}`)
    expect(JSON.stringify(await listSubtitleKeyStatus({ database }))).not.toContain(KEY)
    expect((await listSubtitleKeyStatus({ database })).map((row) => [row.provider, row.state])).toEqual([['opensubtitles', 'valid'], ['subdl', 'none']])
  })

  it('"Usar o padrão" desmarca sem apagar; remover apaga; teste e uso real atualizam o estado', async () => {
    const database = newDb()
    await saveSubtitleKey('subdl', KEY, { database, fetchImpl: answering(200) })
    await setSubtitleKeyChosen('subdl', false, { database })
    expect(await readChosenSubtitleKeys({ database })).toEqual({})
    expect((await getSubtitleKeyStatus('subdl', { database })).state).toBe('valid')
    await setSubtitleKeyChosen('subdl', true, { database })

    await markSubtitleKeyState('subdl', 'rejected', { database })
    expect((await getSubtitleKeyStatus('subdl', { database })).state).toBe('rejected')
    expect((await testSubtitleKey('subdl', { database, fetchImpl: answering(200) })).state).toBe('valid')
    // Sem rede o teste não mexe no estado.
    expect((await testSubtitleKey('subdl', { database, fetchImpl: async () => { throw new Error('x') } })).state).toBe('valid')

    await removeSubtitleKey('subdl', { database })
    expect((await getSubtitleKeyStatus('subdl', { database })).state).toBe('none')
  })

  it('os dois fornecedores guardam a chave pessoal, e só a escolhida é lida para a busca', async () => {
    const database = newDb()
    await saveSubtitleKey('opensubtitles', KEY, { database, fetchImpl: answering(200) })
    await saveSubtitleKey('subdl', NEW_KEY, { database, fetchImpl: answering(200) })
    expect(await readChosenSubtitleKeys({ database })).toEqual({ opensubtitles: KEY, subdl: NEW_KEY })
    await setSubtitleKeyChosen('opensubtitles', false, { database })
    expect(await readChosenSubtitleKeys({ database })).toEqual({ subdl: NEW_KEY })
  })

  it('a chave não aparece em erro nenhum e a tabela fica fora de deleteSource', async () => {
    const database = newDb()
    const leaky: FetchLike = async (url) => {
      throw new TypeError(`Failed to fetch ${url}`)
    }
    const outcome = await saveSubtitleKey('subdl', KEY, { database, fetchImpl: leaky })
    expect(JSON.stringify(outcome)).not.toContain(KEY)

    await saveSubtitleKey('subdl', KEY, { database, fetchImpl: answering(200) })
    await deleteSource('src-qualquer', database).catch(() => {})
    expect((await getSubtitleKeyStatus('subdl', { database })).state).toBe('valid')
  })

  it('a tabela fica fora do backup de uso (072): nenhum arquivo de lib/backup a lê', () => {
    const dir = fileURLToPath(new URL('../backup/', import.meta.url))
    const readers = readdirSync(dir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    expect(readers.length).toBeGreaterThan(0)
    for (const name of readers) expect(readFileSync(dir + name, 'utf-8'), name).not.toMatch(/subtitleCredentials|readChosenSubtitleKeys/)
  })
})
