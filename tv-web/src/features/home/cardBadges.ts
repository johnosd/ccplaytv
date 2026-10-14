/**
 * Selos de um card de título do Início (feature 060, FR-008 — `logic/cards-e-expansao.md` §4). Regra pura: quem chama lê
 * assistido/favorito do aparelho uma vez por tela; nada aqui toca banco nem rede.
 */

export interface CardBadgeInput {
  /** Inclusão declarada pela fonte, epoch ms. `null`/ausente = não declarada. */
  addedAt?: number | null
  /** Nota do provedor, 0–10. `null`/ausente/0 = sem nota. */
  providerRating?: number | null
  watched: boolean
  favorite: boolean
}

export interface CardBadges {
  isNew: boolean
  rating: number | null
  watched: boolean
  favorite: boolean
}

/** "Novo" = incluído nos últimos 7 dias (FR-008). */
export const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** Data de inclusão além de um dia no futuro = relógio do painel ou do aparelho fora do lugar: não marca como novo. */
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

export function cardBadges(input: CardBadgeInput, now: number): CardBadges {
  const { addedAt, providerRating } = input
  const isNew = addedAt != null && addedAt <= now + CLOCK_SKEW_MS && now - addedAt <= NEW_WINDOW_MS
  return {
    isNew,
    rating: providerRating != null && providerRating > 0 ? providerRating : null,
    watched: input.watched,
    favorite: input.favorite,
  }
}
