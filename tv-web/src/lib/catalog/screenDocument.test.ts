/**
 * Documento de tela (feature 086, T071/T072). O que estes testes travam:
 *
 * 1. o documento serve a abertura numa leitura síncrona, sem tocar o banco;
 * 2. **mudar a visibilidade de uma categoria o invalida** — é o que mantém a decisão de visibilidade fora do dado
 *    guardado (regra da feature 066), já que o documento guarda o resultado final e não os candidatos;
 * 3. geração, dia e versão também o invalidam;
 * 4. nada disto lança quando o `localStorage` falha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { storeCategories, storeCategoryItems } from './catalogRepository'
import { setCategoryPreference } from './categoryAccess'
import { changePin } from '../parental/listPin'
import { pickCandidates, writeCandidates } from './showcaseCandidates'
import {
  buildScreenDocument,
  clearScreenDocuments,
  readScreenDocument,
  refreshScreenDocument,
  writeScreenDocument,
} from './screenDocument'

const SOURCE = 'fonte-doc'
const NOW = Date.UTC(2026, 9, 21, 12)
const OUTRO_DIA = Date.UTC(2026, 9, 22, 12)

let database: CatalogDb

beforeEach(async () => {
  localStorage.clear()
  database = new CatalogDb(`doc-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})
afterEach(async () => {
  vi.restoreAllMocks()
  localStorage.clear()
  await database.delete()
})

/** Duas categorias de 20 filmes, com datas intercaladas para as duas disputarem as fileiras. */
async function seed(): Promise<number[]> {
  const ids = await storeCategories([0, 1].map((index) => ({
    sourceId: SOURCE, generation: 1, kind: 'movie' as const, fetchMode: 'on_demand' as const,
    order: index, providerCategoryId: String(100 + index), name: `Cat ${index}`,
  })), database)
  for (let index = 0; index < ids.length; index += 1) {
    const items: CatalogRecord[] = Array.from({ length: 20 }, (_, position) => ({
      sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: index,
      name: `Cat${index} Filme ${position}`, originalName: `Cat${index} Filme ${position}`,
      providerStreamId: `${index}-${position}`,
      addedAt: NOW - (position * 2 + index) * 3_600_000,
      providerRating: 7 + (position % 20) / 10,
      year: 2020 + (position % 5),
    }))
    await storeCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: ids[index], groupOrder: index },
      items, NOW, database)
    const stored = await database.categories.get(ids[index])
    await writeCandidates(pickCandidates({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: ids[index],
      groupOrder: index, order: stored?.order ?? index }, items, NOW), database)
  }
  return ids
}

