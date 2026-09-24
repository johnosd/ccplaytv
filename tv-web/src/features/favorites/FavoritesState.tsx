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
      <div className="live-state-copy">Segure OK sobre {LABEL_BY_KIND[kind]} para favoritar.</div>
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
