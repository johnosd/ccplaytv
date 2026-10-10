import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { useT } from '../lib/i18n/I18nProvider'

export interface SectionEmptyStateProps {
  /** Todas as categorias da seção estão escondidas (feature 066, FR-009). */
  allHidden: boolean
  /** Título e texto do vazio de sempre ("a lista não tem categorias"). */
  title: string
  description?: string
  onBack: () => void
  /** Abre Configurações › Categorias & parental. Sem ele, o vazio é o de sempre. */
  onManage?: () => void
}

/**
 * Vazio de uma seção inteira (Live, Filmes, Séries). Se a pessoa escondeu todas as categorias, explica isso e oferece a
 * gestão — sem isso a tela diria que a lista não tem nada (FR-009). Sempre uma ação focada (constitution: foco).
 */
export function SectionEmptyState({ allHidden, title, description, onBack, onManage }: SectionEmptyStateProps): ReactNode {
  const t = useT()
  if (allHidden && onManage) {
    return (
      <EmptyState
        title={t('parental.hiddenAll.title')}
        description={t('parental.hiddenAll.text')}
        action={{ label: t('parental.hiddenAll.action'), onSelect: onManage }}
        focused
      />
    )
  }
  return <EmptyState title={title} description={description} action={{ label: t('common.back'), onSelect: onBack }} focused />
}
