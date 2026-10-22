/**
 * Feature 086, T081/T088 (FR-008): refazer o documento de tela **avisa**, e é esse aviso que faz a tela mostrar o
 * conteúdo novo na própria sessão.
 *
 * Por que este teste existe: a abertura aceita o documento vencido de propósito — foi o que levou o Início de 2 039 ms
 * para 355 ms na TV, tirando a pré-carga do caminho. O preço é que a tela relê e recebe o documento de um instante
 * atrás; sem o aviso, o conteúdo novo só apareceria se a pessoa saísse e voltasse, o que o FR-008 proíbe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { storeCategories, storeCategoryItems } from './catalogRepository'
import { pickCandidates, writeCandidates } from './showcaseCandidates'
import {
  onScreenDocumentRefreshed,
  readScreenDocument,
  refreshMissingScreenDocuments,
  refreshScreenDocument,
} from './screenDocument'

const SOURCE = 'fonte-aviso'
/**
 * O instante real, não uma data fixa: o documento de tela é validado **pelo dia** na leitura, e
 * `refreshMissingScreenDocuments` o regrava com o relógio real (sem injeção de instante, de propósito — é a
 * fila de 2º plano chamando). Com data fixa, estes testes passavam só no dia em que foram escritos: quebraram
 * na virada de 2026-10-21 para 22.
 */
const NOW = Date.now()

let database: CatalogDb

beforeEach(async () => {
  localStorage.clear()
  database = new CatalogDb(`aviso-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})
afterEach(async () => {
  vi.restoreAllMocks()
  localStorage.clear()
  await database.delete()
})

async function gravaCategoria(order: number, prefixo: string, addedBase: number): Promise<void> {
  const [id] = await storeCategories([{
    sourceId: SOURCE, generation: 1, kind: 'movie', fetchMode: 'on_demand',
    order, providerCategoryId: String(100 + order), name: `Cat ${order}`,
  }], database)
  const items: CatalogRecord[] = Array.from({ length: 5 }, (_, position) => ({
    sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: order,
    name: `${prefixo} Filme ${position}`, originalName: `${prefixo} Filme ${position}`,
    providerStreamId: `${order}-${position}`,
    addedAt: addedBase + position * 1000,
    providerRating: 8, year: 2024,
  }))
  await storeCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: id, groupOrder: order },
    items, NOW, database)
  await writeCandidates(pickCandidates({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: id,
    groupOrder: order, order }, items, NOW), database)
}

describe('aviso de documento refeito (086)', () => {
  it('a pré-carga trazendo uma categoria leva o conteúdo novo à tela na mesma sessão', async () => {
    await gravaCategoria(0, 'Antiga', NOW - 10 * 3_600_000)
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })

    // A tela está aberta, lendo o documento. Quem relê é quem recebe este aviso.
    const avisos: Array<[string, string]> = []
    const cancelar = onScreenDocumentRefreshed((sourceId, kind) => { avisos.push([sourceId, kind]) })

    // A pré-carga traz uma categoria nova, com itens mais recentes.
    await gravaCategoria(1, 'Nova', NOW)

    // Agora a tela, se relesse, veria o documento VENCIDO — com o conteúdo antigo. É o preço de não bloquear a abertura.
    const vencido = readScreenDocument(SOURCE, 'movie', { now: NOW })
    expect(vencido?.stale).toBe(true)
    expect(vencido?.recent.some((item) => item.name.startsWith('Nova'))).toBe(false)
    expect(avisos).toHaveLength(0)

    // A fila de 2º plano refaz o documento — e **avisa**.
    expect(await refreshMissingScreenDocuments(SOURCE, database)).toBe(true)
    expect(avisos).toEqual([[SOURCE, 'movie']])

    // É isso que faz a tela reler e mostrar o conteúdo novo, sem a pessoa sair e voltar (FR-008).
    const atual = readScreenDocument(SOURCE, 'movie', { now: NOW })
    expect(atual?.stale).toBe(false)
    expect(atual?.recent.some((item) => item.name.startsWith('Nova'))).toBe(true)

    cancelar()
    await refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })
    expect(avisos).toHaveLength(1)
  })

  it('não avisa quando não houve o que guardar, e um ouvinte com erro não derruba quem refez', async () => {
    // Sem geração ativa não há documento a montar: nada a avisar.
    const avisos: string[] = []
    const cancelar = onScreenDocumentRefreshed((sourceId) => { avisos.push(sourceId) })
    expect(await refreshScreenDocument('fonte-que-nao-existe', 'movie', { database, now: NOW })).toBe(false)
    expect(avisos).toHaveLength(0)
    cancelar()

    await gravaCategoria(0, 'Antiga', NOW)
    const cancelarRuim = onScreenDocumentRefreshed(() => { throw new Error('ouvinte com problema') })
    const bons: string[] = []
    const cancelarBom = onScreenDocumentRefreshed((sourceId) => { bons.push(sourceId) })

    await expect(refreshScreenDocument(SOURCE, 'movie', { database, now: NOW })).resolves.toBe(true)
    expect(bons).toEqual([SOURCE])

    cancelarRuim()
    cancelarBom()
  })
})
