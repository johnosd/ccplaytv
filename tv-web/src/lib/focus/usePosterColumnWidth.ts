import { useEffect, useState, type RefObject } from 'react'

/**
 * Largura de uma coluna da grade de pôsteres, medida do contêiner real
 * (`research.md` R0-2, feature 009).
 *
 * `.poster-grid` usa colunas fluidas (`repeat(6, 1fr)`) — o que é certo
 * para o layout normal, mas o virtualizador precisa de um número de
 * altura de linha (`estimateSize`) antes do primeiro layout, e essa altura
 * depende da largura da coluna (`.poster-box` é `aspect-ratio: 2/3`). Sem
 * medir, a única saída seria fixar um pixel — o que ADR-007 proíbe (tela
 * nova consome token, nunca define tamanho literal).
 *
 * Zero antes da primeira medição é esperado e seguro: o `ResizeObserver`
 * dispara o callback assim que `observe()` é chamado, então o valor real
 * chega no próximo render, não numa segunda interação da pessoa.
 */
export function usePosterColumnWidth(containerRef: RefObject<HTMLElement | null>, cols: number): number {
  const [columnWidth, setColumnWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setColumnWidth(entry.contentRect.width / cols)
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [containerRef, cols])

  return columnWidth
}
