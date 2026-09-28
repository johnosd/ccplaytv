import { useState } from 'react'
import type { ReactNode } from 'react'
import { useDeleteSource, useResyncSource, useSources, type SourceOut } from '../import/importApi'
import type { TopbarItem, TopDestination } from '../../navigation/appNav'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import type { HintItem } from '../shell/HintBar'
import { SideCategoryNav, type SideCategoryNavEntry } from '../../components/SideCategoryNav'
import { DeleteSourceModal } from '../sources/DeleteSourceModal'
import { getComingSoon } from '../../lib/comingSoon'
import { applyMotionPreference, readReducedMotionPreference, writeReducedMotionPreference } from '../../lib/motionPreference'
import { ADD_SOURCE_ID, SourcesPanel, SOURCES_ACTION_COUNT } from './SourcesPanel'
import { AccessibilityPanel, ACCESSIBILITY_ROW_COUNT } from './AccessibilityPanel'
import { AboutPanel } from './AboutPanel'
import { ComingSoonPanel } from './ComingSoonPanel'

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

const TABS: (SideCategoryNavEntry & { id: SettingsTab })[] = [
  { id: 'integrations', label: 'Integrações & BYOK', icon: 'device' },
  { id: 'sources', label: 'Fontes IPTV', icon: 'live' },
  { id: 'player', label: 'Player & reprodução', icon: 'play' },
  { id: 'accessibility', label: 'Acessibilidade & sistema', icon: 'settings' },
  { id: 'parental', label: 'Perfis & parental', icon: 'favorite' },
  { id: 'about', label: 'Sobre & créditos', icon: 'info' },
]

const HINTS: HintItem[] = [
  { keyLabel: 'OK', action: 'Selecionar' },
  { keyLabel: 'RETURN', action: 'Voltar' },
]

const SOURCES_ACTIONS = ['edit', 'resync', 'delete', 'epg'] as const
const A11Y_MOCK_IDS = ['a11y-voice-guide', 'a11y-high-contrast', 'a11y-subtitles'] as const

type Zone = 'topbar' | 'tabs' | 'panel'

function actionToCol(action: 'edit' | 'resync' | 'delete' | 'epg'): number {
  return SOURCES_ACTIONS.indexOf(action)
}

/**
 * Configurações em abas laterais (feature 026, US2 — FR-021..FR-034),
 * conforme `logic/foco-configuracoes.md`. Zonas `topbar`/`tabs`/`panel`
 * (D-004, mesmo padrão de `logic/foco-shell.md`); `tabs`/`panel` são a
 * mesma "camada" para efeito de RETURN — só `LEFT`/`UP` alternam entre elas.
 */
