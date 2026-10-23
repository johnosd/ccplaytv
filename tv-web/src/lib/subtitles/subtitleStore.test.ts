import { afterEach, describe, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { deleteSource } from '../catalog/sourceDeletion'
import { createSubtitleStore, clampExternalDelay } from './subtitleStore'
import { externalSubtitles } from './subtitleTables'
import type { StoredExternalSubtitle } from './types'

const opened: CatalogDb[] = []

function newDb() {
  const database = new CatalogDb('test-090-' + crypto.randomUUID())
  opened.push(database)
  return database
}

afterEach(async () => {
  for (const database of opened.splice(0)) await database.delete()
})

function entry(overrides: Partial<StoredExternalSubtitle> = {}): StoredExternalSubtitle {
  return {
    stableId: 'src1|movie|id:1',
    sourceId: 'src1',
    language: 'pt-BR',
    resultId: 'os:1',
    release: 'Versão',
    delayMs: 0,
    active: true,
    text: '1\n00:00:01,000 --> 00:00:02,000\nOlá\n',
    ...overrides,
  }
}

/** SRT sintético (R-011): ~1 500 falas com acentos, sem texto de terceiro. */
function syntheticSrt(cues: number): string {
  const lines: string[] = []
  for (let i = 0; i < cues; i += 1) {
    const start = i * 3000
    const stamp = (ms: number) => {
      const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0')
      const m = String(Math.floor(ms / 60_000) % 60).padStart(2, '0')
      const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
      return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`
    }
    lines.push(String(i + 1), `${stamp(start)} --> ${stamp(start + 2500)}`,
      `Fala número ${i}: ação, coração e então ${(i * 7919) % 1000} reações.`, `Segunda linha ${i % 37} — você não está só.`, '')
  }
  return lines.join('\n')
}

describe('subtitleStore (feature 090)', () => {
  it('guarda uma legenda por idioma por item, com no máximo uma ativa; nova versão no mesmo idioma substitui', async () => {
    const store = createSubtitleStore(newDb())
    expect(await store.save(entry({ language: 'pt-BR', resultId: 'os:1' }))).toBe(true)
    expect(await store.save(entry({ language: 'en', resultId: 'sd:1-2', text: '1\n00:00:01,000 --> 00:00:02,000\nHello\n' }))).toBe(true)

    const all = await store.list('src1|movie|id:1')
    expect(all.map((row) => [row.language, row.active])).toEqual([['pt-BR', false], ['en', true]])
    expect((await store.load('src1|movie|id:1'))?.text).toContain('Hello')

    await store.update('src1|movie|id:1', { active: true }, 'pt-BR')
    expect((await store.load('src1|movie|id:1'))?.language).toBe('pt-BR')
    expect((await store.list('src1|movie|id:1')).filter((row) => row.active)).toHaveLength(1)

    expect(await store.save(entry({ language: 'pt-BR', resultId: 'os:9', release: 'Outra' }))).toBe(true)
    const again = await store.list('src1|movie|id:1')
    expect(again).toHaveLength(2)
    expect(again.find((row) => row.language === 'pt-BR')?.resultId).toBe('os:9')
  })

  it('a mesma obra em outra lista é outra memória; desativar deixa o arquivo para reativar', async () => {
    const store = createSubtitleStore(newDb())
    await store.save(entry())
    expect(await store.load('src2|movie|id:1')).toBeNull()

    await store.update('src1|movie|id:1', { active: false })
    expect(await store.load('src1|movie|id:1')).toBeNull()
    expect(await store.list('src1|movie|id:1')).toHaveLength(1)
  })

  it('o ajuste guardado fica na faixa de ±10 s em passos de 0,5 s', async () => {
    const store = createSubtitleStore(newDb())
    await store.save(entry({ delayMs: 25_000 }))
    expect((await store.load('src1|movie|id:1'))?.delayMs).toBe(10_000)
    await store.update('src1|movie|id:1', { delayMs: -1240 })
    expect((await store.load('src1|movie|id:1'))?.delayMs).toBe(-1000)
    expect(clampExternalDelay(Number.NaN)).toBe(0)
  })

  it('respeita o teto: despeja o menos usado de OUTRO item, nunca o próprio; arquivo maior que o teto não grava', async () => {
    let clock = 1000
    const database = newDb()
    const big = syntheticSrt(1500)
    const probe = createSubtitleStore(database, { now: () => clock })
    await probe.save(entry({ stableId: 'a', text: big }))
    const size = (await externalSubtitles(database).get(['a', 'pt-BR']))!.size
    await externalSubtitles(database).clear()

    const store = createSubtitleStore(database, { capBytes: size * 2 + 10, now: () => clock })
    expect(await store.save(entry({ stableId: 'a', text: big }))).toBe(true)
    clock += 1
    expect(await store.save(entry({ stableId: 'b', text: big }))).toBe(true)
    clock += 1
    await store.load('a')
    clock += 1
    expect(await store.save(entry({ stableId: 'c', text: big }))).toBe(true)
    expect(await store.load('b')).toBeNull()
    expect(await store.load('a')).not.toBeNull()
    expect(await store.load('c')).not.toBeNull()

    const tiny = createSubtitleStore(newDb(), { capBytes: 10 })
    expect(await tiny.save(entry({ text: big }))).toBe(false)
  })

  it('R-011: um SRT sintético de ~1 500 falas grava em até 60 KB', async () => {
    const database = newDb()
    const store = createSubtitleStore(database)
    const text = syntheticSrt(1500)
    expect(text.length).toBeGreaterThan(100_000)
    await store.save(entry({ text }))
    const size = (await externalSubtitles(database).get(['src1|movie|id:1', 'pt-BR']))!.size
    expect(size).toBeLessThanOrEqual(60 * 1024)
  })

  it('remover a lista apaga as legendas dela e só as dela', async () => {
    const database = newDb()
    const store = createSubtitleStore(database)
    await database.sources.put({ id: 'src1' } as never)
    await store.save(entry())
    await store.save(entry({ stableId: 'src2|movie|id:1', sourceId: 'src2' }))
    await deleteSource('src1', database)
    expect(await store.list('src1|movie|id:1')).toEqual([])
    expect(await store.list('src2|movie|id:1')).toHaveLength(1)
  })
})
