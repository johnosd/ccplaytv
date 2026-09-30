// Contrato da feature 021 (fundação visual DS V14) — fontes locais e pacote
// Tizen. Fica em `scripts/` (não em `src/`) porque lê arquivos do disco com
// `node:fs`, e `tsconfig.app.json` não tem tipos de Node.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findUnlistedFiles } from './tizenFiles.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const TV_WEB = path.resolve(here, '..')
const REPO = path.resolve(TV_WEB, '..')

// Subconjunto latino, nomes do Fontsource v5; pesos = os que o app já
// carrega hoje (FR-004, D-002 do plan.md).
const FONT_FILES = [
  'poppins-latin-600-normal.woff2',
  'poppins-latin-700-normal.woff2',
  'poppins-latin-800-normal.woff2',
  'inter-latin-400-normal.woff2',
  'inter-latin-500-normal.woff2',
  'inter-latin-600-normal.woff2',
  'inter-latin-700-normal.woff2',
  'inter-latin-800-normal.woff2',
]

function allCssUnder(dir) {
  let text = ''
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) text += allCssUnder(full)
    else if (entry.name.endsWith('.css')) text += `\n${readFileSync(full, 'utf8')}`
  }
  return text
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('021 — fontes locais e pacote Tizen', () => {
  // US1/AC2 · FR-001, FR-002, FR-026
  it('não referencia serviço de fontes externo, declara pt-BR e aponta @font-face para os 8 arquivos locais', () => {
    const html = readFileSync(path.join(TV_WEB, 'index.html'), 'utf8')
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    expect(html).toMatch(/<html[^>]*\blang="pt-BR"/)

    const css = allCssUnder(path.join(TV_WEB, 'src'))
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    for (const file of FONT_FILES) {
      expect(existsSync(path.join(TV_WEB, 'src', 'assets', 'fonts', file)), `arquivo ${file}`).toBe(true)
      expect(css, `@font-face para ${file}`).toMatch(new RegExp(`url\\([^)]*${escapeRegExp(file)}`))
    }
  })

  // FR-005 — arquivo emitido fora de `files:` só falha na TV (D-009)
  it('findUnlistedFiles acusa arquivo do build fora da lista (inclusive caminho com \\) e a lista real cobre as fontes', () => {
    const yaml = [
      'files:',
      '  - index.html',
      '  - assets/index.js',
      '  # comentário no meio da lista',
      '  - assets/importWorker.js',
      '',
      'excludes:',
      '  - assets/excluido.js',
    ].join('\n')

    expect(findUnlistedFiles(['index.html', 'assets/index.js', 'assets/importWorker.js'], yaml)).toEqual([])
    expect(
      findUnlistedFiles(
        ['index.html', 'assets\\inter-latin-400-normal.woff2', 'assets/excluido.js', 'assets/index.js'],
        yaml,
      ),
    ).toEqual(['assets/inter-latin-400-normal.woff2', 'assets/excluido.js'])

    const realYaml = readFileSync(path.join(REPO, 'CCPlayTv', 'tizen_web_project.yaml'), 'utf8')
    expect(findUnlistedFiles(FONT_FILES.map((f) => `assets/${f}`), realYaml)).toEqual([])
  })
})
