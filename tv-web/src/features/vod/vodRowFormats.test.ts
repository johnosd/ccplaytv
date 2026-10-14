import { describe, expect, it } from 'vitest'
import { ROW_FORMATS } from './vodRowFormats'

describe('ROW_FORMATS (feature 053)', () => {
  it('todo formato tem medidas positivas, o item é maior que o card e a fileira cabe o trilho', () => {
    for (const [format, m] of Object.entries(ROW_FORMATS)) {
      expect(m.cardWidth, format).toBeGreaterThan(0)
      expect(m.itemWidth, format).toBeGreaterThan(m.cardWidth)
      expect(m.rowHeight, format).toBeGreaterThan(m.itemHeight)
    }
  })

  it('"poster" é o card de hoje da 052 (260 de card, 284×383 de item)', () => {
    expect(ROW_FORMATS.poster).toMatchObject({ cardWidth: 260, itemWidth: 284, itemHeight: 383 })
  })
})
