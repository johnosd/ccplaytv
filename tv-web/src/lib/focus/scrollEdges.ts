export interface ScrollEdges {
  /** Há conteúdo acima da área visível. */
  start: boolean
  /** Há conteúdo abaixo da área visível. */
  end: boolean
}

/**
 * Em quais bordas de um contêiner rolável vertical ainda há conteúdo fora da
 * vista — é o que decide onde aparece o edge fade (DS V14 §17: "quando existe
 * conteúdo fora da viewport, o usuário precisa perceber que há
 * continuação"). Mesma regra do `Rail` (feature 022), no eixo vertical; a
 * folga de 1px absorve arredondamento de subpixel do `Stage` escalado.
 */
export function verticalScrollEdges(el: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>): ScrollEdges {
  return {
    start: el.scrollTop > 1,
    end: el.scrollHeight - el.scrollTop - el.clientHeight > 1,
  }
}
