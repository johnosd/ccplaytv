import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRemoteNav, clamp } from '../../../lib/useRemoteNav'
import { useToast } from '../../../lib/useToast'
import { useT } from '../../../lib/i18n/I18nProvider'
import { EmptyState } from '../../../components/EmptyState'
import { SideCategoryNav } from '../../../components/SideCategoryNav'
import { Toast } from '../../../components/Toast'
import { useSources } from '../../import/importApi'
import type { ListSettingsFocus, ListSettingsNavigation, ListSettingsTab, SettingsTabHandle } from '../tabs/settingsTab'
import { LIST_SETTINGS_TABS } from './listSettingsTabs'

export type { ListSettingsFocus, ListSettingsTab } from '../tabs/settingsTab'

export interface ListSettingsScreenProps extends ListSettingsNavigation {
  /** A lista que esta tela configura (pode não ser a ativa). */
  sourceId: string
  /** Lista ativa da sessão — só para marcar "Lista ativa"; nada aqui a usa como alvo. */
  activeSourceId: string | null
  initialFocus?: ListSettingsFocus
  /** RETURN na base (FR-008). */
  onBack: () => void
}

type Zone = 'tabs' | 'panel'

/**
 * Configurações da lista (feature 067, US1 — FR-001..FR-011): abas laterais para UMA lista cadastrada, ativa ou não,
 * sem topbar. Abrir esta tela não troca a lista ativa. Mesmo modelo de zonas e de registro de abas de
 * `SettingsScreen` (D-006), sem a zona `topbar`. Regras em
 * `sdd/specs/067-configuracoes-lista-global/logic/navegacao-lista.md`.
 */
export function ListSettingsScreen({
  sourceId,
  activeSourceId,
  initialFocus,
  onEditSource,
  onResyncStarted,
  onOpenEpg,
  onSourceDeleted,
  onBack,
}: ListSettingsScreenProps): ReactNode {
  const t = useT()
  const sourcesQuery = useSources()
  // Lê a versão atual da lista: voltar de Editar já traz o nome novo (D-004).
  const source = sourcesQuery.data?.sources.find((candidate) => candidate.id === sourceId)
  const tabEntries = LIST_SETTINGS_TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) }))
  const initialTab: ListSettingsTab = initialFocus?.tab ?? 'account'

  const [zone, setZone] = useState<Zone>(initialFocus ? 'panel' : 'tabs')
  const [focusedTab, setFocusedTab] = useState<ListSettingsTab>(initialTab)
  const [activeTab, setActiveTab] = useState<ListSettingsTab>(initialTab)
  /** O foco a restaurar só vale para a aba em que a tela abriu, até a primeira troca de aba. */
  const [initialFocusPending, setInitialFocusPending] = useState(true)
  const tabHandle = useRef<SettingsTabHandle>(null)
  const { toastMessage, toastKey, showToast } = useToast()

  /** Outra aba monta do zero; a mesma aba não remonta — volta ao começo pelo `onEnter`. */
  function enterPanel(tab: ListSettingsTab) {
    if (tab === activeTab) tabHandle.current?.onEnter()
    else setInitialFocusPending(false)
    setActiveTab(tab)
    setZone('panel')
  }

  function exitToTabs() {
    setZone('tabs')
    setFocusedTab(activeTab)
  }

  useRemoteNav({
    onDirection: (direction) => {
      if (!source) return
      if (zone === 'tabs') {
        const idx = LIST_SETTINGS_TABS.findIndex((tab) => tab.id === focusedTab)
        if (direction === 'up' || direction === 'down') {
          setFocusedTab(LIST_SETTINGS_TABS[clamp(idx + (direction === 'down' ? 1 : -1), 0, LIST_SETTINGS_TABS.length - 1)].id)
        }
        if (direction === 'right') enterPanel(focusedTab)
        return
      }
      tabHandle.current?.onDirection(direction)
    },
    onSelect: () => {
      // Sem a lista (carregando ou apagada por outro caminho), a única ação é voltar (FR-011, R-009).
      if (!source) {
        if (!sourcesQuery.isLoading) onBack()
        return
      }
      if (zone === 'tabs') enterPanel(focusedTab)
      else tabHandle.current?.onSelect()
    },
    onBack,
  })

  const header = (
    <>
      <h1 className="screen-title">
        {t('listSettings.title')}
        {source && <span className="list-settings-name"> · {source.display_name}</span>}
      </h1>
      <p className="settings-scope-note">{t('listSettings.scope')}</p>
    </>
  )

  if (!source) {
    return (
      <div className="screen settings-screen list-settings-screen">
        {header}
        <EmptyState
          title={sourcesQuery.isLoading ? t('listSettings.loading') : t('listSettings.missing.title')}
          description={sourcesQuery.isLoading ? undefined : t('listSettings.missing.description')}
          action={{ label: t('common.back'), onSelect: onBack }}
          focused
        />
      </div>
    )
  }

  const ActivePanel = (LIST_SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? LIST_SETTINGS_TABS[0]).Panel
  const navigation: ListSettingsNavigation = { onEditSource, onResyncStarted, onOpenEpg, onSourceDeleted }

  return (
    <div className="screen settings-screen list-settings-screen">
      {header}
      <div className="settings-body">
        <SideCategoryNav
          entries={tabEntries}
          selectedId={activeTab}
          focusedId={zone === 'tabs' ? focusedTab : undefined}
          onSelect={(id) => enterPanel(id as ListSettingsTab)}
        />
        <div className="settings-panel no-scrollbar">
          <ActivePanel
            key={activeTab}
            focused={zone === 'panel'}
            initialFocus={initialFocusPending ? initialFocus : undefined}
            source={source}
            activeSourceId={activeSourceId}
            navigation={navigation}
            exitToTabs={exitToTabs}
            showToast={showToast}
            handleRef={tabHandle}
          />
        </div>
      </div>
      <Toast message={toastMessage} messageKey={toastKey} />
    </div>
  )
}
