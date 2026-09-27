import type { ReactNode } from 'react'
import type { SourceOut } from '../import/importApi'
import type { TopDestination } from '../../navigation/appNav'

/** Abas na ordem do DS (FR-022). `sources` é a inicial. */
export type SettingsTab = 'integrations' | 'sources' | 'player' | 'accessibility' | 'parental' | 'about'

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

/**
 * Moldura V14 (topbar) — mesmo padrão de `LiveShellProps`/`VodShellProps`.
 * Ausente = Configurações aberta pelo atalho "Gerenciar listas" da tela de
 * perfis, sem lista ativa: sem topbar (FR-033).
 */
export interface SettingsShellProps {
  sourceName: string
  onGoHome: () => void
  onSwitchTop: (destination: TopDestination) => void
  onOpenProfiles: () => void
  onOpenSearch: () => void
}

export interface SettingsScreenProps {
  /** Lista ativa da sessão — recebe a marca "Lista ativa" (FR-023). `null` sem lista ativa. */
  activeSourceId: string | null
  shell?: SettingsShellProps
  /** Foco a restaurar ao voltar de Editar/progresso/Adicionar. */
  initialFocus?: SettingsFocus
  onAddSource: (from: SettingsFocus) => void
  onEditSource: (source: SourceOut, from: SettingsFocus) => void
  onResyncStarted: (jobId: string, from: SettingsFocus) => void
  /** Depois de a exclusão confirmada terminar — o App despacha `source-removed` (FR-028). */
  onSourceDeleted: (sourceId: string) => void
  /** RETURN na base da tela (FR-033/FR-034). */
  onBack: () => void
}

/**
 * Configurações em abas laterais (feature 026, US2 — FR-021..FR-034).
 * Stub do `sdd-plan`: o `sdd-execute` implementa conforme
 * `logic/foco-configuracoes.md`.
 */
export function SettingsScreen(props: SettingsScreenProps): ReactNode {
  void props
  return <div className="screen settings-screen" />
}
