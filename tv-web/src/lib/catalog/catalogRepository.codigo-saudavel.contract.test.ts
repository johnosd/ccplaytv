/// <reference types="node" />
/**
 * Contrato da feature 063 (US1, 49a-2) — `catalogRepository.ts` vira fachada.
 *
 * A divisão por responsabilidade não pode mudar NADA para quem importa: o
 * conjunto de valores exportados é congelado aqui (o de tipos é conferido
 * pelo `tsc`, via `TiposDaFachada` abaixo), e a fachada só reexporta, por
 * lista explícita, dos módulos de `lib/catalog/repository/` — cada um dentro
 * do limite de linhas da catraca (`logic/catraca-arquitetura.md` §3).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as repository from './catalogRepository'
import type {
  CatalogCategory,
  CategoryItemsTarget,
  ContinueEntry,
  KindPage,
  KindPageChunk,
  NewCategory,
  RefreshedCategory,
  SeriesEpisodesTarget,
  StoredCategoryTarget,
  StructureRefreshResult,
} from './catalogRepository'

/** Tipos públicos de antes da divisão — se um sumir da fachada, o `tsc` falha aqui (FR-002). */
export type TiposDaFachada = [
  CatalogCategory,
  CategoryItemsTarget,
  ContinueEntry,
  KindPage,
  KindPageChunk,
  NewCategory,
  RefreshedCategory,
  SeriesEpisodesTarget,
  StoredCategoryTarget,
  StructureRefreshResult,
]

/** Valores exportados em 2026-10-07, antes da divisão (SC-002). */
const VALORES_DA_FACHADA = [
  'StorageFullError',
  'activeGeneration',
  'allocateGeneration',
  'applyStructureRefresh',
  'clearStagedItems',
  'clearStagedItemsOfOtherSources',
  'collectStaleGenerations',
  'countChannels',
  'deleteAllForSource',
  'discardGeneration',
  'findSeriesRecord',
  'getActiveCategoryBlock',
  'getCategory',
  'getChannel',
  'isQuotaError',
  'kindSortFields',
  'listAllEpisodes',
  'listAllOfKind',
  'listCategories',
  'listChannels',
  'listEpisodes',
  'markCategoryFetched',
  'publishGeneration',
  'readKindPage',
  'renewCategoryItems',
  'resolveContinueEntries',
  'resolveContinueWatching',
  'resolveFavorites',
  'resolveStableIds',
  'setDeclaredCount',
  'stageSectionItems',
  'stagedItemsOf',
  'storeBatch',
  'storeCategories',
  'storeCategoryItems',
  'storeSeriesEpisodes',
  'storeStoredCategory',
]

const LIMITE_DE_LINHAS = 300
const CATALOGO = path.resolve(process.cwd(), 'src/lib/catalog')

/** Linhas físicas; a quebra final do arquivo não conta uma linha a mais (mesma regra da catraca). */
function linhas(texto: string): number {
  if (texto === '') return 0
  return texto.replace(/\r?\n$/, '').split(/\r?\n/).length
}

function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('catalogRepository — fachada da feature 063', () => {
  it('exporta exatamente os mesmos valores, só reexporta de repository/ e cada módulo cabe no limite (FR-001, FR-002, SC-001, SC-002)', () => {
    expect(Object.keys(repository).sort()).toEqual([...VALORES_DA_FACHADA].sort())

    const fachada = semComentarios(readFileSync(path.join(CATALOGO, 'catalogRepository.ts'), 'utf8'))
    const sobra = fachada.replace(
      /export\s+(?:type\s+)?\{[^}]*\}\s*from\s*'\.\/repository\/[\w-]+'\s*;?/g,
      '',
    )
    expect(sobra.trim()).toBe('')

    const pasta = path.join(CATALOGO, 'repository')
    const modulos = readdirSync(pasta).filter((nome) => /\.ts$/.test(nome) && !/\.test\.ts$/.test(nome))
    expect(modulos.length).toBeGreaterThan(1)
    const acimaDoLimite = modulos
      .map((nome) => ({ nome, linhas: linhas(readFileSync(path.join(pasta, nome), 'utf8')) }))
      .filter((modulo) => modulo.linhas > LIMITE_DE_LINHAS)
    expect(acimaDoLimite).toEqual([])
  })
})
