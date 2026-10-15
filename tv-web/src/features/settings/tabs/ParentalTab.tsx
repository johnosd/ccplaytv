import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '../../../components/EmptyState'
import { listManagedCategories, setCategoryPreference, type CategoryRef } from '../../../lib/catalog/categoryAccess'
import type { CategoryKind } from '../../../lib/catalog/db'
import { enableParentalControl, hasPin } from '../../../lib/parental/listPin'
import { useT } from '../../../lib/i18n/I18nProvider'
import { CategoryManager } from '../parental/CategoryManager'
import { controlActions, managedKeyOf, PARENTAL_SECTIONS, type ManagedCategory, type ParentalFocus } from '../parental/parentalModel'
import { ParentalFlow, type ParentalFlowKind } from '../parental/ParentalFlow'
import type { SuggestionDecision } from '../parental/SuggestionStep'
import { moveParentalFocus } from '../parental/parentalNav'
import type { ListSettingsTabProps } from './settingsTab'

/** Chave da consulta da gestão — fora do reset do catálogo (D-005): a lista não pode piscar a cada alternância. */
const parentalCategoriesKey = (sourceId: string, kind: CategoryKind) => ['parental-categories', sourceId, kind] as const
/** PIN por lista (feature 067): a consulta é da lista da gestão. */
const pinKey = (sourceId: string) => ['parental-pin', sourceId] as const

/**
 * Categorias & controle parental (feature 066, US1/US2 — FR-001..FR-004, FR-010, FR-017, FR-019): controle parental e,
 * por seção, cada categoria com Visível/Escondida e Livre/Bloqueada. Desde a feature 067 mora em Configurações da lista
 * e age sobre a lista DA TELA, ativa ou não, com o PIN dela (D-001, D-005). Com PIN, a aba pede o PIN ao entrar e fica
 * liberada até sair dela. Foco por identidade da categoria (D-002 da 066). Só monta quando ativa.
 */
