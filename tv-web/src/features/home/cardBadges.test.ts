import { describe, expect, it } from 'vitest'
import { NEW_WINDOW_MS, cardBadges } from './cardBadges'

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000
const base = { watched: false, favorite: false }

describe('cardBadges (feature 060, FR-008)', () => {
  it('"Novo" vale a inclusão dos últimos 7 dias, inclusive o limite, e não além', () => {
    expect(cardBadges({ ...base, addedAt: NOW - 3 * DAY }, NOW).isNew).toBe(true)
    expect(cardBadges({ ...base, addedAt: NOW - NEW_WINDOW_MS }, NOW).isNew).toBe(true)
    expect(cardBadges({ ...base, addedAt: NOW - NEW_WINDOW_MS - 1 }, NOW).isNew).toBe(false)
  })

  it('sem data de inclusão, ou com data muito no futuro (relógio fora do lugar), nunca é "Novo"', () => {
    expect(cardBadges({ ...base }, NOW).isNew).toBe(false)
    expect(cardBadges({ ...base, addedAt: null }, NOW).isNew).toBe(false)
    expect(cardBadges({ ...base, addedAt: NOW + 30 * DAY }, NOW).isNew).toBe(false)
    // Uma folga de um dia cobre fuso e relógio ligeiramente adiantado.
    expect(cardBadges({ ...base, addedAt: NOW + DAY / 2 }, NOW).isNew).toBe(true)
  })

  it('a nota só aparece quando é maior que zero', () => {
    expect(cardBadges({ ...base, providerRating: 7.9 }, NOW).rating).toBe(7.9)
    expect(cardBadges({ ...base, providerRating: 0 }, NOW).rating).toBeNull()
    expect(cardBadges({ ...base, providerRating: null }, NOW).rating).toBeNull()
    expect(cardBadges({ ...base }, NOW).rating).toBeNull()
  })

  it('assistido e favorito passam como vieram', () => {
    expect(cardBadges({ watched: true, favorite: false }, NOW)).toMatchObject({ watched: true, favorite: false })
    expect(cardBadges({ watched: false, favorite: true }, NOW)).toMatchObject({ watched: false, favorite: true })
  })
})
