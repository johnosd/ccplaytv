import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'

/** O que `channelNumberOf` precisa de um canal — `CatalogItemOut` satisfaz por tipagem estrutural. */
export type ChannelNumberInput = Pick<CatalogItemOut, 'category_id' | 'category_position' | 'source_number'>

/**
 * Quantos itens de uma categoria são um fato conhecido agora, nunca uma
 * promessa da fonte — mesma definição usada pela contagem exibida na coluna
 * de categorias (FR-008) e por `channelNumberOf` (feature 024,
 * `logic/numero-do-canal.md` §3). `undefined` = desconhecida, nunca `0`.
 */
export function knownCategoryCount(category: CatalogCategory): number | undefined {
  switch (category.fetchMode) {
    case 'stored':
      // A importação grava a contagem real da varredura antes de a
      // categoria ser lida (feature 014, D-011).
      return category.declaredCount
    case 'eager':
      // Os itens já estão todos gravados (M3U legado, anterior à 014).
      return category.count
    case 'on_demand':
      // Antes de ler, `count` é 0 por padrão e não significa "vazia" —
      // `declaredCount` do painel é ignorado aqui de propósito: ele pode
      // divergir do que foi de fato entregue (aviso de divergência da
      // feature 010), e o número precisa bater com o que existe.
      return category.itemsFetchedAt !== undefined ? category.count : undefined
    default:
      return undefined
  }
}

const format = (n: number): string => String(n).padStart(3, '0')

/**
 * Número de exibição do canal (feature 024, FR-030/FR-031, ADR-011 §6) —
 * `sdd/specs/024-live-tv-ds-v14/logic/numero-do-canal.md`.
 *
 * Só exibição, nunca identidade. `null` = não derivável de forma estável —
 * a tela não mostra número nenhum, nunca um inventado.
 */
export function channelNumberOf(item: ChannelNumberInput, categories: CatalogCategory[]): string | null {
  // R1 do research.md: refutado (T001) — `source_number` nunca é
  // populado hoje, mas a função continua honrando-o se algum dia existir.
  if (item.source_number != null) return format(item.source_number)

  if (item.category_id == null || item.category_position == null) return null
  const own = categories.find((c) => c.id === item.category_id)
  if (!own) return null

  let offset = 0
  for (const category of categories) {
    if (category.order >= own.order) continue
    const known = knownCategoryCount(category)
    if (known === undefined) return null
    offset += known
  }

  return format(offset + item.category_position + 1)
}
