import { useEffect, useRef } from 'react'

/**
 * Sincroniza o índice logicamente focado (estado da tela) com o
 * virtualizador (`logic/virtualizacao-foco.md` §2, feature 009).
 *
 * O foco em si nunca muda aqui — quem decide "o que é o próximo item"
 * continua sendo a tela, via `clamp`/`gridNextIndex` (`useRemoteNav.ts`).
 * Este hook só garante que o item que acabou de virar "o focado" tenha um
 * nó montado na janela virtual, para a classe `tv-focus` (ADR-007)
 * aparecer nele no mesmo ciclo de render — sem depender de `.focus()` de
 * DOM nem de uma engine de foco externa (ADR-009).
 */
export interface UseVirtualFocusSyncOptions {
  /** Índice logicamente focado agora — vem do estado da tela. */
  focusedIndex: number
  /** `scrollToIndex` do virtualizador ativo (lista 1D ou grade com `lanes`). */
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void
  /** Suspende a sincronização — ex.: painel de conteúdo ainda carregando, sem itens, ou com erro. */
  enabled: boolean
}

export function useVirtualFocusSync({ focusedIndex, scrollToIndex, enabled }: UseVirtualFocusSyncOptions): void {
  // Guarda a função mais recente sem entrar na lista de dependências do
  // efeito principal — um virtualizador recriado a cada render (identidade
  // nova de `scrollToIndex`) não pode, sozinho, disparar um novo scroll.
  // Só a mudança de `focusedIndex` importa. Mesmo padrão de `handlersRef`
  // em `useRemoteNav.ts`.
  const scrollToIndexRef = useRef(scrollToIndex)
  useEffect(() => {
    scrollToIndexRef.current = scrollToIndex
  })

  useEffect(() => {
    if (!enabled) return
    scrollToIndexRef.current(focusedIndex, { align: 'auto' })
  }, [focusedIndex, enabled])
}
