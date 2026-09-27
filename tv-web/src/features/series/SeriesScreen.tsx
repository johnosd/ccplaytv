import type { ReactNode } from 'react'
import { VodCatalogScreen } from '../vod/VodCatalogScreen'
import type { CategoryScreenSnapshot } from '../catalog/categoryScreenSnapshot'
import type { VodShellProps } from '../vod/vodShell'

export interface SeriesScreenProps {
  sourceId: string
  /** `snapshot` (feature 017): mesmo contrato de `MoviesScreenProps.onOpenMovie`. */
  onOpenSeries: (seriesId: string, snapshot?: CategoryScreenSnapshot) => void
  /** Estado a restaurar ao voltar do detalhe (feature 017, FR-019). */
  restore?: CategoryScreenSnapshot
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo guardado de uma categoria sumiu do aparelho. */
  onResync: () => void
  /** Feature 025 (FR-001..FR-004): moldura V14 sob a topbar, mesmo padrão da Live (024). */
  shell?: VodShellProps
}

/**
 * Invólucro fino (feature 025, D-002 do plan.md): a apresentação de Séries
 * é `VodCatalogScreen` parametrizada por `section: 'series'` — o
 * comportamento (trilha, busca, favoritos, prefetch, snapshot) vive lá,
 * compartilhado com Filmes.
 */
export function SeriesScreen({ sourceId, onOpenSeries, restore, onBack, onResync, shell }: SeriesScreenProps): ReactNode {
  return (
    <VodCatalogScreen
      section="series"
      sourceId={sourceId}
      onOpenItem={onOpenSeries}
      restore={restore}
      onBack={onBack}
      onResync={onResync}
      shell={shell}
    />
  )
}
