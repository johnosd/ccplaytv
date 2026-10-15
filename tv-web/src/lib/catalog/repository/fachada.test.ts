/// <reference types="node" />
/**
 * Feature 063 (D-001): `lib/catalog/repository/` é detalhe da fachada. Quem
 * importa um módulo de lá direto tira do `vi.mock`/`vi.spyOn` sobre
 * `catalogRepository` o efeito que eles sempre tiveram (R-001, R-002).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(process.cwd(), 'src')
const REPOSITORY = path.join(SRC, 'lib/catalog/repository')
const FACHADA = path.join(SRC, 'lib/catalog/catalogRepository.ts')
const ESPECIFICADOR = /(?:from|import\(|mock\(|importActual\(|importOriginal\()\s*['"]([^'"]+)['"]/g

function arquivosDeCodigo(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((nome) => /\.(ts|tsx)$/.test(nome))
    .map((nome) => path.join(SRC, nome))
}

function apontaParaRepository(especificador: string): boolean {
  return /(^|\/)repository(\/|$)/.test(especificador)
}

describe('catalogRepository — só a fachada conhece repository/ (feature 063, D-001)', () => {
  it('nenhum arquivo de src, de produção ou de teste, importa repository/ fora da fachada e do próprio repository/', () => {
    const infratores = arquivosDeCodigo()
      .filter((arquivo) => arquivo !== FACHADA && !arquivo.startsWith(REPOSITORY + path.sep))
      .flatMap((arquivo) => {
        const texto = readFileSync(arquivo, 'utf8')
        return [...texto.matchAll(ESPECIFICADOR)]
          .map((achado) => achado[1])
          .filter(apontaParaRepository)
          .map((especificador) => `${path.relative(SRC, arquivo)} → ${especificador}`)
      })
    expect(infratores).toEqual([])
  })

  it('o detector enxerga as formas de import (import, import(), vi.mock e importOriginal)', () => {
    const exemplo = [
      "import { a } from './repository/shared'",
      "const b = await import('../catalog/repository/series')",
      "vi.mock('./repository/staging', () => ({}))",
      "const c = await importOriginal('./repository/generations')",
      "import { d } from './userStateRepository'",
    ].join('\n')
    const achados = [...exemplo.matchAll(ESPECIFICADOR)].map((achado) => achado[1]).filter(apontaParaRepository)
    expect(achados).toEqual([
      './repository/shared',
      '../catalog/repository/series',
      './repository/staging',
      './repository/generations',
    ])
  })
})
