import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { screenMatrix } from './screenFixtures.mjs'

export function statistics(values) {
  if (!values.length || values.some(v => !Number.isFinite(v) || v < 0)) throw new Error('amostras inválidas')
  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  return { n: sorted.length, median, min: sorted[0], max: sorted.at(-1),
    mad: statisticsMedian(sorted.map(v => Math.abs(v - median))) }
}
function statisticsMedian(values) { const s = [...values].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }

// Quantil pelo posto mais próximo (ceil(p*N)), explicitamente igual nos dois lados.
export function quantile(values, p = 0.95) {
  statistics(values)
  if (!(p > 0 && p <= 1)) throw new Error('quantil inválido')
  return [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1]
}

export function comparison(before, after, minimumGain = 0, maximumRegression) {
  const baseline = statistics(before), candidate = statistics(after)
  if (baseline.median === 0) return { baseline, candidate, gain: null,
    pass: minimumGain === 0 && candidate.median === 0, reason: 'baseline zero; redução percentual indefinida' }
  const gain = 1 - candidate.median / baseline.median
  return { baseline, candidate, gain, pass: maximumRegression !== undefined ? -gain <= maximumRegression + 1e-9 : gain + 1e-9 >= minimumGain }
}

export function validateArtifact(artifact) {
  const { manifest, samples } = artifact
  if (manifest.schema !== 1 || manifest.suite !== 'full' || manifest.repeat < 7) throw new Error('baseline/candidata exige suite full e sete repetições')
  if (!manifest.fingerprint?.app || !manifest.fingerprint?.harness) throw new Error('fingerprint ausente')
  if (!Array.isArray(manifest.configurations) || manifest.configurations.length !== 10) throw new Error('matriz incompleta')
  if (JSON.stringify(manifest.configurations) !== JSON.stringify(screenMatrix())) throw new Error('fixture fora da matriz congelada')
  for (const config of manifest.configurations) {
    const group = samples.filter(s => s.configuration === config.id)
    if (group.length !== manifest.repeat || new Set(group.map(s => s.run)).size !== group.length || group.some(s => s.errors?.length)) throw new Error('execução ausente, duplicada ou com erro')
    if (group.some(s => !Number.isInteger(s.run) || s.run < 1 || s.run > manifest.repeat)) throw new Error('número de execução inválido')
    const required = ['home-cold', 'movies-after-home', 'series-after-home', 'home-return', 'movies-index-cold',
      ...({ screens: ['categories-three', 'movie-category-cold'], category: ['category-first'],
        episodes: ['series-summary-first', 'series-summary-reentry', 'series-summary-delta'], cycles: [] }[config.kind])]
    if (group.some(s => required.some(name => !s.steps?.some(step => step.name === name)))) throw new Error('etapa obrigatória ausente')
    if (config.id === 'screens-local-100-images' && group.some(s =>
      JSON.stringify(s.startup?.map(v => `${v.lists}:${v.cache}`).sort()) !== JSON.stringify(['false:cold', 'false:warm', 'true:cold', 'true:warm']))) throw new Error('abertura fria/quente incompleta')
    if (config.id === 'screens-local-100-images' && group.some(s =>
      !Number.isFinite(s.firstInteraction?.usefulMs) || s.firstInteraction.usefulMs < 0 ||
      ['normal-first-home', 'normal-first-movies', 'normal-first-series', 'normal-first-category'].some(name => {
        const stage = s.normalNavigation?.find(v => v.name === name)
        return !Number.isFinite(stage?.usefulMs) || stage.usefulMs < 0 || !stage.equivalent
      }))) throw new Error('primeira interação/navegação normal incompleta')
  }
  if (samples.length !== manifest.repeat * manifest.configurations.length) throw new Error('amostras inesperadas')
}

