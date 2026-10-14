import { describe, it, expect } from 'vitest'
import { statistics, quantile, comparison, validateArtifact, compareArtifacts } from './compare-screen-perf.mjs'
import { screenMatrix } from './screenFixtures.mjs'

function artifact(mode = 'baseline') {
  const configurations = screenMatrix()
  const equivalent = { cards: [{ title: 'Filme sintético', meta: '2026', rank: '' }], focus: 'Início', scroll: [] }
  return { manifest: { schema: 1, mode, suite: 'full', repeat: 7, cpu: 4, clock: 123,
    environment: { browser: 'same', viewport: '1920x1080' }, configurations,
    fingerprint: { app: mode, harness: 'same' } },
  samples: configurations.flatMap(c => Array.from({ length: 7 }, (_, n) => ({
    configuration: c.id, run: n + 1, errors: [], firstInteraction: { usefulMs: 100 },
    normalNavigation: ['normal-first-home', 'normal-first-movies', 'normal-first-series', 'normal-first-category'].map(name => ({ name, usefulMs: 100, equivalent })),
    startup: c.id === 'screens-local-100-images' ? [false, true].flatMap(lists => ['cold', 'warm'].map(cache => ({ lists, cache, usefulMs: 100, jsBytes: 100 }))) : [], api: [],
    steps: ['home-cold', 'movies-after-home', 'movies-index-cold', 'series-after-home', 'home-return',
      'movie-category-cold', 'categories-three', 'category-first', 'series-summary-first', 'series-summary-reentry', 'series-summary-delta'].map(name => ({
      name, equivalent, usefulMs: 100, maxLongTaskMs: 100, longTaskTotalMs: 200,
      reads: [], directionSamplesMs: Array(12).fill(20), completions: [{}, {}, {}], propagationProxyMs: 1000,
    })), selection: { ids: [123], eligibleCount: 5, ms: 100 }, afterScreens: { retainedBytes: 1000 },
    navigationCycles: Array.from({ length: 10 }, (_, i) => ({ cycle: i + 1, retainedBytes: 1000 })),
    listCycles: Array.from({ length: 10 }, (_, i) => ({ cycle: i + 1, retainedBytes: 1000 })),
    temporaryHeapBytes: 1000, lastItem: equivalent, searchLastItem: equivalent, sorted: equivalent, returned: equivalent,
    summariesBefore: [{ seriesId: '1', watched: 50 }], summariesAfter: [{ seriesId: '1', watched: 51 }],
  }))) }
}

describe('comparação reproduzível 065', () => {
  it('usa medianas, dispersão absoluta e p95 pelo posto, sem chamar p97.5 de p95', () => {
    expect(statistics([1, 2, 3, 10, 20])).toEqual({ n: 5, median: 3, min: 1, max: 20, mad: 2 })
    expect(statistics([4, 2])).toMatchObject({ median: 3, mad: 1 })
    expect(quantile(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(95)
    expect(() => statistics([1, NaN])).toThrow()
    expect(() => statistics([])).toThrow()
  })
  it('calcula redução e regressão com limite inclusivo', () => {
    const result = comparison([100, 110, 90], [70, 80, 60], 0.3)
    expect(result.gain).toBeCloseTo(0.3)
    expect(result.pass).toBe(true)
    expect(comparison([100], [110], 0, 0.1).pass).toBe(true)
    expect(comparison([100], [111], 0, 0.1).pass).toBe(false)
  })
  it('não inventa ganho percentual para baseline zero', () => {
    expect(comparison([0], [0], 0.5)).toMatchObject({ gain: null, pass: false })
    expect(comparison([0], [0], 0, 0.1).pass).toBe(true)
    expect(comparison([0], [1], 0, 0.1).pass).toBe(false)
  })
  it('recusa smoke, menos de sete runs, amostra ausente/duplicada e erro de página', () => {
    for (const change of [a => { a.manifest.suite = 'smoke' }, a => { a.manifest.repeat = 6 },
      a => { a.samples.pop() }, a => { a.samples[1].run = 1 }, a => { a.samples[0].errors = ['Error'] },
      a => { a.samples.find(s => s.startup.length).normalNavigation.pop() },
      a => { a.samples.find(s => s.startup.length).firstInteraction.usefulMs = null }]) {
      const a = artifact(); change(a); expect(() => validateArtifact(a)).toThrow()
    }
    expect(() => validateArtifact(artifact())).not.toThrow()
  })
  it('recusa alteração de ambiente, fixture, CPU e instrumentação', () => {
    for (const change of [a => { a.manifest.cpu = 6 }, a => { a.manifest.environment.browser = 'different' },
      a => { a.manifest.configurations[0].fixture.movies = 10 }, a => { a.manifest.fingerprint.harness = 'different' }]) {
      const candidate = artifact('candidate'); change(candidate)
      expect(() => compareArtifacts(artifact(), candidate)).toThrow()
    }
  })
  it('ganho numérico não aprova perda de conteúdo, p95 ausente ou falta de gates', () => {
    const before = artifact(), after = artifact('candidate')
    after.samples[0].steps[0].equivalent = { cards: [], focus: 'Início', scroll: [] }
    const result = compareArtifacts(before, after)
    expect(result.pass).toBe(false)
    expect(result.rows.find(r => r.criterion === 'SC-001').pass).toBe(false)
    expect(result.rows.filter(r => r.configuration === 'gates').every(r => !r.pass)).toBe(true)
    after.samples[0].steps.find(s => s.name === 'categories-three').directionSamplesMs.pop()
    expect(() => compareArtifacts(before, after)).toThrow()
  })
  it('compara identidade das páginas externas, não apenas quantidade', () => {
    const before = artifact(), after = artifact('candidate')
    before.samples[0].api = [{ family: 'discovery', kind: 'movie', page: 1 }]
    after.samples[0].api = [{ family: 'discovery', kind: 'movie', page: 2 }]
    const result = compareArtifacts(before, after)
    expect(result.rows.find(r => r.criterion === 'SC-009' && r.configuration === before.samples[0].configuration).pass).toBe(false)
  })
})
