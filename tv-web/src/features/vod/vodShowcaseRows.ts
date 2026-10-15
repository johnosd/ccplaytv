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

export type ShowcaseRowKey = 'continue' | 'top10' | 'favorites' | 'added' | 'rated' | 'tip' | 'because' | `cat:${string}`

/** `items`: histórico/favoritos/recentes; `slot`: reservada "Em breve" (sem dado); `category`: uma categoria da fonte. */
export type ShowcaseRowKind = 'items' | 'slot' | 'category'

export interface ShowcaseRowSpec {
  key: ShowcaseRowKey
  kind: ShowcaseRowKind
  /** Título exibido (categoria: `vodGroupDisplay` do nome declarado). */
  title: string
  format: RowFormat
  /** Destino do "Ver tudo". `null` nos slots reservados e nas fileiras do TMDB (Top 10 e Dica, feature 057). */
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
  /** Feature 056: há ao menos `RATED_MIN` títulos com nota — só então "Bem avaliados" existe (ausente/`undefined` = não). */
  hasRated?: boolean
  /** Feature 057: há ao menos `TOP10_MIN` títulos do ranking semanal na lista — só então o Top 10 existe (ausente/`undefined` = não). */
  hasTop10?: boolean
  /** Feature 057: há ao menos `TIP_MIN` candidatos válidos da Dica na lista — só então ela existe (ausente/`undefined` = não). */
  hasTip?: boolean
  /**
   * Feature 060 (FR-014/FR-015): há semente e ao menos um semelhante na lista — só então "Porque você assistiu" existe
   * (ausente/`undefined` = não; o slot "Em breve" deixou de existir).
   */
  hasBecause?: boolean
  /** Feature 060: nome do título semente, para o título "Porque você assistiu <nome>". */
  becauseTitle?: string
  /** Nomes declarados pela fonte, na ordem dela. */
  categoryNames: readonly string[]
}

/**
 * Fileiras da tela hero na ordem fixa (`logic/carrosseis-e-foco.md` §1): continue → top10 → favorites → added → rated →
 * tip → because → uma por categoria. As de itens ("Bem avaliados", feature 056; "Top 10 da semana" e "Dica", feature 057;
 * "Porque você assistiu", feature 060 — as três do TMDB, sem "Ver tudo") só existem com dado real; as categorias, sempre. Não
 * resta nenhum slot reservado ("Em breve"): o tipo `slot` segue existindo só porque o foco e a renderização o sabem tratar.
 */
export function buildShowcaseRows(input: BuildShowcaseRowsInput, t: Translator = createTranslator('pt')): ShowcaseRowSpec[] {
  const {
    section,
    hasContinue,
    hasFavorites,
    hasAdded,
    hasRated = false,
    hasTop10 = false,
    hasTip = false,
    hasBecause = false,
    becauseTitle,
    categoryNames,
  } = input
  const rows: ShowcaseRowSpec[] = []
  if (hasContinue) {
    rows.push({ key: 'continue', kind: 'items', title: t('showcase.row.continue'), format: 'poster-xl', seeAll: { kind: 'history' }, slotId: null })
  }
  if (hasTop10) {
    // Feature 057: ranking semanal do TMDB cruzado com a lista; sem dado some (nem slot "Em breve", nem fileira vazia).
    rows.push({
      key: 'top10',
      kind: 'items',
      title: t(section === 'movies' ? 'showcase.row.top10Movies' : 'showcase.row.top10Series'),
      format: 'top10',
      seeAll: null,
      slotId: null,
    })
  }
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
  if (hasRated) {
    // Feature 056: fileira real; sem nota suficiente ela some (nem slot "Em breve", nem fileira vazia).
    rows.push({ key: 'rated', kind: 'items', title: t('showcase.row.rated'), format: 'poster', seeAll: { kind: 'all', sort: 'rating' }, slotId: null })
  }
  if (hasTip) {
    // Feature 057: sorteio do dia entre os candidatos do TMDB que existem na lista; sem dado some.
    rows.push({
      key: 'tip',
      kind: 'items',
      title: t(section === 'movies' ? 'showcase.row.tipMovies' : 'showcase.row.tipSeries'),
      format: 'poster',
      seeAll: null,
      slotId: null,
    })
  }
  if (hasBecause) {
    // Feature 060 (FR-014/FR-015): fileira real, no lugar do slot "Em breve"; sem semente ou sem semelhante na lista, some.
    rows.push({
      key: 'because',
      kind: 'items',
      title: becauseTitle ? t('showcase.row.becauseOf', { title: becauseTitle }) : t('showcase.row.because'),
      format: 'poster',
      seeAll: null,
      slotId: null,
    })
  }
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
