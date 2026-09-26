/**
 * Estados compartilhados da categoria virtual "Favoritos" (feature 013):
 * o vazio (nenhum favorito carregado) e a nota de favoritos gravados que
 * ainda não resolveram nesta geração (FR-009) — usada tanto sozinha
 * (dentro do vazio) quanto ao lado de uma lista com itens, porque os dois
 * podem coexistir: alguns favoritos carregados, outros não.
 */

import type { FavoritableKind } from '../catalog/catalogApi'

const LABEL_BY_KIND: Record<FavoritableKind, string> = {
  channel: 'um canal',
  movie: 'um filme',
  series: 'uma série',
}

/**
 * Texto da dica fixa (FR-012) — um lugar só, usado pelas três telas
 * (Live/Filmes/Séries), pra "segurar OK" e "tecla amarela" nunca ficarem
 * descritos de jeitos diferentes em telas diferentes. Os dois caminhos
 * fazem a MESMA coisa (`toggleFocusedFavorite` de cada tela) — a tecla
 * amarela existe desde 24/09/2026 porque, testando na TV física com um
 * controle substituto, segurar OK não se comportou como no navegador.
 */
export const FAVORITE_HINT_TEXT = 'Segure OK ou aperte a tecla amarela para favoritar'

/** Dica fixa, sempre visível enquanto a tela tem itens favoritáveis (FR-012). */
export function FavoriteHint() {
  return <div className="fav-hint">{FAVORITE_HINT_TEXT}</div>
}

export interface FavoritesEmptyStateProps {
  kind: FavoritableKind
  /**
   * Foco é estado da TELA (ADR-009) — este componente só aplica a classe
   * quando mandado, nunca decide sozinho quem está focado. A ativação por
   * OK também é da tela (`onSelect` do `useRemoteNav`, não `onClick`): o
   * `onClick` aqui é só para o clique de mouse em desenvolvimento, nunca o
   * único caminho (constitution, "Foco Visível e Sem Becos Sem Saída").
   */
  focused: boolean
  onBack: () => void
}

/** "Favoritos" sem nenhum item carregado — nunca um beco sem saída. */
export function FavoritesEmptyState({ kind, focused, onBack }: FavoritesEmptyStateProps) {
  return (
    <div className="live-state">
      <div className="live-state-title">Nenhum favorito ainda</div>
      <div className="live-state-copy">
        Segure OK ou aperte a tecla amarela sobre {LABEL_BY_KIND[kind]} para favoritar.
      </div>
      <button
        type="button"
        className={`live-state-action${focused ? ' tv-focus' : ''}`}
        onClick={onBack}
      >
        Voltar
      </button>
    </div>
  )
}

export interface FavoritesUnresolvedNoteProps {
  /** Quantos favoritos gravados não resolveram — só usado pra decidir SE mostra, nunca exibido como número (FR-009). */
  unresolved: number
}

/**
 * Nunca conta nem lista o que não está carregado — só diz que existe e
 * onde vai aparecer, para não parecer que o favorito foi perdido
 * (princípio "Progresso e Capacidades São Reais").
 */
export function FavoritesUnresolvedNote({ unresolved }: FavoritesUnresolvedNoteProps) {
  if (unresolved <= 0) return null
  return (
    <div className="live-truncated-note">
      Há favoritos que ainda não apareceram aqui — eles voltam a aparecer quando você abrir a categoria onde estão.
    </div>
  )
}
