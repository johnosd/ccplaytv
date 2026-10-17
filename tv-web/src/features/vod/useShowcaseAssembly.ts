import { slotStatusOf, type AssemblySlot } from '../../lib/assembly/screenAssembly'
import { useScreenAssembly, type ScreenAssembly } from '../../lib/assembly/useScreenAssembly'
import { STAGE_HEIGHT, STAGE_WIDTH } from '../../lib/stage'
import { ROW_FORMATS } from './vodRowFormats'
import type { BuildShowcaseRowsInput, ShowcaseRowSpec } from './vodShowcaseRows'
import type { VodSection } from './vodSessionMemory'

/**
 * Montagem da vitrine de Filmes/Séries (feature 079, `logic/montagem-de-tela.md` §4–§5). Substitui a espera local do
 * ad-hoc de 2026-10-09 (`rowsReady`, teto de 3 s): mesma regra da Home, teto de 2 s, "Bem avaliados" e as capas da
 * primeira tela entram na espera. Tipado pela forma — arquivo novo não importa `features/catalog` (ratchet).
 */

export type ShowcaseSlotKey = 'continue' | 'top10' | 'favorites' | 'added' | 'rated' | 'tip' | 'because' | 'categories'

/** Ordem da tela (`buildShowcaseRows`), com as categorias por último. */
const SLOT_ORDER: readonly ShowcaseSlotKey[] = ['continue', 'top10', 'favorites', 'added', 'rated', 'tip', 'because', 'categories']
/** Leituras locais: prontas no 1º render (reabrir a tela) = a vitrine aparece na hora, como antes. */
const PRIMARY = new Set<ShowcaseSlotKey>(['categories', 'continue', 'favorites', 'added'])

interface Read<T> {
  data: T | undefined
  isError?: boolean
}

export interface CardItem {
  id: string
  icon_url?: string | null
}

export interface ShowcaseReads {
  categories: Read<readonly unknown[]>
  continue: Read<{ items: readonly CardItem[] }>
  favorites: Read<{ items: readonly CardItem[] }>
  added: Read<readonly CardItem[]>
  rated: Read<readonly CardItem[]>
  top10: Read<readonly { item: CardItem }[]>
  tip: Read<readonly CardItem[]>
  /** `useBecauseYouWatched`: `undefined` = lendo, `null` = não há fileira. */
  because: { items: readonly CardItem[] } | null | undefined
}

/** Itens de cada fileira que não é de categoria (as prévias de categoria não entram na espera — R-003 do research). */
function itemsOf(reads: ShowcaseReads, key: string): readonly CardItem[] {
  if (key === 'continue') return reads.continue.data?.items ?? []
  if (key === 'favorites') return reads.favorites.data?.items ?? []
  if (key === 'top10') return (reads.top10.data ?? []).map((pick) => pick.item)
  if (key === 'because') return reads.because?.items ?? []
  if (key === 'added' || key === 'rated' || key === 'tip') return reads[key].data ?? []
  return []
}

function readOf(reads: ShowcaseReads, key: ShowcaseSlotKey): Read<unknown> {
  if (key === 'because') return { data: reads.because === undefined ? undefined : (reads.because ?? { items: [] }) }
  return reads[key]
}

/**
 * Capas da primeira tela: as fileiras de itens, na ordem, enquanto couberem na altura do palco; por fileira, os cards que
 * cabem na largura. `wide` usa o backdrop guardado; os demais, a capa. Sobra um pouco (a lista lateral e a topbar não são
 * descontadas) — melhor esperar uma capa a mais que revelar sem uma visível.
 */
export function showcaseFirstScreenImages(
  rows: readonly ShowcaseRowSpec[],
  reads: ShowcaseReads,
  backdrops: ReadonlyMap<string, string>,
): string[] {
  const urls: string[] = []
  let top = 0
  for (const row of rows) {
    if (top >= STAGE_HEIGHT) break
    const format = ROW_FORMATS[row.format]
    top += format.rowHeight
    if (row.kind !== 'items') continue
    for (const item of itemsOf(reads, row.key).slice(0, Math.ceil(STAGE_WIDTH / format.itemWidth))) {
      const url = row.format === 'wide' ? backdrops.get(item.id) : item.icon_url
      if (url) urls.push(url)
    }
  }
  return urls
}

/** Entrada de `buildShowcaseRows` só com o que a montagem já mostrou (as categorias vêm juntas, num slot só). */
export function shownRowsInput(input: BuildShowcaseRowsInput, isShown: (key: ShowcaseSlotKey) => boolean): BuildShowcaseRowsInput {
  return {
    ...input,
    hasContinue: input.hasContinue && isShown('continue'),
    hasTop10: input.hasTop10 === true && isShown('top10'),
    hasFavorites: input.hasFavorites && isShown('favorites'),
    hasAdded: input.hasAdded && isShown('added'),
    hasRated: input.hasRated === true && isShown('rated'),
    hasTip: input.hasTip === true && isShown('tip'),
    hasBecause: input.hasBecause === true && isShown('because'),
    categoryNames: isShown('categories') ? input.categoryNames : [],
  }
}

export function useShowcaseAssembly(
  section: VodSection,
  reads: ShowcaseReads,
  imageUrls: readonly string[],
  /** O formato largo do "Continue" ainda não está decidido (imagens guardadas sendo lidas). */
  extraPending: boolean,
): ScreenAssembly<ShowcaseSlotKey> {
  const slots: AssemblySlot<ShowcaseSlotKey>[] = SLOT_ORDER.map((key) => ({
    key,
    status:
      key === 'categories'
        ? slotStatusOf(reads.categories, (data) => data.length === 0)
        : slotStatusOf(readOf(reads, key), () => itemsOf(reads, key).length === 0),
    primary: PRIMARY.has(key),
    required: key === 'categories',
  }))
  return useScreenAssembly({ screen: section, slots, imageUrls, extraPending })
}
