import { useEffect, useRef, useState, type RefObject } from 'react'

export interface OverflowEdges {
  /** Há conteúdo oculto acima da área visível. */
  above: boolean
  /** Há conteúdo oculto abaixo da área visível. */
  below: boolean
}

const NONE: OverflowEdges = { above: false, below: false }

/**
 * Indicador de continuação de uma lista rolável (feature 048, FR-021 — Spec
 * V14 §17/§34): diz de que lado ainda há itens ocultos, para a tela desenhar
 * o degradê só onde ele informa algo. `above` = `scrollTop > 1`; `below` =
 * `scrollTop + clientHeight < scrollHeight - 1`. Recalcula em scroll
 * (passivo), no `ResizeObserver` do contêiner e quando `deps` muda (ex.: a
 * quantidade de itens); só faz `setState` quando algum lado muda.
 *
 * O contêiner pode ser remontado (Live ↔ zapping usam o mesmo ref): o efeito
 * roda a cada render e só religa os ouvintes quando o elemento mudou.
 */
export function useOverflowEdges(ref: RefObject<HTMLElement | null>, deps?: unknown): OverflowEdges {
  const [edges, setEdges] = useState<OverflowEdges>(NONE)
  const bound = useRef<{ element: HTMLElement; cleanup: () => void } | null>(null)
  const measure = useRef<() => void>(() => {})

  // Efeito sem lista de dependências: roda a cada render, antes dos demais, e deixa `measure` apontando
  // para a leitura mais recente (nunca se escreve em ref durante o render).
  useEffect(() => {
    measure.current = () => {
      const element = ref.current
      const next: OverflowEdges = element
        ? {
            above: element.scrollTop > 1,
            below: element.scrollTop + element.clientHeight < element.scrollHeight - 1,
          }
        : NONE
      setEdges((prev) => (prev.above === next.above && prev.below === next.below ? prev : next))
    }
  })
  useEffect(() => {
    const element = ref.current
    if (bound.current?.element !== element) {
      bound.current?.cleanup()
      bound.current = null
      if (element) {
        const onScroll = () => measure.current()
        element.addEventListener('scroll', onScroll, { passive: true })
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(onScroll)
        observer?.observe(element)
        bound.current = {
          element,
          cleanup: () => {
            element.removeEventListener('scroll', onScroll)
            observer?.disconnect()
          },
        }
      }
    }
    measure.current()
  })

  // Recalcula quando a quantidade/identidade do conteúdo muda.
  useEffect(() => {
    measure.current()
  }, [deps])

  useEffect(
    () => () => {
      bound.current?.cleanup()
      bound.current = null
    },
    [],
  )

  return edges
}
