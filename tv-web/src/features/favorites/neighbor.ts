/**
 * Para onde vai o foco quando o item focado sai da lista visível — desfavoritar
 * dentro de "★ Favoritos" (feature 013, FR-018) ou remover do "↺ Histórico"
 * (feature 036, FR-017). Calculado ANTES de a lista mudar.
 *
 * Próximo id na lista; se não houver, o anterior; se não sobrar nenhum, `null`.
 */
export function computeNeighbor(items: { id: string }[], currentId: string): string | null {
  const index = items.findIndex((item) => item.id === currentId)
  if (index === -1 || items.length <= 1) return null
  return items[index + 1]?.id ?? items[index - 1]?.id ?? null
}
