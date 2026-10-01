import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TopbarItem, TopDestination } from '../../navigation/appNav'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import type { HintItem } from '../shell/HintBar'
import { SideCategoryNav } from '../../components/SideCategoryNav'
import { SETTINGS_TABS } from './tabs/settingsTabs'
import type { SettingsFocus, SettingsNavigation, SettingsTab, SettingsTabHandle } from './tabs/settingsTab'

export type { SettingsFocus, SettingsTab } from './tabs/settingsTab'

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

export interface SettingsScreenProps extends SettingsNavigation {
  /** Lista ativa da sessão — recebe a marca "Lista ativa" (FR-023). `null` sem lista ativa. */
  activeSourceId: string | null
  shell?: SettingsShellProps
  /** Foco a restaurar ao voltar de Editar/progresso/Adicionar. */
  initialFocus?: SettingsFocus
  /** RETURN na base da tela (FR-033/FR-034). */
  onBack: () => void
}

const HINTS: HintItem[] = [
  { keyLabel: 'OK', action: 'Selecionar' },
  { keyLabel: 'RETURN', action: 'Voltar' },
]

type Zone = 'topbar' | 'tabs' | 'panel'

/**
 * Configurações em abas laterais (feature 026, US2 — FR-021..FR-034),
 * conforme `logic/foco-configuracoes.md`. Zonas `topbar`/`tabs`/`panel`
 * (D-004, mesmo padrão de `logic/foco-shell.md`); `tabs`/`panel` são a
 * mesma "camada" para efeito de RETURN — só `LEFT`/`UP` alternam entre elas.
 *
 * Cada aba é um módulo do registro `SETTINGS_TABS` (item 63 do backlog): a
 * tela só cuida das zonas e encaminha as teclas do painel à aba ativa pelo
 * `SettingsTabHandle`.
 */
export function SettingsScreen({
  activeSourceId,
  shell,
  initialFocus,
  onAddSource,
  onEditSource,
  onResyncStarted,
  onOpenEpg,
  onOpenTmdbKey,
  onSourceDeleted,
  onBack,
}: SettingsScreenProps): ReactNode {
  const initialTab: SettingsTab =
    initialFocus?.zone === 'tabs' || initialFocus?.zone === 'panel' ? initialFocus.tab : 'sources'
  const initialZone: Zone = initialFocus?.zone === 'tabs' || initialFocus === undefined ? 'tabs' : 'panel'

  const [zone, setZone] = useState<Zone>(initialZone)
  const [zoneBeforeTopbar, setZoneBeforeTopbar] = useState<'tabs' | 'panel'>(initialZone === 'tabs' ? 'tabs' : 'panel')
  const [focusedTab, setFocusedTab] = useState<SettingsTab>(initialTab)
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [topbarFocusedItem, setTopbarFocusedItem] = useState<TopbarItem>('settings')
  /** O foco a restaurar só vale para a aba em que a tela abriu, até a primeira troca de aba. */
  const [initialFocusPending, setInitialFocusPending] = useState(true)
  const tabHandle = useRef<SettingsTabHandle>(null)

  const { toastMessage, toastKey, showToast } = useToast()

  const navigation: SettingsNavigation = {
    onAddSource,
    onEditSource,
    onResyncStarted,
    onOpenEpg,
    onOpenTmdbKey,
    onSourceDeleted,
  }

  /** Outra aba monta do zero; a mesma aba não remonta — volta ao começo pelo `onEnter`. */
  function enterPanel(tab: SettingsTab) {
    if (tab === activeTab) tabHandle.current?.onEnter()
    else setInitialFocusPending(false)
    setActiveTab(tab)
    setZone('panel')
  }

  function exitToTabs() {
    setZone('tabs')
    setFocusedTab(activeTab)
  }

  function goToTopbar() {
    if (!shell) return
    setZoneBeforeTopbar(zone === 'panel' ? 'panel' : 'tabs')
    setZone('topbar')
  }

  useRemoteNav({
    onDirection: (direction) => {
      if (zone === 'topbar') {
        if (direction === 'down') setZone(zoneBeforeTopbar)
        return
      }
      if (zone === 'tabs') {
        const idx = SETTINGS_TABS.findIndex((tab) => tab.id === focusedTab)
        if (direction === 'up') {
          if (idx === 0) {
            goToTopbar()
            return
          }
          setFocusedTab(SETTINGS_TABS[clamp(idx - 1, 0, SETTINGS_TABS.length - 1)].id)
          return
        }
        if (direction === 'down') {
          setFocusedTab(SETTINGS_TABS[clamp(idx + 1, 0, SETTINGS_TABS.length - 1)].id)
          return
        }
        if (direction === 'right') enterPanel(focusedTab)
        return
      }
      tabHandle.current?.onDirection(direction)
    },
    onSelect: () => {
      if (zone === 'topbar') return // TopBar tem o próprio onSelect
      if (zone === 'tabs') {
        enterPanel(focusedTab)
        return
      }
      tabHandle.current?.onSelect()
    },
    onBack,
  })

  const ActivePanel = (SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0]).Panel

  const body = (
    <div className="settings-body">
      <SideCategoryNav
        entries={SETTINGS_TABS}
        selectedId={activeTab}
        focusedId={zone === 'tabs' ? focusedTab : undefined}
        onSelect={(id) => enterPanel(id as SettingsTab)}
      />
      {/* Achado real (feature 028, FR-006): rolava com a barra nativa visível. */}
      <div className="settings-panel no-scrollbar">
        <ActivePanel
          key={activeTab}
          focused={zone === 'panel'}
          initialFocus={initialFocusPending ? initialFocus : undefined}
          activeSourceId={activeSourceId}
          navigation={navigation}
          exitToTabs={exitToTabs}
          goToTopbar={goToTopbar}
          showToast={showToast}
          handleRef={tabHandle}
        />
      </div>
    </div>
  )

  return (
    <div className="screen settings-screen">
      {shell ? (
        <AppShell
          hints={HINTS}
          topBar={
            <TopBar
              sourceName={shell.sourceName}
              active={zone === 'topbar'}
              focusedItem={topbarFocusedItem}
              currentItem="settings"
              onFocusItem={setTopbarFocusedItem}
              onExitDown={() => setZone(zoneBeforeTopbar)}
              onNavigate={(destination) => shell.onSwitchTop(destination)}
              onGoHome={shell.onGoHome}
              onOpenProfiles={shell.onOpenProfiles}
              onOpenSearch={shell.onOpenSearch}
              onBack={onBack}
            />
          }
        >
          {body}
        </AppShell>
      ) : (
        <>
          <h1 className="screen-title">Configurações</h1>
          {body}
        </>
      )}
      <Toast message={toastMessage} messageKey={toastKey} />
    </div>
  )
}
