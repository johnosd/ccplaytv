// Contrato da feature 063 (US2, 49b) — catraca de fronteiras e tamanho.
// Regras: `sdd/specs/063-codigo-saudavel-benchmark/logic/catraca-arquitetura.md`.
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkArchitecture, loadBaseline, loadSourceFiles, MAX_LINES } from './architecture.mjs'

const lines = (n) => 'x\n'.repeat(n)
const rulesOf = (result) =>
  result.violations.map((v) => (v.target ? `${v.rule} ${v.file} -> ${v.target}` : `${v.rule} ${v.file}`)).sort()

describe('architecture — catraca da feature 063', () => {
  it('fronteiras: import novo proibido reprova em todas as formas; o herdado passa; catalog→player não tem exceção (FR-007..FR-010, FR-015)', () => {
    const files = [
      { path: 'features/home/Home.tsx', source: "import { Card } from '../vod/Card'\nimport type { T } from '../shell/types'\n" },
      { path: 'features/vod/Card.tsx', source: '' },
      { path: 'features/shell/types.ts', source: '' },
      { path: 'features/vod/Grid.tsx', source: "import { Card } from './Card'\nimport { x } from '../../lib/catalog/a'\n" },
      { path: 'features/live/Live.tsx', source: "export { Card } from '../vod/Card'\nconst m = () => import('../home/Home')\n" },
      { path: 'lib/catalog/a.ts', source: "import { p } from '../player/p'\nimport { Card } from '../../features/vod/Card'\n" },
      { path: 'lib/player/p.ts', source: "import { a } from '../catalog/a'\nimport React from 'react'\n" },
      { path: 'lib/epg/e.ts', source: "import { B } from '../../components/B'\n" },
      { path: 'components/B.tsx', source: "import { Card } from '../features/vod/Card'\n" },
      { path: 'components/C.tsx', source: "import { Card } from '../features/vod/Card'\n" },
    ]
    const baseline = {
      imports: {
        'features/home/Home.tsx': ['features/vod/Card.tsx'],
        'components/B.tsx': ['features/vod/Card.tsx'],
        // Herdar catalog→player é proibido: mesmo listado, reprova.
        'lib/catalog/a.ts': ['lib/player/p.ts'],
      },
      maxLines: {},
    }

    expect(rulesOf(checkArchitecture(files, baseline))).toEqual(
      [
        'catalog-to-player lib/catalog/a.ts -> lib/player/p.ts',
        'components-to-features components/C.tsx -> features/vod/Card.tsx',
        'feature-to-feature features/home/Home.tsx -> features/shell/types.ts',
        'feature-to-feature features/live/Live.tsx -> features/home/Home.tsx',
        'feature-to-feature features/live/Live.tsx -> features/vod/Card.tsx',
        'lib-to-ui lib/catalog/a.ts -> features/vod/Card.tsx',
        'lib-to-ui lib/epg/e.ts -> components/B.tsx',
      ].sort(),
    )
  })

  it('tamanho: arquivo novo acima do limite e herdado acima do teto reprovam; obsoletos são apontados; teste e fixture ficam de fora (FR-011, FR-013, FR-014)', () => {
    const files = [
      { path: 'lib/novo.ts', source: lines(MAX_LINES + 1) },
      { path: 'lib/no-limite.ts', source: lines(MAX_LINES) },
      { path: 'lib/grande.ts', source: lines(501) },
      { path: 'lib/estavel.ts', source: lines(400) },
      { path: 'lib/encolheu.ts', source: lines(350) },
      { path: 'lib/cabe-agora.ts', source: lines(120) },
      { path: 'lib/x.test.ts', source: lines(900) + "import { Card } from '../features/vod/Card'\n" },
      { path: 'lib/catalog/m.fixtures.ts', source: lines(900) },
      { path: 'testing/helper.ts', source: lines(900) },
      { path: 'features/a/A.tsx', source: "import { B } from '../b/B'\n" },
      { path: 'features/b/B.tsx', source: '' },
    ]
    const baseline = {
      imports: { 'features/a/A.tsx': ['features/b/B.tsx'], 'features/a/Sumiu.tsx': ['features/b/B.tsx'] },
      maxLines: { 'lib/grande.ts': 500, 'lib/estavel.ts': 400, 'lib/encolheu.ts': 380, 'lib/cabe-agora.ts': 310 },
    }

    const result = checkArchitecture(files, baseline)

    expect(rulesOf(result)).toEqual(['max-lines lib/grande.ts', 'max-lines lib/novo.ts'])
    expect(result.violations.find((v) => v.file === 'lib/grande.ts')).toMatchObject({ lines: 501, limit: 500 })
    expect(result.violations.find((v) => v.file === 'lib/novo.ts')).toMatchObject({ lines: MAX_LINES + 1, limit: MAX_LINES })
    expect(result.obsolete.map((o) => `${o.kind} ${o.file} ${o.target ?? ''}`.trim()).sort()).toEqual(
      ['import features/a/Sumiu.tsx features/b/B.tsx', 'max-lines lib/cabe-agora.ts', 'max-lines lib/encolheu.ts'].sort(),
    )
  })

  it('o código real, com a lista de exceções versionada, passa sem violação nem exceção catalog→player (SC-004, SC-005, FR-016)', () => {
    const root = process.cwd()
    const baseline = loadBaseline(path.join(root, 'scripts/architecture-baseline.json'))
    const result = checkArchitecture(loadSourceFiles(path.join(root, 'src')), baseline)

    expect(result.violations).toEqual([])
    const herdadoCatalogPlayer = Object.entries(baseline.imports).filter(
      ([file, targets]) => file.startsWith('lib/catalog/') && targets.some((t) => t.startsWith('lib/player/')),
    )
    expect(herdadoCatalogPlayer).toEqual([])
    expect(baseline.maxLines['lib/catalog/catalogRepository.ts']).toBeUndefined()
  })
})
