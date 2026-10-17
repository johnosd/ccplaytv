// Feature 021, Fase 3 (T016) — casos extras de `findUnlistedFiles`, além
// dos 2 já cobertos pelo contrato (`pacoteTizen.fundacao-visual.contract.
// test.mjs`).
import { describe, expect, it } from 'vitest'
import { findStaleDeclared, findUnlistedFiles } from './tizenFiles.mjs'

describe('findUnlistedFiles — casos extras', () => {
  it('YAML sem seção excludes: (files: é a última seção)', () => {
    const yaml = ['files:', '  - index.html', '  - assets/index.js', ''].join('\n')
    expect(findUnlistedFiles(['index.html', 'assets/index.js'], yaml)).toEqual([])
    expect(findUnlistedFiles(['index.html', 'assets/extra.js'], yaml)).toEqual(['assets/extra.js'])
  })

  it('files: sem nenhuma linha em branco depois, seguido direto de outra chave', () => {
    const yaml = ['files:', '  - index.html', 'excludes:', '  - Build/*'].join('\n')
    expect(findUnlistedFiles(['index.html'], yaml)).toEqual([])
    expect(findUnlistedFiles(['index.html', 'assets/extra.js'], yaml)).toEqual(['assets/extra.js'])
  })

  it('indentação de 4 espaços', () => {
    const yaml = ['files:', '    - index.html', '    - assets/index.js', 'excludes: []'].join('\n')
    expect(findUnlistedFiles(['index.html', 'assets/index.js'], yaml)).toEqual([])
  })

  it('itens entre aspas simples ou duplas', () => {
    const yaml = ['files:', "  - 'index.html'", '  - "assets/index.js"'].join('\n')
    expect(findUnlistedFiles(['index.html', 'assets/index.js'], yaml)).toEqual([])
  })

  it('sem seção files: nenhum arquivo é considerado listado', () => {
    const yaml = ['excludes:', '  - Build/*'].join('\n')
    expect(findUnlistedFiles(['index.html'], yaml)).toEqual(['index.html'])
  })
})

// Feature 078 (T017, R-008): o inverso de findUnlistedFiles.
describe('findStaleDeclared', () => {
  const yaml = ['files:', '  - index.html', '  - icon.png', '  - assets/index.js', '  - assets/old.js', 'excludes:', '  - Build/*'].join('\n')

  it('acusa entrada declarada que o build não emite, e ignora icon.png (vem do projeto Tizen)', () => {
    expect(findStaleDeclared(['index.html', 'assets/index.js'], yaml)).toEqual(['assets/old.js'])
  })

  it('normaliza "\\" do dist e devolve vazio quando tudo coincide', () => {
    expect(findStaleDeclared(['index.html', 'assets\\index.js', 'assets\\old.js'], yaml)).toEqual([])
  })

  it('sem seção files: não há nada obsoleto', () => {
    expect(findStaleDeclared(['index.html'], 'excludes:\n  - Build/*')).toEqual([])
  })
})
