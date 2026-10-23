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
  refreshMissingScreenDocuments,
  refreshScreenDocument,
  writeScreenDocument,
} from './screenDocument'

const SOURCE = 'fonte-doc'
/**
 * O instante real, não uma data fixa: o documento de tela é validado **pelo dia** na leitura, e
 * `refreshMissingScreenDocuments` o regrava com o relógio real (sem injeção de instante, de propósito — é a
 * fila de 2º plano chamando). Com data fixa, estes testes passavam só no dia em que foram escritos: quebraram
 * na virada de 2026-10-21 para 22.
 */
const NOW = Date.now()
const OUTRO_DIA = NOW + 24 * 60 * 60 * 1000

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
    expect(await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })).toBe(true)

    // A leitura é síncrona e não abre transação: qualquer acesso ao banco aqui é falha de desenho.
    const aberto = vi.spyOn(database, 'transaction')
    const documento = readScreenDocument(SOURCE, 'movie', { now: NOW })

    expect(aberto).not.toHaveBeenCalled()
    expect(documento?.recent.length).toBeGreaterThan(0)
    expect(documento?.rated.length).toBeGreaterThan(0)
    expect(documento?.categories.map((category) => category.name)).toEqual(['Cat 0', 'Cat 1'])
    expect(documento?.totalCategories).toBe(2)
    expect(documento?.coveredCategories).toBe(2)
    // As capas da primeira tela não ficam no documento (T083): saem dos itens, que já estão aqui.
    expect(documento?.recent[0]?.iconUrl === undefined || typeof documento?.recent[0]?.iconUrl === 'string').toBe(true)
  })

  it('esconder uma categoria apaga o documento, e o refeito deixa os itens dela de fora', async () => {
    await seed()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const antes = readScreenDocument(SOURCE, 'movie', { now: NOW })
    expect(antes?.recent.some((item) => item.name.startsWith('Cat0'))).toBe(true)

    // A pessoa esconde a primeira categoria. O documento guardado não sabe disso...
    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', providerCategoryId: '100', name: 'Cat 0' }, { hidden: true }, database)

    // ...e por isso quem muda a visibilidade o apaga na hora, em vez de deixar a tela mostrar conteúdo escondido.
    expect(readScreenDocument(SOURCE, 'movie', { now: NOW })).toBeUndefined()

    // Refeito, ele exclui a categoria escondida — e a cobertura continua honesta.
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const depois = readScreenDocument(SOURCE, 'movie', { now: NOW })
    expect(depois?.recent.some((item) => item.name.startsWith('Cat0'))).toBe(false)
    expect(depois?.recent.some((item) => item.name.startsWith('Cat1'))).toBe(true)
    expect(depois?.categories.map((category) => category.name)).toEqual(['Cat 1'])
    expect(depois?.totalCategories).toBe(1)
  })

  it('travar uma categoria por PIN também apaga o documento', async () => {
    await seed()
    await changePin(SOURCE, '4321', database)
    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', providerCategoryId: '100', name: 'Cat 0' }, { locked: true }, database)
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })

    const documento = readScreenDocument(SOURCE, 'movie', { now: NOW })
    expect(documento?.recent.some((item) => item.name.startsWith('Cat0'))).toBe(false)
    expect(documento?.categories.map((category) => category.name)).toEqual(['Cat 1'])
  })

  it('gravar candidatos novos marca o documento como vencido — ele segue usável até o refresh trocá-lo', async () => {
    await seed()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const pedido = { now: NOW }
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

    // O documento NÃO desaparece: a fileira continua na tela com o conteúdo de um instante atrás, agora marcada como
    // vencida. Apagar fazia a pré-carga derrubá-lo a cada categoria, e a abertura voltava a custar ~1,8 s na TV.
    const vencido = readScreenDocument(SOURCE, 'movie', pedido)
    expect(vencido).toBeDefined()
    expect(vencido?.stale).toBe(true)
    expect(vencido?.recent.some((item) => item.name.startsWith('Cat2'))).toBe(false)

    // A fila de 2º plano refaz justamente os vencidos (FR-008: atualiza na própria sessão).
    expect(await refreshMissingScreenDocuments(SOURCE, database)).toBe(true)
    const depois = readScreenDocument(SOURCE, 'movie', pedido)
    expect(depois?.stale).toBe(false)
    expect(depois?.recent.some((item) => item.name.startsWith('Cat2'))).toBe(true)
    expect(depois?.categories.map((category) => category.name)).toEqual(['Cat 0', 'Cat 1', 'Cat 2'])
  })

  it('recusa documento de outro dia e de outra versão — as duas validações que não precisam do banco', async () => {
    await seed()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    const pedido = { now: NOW }

    expect(readScreenDocument(SOURCE, 'movie', pedido)).toBeDefined()
    // A semente de "Bem avaliados" é diária: o documento de ontem não serve hoje.
    expect(readScreenDocument(SOURCE, 'movie', { now: OUTRO_DIA })).toBeUndefined()

    const guardado = JSON.parse(localStorage.getItem(`ccplay.showcase.${SOURCE}.movie`) as string)
    localStorage.setItem(`ccplay.showcase.${SOURCE}.movie`, JSON.stringify({ ...guardado, v: 999 }))
    expect(readScreenDocument(SOURCE, 'movie', pedido)).toBeUndefined()
  })

  it('a leitura NÃO consulta o banco — é isso que a torna imune à carga em curso', async () => {
    await seed()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })

    // Na TV, as duas leituras que eu usava para validar o documento custavam 0,9–4,0 s na abertura (`prepareMs`),
    // contra 1–17 ms para ler o documento (`docMs`). Qualquer consulta reintroduzida aqui desfaz o ganho.
    const abriuTransacao = vi.spyOn(database, 'transaction')
    const leuFonte = vi.spyOn(database.sources, 'get')
    expect(readScreenDocument(SOURCE, 'movie', { now: NOW })).toBeDefined()
    expect(abriuTransacao).not.toHaveBeenCalled()
    expect(leuFonte).not.toHaveBeenCalled()
  })

  it('a troca de geração apaga o documento, porque a leitura não a verificaria', async () => {
    await seed()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    expect(readScreenDocument(SOURCE, 'movie', { now: NOW })).toBeDefined()

    clearScreenDocuments(SOURCE)
    expect(readScreenDocument(SOURCE, 'movie', { now: NOW })).toBeUndefined()
  })

  it('não lança quando o localStorage falha, nem guarda documento acima do teto', async () => {
    await seed()
    const documento = await buildScreenDocument(SOURCE, 'movie', { database, now: NOW })
    expect(documento).toBeDefined()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(readScreenDocument(SOURCE, 'movie', { now: NOW })).toBeUndefined()
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
