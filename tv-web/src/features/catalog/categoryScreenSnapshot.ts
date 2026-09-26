/**
 * O que uma tela de categoria (Filmes/Séries) precisa para voltar do
 * detalhe exatamente onde estava (feature 017, FR-019; fecha o bug de
 * backlog "Voltar do detalhe pra grade não restaura foco nem posição").
 *
 * Opaco para o `App.tsx`: ele só guarda o que a tela entregou ao abrir o
 * detalhe e devolve de volta ao remontá-la. Tudo é identidade (nome de
 * categoria, id de categoria, id de item) — nunca índice (constitution,
 * "Voltar Restaura Foco e Posição").
 */

/**
 * `{ kind: 'search' }` (feature 017) foi removido daqui na feature 018: a
 * busca deixou de ser uma entrada própria e virou um sub-estado de
 * qualquer entrada já aberta (`searchActive`, abaixo) — "Todos" (`all`) a
 * substitui como entrada virtual nova. `MoviesScreen.tsx`/`SeriesScreen.tsx`
 * migraram para este shape na mesma leva de trabalho, então não houve
 * janela de build quebrado a proteger (D-007 do `plan.md` da 018).
 */
export type SnapshotTrailKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; name: string }

export type SnapshotEntered = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; id: number }

export interface CategoryScreenSnapshot {
  trailKey: SnapshotTrailKey | null
  entered: SnapshotEntered | null
  col: 0 | 1
  focusedItemId: string | null
  /** Termo da busca no momento em que o item foi aberto — `''` fora da busca. */
  searchTerm: string
  /** Se o campo de busca estava aberto (feature 018) ao abrir o item. */
  searchActive: boolean
}
