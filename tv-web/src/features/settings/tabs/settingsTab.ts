import type { ComponentType, Ref } from 'react'
import type { SideCategoryNavEntry } from '../../../components/SideCategoryNav'
import type { SourceOut } from '../../import/importApi'

/** Abas na ordem do DS (FR-022). `sources` é a inicial. */
export type SettingsTab = 'integrations' | 'sources' | 'player' | 'accessibility' | 'parental' | 'privacy' | 'about'

/**
 * Onde estava o foco quando a pessoa saiu de Configurações (para Editar,
 * Ressincronizar ou Adicionar) — restaurado ao voltar, por **id** de lista,
 * nunca por índice (FR-026; `logic/foco-configuracoes.md`).
 */
export type SettingsFocus =
  | { zone: 'tabs'; tab: SettingsTab }
  | { zone: 'sources'; sourceId: string; action: 'edit' | 'resync' | 'delete' | 'epg' }
  | { zone: 'sources-add' }
  | { zone: 'panel'; tab: SettingsTab }

export type SettingsDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Teclas da zona `panel`, encaminhadas pela tela à aba ativa — a tela é quem
 * registra o teclado (um só `useRemoteNav`), mesmo padrão do `EpgGuideHandle`.
 */
export interface SettingsTabHandle {
  /** A pessoa entrou de novo no painel desta aba (→/OK na coluna de abas): volta o foco ao começo. */
  onEnter: () => void
  onDirection: (direction: SettingsDirection) => void
  onSelect: () => void
}

/** Saídas de Configurações para outras telas — cada aba usa só as suas. */
export interface SettingsNavigation {
  onAddSource: (from: SettingsFocus) => void
  onEditSource: (source: SourceOut, from: SettingsFocus) => void
  onResyncStarted: (jobId: string, from: SettingsFocus) => void
  /**
   * Botão "EPG" da linha da lista (feature 030, US2) — abre a tela de EPG.
   * Opcional só porque o contrato travado da 026 monta esta tela sem ele;
   * ausente, o botão não faz nada (nunca volta a ser o toast "Em breve").
   */
  onOpenEpg?: (source: SourceOut, from: SettingsFocus) => void
  /**
   * "Configurar"/"Editar" do card do TMDB (feature 032, US2) — abre a tela da
   * chave. Opcional só porque os contratos travados das features 026/028
   * montam esta tela sem ele; ausente, o botão não faz nada.
   */
  onOpenTmdbKey?: (from: SettingsFocus) => void
  /** Depois de a exclusão confirmada terminar — o App despacha `source-removed` (FR-028). */
  onSourceDeleted: (sourceId: string) => void
}

/**
 * O que a tela entrega à aba ativa. A aba monta ao ser escolhida e desmonta
 * ao trocar de aba; reentrar na mesma aba não remonta (chama `onEnter`).
 * Cuidado: o callback por chamada de `mutate` do React Query não roda se a
 * aba desmontar antes de a mutação terminar (trocar de aba no meio de uma
 * exclusão perderia o `onSourceDeleted`) — o mesmo que já valia para a tela
 * inteira com RETURN. Os contratos travados mockam só `mutate`.
 */
export interface SettingsTabProps {
  /** Zona `panel` ativa — sem isso a aba aparece sem foco nenhum. */
  focused: boolean
  /** Só até a pessoa trocar de aba (volta de Editar/Adicionar/EPG/chave); lido no estado inicial. */
  initialFocus?: SettingsFocus
  activeSourceId: string | null
  navigation: SettingsNavigation
  /** ← na borda esquerda: devolve o foco à coluna de abas. */
  exitToTabs: () => void
  /** ↑ na primeira linha: sobe à topbar (no-op sem topbar). */
  goToTopbar: () => void
  showToast: (message: string) => void
  handleRef: Ref<SettingsTabHandle>
}

export interface SettingsTabDefinition extends SideCategoryNavEntry {
  id: SettingsTab
  Panel: ComponentType<SettingsTabProps>
}