export function ParentalTab({ focused, source, exitToTabs, showToast, handleRef }: ListSettingsTabProps): ReactNode {
  const sourceId = source.id
  const t = useT()
  const queryClient = useQueryClient()
  const [section, setSection] = useState<CategoryKind>('channel')
  const [focus, setFocus] = useState<ParentalFocus>({ row: 'control', col: 0 })
  const [flow, setFlow] = useState<ParentalFlowKind | null>(null)
  const [tabUnlocked, setTabUnlocked] = useState(false)
  // A categoria que a pessoa tentava bloquear quando o PIN foi pedido (FR-010): entra nas decisões de ligar.
  const [pendingLock, setPendingLock] = useState<ManagedCategory | null>(null)
  const pinQuery = useQuery({ queryKey: pinKey(sourceId), queryFn: () => hasPin(sourceId) })
  const query = useQuery({
    queryKey: parentalCategoriesKey(sourceId, section),
    queryFn: () => listManagedCategories(sourceId, section),
  })
  const categories = query.data
  const failed = query.isError
  const pinActive = pinQuery.data === true
  const gated = pinActive && !tabUnlocked
  const ctx = { gated, pinActive, section, categories, failed }

  // O foco guardado pode apontar para o que sumiu (categoria removida, ação que mudou com o PIN): cai num lugar válido.
  const effectiveFocus: ParentalFocus = gated
    ? { row: 'gate' }
    : focus.row === 'gate' || (focus.row === 'category' && !categories?.some((category) => managedKeyOf(category) === focus.key))
      ? { row: 'control', col: 0 }
      : focus.row === 'control'
        ? { row: 'control', col: Math.min(focus.col, controlActions(pinActive).length - 1) }
        : focus

  const refOf = (category: ManagedCategory): CategoryRef => ({
    sourceId,
    kind: category.kind,
    providerCategoryId: category.providerCategoryId,
    name: category.name,
  })

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: pinKey(sourceId) }),
      queryClient.invalidateQueries({ queryKey: ['parental-categories', sourceId] }),
    ])
  }

  async function toggle(category: ManagedCategory, col: number) {
    if (col === 1 && !pinActive) {
      // Bloquear a primeira categoria cria o PIN (FR-010); sem PIN, nada fica bloqueado.
      setPendingLock(category)
      setFlow('enable')
      return
    }
    await setCategoryPreference(refOf(category), col === 0 ? { hidden: !category.hidden } : { locked: !category.locked })
    // `invalidate`: o estado novo substitui o velho sem a lista sumir no meio (o foco fica na mesma linha).
    await queryClient.invalidateQueries({ queryKey: parentalCategoriesKey(sourceId, category.kind) })
  }

  async function enable(pin: string, suggestions: SuggestionDecision[]) {
    // A categoria que a pessoa bloqueava vence a sugestão dela, se também for adulta e tiver sido desmarcada.
    const decisions = suggestions.map(({ category, locked }) => ({ category: refOf(category), locked }))
    if (pendingLock) decisions.push({ category: refOf(pendingLock), locked: true })
    await enableParentalControl(sourceId, pin, decisions)
    setTabUnlocked(true)
    setPendingLock(null)
    setFlow(null)
    // Confirmação visível de que ligou (pedido do usuário na TV, 2026-10-10).
    showToast(t('parental.control.enabled'))
    await refresh()
  }

  function select() {
    const current = effectiveFocus
    if (pinQuery.isPending) exitToTabs()
    else if (current.row === 'gate') setFlow('unlock-tab')
    else if (current.row === 'control') setFlow(controlActions(pinActive)[current.col])
    else if (current.row === 'retry') void query.refetch()
    else if (current.row === 'category') {
      const category = categories?.find((candidate) => managedKeyOf(candidate) === current.key)
      if (category) void toggle(category, current.col)
    }
  }

  useImperativeHandle(handleRef, () => ({
    // Entrar no painel com PIN ativo já pede o PIN (FR-017); sem PIN, começa no controle parental.
    onEnter: () => (gated ? setFlow('unlock-tab') : setFocus({ row: 'control', col: 0 })),
    onDirection: (direction) => {
      const move = moveParentalFocus(effectiveFocus, direction, ctx)
      // Sem topbar em Configurações da lista: só a saída para as abas existe.
      if ('exit' in move) {
        if (move.exit === 'tabs') exitToTabs()
      }
      else if ('section' in move) {
        setSection(move.section)
        setFocus({ row: 'sections', col: PARENTAL_SECTIONS.indexOf(move.section) })
      } else setFocus(move.focus)
    },
    onSelect: select,
  }))

  // Sem saber ainda se há PIN, nada da gestão aparece — senão ela ficaria liberada por um instante (FR-017).
  if (pinQuery.isPending) {
    return <EmptyState title={t('parental.tab.title')} description={t('parental.loading')} action={{ label: t('common.backToTabs'), onSelect: exitToTabs }} focused={focused} />
  }

  return (
    <>
      <CategoryManager
        section={section}
        categories={categories}
        failed={failed}
        pinActive={pinActive}
        gated={gated}
        focus={focused && flow === null ? effectiveFocus : undefined}
        onOpenGate={() => setFlow('unlock-tab')}
        onControl={(action) => setFlow(action)}
        onSelectSection={(kind) => setSection(kind)}
        onToggleHidden={(category) => void toggle(category, 0)}
        onToggleLocked={(category) => void toggle(category, 1)}
        onRetry={() => void query.refetch()}
      />
      {flow && (
        <ParentalFlow
          kind={flow}
          sourceId={sourceId}
          onTabUnlocked={() => {
            setTabUnlocked(true)
            setFlow(null)
          }}
          onEnable={enable}
          onFinished={(kind) => {
            setFlow(null)
            showToast(t(kind === 'change' ? 'parental.control.pinChanged' : 'parental.control.disabled'))
            void refresh()
          }}
          onCancel={() => {
            setPendingLock(null)
            setFlow(null)
          }}
        />
      )}
    </>
  )
}
