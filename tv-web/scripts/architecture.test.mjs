// Cobertura complementar da catraca da feature 063 (o contrato cobre as regras;
// aqui ficam a resolução de imports e a CLI).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildBaseline,
  checkArchitecture,
  countLines,
  isProductionFile,
  MAX_LINES,
  pruneBaseline,
  runCli,
  serializeBaseline,
} from './architecture.mjs'

const empty = { imports: {}, maxLines: {} }
const violationsOf = (files, baseline = empty) =>
  checkArchitecture(files, baseline).violations.map((v) => `${v.rule} ${v.file} -> ${v.target ?? ''}`)

describe('architecture — resolução de imports', () => {
  it('resolve para index.ts e index.tsx', () => {
    const files = [
      { path: 'features/a/A.tsx', source: "import { x } from '../b'\nimport { y } from '../c'\n" },
      { path: 'features/b/index.ts', source: '' },
      { path: 'features/c/index.tsx', source: '' },
    ]
    expect(violationsOf(files)).toEqual([
      'feature-to-feature features/a/A.tsx -> features/b/index.ts',
      'feature-to-feature features/a/A.tsx -> features/c/index.tsx',
    ])
  })

  it('aceita especificador com .ts explícito e conta import type e dinâmico', () => {
    const files = [
      { path: 'features/a/A.tsx', source: "import type { T } from '../b/B.ts'\nconst l = () => import('../c/C')\n" },
      { path: 'features/b/B.ts', source: '' },
      { path: 'features/c/C.tsx', source: '' },
    ]
    expect(violationsOf(files)).toEqual([
      'feature-to-feature features/a/A.tsx -> features/b/B.ts',
      'feature-to-feature features/a/A.tsx -> features/c/C.tsx',
    ])
  })

  it('ignora pacotes e destino fora de src, e classifica um .css pelo prefixo', () => {
    const files = [
      {
        path: 'lib/x.ts',
        source: "import React from 'react'\nimport z from 'dexie'\nimport '../../fora/x'\nimport '../features/a/a.css'\n",
      },
      { path: 'components/Y.tsx', source: "import '../features/a/a.css'\n" },
    ]
    expect(violationsOf(files)).toEqual([
      'lib-to-ui lib/x.ts -> features/a/a.css',
      'components-to-features components/Y.tsx -> features/a/a.css',
    ])
  })

  it('arquivo que não é de produção não é origem nem conta linhas', () => {
    expect(isProductionFile('lib/a.test.ts')).toBe(false)
    expect(isProductionFile('lib/a.contract.test.tsx')).toBe(false)
    expect(isProductionFile('lib/a.fixtures.ts')).toBe(false)
    expect(isProductionFile('testing/h.ts')).toBe(false)
    expect(isProductionFile('lib/testing/h.ts')).toBe(false)
    expect(isProductionFile('setupTests.ts')).toBe(false)
    expect(isProductionFile('vite-env.d.ts')).toBe(false)
    expect(isProductionFile('lib/a.ts')).toBe(true)
    expect(isProductionFile('features\\a\\A.tsx')).toBe(true)
  })

  it('conta linhas físicas: a quebra final não vale uma linha, vazio vale zero, CRLF conta igual', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('a')).toBe(1)
    expect(countLines('a\n')).toBe(1)
    expect(countLines('a\n\nb\n')).toBe(3)
    expect(countLines('a\r\nb\r\n')).toBe(2)
  })
})

