import { useEffect, useMemo, useState } from 'react'
import { searchWithinItems } from '../../lib/catalog/catalogSearch'
import { availableSortOptions, sortVodItems, sortVodItemsInSlices, type VodSortOption } from './vodSort'

// O tipo vem de `vodSort` (feature→feature, `catalogApi` não pode ser importado daqui: ratchet de arquitetura).
type CatalogItemOut = Parameters<typeof sortVodItems>[0][number]

/** Listas até este tamanho ordenam na hora, como antes (sem piscar o carregando); acima, em fatias (feature 084). */
export const SYNC_SORT_MAX = 2_000

const NO_ITEMS: CatalogItemOut[] = []

export interface VodListItemsInput {
  baseItems: CatalogItemOut[]
  enteredFavorites: boolean
  enteredHistory: boolean
  enteredAll: boolean
  /** Campos de ordenação do tipo inteiro (só em "Todos" aos poucos, com o modal aberto). */
  kindSortFields: { year: boolean; addedAt: boolean } | undefined
  /** Opção escolhida pela pessoa (pode não existir nesta entrada). */
  sortOption: VodSortOption
  searchActive: boolean
  belowMinimum: boolean
  searchTerm: string
  /** Identifica a entrada aberta: o resultado anterior só vale para a mesma entrada. */
  entryKey: string
}

export interface VodListItems {
  items: CatalogItemOut[]
  availableOptions: VodSortOption[]
  effectiveSortOption: VodSortOption
  /** Ordenando uma lista grande e ainda sem nada da mesma entrada para mostrar: soma ao estado de carregando da tela. */
  pending: boolean
}

interface SortedResult {
  input: CatalogItemOut[]
  option: VodSortOption
  entryKey: string
  items: CatalogItemOut[]
}

/**
 * Filtro por termo, opções de "Ordenar" e a lista ordenada de Filmes/Séries (extraído de `VodCategoryScreen`, feature 084).
 * Lista grande ordena em fatias, cancelando a ordenação anterior quando a lista, a opção ou o termo mudam; enquanto isso
 * mantém a lista anterior **da mesma entrada** (o foco continua por id, sem pulo).
 */
export function useVodListItems(input: VodListItemsInput): VodListItems {
  const { baseItems, enteredFavorites, enteredHistory, enteredAll, kindSortFields, sortOption, searchActive, belowMinimum, searchTerm, entryKey } = input

  const availableOptions = useMemo(() => {
    if (enteredFavorites || enteredHistory) return []
    const loaded = availableSortOptions(baseItems)
    if (!enteredAll || !kindSortFields) return loaded
    // União com o tipo inteiro: nunca some uma opção que os itens lidos já mostram.
    return (['source', 'az', 'year', 'added'] as const).filter(
      (option) =>
        loaded.includes(option) ||
        (option === 'year' && kindSortFields.year) ||
        (option === 'added' && kindSortFields.addedAt),
    )
  }, [enteredFavorites, enteredHistory, enteredAll, baseItems, kindSortFields])
  // Opção salva pode não estar disponível nesta entrada (ex.: "Ano" numa categoria M3U) — a grade usa "Ordem da
  // fonte" sem apagar a escolha da seção (D-008).
  // "Nota" (feature 056) não é opção do modal: só vale como destino do "Ver tudo" de "Bem avaliados", em "Todos".
  const effectiveSortOption: VodSortOption =
    (sortOption === 'rating' && enteredAll) || availableOptions.includes(sortOption) ? sortOption : 'source'

  const filtered = useMemo(
    () => (!searchActive ? baseItems : belowMinimum ? NO_ITEMS : searchWithinItems(baseItems, searchTerm, (item) => item.name)),
    [searchActive, belowMinimum, baseItems, searchTerm],
  )
  const needsSort = !enteredFavorites && !enteredHistory && effectiveSortOption !== 'source'
  const inSlices = needsSort && filtered.length > SYNC_SORT_MAX
  const syncItems = useMemo(
    () => (!needsSort ? filtered : inSlices ? NO_ITEMS : sortVodItems(filtered, effectiveSortOption)),
    [needsSort, inSlices, filtered, effectiveSortOption],
  )

  const [sorted, setSorted] = useState<SortedResult | null>(null)
  useEffect(() => {
    if (!inSlices) return
    const controller = new AbortController()
    sortVodItemsInSlices(filtered, effectiveSortOption, { signal: controller.signal }).then(
      (items) => setSorted({ input: filtered, option: effectiveSortOption, entryKey, items }),
      (error: unknown) => {
        if (controller.signal.aborted || (error as { name?: string } | null)?.name === 'AbortError') return
        setSorted({ input: filtered, option: effectiveSortOption, entryKey, items: sortVodItems(filtered, effectiveSortOption) })
      },
    )
    return () => controller.abort()
  }, [inSlices, filtered, effectiveSortOption, entryKey])

  if (!inSlices) return { items: syncItems, availableOptions, effectiveSortOption, pending: false }
  const ready = sorted !== null && sorted.input === filtered && sorted.option === effectiveSortOption
  const shown = ready ? sorted.items : sorted !== null && sorted.entryKey === entryKey ? sorted.items : undefined
  return { items: shown ?? NO_ITEMS, availableOptions, effectiveSortOption, pending: shown === undefined }
}
