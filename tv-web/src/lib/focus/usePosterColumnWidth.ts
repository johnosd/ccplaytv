import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface PosterColumnMeasurement {
  /** Largura de uma coluna, em pixels. `0` antes da primeira medição. */
  columnWidth: number
  /**
   * Anexar ao `ref` do contêiner da grade — é o que dispara a medição.
   *
   * **Por que não é um `RefObject` que o chamador cria com `useRef`**
   * (achado na verificação na TV física, feature 009): o contêiner da
   * grade só existe no DOM depois que o conteúdo carrega
   * (`{items.length > 0 && <div ref .../>}`). Um `useEffect` com
   * `[containerRef, cols]` nas dependências só roda de novo se um desses
   * valores mudar — e nem a identidade do objeto `ref` nem `cols` mudam
   * quando o `<div>` passa a existir. O efeito rodava uma vez, achava
   * `containerRef.current === null` e nunca tentava de novo:
   * `columnWidth` ficava travado em `0` pra sempre, e cada linha da grade
   * saía do tamanho mínimo (`POSTER_ROW_EXTRA_PX`), sobrepondo a de baixo.
   * Um **callback ref** não tem esse problema: o React o chama toda vez
   * que o nó monta ou desmonta, então a medição começa exatamente quando
   * o contêiner passa a existir, não só na montagem do componente.
   */
  setContainerRef: (node: HTMLElement | null) => void
  /** O mesmo nó, para `getScrollElement: () => containerRef.current` do virtualizador. */
  containerRef: RefObject<HTMLElement | null>
}

/**
 * Largura de uma coluna da grade de pôsteres, medida do contêiner real
 * (`research.md` R0-2, feature 009).
 *
 * `.poster-grid` usa colunas fluidas (`repeat(6, 1fr)` na versão não
 * virtualizada) — o que é certo para o layout normal, mas o virtualizador
 * precisa de um número de altura de linha (`estimateSize`) antes do
 * primeiro layout, e essa altura depende da largura da coluna (`.poster-box`
 * é `aspect-ratio: 2/3`). Sem medir, a única saída seria fixar um pixel —
 * o que ADR-007 proíbe (tela nova consome token, nunca define tamanho
 * literal).
 *
 * Zero antes da primeira medição é esperado e seguro: o `ResizeObserver`
 * dispara o callback assim que `observe()` é chamado, então o valor real
 * chega no próximo render, não numa segunda interação da pessoa.
 */
export function usePosterColumnWidth(cols: number): PosterColumnMeasurement {
  const [columnWidth, setColumnWidth] = useState(0)
  const containerRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const setContainerRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect()
      containerRef.current = node
      if (!node) return

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        setColumnWidth(entry.contentRect.width / cols)
      })
      observer.observe(node)
      observerRef.current = observer
    },
    [cols],
  )

  // Desconecta se o componente desmontar com o nó ainda presente — o
  // callback ref já desconecta na troca de nó, isto cobre só o unmount.
  useEffect(() => () => observerRef.current?.disconnect(), [])

  return { columnWidth, setContainerRef, containerRef }
}