describe('architecture — lista de exceções', () => {
  const files = [
    { path: 'features/a/A.tsx', source: "import { B } from '../b/B'\n" },
    { path: 'features/b/B.tsx', source: '' },
    { path: 'lib/catalog/c.ts', source: "import { p } from '../player/p'\n" },
    { path: 'lib/player/p.ts', source: '' },
    { path: 'lib/grande.ts', source: 'x\n'.repeat(MAX_LINES + 20) },
  ]

  it('buildBaseline nunca herda catalog→player e deixa o resto ordenado', () => {
    const baseline = buildBaseline(files)
    expect(baseline).toEqual({
      imports: { 'features/a/A.tsx': ['features/b/B.tsx'] },
      maxLines: { 'lib/grande.ts': MAX_LINES + 20 },
    })
    expect(checkArchitecture(files, baseline).violations.map((v) => v.rule)).toEqual(['catalog-to-player'])
  })

  it('pruneBaseline só aperta: tira obsoleto, baixa teto e nunca acrescenta nem sobe', () => {
    const baseline = {
      imports: { 'features/a/A.tsx': ['features/b/B.tsx', 'features/b/Sumiu.tsx'], 'features/x/Fantasma.tsx': ['features/b/B.tsx'] },
      maxLines: { 'lib/grande.ts': MAX_LINES + 50, 'lib/fantasma.ts': 999 },
    }
    expect(pruneBaseline(files, baseline)).toEqual({
      imports: { 'features/a/A.tsx': ['features/b/B.tsx'] },
      maxLines: { 'lib/grande.ts': MAX_LINES + 20 },
    })

    // Um arquivo que cresceu além do teto é violação, e `prune` não sobe o teto.
    const crescido = [{ path: 'lib/grande.ts', source: 'x\n'.repeat(MAX_LINES + 80) }]
    expect(pruneBaseline(crescido, { imports: {}, maxLines: { 'lib/grande.ts': MAX_LINES + 50 } }).maxLines).toEqual({
      'lib/grande.ts': MAX_LINES + 50,
    })
    // Um import novo não herdado também não entra pelo `prune`.
    expect(pruneBaseline(files, empty).imports).toEqual({})
  })

  it('serializeBaseline ordena chaves e listas e termina com quebra de linha', () => {
    const text = serializeBaseline({ imports: { 'b.ts': ['z.ts', 'a.ts'], 'a.ts': ['c.ts'] }, maxLines: { 'z.ts': 301, 'a.ts': 400 } })
    expect(text.endsWith('}\n')).toBe(true)
    expect(Object.keys(JSON.parse(text).imports)).toEqual(['a.ts', 'b.ts'])
    expect(JSON.parse(text).imports['b.ts']).toEqual(['a.ts', 'z.ts'])
    expect(Object.keys(JSON.parse(text).maxLines)).toEqual(['a.ts', 'z.ts'])
  })
})

describe('architecture — CLI', () => {
  const dirs = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function projeto(arquivos) {
    const dir = mkdtempSync(path.join(tmpdir(), 'arch-'))
    dirs.push(dir)
    const src = path.join(dir, 'src')
    for (const [file, content] of Object.entries(arquivos)) {
      const full = path.join(src, file)
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, content)
    }
    return { srcDir: src, baselinePath: path.join(dir, 'baseline.json') }
  }

  function rodar(argv, options) {
    const saida = []
    const erros = []
    const code = runCli(argv, { ...options, out: (l) => saida.push(l), err: (l) => erros.push(l) })
    return { code, saida, erros }
  }

  it('--write-baseline grava a lista e recusa quando ela já existe', () => {
    const options = projeto({ 'features/a/A.tsx': "import { B } from '../b/B'\n", 'features/b/B.tsx': '' })

    expect(rodar(['--write-baseline'], options).code).toBe(0)
    const gravado = readFileSync(options.baselinePath, 'utf8')
    expect(JSON.parse(gravado).imports).toEqual({ 'features/a/A.tsx': ['features/b/B.tsx'] })

    expect(rodar(['--write-baseline'], options).code).toBe(2)
    expect(readFileSync(options.baselinePath, 'utf8')).toBe(gravado)

    // Verificação sem violação, e --prune sem nada a apertar não mexe no arquivo.
    expect(rodar([], options).code).toBe(0)
    expect(rodar(['--prune'], options).code).toBe(0)
    expect(readFileSync(options.baselinePath, 'utf8')).toBe(gravado)
  })

  it('--prune tira a exceção obsoleta e a verificação só avisa', () => {
    const options = projeto({ 'features/a/A.tsx': '', 'features/b/B.tsx': '' })
    writeFileSync(options.baselinePath, JSON.stringify({ imports: { 'features/a/A.tsx': ['features/b/B.tsx'] }, maxLines: {} }))

    const verificacao = rodar([], options)
    expect(verificacao.code).toBe(0)
    expect(verificacao.saida.some((l) => l.includes('obsoleta'))).toBe(true)

    expect(rodar(['--prune'], options).code).toBe(0)
    expect(JSON.parse(readFileSync(options.baselinePath, 'utf8')).imports).toEqual({})
  })

  it('sem lista de exceções a verificação sai com 2 e não cria o arquivo', () => {
    const options = projeto({ 'lib/a.ts': '' })
    expect(rodar([], options).code).toBe(2)
    expect(existsSync(options.baselinePath)).toBe(false)
  })

  it('violação sai com 1 e imprime só caminhos e números', () => {
    const options = projeto({ 'features/a/A.tsx': '', 'lib/novo.ts': 'segredo()\n'.repeat(MAX_LINES + 1) })
    writeFileSync(options.baselinePath, JSON.stringify({ imports: {}, maxLines: {} }))

    const resultado = rodar([], options)
    expect(resultado.code).toBe(1)
    expect(resultado.erros.some((l) => l.includes(`lib/novo.ts (${MAX_LINES + 1} > ${MAX_LINES})`))).toBe(true)
    expect([...resultado.saida, ...resultado.erros].some((l) => l.includes('segredo'))).toBe(false)
  })
})