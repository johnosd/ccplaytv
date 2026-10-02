import type { Dispatch, SetStateAction } from 'react'
import { groupLabel, type CatalogCategory } from '../catalog/catalogApi'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import type { TopbarItem } from '../../navigation/appNav'
import { liveEntryKey, PREVIEW_ACTION_COUNT, type EnteredKey, type TrailEntry } from './liveTrail'
import { recalledLiveFocus } from './liveSessionMemory'
import type { LiveChannels, LiveTrail } from './useLiveCatalog'
import type { LiveGuide, LiveGuideState } from './useLiveGuide'
import type { LiveSearch } from './useLiveSearch'
import type { LiveZapping, LiveZappingState } from './useLiveZapping'

export interface LiveKeyboardParams {
  /** Lista ativa — chave da memória de foco por entrada (feature 046). */
  sourceId: string
  contentActive: boolean
  hasShell: boolean
  setZone: Dispatch<SetStateAction<'topbar' | 'content'>>
  setTopbarItem: Dispatch<SetStateAction<TopbarItem>>
  setCol: Dispatch<SetStateAction<0 | 1 | 2>>
  previewAction: number
  setPreviewAction: Dispatch<SetStateAction<number>>
  topErrorActionIndex: number
  setTopErrorActionIndex: Dispatch<SetStateAction<number>>
  onBack: () => void
  onResync: () => void
  trail: LiveTrail
  search: LiveSearch
  channels: LiveChannels
  zap: LiveZappingState
  zapping: LiveZapping
  guide: LiveGuideState
  liveGuide: LiveGuide
}

/**
 * Navegação da TV ao vivo: entrar numa entrada da trilha, setas, OK, RETURN
 * e gestos de favoritar — UM registro de `useRemoteNav`
 * (`logic/divisao.md` §1.3). Extraído da `LiveScreen` na feature 040 sem
 * mudar nada. Devolve o que o desenho e o zapping também usam.
 */
