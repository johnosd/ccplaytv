import { chromium } from 'playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fixtureRows, fixtureSpec, screenMatrix, CLOCK } from './screenFixtures.mjs'
import { createRuntime, fingerprints, root } from './screenRuntime.mjs'
import { runScenario } from './screenScenarios.mjs'
import { statistics } from './compare-screen-perf.mjs'

const args = process.argv.slice(2)
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback
const mode = value('--mode', 'baseline'), suite = value('--suite', 'full')
const repeat = Number(value('--repeat', suite === 'smoke' ? '1' : '7')), cpu = Number(value('--cpu', '4'))
if (!['baseline', 'candidate'].includes(mode) || !['full', 'smoke'].includes(suite) || !Number.isInteger(repeat) || repeat < (suite === 'full' ? 7 : 1) || !(cpu > 0)) throw new Error('opções inválidas')
const output = path.resolve(root, value('--output', `bench-results/screen-perf-065/${mode}/${new Date().toISOString().replaceAll(/[:.]/g, '-')}`))
const allowed = path.resolve(root, 'bench-results/screen-perf-065') + path.sep
if (!output.startsWith(allowed)) throw new Error('saída deve ficar em bench-results/screen-perf-065')
let configurations = suite === 'full' ? screenMatrix() : screenMatrix().slice(0, 1)
if (args.includes('--only')) {
  if (suite !== 'smoke') throw new Error('--only é diagnóstico, exige suite smoke')
  configurations = screenMatrix().filter(c => c.id === value('--only'))
  if (!configurations.length) throw new Error('configuração desconhecida')
}
// Nenhum processo paralelo ou diretório reutilizado pode gerar uma baseline.
await mkdir(path.dirname(output), { recursive: true })
await mkdir(output)
const lockFile = path.join(root, 'bench-results/screen-perf-065/.running')
let lock
let runtime, browser
const samples = []
try {
  lock = await writeFile(lockFile, String(process.pid), { flag: 'wx' }).then(() => true)
  const fingerprint = await fingerprints()
  runtime = await createRuntime()
  browser = await chromium.launch({ headless: true })
  const checksInput = args.includes('--checks') ? JSON.parse(await readFile(value('--checks'), 'utf8')) : {}
  const checks = Object.fromEntries(['contracts', 'faults', 'sharedQueries', 'firstInteraction', 'tizen', 'offlineRoutes', 'lint', 'types', 'tests', 'build', 'e2e', 'manual', 'secrets'].map(key => [key, checksInput[key] === true]))
  const manifest = { schema: 1, mode, suite, repeat, cpu, clock: CLOCK,
    createdAt: new Date().toISOString(), fingerprint, configurations, checks, builds: runtime.builds,
    environment: { browser: browser.version(), os: `${os.platform()} ${os.release()} ${os.arch()}`, cpuModel: os.cpus()[0]?.model,
      memoryBytes: os.totalmem(), viewport: '1920x1080', timezone: 'America/Sao_Paulo', locale: 'pt-BR',
      cachePolicy: 'context novo por amostra; warm = reentrada no mesmo contexto; HTTP cache desativado pelo routing',
      heapPolicy: 'estabilização de consultas + 300ms + GC explícito CDP', network: 'loopback; TMDB simulado 100ms; demais hosts bloqueados' },
    limits: ['DOM/dois quadros são proxy de pintura/foco', 'p95 é distribuição de keydown→dois quadros, não tecla física',
      'heap principal não inclui RAM/GPU/arte decodificada; Worker positivo tem heap não aferido',
      'pico temporário amostrado a cada 100ms', 'seedRpcMs é preparo a CPU1, não importação; telas/conversão real permanecem a CPU configurada',
      'entrada control agrega adapter; tempos/bytes de abertura vêm da entrada normal', 'SVGs locais procedurais, sem imagens reais do provedor'] }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' })
  for (const config of configurations) {
    const rows = fixtureRows(fixtureSpec(config.fixture))
    for (let run = 1; run <= repeat; run++) {
      console.log(`medindo ${config.id} ${run}/${repeat}`)
      samples.push(await runScenario(browser, runtime, config, rows, cpu, run))
      await writeFile(path.join(output, 'samples.partial.json'), JSON.stringify(samples, null, 2))
    }
  }
  await writeFile(path.join(output, 'samples.json'), JSON.stringify(samples, null, 2), { flag: 'wx' })
  const lines = ['# Baseline/candidata 065', '', `Modo: ${mode}; suite: ${suite}; ${repeat} amostras independentes por configuração; CPU ${cpu}×.`,
    `Revisão: ${fingerprint.revision}; app SHA256: ${fingerprint.app}; harness SHA256: ${fingerprint.harness}.`, '',
    '| Configuração | Métrica | N | Mediana | Mínimo | Máximo | MAD |', '| --- | --- | --- | --- | --- | --- | --- |']
  for (const config of configurations) {
    const group = samples.filter(s => s.configuration === config.id)
    const metric = (label, values, divisor = 1) => {
      const s = statistics(values.map(value => value / divisor))
      lines.push(`| ${config.id} | ${label} | ${s.n} | ${s.median.toFixed(2)} | ${s.min.toFixed(2)} | ${s.max.toFixed(2)} | ${s.mad.toFixed(2)} |`)
    }
    for (const stage of group[0].steps) if (stage.usefulMs !== null) {
      const summary = statistics(group.map(s => s.steps.find(t => t.name === stage.name).usefulMs))
      lines.push(`| ${config.id} | ${stage.name} (ms) | ${summary.n} | ${summary.median.toFixed(2)} | ${summary.min.toFixed(2)} | ${summary.max.toFixed(2)} | ${summary.mad.toFixed(2)} |`)
    }
    const retained = statistics(group.map(s => s.afterScreens.retainedBytes))
    lines.push(`| ${config.id} | heap H→F→S (MiB) | ${retained.n} | ${(retained.median / 1048576).toFixed(2)} | ${(retained.min / 1048576).toFixed(2)} | ${(retained.max / 1048576).toFixed(2)} | ${(retained.mad / 1048576).toFixed(2)} |`)
    metric('preparo seed CPU1 (ms)', group.map(s => s.preparation.seedRpcMs))
    metric('armazenamento adicional do roteiro (MiB)', group.map(s => Math.max(0, s.storageAfter.usageBytes - s.storageBefore.usageBytes)), 1048576)
    metric('seleção pura (ms)', group.map(s => s.selection.ms))
    metric('Workers criados (contagem)', group.map(s => s.workers.created))
    metric('chamadas simuladas (contagem)', group.map(s => s.api.length))
    for (const start of group[0].startup) {
      const starts = group.map(s => s.startup.find(v => v.lists === start.lists && v.cache === start.cache))
      metric(`abertura lista=${start.lists}/${start.cache} (ms)`, starts.map(s => s.usefulMs))
      metric(`JS abertura lista=${start.lists}/${start.cache} (bytes)`, starts.map(s => s.jsBytes))
    }
    if (group[0].startup.length) {
      metric('primeiro comando normal (ms)', group.map(s => s.firstInteraction.usefulMs))
      for (const stage of group[0].normalNavigation) metric(`${stage.name} (ms)`, group.map(s => s.normalNavigation.find(v => v.name === stage.name).usefulMs))
    }
    if (config.kind === 'category') metric('pico temporário amostrado (MiB)', group.map(s => s.temporaryHeapBytes), 1048576)
    if (config.kind === 'episodes') for (const name of ['series-summary-first', 'series-summary-reentry', 'series-summary-delta']) {
      metric(`${name}: episódios lidos`, group.map(s => s.steps.find(step => step.name === name).reads.filter(r => r.kind === 'episode').reduce((n, r) => n + r.records, 0)))
    }
  }
  lines.push('', '## Custos e limitações', '', ...manifest.limits.map(limit => `- ${limit}`), '',
    'samples.json publica preparo, armazenamento, leituras, tarefas longas, heap/ciclos, seleção/ids, resumos, foco/rolagem, chamadas e abertura/bytes.',
    'Baseline registra comportamento anterior, inclusive falhas conhecidas: nenhum percentual ou critério é aprovado por este relatório. Candidata exige comparação + gates externos em --checks.',
    'p95: posto mais próximo ceil(0,95 × N), com 12 comandos por amostra (84 em sete execuções).',
    'Fixture canônica já está em categoryBlocks; não mede importação/conversão legada. Derivações novas na candidata permanecem dentro do roteiro desde home-cold, sem preparo de projeções. category-first é primeira entrada na grade após H→F→S e índice frio, não leitura de instalação vazia.',
    'Índice frio remove somente o cache público catalog-search-index/movie; os demais caches do roteiro permanecem. Workers têm heap zero quando nenhum é criado; qualquer Worker positivo sem aferição separada impede aprovar a redução de memória no comparador.')
  await writeFile(path.join(output, 'report.md'), lines.join('\n'), { flag: 'wx' })
  console.log(`concluído: ${path.relative(root, output).replaceAll('\\', '/')} (${samples.length} amostras)`)
} catch (error) {
  const stage = /^[a-z-]+$/.test(error?.benchStage ?? '') ? error.benchStage : 'preparation-or-finalization'
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ status: 'incomplete', name: error?.name ?? 'Error', stage, samples: samples.length }), { flag: 'wx' }).catch(() => {})
  // Erros de navegador/fetch podem carregar URLs com chave: não propagar mensagem/stack.
  console.error(`benchmark incompleto (${error?.name ?? 'Error'}; ${stage}); não usar como baseline`)
  process.exitCode = 1
} finally {
  await browser?.close()
  await runtime?.close()
  if (lock) {
    const { unlink } = await import('node:fs/promises')
    await unlink(lockFile)
  }
}
