/**
 * Comportamento de "segurar OK favorita" compartilhado pelas três telas
 * (Live TV, Filmes, Séries — feature 013). Cada tela só decide QUANDO
 * chamar (`onLongSelect` do `useRemoteNav`, só na coluna de conteúdo) e
 * COM que lista visível, se a chamada acontece dentro da categoria
 * "Favoritos"; o resto — gravar, avisar, mover o foco — é um lugar só.
 */

import { useToggleFavorite, type CatalogItemOut } from '../catalog/catalogApi'

export interface FavoriteToggleOptions {
  /**
   * A lista de itens visíveis NO MOMENTO da chamada — só quando o gesto
   * acontece dentro da categoria "Favoritos" (nunca na categoria de
   * origem do item, onde desfavoritar não precisa mover o foco pra fora
   * dele). Usada apenas para calcular o vizinho, antes de a lista mudar
   * de verdade (FR-018).
   */
  visibleItems?: { id: string }[]
  /**
   * Chamado com o id do item vizinho — ou `null` se não sobra nenhum —
   * só quando o item foi DESFAVORITADO e `visibleItems` foi informada.
   * Favoritar nunca move o foco.
   */
  onFocusNeighbor?: (neighborId: string | null) => void
}

/** Próximo id na lista; se não houver, o anterior; se não sobrar nenhum, `null` (FR-018). */
function computeNeighbor(items: { id: string }[], currentId: string): string | null {
  const index = items.findIndex((item) => item.id === currentId)
  if (index === -1 || items.length <= 1) return null
  return items[index + 1]?.id ?? items[index - 1]?.id ?? null
}

/** Mensagem honesta, sem detalhe técnico (FR-013). */
function explainFavoriteError(error: unknown): string {
  if (error instanceof Error && error.message.includes('identidade estável')) {
    // Edge case da spec: item sem id do painel e sem nome aproveitável —
    // não é uma falha passageira de gravação, é permanente para este item.
    return 'Este item não pode ser favoritado.'
  }
  return 'Não foi possível salvar o favorito.'
}

export function useFavoriteToggle(showToast: (message: string) => void) {
  const toggleMutation = useToggleFavorite()

  async function toggle(item: CatalogItemOut, options: FavoriteToggleOptions = {}): Promise<void> {
    try {
      const isFavoriteNow = await toggleMutation.mutateAsync(item)
      showToast(isFavoriteNow ? 'Adicionado aos favoritos' : 'Removido dos favoritos')

      if (!isFavoriteNow && options.visibleItems && options.onFocusNeighbor) {
        options.onFocusNeighbor(computeNeighbor(options.visibleItems, item.id))
      }
    } catch (error) {
      // A estrela nunca muda numa falha: não houve `onSuccess`, então
      // nenhum cache foi invalidado — a tela continua lendo o estado
      // anterior (FR-013).
      showToast(explainFavoriteError(error))
    }
  }

  return { toggle, isPending: toggleMutation.isPending }
}
