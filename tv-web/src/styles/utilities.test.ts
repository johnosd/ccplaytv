// Feature 021, Fase 7 (T042) — D-007 do plan.md. Mesma técnica de leitura
// de `tokens.test.ts` (node:fs — `.css?raw`/`?inline` voltam vazio sob
// Vitest, ver `Cuidados para Retomada` do plan.md).
/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.resolve(process.cwd(), 'src/styles/utilities.css'), 'utf8')

describe('021 — utilities.css (D-007)', () => {
  it.each(['.no-scale', '.pressed', '.is-soft-disabled', '.is-hard-disabled'])(
    'declara %s',
    (selector) => {
      expect(css).toContain(selector)
    },
  )

  it('.is-hard-disabled continua visível (não usa display:none nem visibility:hidden)', () => {
    const block = /\.is-hard-disabled\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(block).not.toBe('')
    expect(block).not.toMatch(/display:\s*none/)
    expect(block).not.toMatch(/visibility:\s*hidden/)
  })
})
