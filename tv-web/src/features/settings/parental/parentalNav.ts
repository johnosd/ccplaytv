import type { CategoryKind } from '../../../lib/catalog/db'
import type { SettingsDirection } from '../tabs/settingsTab'
import { controlActions, managedKeyOf, PARENTAL_SECTIONS, type ManagedCategory, type ParentalFocus } from './parentalModel'

export interface ParentalNavContext {
  gated: boolean
  pinActive: boolean
  section: CategoryKind
  categories: ManagedCategory[] | undefined
  failed: boolean
}

/** Resultado de uma seta: novo foco, trocar de seção (e focá-la), ou sair da aba pela esquerda/por cima. */
export type ParentalMove = { focus: ParentalFocus } | { section: CategoryKind } | { exit: 'tabs' | 'topbar' }

const stay = (focus: ParentalFocus): ParentalMove => ({ focus })

/**
 * Setas da aba Categorias & parental, de cima para baixo: controle parental → seções → categorias (ou "Tentar de
 * novo"). ← na primeira coluna devolve à coluna de abas; ↑ no topo sobe à topbar. Foco de categoria é por identidade.
 */
export function moveParentalFocus(focus: ParentalFocus, direction: SettingsDirection, ctx: ParentalNavContext): ParentalMove {
  const sectionCol = PARENTAL_SECTIONS.indexOf(ctx.section)
  if (focus.row === 'gate' || ctx.gated) {
    if (direction === 'left') return { exit: 'tabs' }
    if (direction === 'up') return { exit: 'topbar' }
    return stay({ row: 'gate' })
  }
  if (focus.row === 'control') {
    const last = controlActions(ctx.pinActive).length - 1
    if (direction === 'left') return focus.col === 0 ? { exit: 'tabs' } : stay({ row: 'control', col: focus.col - 1 })
    if (direction === 'right') return stay({ row: 'control', col: Math.min(focus.col + 1, last) })
    if (direction === 'up') return { exit: 'topbar' }
    return stay({ row: 'sections', col: sectionCol })
  }
  if (focus.row === 'sections') {
    if (direction === 'left' && focus.col === 0) return { exit: 'tabs' }
    if (direction === 'left' || direction === 'right') {
      const col = Math.min(Math.max(focus.col + (direction === 'right' ? 1 : -1), 0), PARENTAL_SECTIONS.length - 1)
      // Mover o foco escolhe a seção (constitution: foco seleciona) — só lê do aparelho, nunca rede.
      return { section: PARENTAL_SECTIONS[col] }
    }
    if (direction === 'up') return stay({ row: 'control', col: 0 })
    if (ctx.failed) return stay({ row: 'retry' })
    const first = ctx.categories?.[0]
    return stay(first ? { row: 'category', key: managedKeyOf(first), col: 0 } : focus)
  }
  if (focus.row === 'retry') {
    if (direction === 'left') return { exit: 'tabs' }
    if (direction === 'up') return stay({ row: 'sections', col: sectionCol })
    return stay(focus)
  }
  const categories = ctx.categories ?? []
  const index = categories.findIndex((category) => managedKeyOf(category) === focus.key)
  if (index < 0) return stay({ row: 'sections', col: sectionCol })
  if (direction === 'left') return focus.col === 0 ? { exit: 'tabs' } : stay({ ...focus, col: 0 })
  if (direction === 'right') return stay({ ...focus, col: 1 })
  if (direction === 'up' && index === 0) return stay({ row: 'sections', col: sectionCol })
  const next = categories[index + (direction === 'down' ? 1 : -1)]
  return stay(next ? { row: 'category', key: managedKeyOf(next), col: focus.col } : focus)
}