export function compareArtifacts(baseline, candidate) {
  validateArtifact(baseline); validateArtifact(candidate)
  if (baseline.manifest.mode !== 'baseline' || candidate.manifest.mode !== 'candidate') throw new Error('modos incompatíveis')
  for (const key of ['environment', 'cpu', 'clock', 'configurations']) {
    if (JSON.stringify(baseline.manifest[key]) !== JSON.stringify(candidate.manifest[key])) throw new Error('ambiente/fixture incompatível')
  }
  if (baseline.manifest.fingerprint.harness !== candidate.manifest.fingerprint.harness) throw new Error('instrumentação mudou; recapturar baseline')
  const rows = []
  const add = (criterion, configuration, metric, detail, pass) => rows.push({ criterion, configuration, metric, pass, ...detail })
  const group = (artifact, id) => artifact.samples.filter(s => s.configuration === id).sort((a, b) => a.run - b.run)
  const step = (sample, name) => { const value = sample.steps.find(s => s.name === name); if (!value) throw new Error('etapa ausente'); return value }
  const pair = (criterion, id, metric, before, after, gain = 0, regression) => {
    const result = comparison(before, after, gain, regression)
    add(criterion, id, metric, result, result.pass)
  }
  for (const config of baseline.manifest.configurations) {
    const before = group(baseline, config.id), after = group(candidate, config.id)
    const same = before.every((sample, i) => sample.steps.every(s => JSON.stringify(s.equivalent) === JSON.stringify(step(after[i], s.name).equivalent)))
    add('SC-001', config.id, 'cards/ordem/foco/rolagem observados', {}, same)
    if (config.kind === 'screens') {
      for (const name of ['movies-after-home', 'movies-index-cold']) {
        pair('SC-002', config.id, `${name}:conteúdo/foco`, before.map(s => step(s, name).usefulMs), after.map(s => step(s, name).usefulMs), 0.3)
        pair('SC-003', config.id, `${name}:maior tarefa`, before.map(s => step(s, name).maxLongTaskMs), after.map(s => step(s, name).maxLongTaskMs), 0.5)
      }
      for (const name of ['home-cold', 'series-after-home', 'home-return', 'movie-category-cold']) pair('SC-002', config.id, `${name}:regressão`, before.map(s => step(s, name).usefulMs), after.map(s => step(s, name).usefulMs), 0, 0.1)
      pair('SC-003', config.id, 'seleção pura', before.map(s => s.selection.ms), after.map(s => s.selection.ms), 0.5)
      add('SC-001', config.id, 'ids/contador da seleção', {}, before.every((s, i) => JSON.stringify(s.selection.ids) === JSON.stringify(after[i].selection.ids) && s.selection.eligibleCount === after[i].selection.eligibleCount))
      pair('SC-004', config.id, 'soma tarefas nos eventos reais', before.map(s => step(s, 'categories-three').longTaskTotalMs), after.map(s => step(s, 'categories-three').longTaskTotalMs), 0.5)
      const directions = samples => samples.flatMap(s => step(s, 'categories-three').directionSamplesMs)
      if ([...before, ...after].some(s => step(s, 'categories-three').directionSamplesMs.length !== 12)) throw new Error('comandos direcionais incompletos')
      pair('SC-004', config.id, 'p95 direção (proxy de dois quadros)', [quantile(directions(before))], [quantile(directions(after))], 0, 0.1)
      add('SC-004', config.id, 'escopo/propagação', {}, after.every(s => {
        const e = step(s, 'categories-three')
        return e.completions.length === 3 && e.observationAfterLastMs >= 2000 && e.scheduledIntervalMs === 1000 && e.propagationProxyMs !== null && e.propagationProxyMs <= 2000 && !e.reads.some(r => r.items > 0 && (r.kind === 'series' || r.source === 'b' || r.source === 'c'))
      }))
      pair('SC-005', config.id, 'heap retido', before.map(s => s.afterScreens.retainedBytes), after.map(s => s.afterScreens.retainedBytes), 0.2)
      add('SC-005', config.id, 'Worker registrado separadamente', {}, after.every(s => s.workers?.created === 0 || Number.isFinite(s.workers?.heapBytes)))
      const pages = sample => JSON.stringify([...new Set(sample.api.map(c => `${c.family}:${c.kind}:${c.page}`))].sort())
      add('SC-009', config.id, 'chamadas/universo de páginas', {}, after.every((s, i) => s.api.length <= before[i].api.length && pages(s) === pages(before[i])))
    }
    if (config.kind === 'cycles') {
      for (const key of ['navigationCycles', 'listCycles']) add('SC-006', config.id, key, {}, after.every(s => s[key]?.length === 10 && s[key].slice(2).every(c => c.retainedBytes <= s[key][1].retainedBytes * 1.1)))
    }
    if (config.kind === 'category') {
      pair('SC-007', config.id, 'primeiro recorte', before.map(s => step(s, 'category-first').usefulMs), after.map(s => step(s, 'category-first').usefulMs), 0.3)
      pair('SC-007', config.id, 'heap temporário amostrado', before.map(s => s.temporaryHeapBytes), after.map(s => s.temporaryHeapBytes), 0.3)
      add('SC-007', config.id, 'leitura limitada/fim/busca/RETURN', {}, after.every((s, i) => step(s, 'category-first').cacheAtEnd?.categoryItems < 30000 && !step(s, 'category-first').reads.some(r => r.items >= 30000) && ['lastItem', 'searchLastItem', 'sorted', 'returned', 'detailBefore', 'detailReturned'].every(key => JSON.stringify(s[key]) === JSON.stringify(before[i][key])) && s.detailBefore !== undefined && JSON.stringify(s.detailBefore) === JSON.stringify(s.detailReturned)))
    }
    if (config.kind === 'episodes') {
      add('SC-010', config.id, 'resumo e varredura de episódios', {}, after.every((s, i) => {
        const reentry = step(s, 'series-summary-reentry'), delta = step(s, 'series-summary-delta')
        const episodes = x => x.reads.filter(r => r.store === 'channels' && r.kind === 'episode').reduce((n, r) => n + r.records, 0)
        return episodes(reentry) === 0 && episodes(delta) <= 100 && JSON.stringify(s.summariesBefore) === JSON.stringify(before[i].summariesBefore) && JSON.stringify(s.summariesAfter) === JSON.stringify(before[i].summariesAfter)
      }))
    }
    if (before[0].startup.length) {
      pair('SC-011', config.id, 'primeiro comando normal', before.map(s => s.firstInteraction.usefulMs), after.map(s => s.firstInteraction.usefulMs), 0, 0.1)
      for (const normal of before[0].normalNavigation) {
        const stages = samples => samples.map(s => s.normalNavigation.find(v => v.name === normal.name))
        pair('SC-011', config.id, normal.name, stages(before).map(s => s.usefulMs), stages(after).map(s => s.usefulMs), 0, 0.1)
        add('SC-001', config.id, normal.name, {}, stages(before).every((s, i) => JSON.stringify(s.equivalent) === JSON.stringify(stages(after)[i].equivalent)))
      }
      for (const start of before[0].startup) {
      const values = (samples, field) => samples.map(s => s.startup.find(v => v.lists === start.lists && v.cache === start.cache)[field])
      pair('SC-011', config.id, `abertura:${start.lists}:${start.cache}`, values(before, 'usefulMs'), values(after, 'usefulMs'), 0.3)
      pair('SC-012', config.id, `JS:${start.lists}:${start.cache}`, values(before, 'jsBytes'), values(after, 'jsBytes'), 0.25)
      }
    }
  }
  const checks = candidate.manifest.checks ?? {}
  add('SC-008', 'gates', 'falhas/cancelamento/cache/segredos', {}, checks.contracts === true && checks.faults === true)
  add('SC-009', 'gates', 'leases/cache/contexto obsoleto', {}, checks.sharedQueries === true)
  add('SC-011', 'gates', 'primeiro acesso/primeiro comando sem regressão >10%', {}, checks.firstInteraction === true)
  add('SC-012', 'gates', 'pacote/rotas locais', {}, checks.tizen === true && checks.offlineRoutes === true)
  add('SC-013', 'gates', 'checks/quickstart/relatório', {}, ['lint', 'types', 'tests', 'build', 'e2e', 'manual', 'secrets'].every(key => checks[key] === true))
  return { pass: rows.every(row => row.pass), rows }
}

