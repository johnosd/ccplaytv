import { createTranslator, type Translator } from '../../lib/i18n/translate'
import { groupLabel } from '../catalog/catalogApi'
import { vodGroupDisplay } from './vodGroupDisplay'
import type { VodSection } from './vodSessionMemory'
import type { VodTarget } from './vodTarget'

/**
 * Descritores das fileiras da tela hero de Filmes/Séries (feature 053). Só decide QUAIS fileiras existem, em que ordem e
 * com que formato — não lê dado nenhum. Regras em `logic/carrosseis-e-foco.md` §1.
 */

export type RowFormat = 'poster-xl' | 'poster' | 'poster-compact' | 'top10' | 'wide'

export type ShowcaseRowKey = 'continue' | 'top10' | 'favorites' | 'added' | 'rated' | 'because' | `cat:${string}`

/** `items`: histórico/favoritos/recentes; `slot`: reservada "Em breve" (sem dado); `category`: uma categoria da fonte. */
export type ShowcaseRowKind = 'items' | 'slot' | 'category'

export interface ShowcaseRowSpec {
  key: ShowcaseRowKey
  kind: ShowcaseRowKind
  /** Título exibido (categoria: `vodGroupDisplay` do nome declarado). */
  title: string
  format: RowFormat
  /** Destino do "Ver tudo". `null` nos slots reservados. */
  seeAll: VodTarget | null
  /** Id registrado em `lib/comingSoon.ts`. `null` fora dos slots. */
  slotId: string | null
}

/** Id do cartão final "Ver tudo" de uma fileira. */
export const SEE_ALL_ID = '__see-all__'
/** Id do único cartão focável de um slot reservado. */
export const SLOT_ENTRY_ID = 'slot'

export interface BuildShowcaseRowsInput {
  section: VodSection
  hasContinue: boolean
  hasFavorites: boolean
  hasAdded: boolean
  /** Nomes declarados pela fonte, na ordem dela. */
  categoryNames: readonly string[]
}

function slotRow(key: ShowcaseRowKey, title: string, format: RowFormat, slotId: string): ShowcaseRowSpec {
  // `title` já vem traduzido por quem monta as fileiras (feature 054).
  return { key, kind: 'slot', title, format, seeAll: null, slotId }
}

/**
 * Fileiras da tela hero na ordem fixa (`logic/carrosseis-e-foco.md` §1): continue → top10 → favorites → added → rated →
 * because → uma por categoria. As de itens só existem com dado real; os 3 slots e as categorias, sempre.
 */
export function buildShowcaseRows(input: BuildShowcaseRowsInput, t: Translator = createTranslator('pt')): ShowcaseRowSpec[] {
  const { section, hasContinue, hasFavorites, hasAdded, categoryNames } = input
  const rows: ShowcaseRowSpec[] = []
  if (hasContinue) {
    rows.push({ key: 'continue', kind: 'items', title: t('showcase.row.continue'), format: 'poster-xl', seeAll: { kind: 'history' }, slotId: null })
  }
  rows.push(
    section === 'movies'
      ? slotRow('top10', t('showcase.row.top10Movies'), 'top10', 'vod-top10-movies')
      : slotRow('top10', t('showcase.row.top10Series'), 'top10', 'vod-top10-series'),
  )
  if (hasFavorites) {
    rows.push({
      key: 'favorites',
      kind: 'items',
      title: t('live.favoritesStar'),
      // O destaque grande é do histórico; sem ele, passa para os favoritos.
      format: hasContinue ? 'poster' : 'poster-xl',
      seeAll: { kind: 'favorites' },
      slotId: null,
    })
  }
  if (hasAdded) {
    rows.push({ key: 'added', kind: 'items', title: t('showcase.row.added'), format: 'poster', seeAll: { kind: 'all', sort: 'added' }, slotId: null })
  }
  rows.push(slotRow('rated', t('showcase.row.rated'), 'poster', 'vod-rated'))
  rows.push(slotRow('because', t('showcase.row.because'), 'poster', 'vod-because'))
  const seen = new Set<string>()
  for (const declared of categoryNames) {
    const name = groupLabel(declared)
    if (seen.has(name)) continue // nome repetido: a chave de foco seria duplicada
    seen.add(name)
    rows.push({
      key: `cat:${name}`,
      kind: 'category',
      title: vodGroupDisplay(declared, t),
      format: 'poster-compact',
      seeAll: { kind: 'category', name },
      slotId: null,
    })
  }
  return rows
}
