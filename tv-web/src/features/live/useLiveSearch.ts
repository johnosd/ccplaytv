import { useEffect, useRef, useState } from 'react'
import { normalizeForSearch, SEARCH_MIN_CHARS } from '../../lib/catalog/catalogSearch'

/**
 * Busca por categoria (feature 018) — sub-estado de qualquer entrada já
 * aberta (D-002), nunca uma entrada própria. `topFocused` generaliza o
 * antigo `searchFieldFocused` (feature 017): o foco visual, dentro da
 * coluna de conteúdo, está no elemento do topo — o ícone quando a busca
 * está inativa, o campo (foco DOM real) quando ativa — em vez de num
 * item/resultado (`logic/busca-por-categoria.md` §1/§3).
 *
 * Extraído da `LiveScreen` na feature 040 sem mudar nada; o efeito de foco
 * do campo fica na mesma posição de antes entre os efeitos da tela
 * (`sdd/specs/040-dividir-player-live/logic/divisao.md` §1.2).
 */
export function useLiveSearch() {
  const [searchActive, setSearchActive] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [topFocused, setTopFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const belowMinimum = normalizeForSearch(searchTerm).length < SEARCH_MIN_CHARS

  useEffect(() => {
    if (searchActive && topFocused) searchInputRef.current?.focus()
    else searchInputRef.current?.blur()
  }, [searchActive, topFocused])

  /** Reseta a busca (feature 018, D-002/FR-008) — sempre que a coluna de conteúdo troca de entrada. */
  function resetSearchState() {
    setSearchActive(false)
    setSearchTerm('')
    setTopFocused(false)
  }

  return {
    searchActive,
    setSearchActive,
    searchTerm,
    setSearchTerm,
    topFocused,
    setTopFocused,
    searchInputRef,
    belowMinimum,
    resetSearchState,
  }
}

export type LiveSearch = ReturnType<typeof useLiveSearch>
