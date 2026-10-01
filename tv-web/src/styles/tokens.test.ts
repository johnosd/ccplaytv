/// <reference types="node" />
/**
 * `tsconfig.app.json` restringe `types` a `vite/client` (evita globais do
 * Node vazando pro app inteiro) — a referência acima traz só PRA ESTE
 * ARQUIVO os tipos de `node:fs`/`node:path`/`process` que ele usa pra ler
 * o CSS de verdade (ver comentário abaixo sobre `?raw`/`?inline`).
 *
 * Feature 021, Fase 2 (T007) — confere que os tokens V14 (D-001 do plan.md)
 * existem com o valor normativo, e que todo nome já usado pelo app antes
 * desta feature continua resolvendo pro MESMO valor literal de antes
 * (FR-007). Não é teste de contrato (a trava desta feature já tem seus 5),
 * é cobertura complementar sobre o texto do CSS — jsdom não computa
 * `var()` de verdade, então resolvemos a cadeia à mão a partir do texto.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// `?raw`/`?inline` não servem aqui: o Vitest, por padrão (`test.css` não
// ligado em `vite.config.ts`), troca todo import de `.css` por um módulo
// vazio, com ou sem query — lido direto do disco pra ter o texto real.
const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')

/** Mapa `--nome` -> valor bruto, a partir do PRIMEIRO bloco `:root { ... }`. */
function parseRootDeclarations(source: string): Map<string, string> {
  const rootStart = source.indexOf(':root {')
  if (rootStart === -1) throw new Error('bloco :root não encontrado')
  const bodyStart = source.indexOf('{', rootStart) + 1
  const bodyEnd = source.indexOf('\n}', bodyStart)
  // Comentário `/* ... */` colado antes de uma declaração (sem `;` entre
  // os dois) grudava no pedaço anterior do split abaixo e derrubava a
  // primeira declaração de cada seção — removidos antes de tudo.
  const body = source.slice(bodyStart, bodyEnd).replace(/\/\*[\s\S]*?\*\//g, '')

  const map = new Map<string, string>()
  for (const rawDecl of body.split(';')) {
    const decl = rawDecl.trim()
    if (!decl.startsWith('--')) continue
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    const name = decl.slice(0, colon).trim()
    const value = decl.slice(colon + 1).trim()
    map.set(name, value)
  }
  return map
}

/** Segue `var(--outro)`/`var(--outro, fallback)` um nível de cada vez, até um literal. */
function resolve(name: string, map: Map<string, string>): string | undefined {
  let value = map.get(name)
  let guard = 0
  while (value) {
    const match = /^var\((--[a-z0-9-]+)(?:\s*,\s*[^)]+)?\)$/i.exec(value)
    if (!match) return value
    value = map.get(match[1])
    guard += 1
    if (guard > 10) throw new Error(`ciclo de var() ao resolver ${name}`)
  }
  return undefined
}

const root = parseRootDeclarations(css)

describe('021 — tokens V14 (D-001)', () => {
  it.each([
    // Superfícies (§5.1)
    ['--bg-canvas', '#05060a'],
    ['--bg-base', '#0b0d12'],
    ['--bg-surface', '#15181f'],
    ['--bg-elevated', '#1d212b'],
    ['--bg-hover', '#2a2f3c'],
    // Texto (§5.2)
    ['--text-primary', '#f5f6f8'],
    ['--text-secondary', '#a7adbb'],
    ['--text-disabled', '#5c6372'],
    ['--text-annotation', '#7c8494'],
    // Accent (§5.3)
    ['--accent', '#ff7a3d'],
    ['--accent-light', '#ffa36b'],
    ['--accent-pressed', '#d9601f'],
    ['--accent-tint', 'rgba(255, 122, 61, 0.16)'],
    ['--accent-tint-border', 'rgba(255, 122, 61, 0.4)'],
    ['--accent-ink', '#2a1206'],
    // Semânticos
    ['--success', '#3ddc84'],
    ['--warning', '#ffc93d'],
    ['--info', '#2db8c4'],
    ['--info-deep', '#1e9ab0'],
    ['--live', '#ff2e87'],
    ['--danger', '#ff4f68'],
    // Tipografia (§6)
    ['--fs-display', '64px'],
    ['--fs-h1', '40px'],
    ['--fs-h2', '28px'],
    ['--fs-body-lg', '24px'],
    ['--fs-body', '20px'],
    ['--fs-caption', '16px'],
    ['--fw-display', '800'],
    ['--fw-h1', '700'],
    ['--fw-h2', '600'],
    ['--fw-body', '500'],
    ['--fw-caption', '600'],
    // Espaçamento (§7)
    ['--space-1', '8px'],
    ['--space-2', '16px'],
    ['--space-3', '24px'],
    ['--space-4', '32px'],
    ['--space-5', '48px'],
    ['--space-6', '64px'],
    ['--space-7', '96px'],
    // Raio (§8)
    ['--radius-sm', '8px'],
    ['--radius-md', '12px'],
    ['--radius-lg', '16px'],
    ['--radius-pill', '999px'],
    // Elevação (§9)
    ['--elevation-1', '0 8px 24px rgba(0, 0, 0, 0.28)'],
    ['--elevation-2', '0 16px 48px rgba(0, 0, 0, 0.48)'],
    ['--elevation-3', '0 24px 70px rgba(0, 0, 0, 0.62)'],
    // Motion (§10)
    ['--ease', 'cubic-bezier(0.2, 0.8, 0.2, 1)'],
    ['--duration-fast', '140ms'],
    ['--duration-standard', '200ms'],
    ['--duration-slow', '320ms'],
    // Foco (§11.1)
    ['--focus-ring-width', '4px'],
    ['--focus-ring-offset', '3px'],
    ['--focus-halo', '0 0 0 8px rgba(255, 122, 61, 0.22)'],
    ['--focus-glow', '0 0 40px rgba(255, 122, 61, 0.55)'],
    ['--focus-scale', '1.06'],
    // Camadas (§29)
    ['--z-background', '0'],
    ['--z-content', '10'],
    ['--z-nav', '50'],
    ['--z-overlay', '100'],
    // Palco (§4)
    ['--stage-width', '1920px'],
    ['--stage-height', '1080px'],
    ['--safe-x', '96px'],
    ['--safe-y', '76px'],
    // Ícone (§15)
    ['--icon-size', '1em'],
  ] as const)('token V14 %s tem o valor normativo %s', (name, expected) => {
    expect(resolve(name, root)).toBe(expected)
  })

  // Nomes usados pelo app ANTES desta feature — precisam resolver pro
  // MESMO valor literal de sempre (FR-007), agora via alias pro nome V14.
  it.each([
    ['--bg', '#05060a'],
    ['--surface-deep', '#0b0d12'],
    ['--surface', '#15181f'],
    ['--surface-field-active', '#1d212b'],
    ['--surface-active', '#2a2f3c'],
    ['--border-dashed', '#2a2f3c'],
    ['--text-muted', '#5c6372'],
    ['--text-tertiary', '#7c8494'],
    ['--accent-hover', '#ffa36b'],
  ] as const)('alias existente %s continua resolvendo para %s', (name, expected) => {
    expect(resolve(name, root)).toBe(expected)
  })

  it('nomes que já existiam com o valor certo continuam sem alias (accent, accent-ink, text-primary, text-secondary)', () => {
    expect(root.get('--accent')).toBe('#ff7a3d')
    expect(root.get('--accent-ink')).toBe('#2a1206')
    expect(root.get('--text-primary')).toBe('#f5f6f8')
    expect(root.get('--text-secondary')).toBe('#a7adbb')
  })
})
