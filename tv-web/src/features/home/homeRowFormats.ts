/**
 * Medidas dos formatos de fileira do Início (feature 060, D-009 — `logic/cards-e-expansao.md` §1). Fonte única: o `Rail`
 * precisa de largura/altura fixas em px e o CSS lê as mesmas por variáveis inline (`--home-card-w`/`--home-card-h`/…), nunca
 * um px literal na folha de estilo. Mesmo papel de `features/vod/vodRowFormats.ts`.
 */

export type HomeRowFormat = 'poster' | 'rank' | 'continue' | 'live' | 'ai'

export interface HomeFormatMetrics {
  /** Largura/altura do card em repouso, no palco 1920 × 1080. */
  cardWidth: number
  cardHeight: number
  /** Largura/altura do card focado e expandido (iguais às de repouso nos formatos que não expandem). */
  expandedCardWidth: number
  expandedCardHeight: number
  /** Largura do slot do `Rail` (card + espaço entre cards), em repouso e com o card expandido. */
  itemWidth: number
  expandedItemWidth: number
  /** Altura do trilho: o maior card (expandido) + legenda + folga do anel de foco acima e abaixo. */
  itemHeight: number
  /** Só `rank`: largura da coluna do numeral e quanto o pôster o cobre. */
  numeralWidth: number
  numeralOverlap: number
}

/** Espaço entre cards (= `--space-3`). */
export const CARD_GAP = 24
/**
 * Folga acima e abaixo do card para o anel de foco (contorno + halo + `scale(1.06)`) não ser cortado pelo `overflow-y: hidden`
 * do trilho (= `--space-4`).
 */
export const FOCUS_PAD = 32
/** Legenda embaixo dos cards 16:9 (tempo restante / próximo programa). */
const CAPTION_BLOCK = 44

const NUMERAL_WIDTH = 160
const NUMERAL_OVERLAP = 44

function metrics(card: [number, number], expanded: [number, number], caption = 0, numeral = false): HomeFormatMetrics {
  const lead = numeral ? NUMERAL_WIDTH - NUMERAL_OVERLAP : 0
  return {
    cardWidth: card[0],
    cardHeight: card[1],
    expandedCardWidth: expanded[0],
    expandedCardHeight: expanded[1],
    itemWidth: lead + card[0] + CARD_GAP,
    expandedItemWidth: lead + expanded[0] + CARD_GAP,
    itemHeight: Math.max(card[1], expanded[1]) + caption + FOCUS_PAD * 2,
    numeralWidth: numeral ? NUMERAL_WIDTH : 0,
    numeralOverlap: numeral ? NUMERAL_OVERLAP : 0,
  }
}

export const HOME_ROW_FORMATS: Record<HomeRowFormat, HomeFormatMetrics> = {
  poster: metrics([250, 375], [667, 375]),
  rank: metrics([250, 375], [667, 375], 0, true),
  continue: metrics([480, 270], [600, 338], CAPTION_BLOCK),
  // Canais favoritos: ícone quadrado (logo ou iniciais) com o nome embaixo — não expande (ad-hoc 2026-10-09).
  live: metrics([200, 200], [200, 200], CAPTION_BLOCK),
  ai: metrics([860, 170], [860, 170]),
}

/** Largura útil de uma fileira: o palco de 1920 menos a safe zone dos dois lados (`--safe-x` = 96). */
const HOME_RAIL_WIDTH = 1920 - 96 * 2
/**
 * Quantos canais favoritos a fileira mostra: só os que cabem na tela sem rolar, guardando o último slot para o "Ver todos (N)"
 * que leva à categoria Favoritos da TV ao vivo.
 */
export const HOME_CHANNELS_VISIBLE = Math.floor(HOME_RAIL_WIDTH / HOME_ROW_FORMATS.live.itemWidth) - 1

/** Altura da faixa de fileiras que espia embaixo do billboard expandido (mostra o título e o topo dos cards da 1ª fileira). */
export const HOME_PEEK_HEIGHT = 192

/** Atraso até o fundo ambiente seguir o card focado (D-005): seta segurada não faz o fundo piscar. */
export const HOME_AMBIENT_DELAY_MS = 250
/** Atraso das fileiras que leem o índice de busca inteiro (D-013): a primeira tela não espera por elas. */
export const HOME_DEFERRED_MS = 600