export async function loadArtifact(directory) {
  return { manifest: JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')), samples: JSON.parse(await readFile(path.join(directory, 'samples.json'), 'utf8')) }
}

async function main() {
  const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1]
  if (!args.includes('--baseline') || !args.includes('--candidate')) throw new Error('informe --baseline e --candidate')
  const result = compareArtifacts(await loadArtifact(value('--baseline')), await loadArtifact(value('--candidate')))
  const report = ['# Comparação 065', '', 'Ganho = 1 − mediana candidata / mediana baseline. MAD = mediana do desvio absoluto.', '',
    '| Critério | Configuração/métrica | Baseline | Candidata | Ganho | Resultado |', '| --- | --- | --- | --- | --- | --- |',
    ...result.rows.map(r => `| ${r.criterion} | ${r.configuration}/${r.metric} | ${r.baseline?.median ?? '—'} | ${r.candidate?.median ?? '—'} | ${r.gain == null ? '—' : (r.gain * 100).toFixed(1) + '%'} | ${r.pass ? 'PASS' : 'FAIL'} |`), '',
    'JSON contém n/min/max/MAD e razões para denominador zero. Ausência de gates de verificação não é aprovação.'].join('\n')
  await writeFile(path.join(value('--candidate'), 'comparison.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
  await writeFile(path.join(value('--candidate'), 'comparison.md'), report, { flag: 'wx' })
  console.log(`comparação: ${result.pass ? 'PASS' : 'FAIL'} (${result.rows.length} verificações)`)
  if (!result.pass) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(() => { console.error('comparação inválida; confira artefatos e compatibilidade'); process.exitCode = 1 })