describe('documento de tela (086)', () => {
  it('monta, guarda e devolve na leitura sem tocar o banco', async () => {
    await seed()
    expect(await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW, images: ['capa-1', 'capa-2'] })).toBe(true)

    // A leitura é síncrona e não abre transação: qualquer acesso ao banco aqui é falha de desenho.
    const aberto = vi.spyOn(database, 'transaction')
    const documento = readScreenDocument(SOURCE, 'movie', { generation: 1, now: NOW, excluded: [] })

    expect(aberto).not.toHaveBeenCalled()
    expect(documento?.recent.length).toBeGreaterThan(0)
    expect(documento?.rated.length).toBeGreaterThan(0)
    expect(documento?.categories.map((category) => category.name)).toEqual(['Cat 0', 'Cat 1'])
    expect(documento?.totalCategories).toBe(2)
    expect(documento?.coveredCategories).toBe(2)
    expect(documento?.images).toEqual(['capa-1', 'capa-2'])
  })

  it('não é usado depois de a pessoa esconder uma categoria, e o documento refeito deixa os itens dela de fora', async () => {
    const ids = await seed()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const antes = readScreenDocument(SOURCE, 'movie', { generation: 1, now: NOW, excluded: [] })
    expect(antes?.recent.some((item) => item.name.startsWith('Cat0'))).toBe(true)

    // A pessoa esconde a primeira categoria. O documento guardado não sabe disso...
    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', providerCategoryId: '100', name: 'Cat 0' }, { hidden: true }, database)

    // ...e por isso a leitura com o conjunto novo de excluídas o recusa, em vez de mostrar conteúdo escondido.
    expect(readScreenDocument(SOURCE, 'movie', { generation: 1, now: NOW, excluded: [ids[0]] })).toBeUndefined()

    // Refeito, ele exclui a categoria escondida — e a cobertura continua honesta.
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const depois = readScreenDocument(SOURCE, 'movie', { generation: 1, now: NOW, excluded: [ids[0]] })
    expect(depois?.recent.some((item) => item.name.startsWith('Cat0'))).toBe(false)
    expect(depois?.recent.some((item) => item.name.startsWith('Cat1'))).toBe(true)
    expect(depois?.categories.map((category) => category.name)).toEqual(['Cat 1'])
    expect(depois?.totalCategories).toBe(1)
  })

  it('também recusa o documento de categoria travada por PIN', async () => {
    const ids = await seed()
    await changePin(SOURCE, '4321', database)
    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', providerCategoryId: '100', name: 'Cat 0' }, { locked: true }, database)
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })

    const documento = readScreenDocument(SOURCE, 'movie', { generation: 1, now: NOW, excluded: [ids[0]] })
    expect(documento?.recent.some((item) => item.name.startsWith('Cat0'))).toBe(false)
    expect(documento?.categories.map((category) => category.name)).toEqual(['Cat 1'])
  })

  it('gravar candidatos novos invalida o documento, para a fileira acompanhar a pré-carga', async () => {
    await seed()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const pedido = { generation: 1, now: NOW, excluded: [] as number[] }
    expect(readScreenDocument(SOURCE, 'movie', pedido)).toBeDefined()

    // A pré-carga traz uma categoria nova e grava os candidatos dela. O documento guardado não a conhece — e por isso
    // precisa sair de cena (FR-008/FR-012: ninguém deve ter de pedir "Atualizar" para ver o que a lista já tem).
    const [nova] = await storeCategories([{
      sourceId: SOURCE, generation: 1, kind: 'movie', fetchMode: 'on_demand',
      order: 2, providerCategoryId: '102', name: 'Cat 2',
    }], database)
    const items: CatalogRecord[] = Array.from({ length: 5 }, (_, position) => ({
      sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: 2,
      name: `Cat2 Filme ${position}`, originalName: `Cat2 Filme ${position}`, providerStreamId: `2-${position}`,
      // Mais novos que todos os outros: têm de entrar em "Adicionados recentemente".
      addedAt: NOW + (position + 1) * 3_600_000,
      providerRating: 9, year: 2025,
    }))
    await storeCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: nova, groupOrder: 2 },
      items, NOW, database)
    await writeCandidates(pickCandidates({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: nova,
      groupOrder: 2, order: 2 }, items, NOW), database)

    expect(readScreenDocument(SOURCE, 'movie', pedido)).toBeUndefined()

    // Refeito, a categoria nova está nas fileiras e na trilha.
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const depois = readScreenDocument(SOURCE, 'movie', pedido)
    expect(depois?.recent.some((item) => item.name.startsWith('Cat2'))).toBe(true)
    expect(depois?.categories.map((category) => category.name)).toEqual(['Cat 0', 'Cat 1', 'Cat 2'])
  })

  it('recusa documento de outra geração, de outro dia e de outra versão', async () => {
    await seed()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const pedido = { generation: 1, now: NOW, excluded: [] as number[] }

    expect(readScreenDocument(SOURCE, 'movie', pedido)).toBeDefined()
    expect(readScreenDocument(SOURCE, 'movie', { ...pedido, generation: 2 })).toBeUndefined()
    // A semente de "Bem avaliados" é diária: o documento de ontem não serve hoje.
    expect(readScreenDocument(SOURCE, 'movie', { ...pedido, now: OUTRO_DIA })).toBeUndefined()

    const guardado = JSON.parse(localStorage.getItem(`ccplay.showcase.${SOURCE}.movie`) as string)
    localStorage.setItem(`ccplay.showcase.${SOURCE}.movie`, JSON.stringify({ ...guardado, v: 999 }))
    expect(readScreenDocument(SOURCE, 'movie', pedido)).toBeUndefined()
  })

  it('não lança quando o localStorage falha, nem guarda documento acima do teto', async () => {
    await seed()
    const documento = await buildScreenDocument(SOURCE, 'movie', { database, now: NOW })
    expect(documento).toBeDefined()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(readScreenDocument(SOURCE, 'movie', { generation: 1, now: NOW, excluded: [] })).toBeUndefined()
    vi.restoreAllMocks()

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cota') })
    expect(writeScreenDocument(documento!)).toBe(false)
    vi.restoreAllMocks()

    // Acima do teto nem tenta guardar: o `JSON.parse` síncrono de um documento grande é o que queremos evitar.
    const gigante = { ...documento!, recent: Array.from({ length: 4000 }, () => documento!.recent[0]) }
    expect(writeScreenDocument(gigante)).toBe(false)

    expect(() => clearScreenDocuments(SOURCE)).not.toThrow()
  })
})
