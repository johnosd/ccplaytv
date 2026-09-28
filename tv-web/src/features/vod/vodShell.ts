import type { TopDestination } from '../../navigation/appNav'

/**
 * Moldura V14 de Filmes/Séries (feature 025, FR-001..FR-004) — mesmo papel de
 * `LiveShellProps` (feature 024): opcional; sem ela, a tela funciona sozinha,
 * como os testes de comportamento a montam. `logic/foco-vod.md` §1.
 */
export interface VodShellProps {
  /** Nome da lista ativa, para o indicador da topbar. */
  sourceName: string
  /** OK em "Início" na topbar. */
  onGoHome: () => void
  /** OK em outro destino de topo na topbar — troca sem empilhar (`switch-top`, D-004 da 024). */
  onSwitchTop: (destination: TopDestination) => void
  /** OK no indicador da lista ativa. */
  onOpenProfiles: () => void
  /**
   * OK na lupa/engrenagem da topbar (feature 026, D-001 — opcional: os
   * contratos travados das features 024/025 montam este objeto com 4
   * campos, e o `tsc -b` compila esses arquivos). Ausente = soft disabled.
   */
  onOpenSearch?: () => void
  onOpenSettings?: () => void
}
