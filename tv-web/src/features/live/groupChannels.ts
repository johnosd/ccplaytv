import type { CatalogItemOut } from '../catalog/catalogApi'

/**
 * Teto de canais renderizados por grupo.
 *
 * **Salvaguarda temporária**, não regra de produto: sem virtualização, montar
 * milhares de nós trava o engine da TV, e uma TV travada no meio do teste de
 * reprodução seria diagnosticada como falha do player. Sai quando a
 * virtualização entrar (item 7 do backlog). O valor é um ponto de partida a
 * ajustar por medição, não um número defendido.
 *
 * Referência de escala: a fonte real já importada tem 311.367 entradas.
 */
export const CHANNELS_PER_GROUP_CAP = 500

/** Rótulo para canais que a fonte não declarou em nenhum grupo (ADR-005 §1). */
export const UNGROUPED_LABEL = 'Sem categoria'

export interface ChannelGroup {
  name: string
  /** Já limitado ao teto. */
  channels: CatalogItemOut[]
  /** Quantos canais o grupo tem de fato, antes do teto. */
  totalCount: number
  truncated: boolean
}

/**
 * Agrupa canais pelos grupos declarados pela fonte.
 *
 * Invariantes:
 * - **Ordem da fonte é preservada**, tanto entre grupos (ordem de primeira
 *   aparição) quanto dentro de cada grupo. Nada é ordenado alfabeticamente:
 *   listas IPTV usam a ordem como informação (canais principais primeiro).
 * - Grupo ausente, vazio ou só espaços vira "Sem categoria" — nunca um grupo
 *   inventado nem um item descartado (ADR-005 §1/§2).
 * - Função pura: sem React, sem rede, testável isoladamente.
 */
export function groupChannels(
  items: CatalogItemOut[],
  cap: number = CHANNELS_PER_GROUP_CAP,
  /**
   * Total real por grupo, quando quem chama o conhece. A consulta também
   * limita o que lê do armazenamento, então contar os itens recebidos
   * responderia "500 de 500" para um grupo que tem 12 mil — a nota de
   * truncamento diria que não há truncamento.
   */
  totals?: Record<string, number>,
): ChannelGroup[] {
  const order: string[] = []
  const byName = new Map<string, CatalogItemOut[]>()

  for (const item of items) {
    const name = item.original_group?.trim() ? item.original_group.trim() : UNGROUPED_LABEL
    let bucket = byName.get(name)
    if (!bucket) {
      bucket = []
      byName.set(name, bucket)
      order.push(name)
    }
    bucket.push(item)
  }

  return order.map((name) => {
    const all = byName.get(name) ?? []
    const channels = all.slice(0, cap)
    const totalCount = totals?.[name] ?? all.length
    return {
      name,
      channels,
      totalCount,
      truncated: totalCount > channels.length,
    }
  })
}
