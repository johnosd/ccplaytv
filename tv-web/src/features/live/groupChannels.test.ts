import { describe, expect, it } from 'vitest'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { groupChannels, UNGROUPED_LABEL } from './groupChannels'

function channel(
  name: string,
  group: string | null,
  playable = true,
): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'channel',
    name,
    original_group: group,
    published: true,
    playable,
  }
}

describe('groupChannels', () => {
  it('preserva a ordem de declaração da fonte, entre grupos e dentro deles', () => {
    // Ordem invertida do alfabeto de propósito: se algo ordenar por nome, o
    // teste quebra. Listas IPTV usam a ordem como informação.
    const result = groupChannels([
      channel('Zulu', 'Esportes'),
      channel('Alfa', 'Notícias'),
      channel('Yankee', 'Esportes'),
      channel('Bravo', 'Notícias'),
    ])

    expect(result.map((g) => g.name)).toEqual(['Esportes', 'Notícias'])
    expect(result[0].channels.map((c) => c.name)).toEqual(['Zulu', 'Yankee'])
    expect(result[1].channels.map((c) => c.name)).toEqual(['Alfa', 'Bravo'])
  })

  it('agrupa canal sem grupo em "Sem categoria", sem inventar nem descartar', () => {
    const result = groupChannels([
      channel('Com grupo', 'Notícias'),
      channel('Sem grupo', null),
      channel('Grupo vazio', ''),
      channel('Grupo só espaços', '   '),
    ])

    const ungrouped = result.find((g) => g.name === UNGROUPED_LABEL)
    expect(ungrouped).toBeDefined()
    expect(ungrouped?.channels.map((c) => c.name)).toEqual([
      'Sem grupo',
      'Grupo vazio',
      'Grupo só espaços',
    ])
    // Nenhum item some.
    expect(result.reduce((n, g) => n + g.totalCount, 0)).toBe(4)
  })

  it('normaliza espaços em volta do nome do grupo', () => {
    const result = groupChannels([channel('A', ' Notícias '), channel('B', 'Notícias')])

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Notícias')
    expect(result[0].channels).toHaveLength(2)
  })

  it('aplica o teto e sinaliza truncamento, sem perder a contagem real', () => {
    const many = Array.from({ length: 7 }, (_, i) => channel(`C${i}`, 'Grande'))

    const result = groupChannels(many, 3)

    expect(result[0].channels).toHaveLength(3)
    expect(result[0].channels.map((c) => c.name)).toEqual(['C0', 'C1', 'C2'])
    expect(result[0].truncated).toBe(true)
    // A contagem real sobrevive ao corte — é o que permite explicar ao
    // usuário o que ficou de fora.
    expect(result[0].totalCount).toBe(7)
  })

  it('não marca truncamento quando o grupo cabe exatamente no teto', () => {
    const exact = Array.from({ length: 3 }, (_, i) => channel(`C${i}`, 'Justo'))

    const result = groupChannels(exact, 3)

    expect(result[0].truncated).toBe(false)
    expect(result[0].totalCount).toBe(3)
  })

  it('devolve lista vazia para entrada vazia', () => {
    expect(groupChannels([])).toEqual([])
  })

  it('preserva o sinal de indisponibilidade de cada canal', () => {
    const result = groupChannels([channel('Sem URL', 'G', false), channel('Com URL', 'G')])

    expect(result[0].channels[0].playable).toBe(false)
    expect(result[0].channels[1].playable).toBe(true)
  })
})
