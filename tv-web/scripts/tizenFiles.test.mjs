// Feature 021, Fase 3 (T016) — casos extras de `findUnlistedFiles`, além
// dos 2 já cobertos pelo contrato (`pacoteTizen.fundacao-visual.contract.
// test.mjs`).
import { describe, expect, it } from 'vitest'
import { findUnlistedFiles } from './tizenFiles.mjs'

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
