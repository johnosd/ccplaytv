import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

function token(name: string) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, 'i'))
  if (!match) throw new Error('token ausente: ' + name)
  return match[1]
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('tokens de contraste do portal', () => {
  it('mantém AA para texto e 3:1 para indicadores grandes de estado', () => {
    const pairs = [
      ['text-primary', 'bg-base', 4.5],
      ['text-secondary', 'bg-base', 4.5],
      ['text-muted', 'bg-base', 4.5],
      ['accent', 'bg-base', 4.5],
      ['text-on-accent', 'accent', 4.5],
      ['success', 'bg-base', 3],
      ['warning', 'bg-base', 3],
      ['danger', 'bg-base', 3],
    ] as const

    for (const [foreground, background, minimum] of pairs) {
      expect(contrast(token(foreground), token(background)), `${foreground} sobre ${background}`).toBeGreaterThanOrEqual(minimum)
    }
  })
})