export function SettingsScreen({
  activeSourceId,
  shell,
  initialFocus,
  onAddSource,
  onEditSource,
  onResyncStarted,
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

  const sourcesQuery = useSources()
  const sources = sourcesQuery.data?.sources ?? []
  const sourceIds = [...sources.map((source) => source.id), ADD_SOURCE_ID]

  const initialSourcesRowId =
    initialFocus?.zone === 'sources' ? initialFocus.sourceId : initialFocus?.zone === 'sources-add' ? ADD_SOURCE_ID : null
  const [sourcesRowId, setSourcesRowId] = useState<string | null>(initialSourcesRowId)
  const [sourcesCol, setSourcesCol] = useState(initialFocus?.zone === 'sources' ? actionToCol(initialFocus.action) : 0)
  const [accessibilityRow, setAccessibilityRow] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(() => readReducedMotionPreference())
  const [confirmDelete, setConfirmDelete] = useState<SourceOut | null>(null)

  const { toastMessage, toastKey, showToast } = useToast()
  const resyncSource = useResyncSource()
  const deleteSource = useDeleteSource()

  const effectiveSourcesRowId =
    sourcesRowId !== null && sourceIds.includes(sourcesRowId) ? sourcesRowId : (sourceIds[0] ?? ADD_SOURCE_ID)
  const effectiveSourcesColMax = effectiveSourcesRowId === ADD_SOURCE_ID ? 0 : SOURCES_ACTION_COUNT - 1
  const effectiveSourcesCol = clamp(sourcesCol, 0, effectiveSourcesColMax)

  function enterPanel(tab: SettingsTab) {
    setActiveTab(tab)
    setZone('panel')
    if (tab === 'sources') {
      setSourcesRowId(null)
      setSourcesCol(0)
    }
    if (tab === 'accessibility') setAccessibilityRow(0)
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

  function toggleReducedMotion() {
    const next = !reducedMotion
    writeReducedMotionPreference(next)
    applyMotionPreference()
    setReducedMotion(next)
  }

  function activateAccessibilityRow(row: number) {
    setAccessibilityRow(row)
    if (row === 0) {
      toggleReducedMotion()
      return
    }
    showToast(`Em breve — ${getComingSoon(A11Y_MOCK_IDS[row - 1]).message}`)
  }

  function confirmSourceDeletion() {
    if (!confirmDelete) return
    const { id } = confirmDelete
    const realIdx = sources.findIndex((source) => source.id === id)
    const nextId = sources[realIdx + 1]?.id ?? sources[realIdx - 1]?.id ?? ADD_SOURCE_ID
    setConfirmDelete(null)
    deleteSource.mutate(id, {
      onSuccess: () => {
        setSourcesRowId(nextId)
        onSourceDeleted(id)
      },
      onError: () => showToast('Não foi possível excluir a lista.'),
    })
  }

  /** Mesmo caminho para o teclado (foco corrente) e o clique de mouse (linha/coluna do evento). */
  function activateSourcesRow(rowId: string, col: number) {
    setSourcesRowId(rowId)
    setSourcesCol(col)
    if (rowId === ADD_SOURCE_ID) {
      onAddSource({ zone: 'sources-add' })
      return
    }
    const source = sources.find((candidate) => candidate.id === rowId)
    if (!source) return
    const from: SettingsFocus = { zone: 'sources', sourceId: rowId, action: SOURCES_ACTIONS[col] }
    if (col === 0) {
      onEditSource(source, from)
      return
    }
    if (col === 1) {
      if (resyncSource.isPending) return
      showToast('Ressincronizando lista…')
      resyncSource.mutate(source.id, {
        onSuccess: (result) => onResyncStarted(result.import_job_id, from),
        onError: () => showToast('Não foi possível ressincronizar a lista.'),
      })
      return
    }
    if (col === 2) {
      if (deleteSource.isPending) return
      setConfirmDelete(source)
      return
    }
    showToast(`Em breve — ${getComingSoon('settings-epg').message}`)
  }

  useRemoteNav({
    onDirection: (direction) => {
      if (zone === 'topbar') {
        if (direction === 'down') setZone(zoneBeforeTopbar)
        return
      }
      if (zone === 'tabs') {
        if (direction === 'up') {
          if (focusedTab === TABS[0].id) {
            goToTopbar()
            return
          }
          const idx = TABS.findIndex((tab) => tab.id === focusedTab)
          setFocusedTab(TABS[clamp(idx - 1, 0, TABS.length - 1)].id)
          return
        }
        if (direction === 'down') {
          const idx = TABS.findIndex((tab) => tab.id === focusedTab)
          setFocusedTab(TABS[clamp(idx + 1, 0, TABS.length - 1)].id)
          return
        }
        if (direction === 'right') enterPanel(focusedTab)
        return
      }
      // zone === 'panel'
      if (activeTab === 'sources') {
        if (direction === 'left' && effectiveSourcesCol === 0) {
          exitToTabs()
          return
        }
        if (direction === 'up' && effectiveSourcesRowId === sourceIds[0]) {
          goToTopbar()
          return
        }
        if (direction === 'left') setSourcesCol((c) => clamp(c - 1, 0, effectiveSourcesColMax))
        if (direction === 'right') setSourcesCol((c) => clamp(c + 1, 0, effectiveSourcesColMax))
        if (direction === 'up' || direction === 'down') {
          const idx = sourceIds.indexOf(effectiveSourcesRowId)
          const next = clamp(idx + (direction === 'down' ? 1 : -1), 0, sourceIds.length - 1)
          setSourcesRowId(sourceIds[next])
        }
        return
      }
      if (activeTab === 'accessibility') {
        if (direction === 'left') {
          exitToTabs()
          return
        }
        if (direction === 'up' && accessibilityRow === 0) {
          goToTopbar()
          return
        }
        if (direction === 'up' || direction === 'down') {
          setAccessibilityRow((r) => clamp(r + (direction === 'down' ? 1 : -1), 0, ACCESSIBILITY_ROW_COUNT - 1))
        }
        return
      }
      // 'about' e abas mock: uma linha só.
      if (direction === 'left') exitToTabs()
      if (direction === 'up') goToTopbar()
    },
    onSelect: () => {
      if (zone === 'topbar') return // TopBar tem o próprio onSelect
      if (zone === 'tabs') {
        enterPanel(focusedTab)
        return
      }
      if (activeTab === 'sources') {
        activateSourcesRow(effectiveSourcesRowId, effectiveSourcesCol)
        return
      }
      if (activeTab === 'accessibility') {
        activateAccessibilityRow(accessibilityRow)
        return
      }
      if (activeTab === 'about') return
      exitToTabs() // abas mock: "Voltar às abas"
    },
    onBack,
  })

  const body = (
    <div className="settings-body">
      <SideCategoryNav
        entries={TABS}
        selectedId={activeTab}
        focusedId={zone === 'tabs' ? focusedTab : undefined}
        onSelect={(id) => enterPanel(id as SettingsTab)}
      />
      <div className="settings-panel">
        {activeTab === 'sources' && (
          <SourcesPanel
            sources={sources}
            activeSourceId={activeSourceId}
            focusedRowId={zone === 'panel' ? effectiveSourcesRowId : undefined}
            focusedCol={effectiveSourcesCol}
            resyncPending={resyncSource.isPending}
            deletePending={deleteSource.isPending}
            onActivateRow={activateSourcesRow}
          />
        )}
        {activeTab === 'accessibility' && (
          <AccessibilityPanel
            reducedMotion={reducedMotion}
            focusedRow={zone === 'panel' ? accessibilityRow : undefined}
            onActivateRow={activateAccessibilityRow}
          />
        )}
        {activeTab === 'about' && <AboutPanel focused={zone === 'panel'} />}
        {(activeTab === 'integrations' || activeTab === 'player' || activeTab === 'parental') && (
          <ComingSoonPanel tab={activeTab} focused={zone === 'panel'} onBack={exitToTabs} />
        )}
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
      {confirmDelete && (
        <DeleteSourceModal source={confirmDelete} onCancel={() => setConfirmDelete(null)} onConfirm={confirmSourceDeletion} />
      )}
      <Toast message={toastMessage} messageKey={toastKey} />
    </div>
  )
}
