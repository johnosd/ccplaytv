import { describe, expect, it } from 'vitest'
import { classifyEntry, type CatalogItemKind } from './classifier'
import { parseM3uText } from './m3uParser'
// A fixture é lida do próprio `api/`, não copiada: uma cópia divergiria em
// silêncio, e detectar divergência entre as duas implementações é o ponto.
// O import bruto é do empacotador — `node:fs` exigiria tipos de Node no
// projeto da TV, onde `process` não existe e não deve type-checkar.
import sharedFixture from '../../../../api/tests/fixtures/sample.m3u?raw'

/**
 * Paridade com o caminho congelado (SC-013).
 *
 * O backend não é removido pela migração — congela como contorno
 * (ADR-008/FR-021). Isso dá um efeito colateral útil: ele vira **oráculo**
 * do port. Este teste lê **a mesma fixture** que `api/tests/test_classifier.py`
 * usa e afirma o mesmo resultado que os testes de lá documentam.
 *
 * Ler o arquivo original em vez de copiá-lo é deliberado: uma cópia
 * divergiria em silêncio, e detectar divergência entre as duas
 * implementações é justamente o ponto (plan.md, R-007).
 *
 * Este é o único lugar da feature que toca `api/` — e só para leitura.
 * D-007 continua valendo: nenhuma task altera código Python.
 */


describe('paridade com o caminho congelado (api/)', () => {
  it('a fixture compartilhada é a do backend, e é uma lista de verdade', () => {
    // Se o backend mover, esvaziar ou trocar a fixture, isto falha aqui com
    // uma mensagem clara, em vez de falhar adiante parecendo bug do parser.
    expect(sharedFixture.trimStart().startsWith('#EXTM3U')).toBe(true)
    expect(sharedFixture.length).toBeGreaterThan(100)
  })

  it('produz os mesmos quatro tipos que test_classifier.py documenta', async () => {
    const { entries } = await parseM3uText(sharedFixture)
    const kinds = new Set<CatalogItemKind>(entries.map((entry) => classifyEntry(entry).kind))

    expect(kinds).toEqual(new Set<CatalogItemKind>(['channel', 'movie', 'episode', 'unclassified']))
  })

  it('agrupa os dois episódios sob a mesma série, temporada 1, sem criar série avulsa', async () => {
    const { entries } = await parseM3uText(sharedFixture)
    const classified = entries.map(classifyEntry)
    const episodes = classified.filter((item) => item.kind === 'episode')

    expect(episodes).toHaveLength(2)
    expect(episodes[0].seriesKey).toBe(episodes[1].seriesKey)
    expect(new Set(episodes.map((item) => item.episodeNumber))).toEqual(new Set([1, 2]))
    expect(episodes.every((item) => item.seasonNumber === 1)).toBe(true)
    expect(classified.some((item) => item.kind === 'series')).toBe(false)
  })

  it('marca exatamente um item como não classificado, com o mesmo nome', async () => {
    const { entries } = await parseM3uText(sharedFixture)
    const unclassified = entries.map(classifyEntry).filter((item) => item.kind === 'unclassified')

    expect(unclassified).toHaveLength(1)
    expect(unclassified[0].name).toBe('Item Sem Grupo Nem Padrao')
  })
})
