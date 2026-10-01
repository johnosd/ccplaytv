import { describe, expect, it } from 'vitest'
import { categoryMatchKey, diffCategories, type ExistingCategory, type IncomingCategory } from './structureDiff'

describe('Reconciliação de estrutura na atualização — contrato da feature 038', () => {
  // FR-024 (categoria mantida conserva o id local — e com ele os itens), FR-028 (removida sai, nova entra),
  // Constitution: Categorias da Fonte São Preservadas (nome/posição vêm da atualização).
  // Armadilha: o `category_id` do Xtream se repete entre seções — nunca casar canal com filme.
  it('mantém por seção + id do provedor (ou nome no M3U), acrescenta as novas e remove as que saíram', () => {
    const existing: ExistingCategory[] = [
      { id: 101, kind: 'movie', matchKey: categoryMatchKey('10', 'Ação') },
      { id: 102, kind: 'movie', matchKey: categoryMatchKey('11', 'Drama') },
      { id: 201, kind: 'channel', matchKey: categoryMatchKey('10', 'Esportes') },
      { id: 301, kind: 'series', matchKey: categoryMatchKey(undefined, 'Novelas') },
    ]
    const dramaRenamed: IncomingCategory = {
      kind: 'movie',
      matchKey: categoryMatchKey('11', 'Drama e Romance'),
      name: 'Drama e Romance',
      position: 0,
    }
    const newMovieCategory: IncomingCategory = {
      kind: 'movie',
      matchKey: categoryMatchKey('12', 'Lançamentos'),
      name: 'Lançamentos',
      position: 1,
    }
    // Mesmo id "10" de "Ação", mas em canais: casa com 201, nunca com 101.
    const sportsChannel: IncomingCategory = {
      kind: 'channel',
      matchKey: categoryMatchKey('10', 'Esportes HD'),
      name: 'Esportes HD',
      position: 0,
    }
    const novelasM3u: IncomingCategory = {
      kind: 'series',
      matchKey: categoryMatchKey(undefined, 'Novelas'),
      name: 'Novelas',
      position: 3,
      declaredCount: 40,
    }

    const diff = diffCategories(existing, [dramaRenamed, newMovieCategory, sportsChannel, novelasM3u])

    expect(diff.keep).toHaveLength(3)
    expect(diff.keep).toEqual(
      expect.arrayContaining([
        { id: 102, incoming: dramaRenamed },
        { id: 201, incoming: sportsChannel },
        { id: 301, incoming: novelasM3u },
      ]),
    )
    expect(diff.add).toEqual([newMovieCategory])
    expect(diff.remove).toEqual([101])
    // Id do provedor casa mesmo com nome trocado; sem id, só o nome declarado casa.
    expect(categoryMatchKey('11', 'Drama')).toBe(categoryMatchKey('11', 'Outro nome'))
    expect(categoryMatchKey(undefined, 'Novelas')).not.toBe(categoryMatchKey(undefined, 'Novelas BR'))
  })
})
