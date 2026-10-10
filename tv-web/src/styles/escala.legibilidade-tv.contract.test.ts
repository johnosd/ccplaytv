import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Teste de CONTRATO da feature 068 (legibilidade para TV, US1). Travado em
 * `sdd/specs/068-legibilidade-tv/contract-tests.lock`; o sdd-execute só pode fazê-lo passar.
 * Lê as folhas de estilo do app: a escala é decisão de CSS (tokens `--fs-*`, `styles/font-scale.css`).
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

/** A escala nova, na base 1920×1080 (FR-001). */
const SCALE: Record<string, number> = {
  '--fs-display': 64,
  '--fs-h1': 48,
  '--fs-h2': 32,
  '--fs-body-lg': 28,
  '--fs-body': 24,
  '--fs-caption': 20,
}

/** Valor em px de uma declaração `--fs-x: 20px` ou `--fs-x: calc(20px * var(--font-scale))`, com `--font-scale` = 1. */
function tokenPx(css: string, token: string): number | null {
  const match = new RegExp(`${token}\\s*:\\s*(?:calc\\(\\s*)?([0-9.]+)px`).exec(css)
  return match ? Number(match[1]) : null
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : cssFiles(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

describe('068 — escala tipográfica para TV (contrato)', () => {
  // FR-001, US1/AC1: tokens base (`index.css`) e efetivos (`styles/font-scale.css`) com a escala nova.
  it('os tokens de texto valem 64/48/32/28/24/20 px, na base e na escala efetiva', () => {
    const base = readFileSync(join(SRC, 'index.css'), 'utf8')
    const effective = readFileSync(join(SRC, 'styles', 'font-scale.css'), 'utf8')
    for (const [token, px] of Object.entries(SCALE)) {
      expect({ token, base: tokenPx(base, token), effective: tokenPx(effective, token) }).toEqual({ token, base: px, effective: px })
    }
    expect(/--font-scale\s*:\s*1\s*;/.test(effective)).toBe(true)
  })

  // FR-002, SC-001: nenhuma declaração de fonte com tamanho literal abaixo de 20 px em nenhuma folha de estilo do app.
  it('nenhum font-size/font com tamanho literal abaixo de 20 px', () => {
    const offenders: string[] = []
    for (const file of cssFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        if (!/^\s*font(-size)?\s*:/.test(line)) return
        for (const [, value] of line.matchAll(/([0-9.]+)px/g)) {
          if (Number(value) < 20) offenders.push(`${file.slice(SRC.length + 1)}:${index + 1}: ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
