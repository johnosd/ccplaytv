import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Teste de CONTRATO da feature 083 (foco leve na TV). Travado em
 * `sdd/specs/083-foco-leve-tv/contract-tests.lock`; o sdd-execute só pode fazê-lo passar.
 * Lê as folhas de estilo do app: na TV de referência, animar a sombra do foco levou a grade de 140 cards a 38 fps e
 * a faixa com backdrop-filter a 32 fps (sonda 2 da 082). O fps em si só se prova na TV — aqui fica a regra que o produz.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : cssFiles(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

/** Troca comentários por espaços do mesmo tamanho, preservando as quebras de linha (o número da linha continua certo). */
function semComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

function linhaDe(css: string, index: number): number {
  return css.slice(0, index).split('\n').length
}

/** Declarações que fazem a sombra (ou tudo) animar, e qualquer backdrop-filter — com arquivo:linha. */
function animacoesPesadas(file: string): string[] {
  const css = semComentarios(readFileSync(file, 'utf8'))
  const name = relative(SRC, file).replace(/\\/g, '/')
  const found: string[] = []
  for (const match of css.matchAll(/(?:^|[;{\s])(transition(?:-property)?)\s*:([^;}]*)/g)) {
    if (/\b(box-shadow|all)\b/.test(match[2])) found.push(`${name}:${linhaDe(css, match.index ?? 0)} ${match[1]} anima ${match[2].match(/\b(box-shadow|all)\b/)?.[1]}`)
  }
  for (const match of css.matchAll(/(?:-webkit-)?backdrop-filter\s*:/g)) {
    found.push(`${name}:${linhaDe(css, match.index ?? 0)} backdrop-filter`)
  }
  for (const match of css.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)) {
    if (/\bbox-shadow\s*:/.test(match[1])) found.push(`${name}:${linhaDe(css, match.index ?? 0)} @keyframes anima box-shadow`)
  }
  return found
}

describe('083 — foco leve na TV (contrato)', () => {
  // FR-002, FR-003, Fora de Escopo (backdrop-filter): nenhuma folha de estilo anima a sombra do foco nem usa
  // backdrop-filter — o brilho pode existir, mas não é repintado a cada quadro da transição.
  it('nenhuma folha de estilo do app anima box-shadow nem usa backdrop-filter', () => {
    const files = cssFiles(SRC)
    expect(files.length).toBeGreaterThan(0)
    expect(files.flatMap(animacoesPesadas)).toEqual([])
  })
})
