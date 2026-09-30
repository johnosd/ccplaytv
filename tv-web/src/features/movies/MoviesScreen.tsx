import type { ReactNode } from 'react'
import { VodCatalogScreen } from '../vod/VodCatalogScreen'
import type { CategoryScreenSnapshot } from '../catalog/categoryScreenSnapshot'
import type { VodShellProps } from '../vod/vodShell'
import type { TopbarItem } from '../../navigation/appNav'

export interface MoviesScreenProps {
  sourceId: string
  /**
   * `snapshot` (feature 017): o estado da tela no instante em que o filme
   * foi aberto — o `App` o guarda no histórico e o devolve em `restore` ao
   * voltar do detalhe.
   */
  onOpenMovie: (movieId: string, snapshot?: CategoryScreenSnapshot) => void
  /** Estado a restaurar ao voltar do detalhe (feature 017, FR-019). */
  restore?: CategoryScreenSnapshot
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo guardado de uma categoria sumiu do aparelho. */
  onResync: () => void
  /** Feature 025 (FR-001..FR-004): moldura V14 sob a topbar, mesmo padrão da Live (024). */
  shell?: VodShellProps
  /** Remonta com a topbar ativa neste item — volta de Busca/Configurações (feature 026, FR-034/FR-044). */
  initialTopbarItem?: TopbarItem
}

/**
 * Invólucro fino (feature 025, D-002 do plan.md): a apresentação de Filmes
 * é `VodCatalogScreen` parametrizada por `section: 'movies'` — o
 * comportamento (trilha, busca, favoritos, prefetch, snapshot) vive lá,
 * compartilhado com Séries.
 */
export function MoviesScreen({
  sourceId,
  onOpenMovie,
  restore,
  onBack,
  onResync,
  shell,
  initialTopbarItem,
}: MoviesScreenProps): ReactNode {
  return (
    <VodCatalogScreen
      section="movies"
      sourceId={sourceId}
      onOpenItem={onOpenMovie}
      restore={restore}
      onBack={onBack}
      onResync={onResync}
      shell={shell}
      initialTopbarItem={initialTopbarItem}
    />
  )
}
