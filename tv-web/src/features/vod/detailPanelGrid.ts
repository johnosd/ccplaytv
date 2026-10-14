import { clamp, type RemoteDirection } from '../../lib/useRemoteNav'
import type { ResolvedTitle, SimilarTabView } from '../../lib/metadata/types'

/**
 * Semelhantes encontrados (com item no catálogo local) e não encontrados, cada
 * grupo na ordem recebida (feature 059, D-007). O `SimilarPanel` desenha com
 * isto e as telas montam a grade de foco com isto — desenho e foco nunca discordam.
 */
export function splitSimilar(titles: ResolvedTitle[]): { found: ResolvedTitle[]; missing: ResolvedTitle[] } {
  return {
    found: titles.filter((title) => title.localItemId !== undefined),
    missing: titles.filter((title) => title.localItemId === undefined),
  }
}

/**
 * Linhas de foco do painel das abas (feature 059, `logic/semelhantes-duas-linhas.md`
 * §2): Elenco = uma linha; Semelhantes prontos = até duas (vazias saem); sem chave =
 * só "Configurar TMDB"; demais = nada focável (o foco fica na aba).
 */
export function detailPanelRows(
  activeTab: string,
  castKeys: string[],
  similar: Pick<SimilarTabView, 'status' | 'titles'>,
  configureKey: string,
): string[][] {
  if (activeTab === 'cast') return castKeys.length > 0 ? [castKeys] : []
  if (activeTab !== 'similar') return []
  if (similar.status === 'no_key') return [[configureKey]]
  if (similar.status !== 'ready') return []
  const { found, missing } = splitSimilar(similar.titles)
  return [found, missing].map((group) => group.map((title) => title.key)).filter((row) => row.length > 0)
}

/**
 * Foco do painel das abas do detalhe como uma grade de linhas de chaves
 * (feature 059, D-008, `logic/semelhantes-duas-linhas.md` §2): Elenco é uma
 * linha; Semelhantes, até duas ("Na sua lista" / "Não encontrados"). Mesma
 * regra da `PersonScreen`: ←/→ param na ponta, ↓/↑ trocam de linha mantendo
 * a coluna (limitada ao tamanho da outra linha), ↑ na 1ª linha sai do painel.
 */
export type PanelMove = { kind: 'focus'; key: string } | { kind: 'exit-up' } | { kind: 'stay' }

export function movePanelFocus(rows: string[][], key: string, dir: RemoteDirection): PanelMove {
  const rowIndex = rows.findIndex((row) => row.includes(key))
  if (rowIndex === -1) return { kind: 'stay' }
  const row = rows[rowIndex]
  const column = row.indexOf(key)

  if (dir === 'left' || dir === 'right') {
    const next = clamp(column + (dir === 'left' ? -1 : 1), 0, row.length - 1)
    return next === column ? { kind: 'stay' } : { kind: 'focus', key: row[next] }
  }
  if (dir === 'up') {
    if (rowIndex === 0) return { kind: 'exit-up' }
    const above = rows[rowIndex - 1]
    return { kind: 'focus', key: above[Math.min(column, above.length - 1)] }
  }
  if (rowIndex === rows.length - 1) return { kind: 'stay' }
  const below = rows[rowIndex + 1]
  return { kind: 'focus', key: below[Math.min(column, below.length - 1)] }
}