export function useLiveKeyboard({
  sourceId,
  contentActive,
  hasShell,
  setZone,
  setTopbarItem,
  setCol,
  previewAction,
  setPreviewAction,
  topErrorActionIndex,
  setTopErrorActionIndex,
  onBack,
  onResync,
  trail,
  search,
  channels,
  zap,
  zapping,
  guide,
  liveGuide,
}: LiveKeyboardParams) {
  const { categories, categoriesQuery, topPhase, trail: entries, categoryIdx, focusedTrailEntry, entered, setEntered, setFocusedIdentity } = trail
  const { searchActive, setSearchActive, setSearchTerm, topFocused, setTopFocused, resetSearchState } = search
  const {
    activeChannel,
    canToggleFavorite,
    channelIdx,
    contentEmptyNeedsBack,
    contentFailed,
    contentIsLoading,
    contentMissing,
    effectiveCol,
    items,
    retryContent,
    showingContent,
    toggleFocusedFavorite,
  } = channels
  const { playing, zapOpen } = zap
  const { playActiveChannel } = zapping
  const { guide: openGuide, guideRef } = guide
  const { openGuideFromPreview, pageGuide } = liveGuide

  /**
   * Canal a focar ao ENTRAR numa entrada (feature 046, FR-008/FR-009): o último lembrado nesta
   * sessão, ou `null` — o primeiro item — se nunca foi visitada.
   */
  function rememberedChannelFor(key: EnteredKey): string | null {
    const entryKey = liveEntryKey(key, categories)
    return (entryKey && recalledLiveFocus(sourceId, entryKey)?.channelId) || null
  }

  function enterCategory(category: CatalogCategory) {
    if (entered?.kind !== 'category' || entered.id !== category.id) {
      setEntered({ kind: 'category', id: category.id })
      // Trocar de categoria começa no último canal lembrado dela — ou no primeiro, se nunca
      // visitada: o item de OUTRA categoria/de Favoritos/Todos não é uma posição significativa.
      setFocusedIdentity({
        trailKey: { kind: 'category', name: groupLabel(category.name) },
        channelId: rememberedChannelFor({ kind: 'category', id: category.id }),
      })
    }
    resetSearchState()
    setCol(1)
    setPreviewAction(0)
  }

  function enterFavorites() {
    if (entered?.kind !== 'favorites') {
      setEntered({ kind: 'favorites' })
      setFocusedIdentity({ trailKey: { kind: 'favorites' }, channelId: rememberedChannelFor({ kind: 'favorites' }) })
    }
    resetSearchState()
    setCol(1)
    setPreviewAction(0)
  }

  /** Entra em "Todos" (feature 018, D-001) — mesmo padrão de `enterFavorites`. */
  function enterAll() {
    if (entered?.kind !== 'all') {
      setEntered({ kind: 'all' })
      setFocusedIdentity({ trailKey: { kind: 'all' }, channelId: rememberedChannelFor({ kind: 'all' }) })
    }
    resetSearchState()
    setCol(1)
    setPreviewAction(0)
  }

  /** Entra numa entrada específica da trilha — Favoritos, Todos ou uma categoria. */
  function enterTrailEntry(entry: TrailEntry) {
    if (entry.key.kind === 'favorites') enterFavorites()
    else if (entry.key.kind === 'all') enterAll()
    else if (entry.category) enterCategory(entry.category)
  }

  /** Entra no que está focado na trilha agora — Favoritos, Todos ou uma categoria. */
  function enterFocusedTrailItem() {
    if (focusedTrailEntry) enterTrailEntry(focusedTrailEntry)
  }

  function handleTrailDirection(dir: 'up' | 'down' | 'left' | 'right') {
    // Ícone/campo no topo da coluna de conteúdo (feature 018, D-003):
    // qualquer entrada com itens tem esse topo — nunca dentro do zapping
    // (FR-018). ↓ do topo vai pro 1º item; ↑ no 1º item volta ao topo.
    // ←/→ no campo já foram capturados pela guarda de alvo editável do
    // useRemoteNav antes de chegar aqui — o que sobra de ←/→ (ícone
    // focado, sem foco DOM) precisa continuar pro fluxo padrão abaixo, por
    // isso só ↑/↓ retornam cedo aqui, nunca ← nem →.
    const hasTop = effectiveCol === 1 && !zapOpen && items.length > 0
    if (hasTop && topFocused) {
      if (dir === 'down') {
        setTopFocused(false)
        setFocusedIdentity((prev) => ({ ...prev, channelId: items[0].id }))
      }
      if (dir === 'up' || dir === 'down') return
    }
    if (hasTop && !topFocused && dir === 'up' && channelIdx === 0) {
      setTopFocused(true)
      return
    }

    if (dir === 'left') {
      if (effectiveCol === 2) {
        setCol(1) // preview → o mesmo canal de onde saiu (D-005)
        return
      }
      setCol(0)
      return
    }
    if (dir === 'right') {
      if (effectiveCol === 0) {
        enterFocusedTrailItem()
        return
      }
      // → do canal focado pro preview (feature 024, FR-014) — nunca dentro
      // do zapping, que não tem preview (D-009): mantém o comportamento
      // antigo (sem efeito) lá.
      if (effectiveCol === 1 && !zapOpen && !topFocused && activeChannel) {
        setCol(2)
        setPreviewAction(0)
      }
      return
    }

    if (effectiveCol === 0) {
      // Sobe da trilha para a topbar (feature 024, D-003) — só fora do
      // zapping (que não tem topbar) e só no topo real da trilha.
      if (dir === 'up' && categoryIdx === 0 && hasShell && !zapOpen) {
        setTopbarItem('live')
        setZone('topbar')
        return
      }
      if (dir === 'up' || dir === 'down') {
        const next = clamp(categoryIdx + (dir === 'down' ? 1 : -1), 0, entries.length - 1)
        if (next !== categoryIdx) {
          setFocusedIdentity({ trailKey: entries[next]?.key ?? { kind: 'favorites' }, channelId: null })
        }
      }
    } else if (effectiveCol === 2) {
      if (dir === 'up' || dir === 'down') {
        setPreviewAction((prev) => clamp(prev + (dir === 'down' ? 1 : -1), 0, PREVIEW_ACTION_COUNT - 1))
      }
    } else if (!topFocused) {
      const total = items.length
      if (dir === 'up' || dir === 'down') {
        const next = clamp(channelIdx + (dir === 'down' ? 1 : -1), 0, Math.max(0, total - 1))
        setFocusedIdentity((prev) => ({ ...prev, channelId: items[next]?.id ?? null }))
      }
    }
  }

  function handleTrailSelect() {
    if (effectiveCol === 0) {
      enterFocusedTrailItem()
      return
    }

    if (effectiveCol === 2) {
      if (previewAction === 0) {
        playActiveChannel()
        return
      }
      if (previewAction === 1) {
        toggleFocusedFavorite()
        return
      }
      // "Guia completo" (feature 031): o guia em tela cheia — já não é mock.
      openGuideFromPreview()
      return
    }

    // Estados só com "Voltar" (feature 024, T021/R-005): carregando o
    // conteúdo, ou conteúdo vazio sem outra ação (Favoritos/Todos/categoria
    // vazios) — nos três, o único elemento acionável é "Voltar", que devolve
    // o foco à trilha. Sem isto, os botões apareciam com aparência de foco
    // sem SELECT fazer nada (constitution, "Foco Visível e Sem Becos Sem
    // Saída").
    if (showingContent && !searchActive && contentIsLoading) {
      setCol(0)
      return
    }
    if (contentEmptyNeedsBack) {
      setCol(0)
      return
    }
    // Feature 014 (T039) — e achado no caminho: o mesmo estado de
    // "Tentar de novo" já existia sem isto, então SELECT não ativava o
    // botão apesar da aparência de foco (constitution, "Foco Visível e
    // Sem Becos Sem Saída") — corrigido junto, mesmo sendo pré-existente.
    if (!contentIsLoading && contentMissing) {
      onResync()
      return
    }
    if (!contentIsLoading && contentFailed) {
      retryContent()
      return
    }
    // Ícone de busca (feature 018): SELECT nele abre o campo. Só é
    // alcançado com `!searchActive` — quando o campo já tem foco DOM real
    // (`searchActive && topFocused`), a guarda de alvo editável do
    // useRemoteNav intercepta Enter antes de chegar aqui.
    if (topFocused) {
      setSearchActive(true)
      setSearchTerm('')
      return
    }
    playActiveChannel()
  }

  // Quando a camada de reprodução está aberta, ela é dona do teclado
  // (`modal: true`), então esta tela ignora as teclas — nada de navegar a
  // lista por trás do player. Com `shell`, só o escopo ATIVO (topbar ou
  // conteúdo) recebe handlers — o outro ganha `{}` (mesmo padrão de
  // `TopBar`/`logic/foco-live-shell.md` §2 da feature 024).
  useRemoteNav(
    contentActive
      ? {
          onDirection: (dir) => {
            if (playing) return
            if (openGuide) {
              guideRef.current?.onDirection(dir) // feature 031: o guia parado não registra teclado próprio
              return
            }
            if (topPhase === 'error') {
              if (dir === 'left' || dir === 'right') setTopErrorActionIndex((i) => (i === 0 ? 1 : 0))
              return
            }
            if (topPhase !== 'normal') return // loading/empty: uma ação só, nada pra mover
            handleTrailDirection(dir)
          },
          onSelect: () => {
            if (playing) return
            if (openGuide) {
              guideRef.current?.onSelect()
              return
            }
            if (topPhase === 'loading' || topPhase === 'empty') {
              onBack()
              return
            }
            if (topPhase === 'error') {
              if (topErrorActionIndex === 0) void categoriesQuery.refetch()
              else onBack()
              return
            }
            handleTrailSelect()
          },
          // CH±/ChannelUp/Down (feature 031, FR-015): pagina o guia parado. Só existe
          // handler com o guia aberto — sem ele a tecla segue sendo "não mapeada",
          // como fora do player (feature 027, FR-029). O mapeamento é o mesmo do
          // guia sobre o player (`pageGuide`, em `useLiveGuide`).
          onMediaKey: openGuide && !playing ? pageGuide : undefined,
          // Favoritar não é do guia (feature 031): sem os gestos enquanto ele está aberto.
          onLongSelect: !openGuide && topPhase === 'normal' && canToggleFavorite ? toggleFocusedFavorite : undefined,
          onFavoriteKey: !openGuide && topPhase === 'normal' && canToggleFavorite ? toggleFocusedFavorite : undefined,
          onBack: () => {
            if (playing) return
            if (openGuide) {
              guideRef.current?.onBack()
              return
            }
            if (topPhase !== 'normal') {
              onBack()
              return
            }
            // Preview (feature 024): volta ao mesmo canal, nunca à trilha
            // direto (D-005).
            if (effectiveCol === 2) {
              setCol(1)
              return
            }
            // Busca (feature 018): RETURN só ganha uma camada extra quando a
            // busca está ATIVA — resultado focado volta ao campo; campo focado
            // FECHA a busca (volta ao ícone, sem sair da categoria). Fora da
            // busca (item normal OU ícone parado), RETURN vai direto pra trilha,
            // igual à navegação normal — nunca força passar pelo ícone.
            // RETURN físico (10009/Escape/XF86Back) nunca é interceptado pela
            // guarda de alvo editável do useRemoteNav, então chega aqui
            // normalmente mesmo com o campo focado.
            if (effectiveCol === 1 && searchActive && !topFocused) {
              setTopFocused(true)
              return
            }
            if (effectiveCol === 1 && searchActive && topFocused) {
              setSearchActive(false)
              setSearchTerm('')
              return
            }
            if (effectiveCol === 1) {
              setCol(0)
              return
            }
            onBack()
          },
        }
      : {},
  )

  return { enterTrailEntry, handleTrailDirection, handleTrailSelect }
}
