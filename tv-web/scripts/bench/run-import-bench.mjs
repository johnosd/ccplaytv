// Feature 063 (US3, item 35): runner do benchmark de importação.
//
//   node scripts/bench/run-import-bench.mjs [--formats xtream,m3u,xmltv] [--sizes 1000,10000,100000]
//                                           [--seed 1] [--cpu 1] [--device <slug>] [--app-url <url>] [--serve-only]
//   npm run bench:import -- <mesmas opções>
//
// Sobe um servidor de fontes FICTÍCIAS em 127.0.0.1, abre `bench.html` (do `npm run dev`) num contexto
// de navegador novo por modo e combinação, e grava o resultado em `bench-results/` (versionado). Não é
// gate: sai com 0 mesmo se ficou mais lento; só sai com outro código se o próprio runner quebrar.
// `--serve-only` não abre navegador: serve as fontes na LAN e recebe o resultado da página aberta na TV.
// Formato e regras: `sdd/specs/063-codigo-saudavel-benchmark/logic/benchmark.md` §4 e §5.
//
// Nada aqui lê o nome da máquina nem o usuário, e o resultado nunca leva URL (D-007, FR-021).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BENCH_CLOCK, BENCH_FORMATS, BENCH_SIZES, DEFAULT_SEED, generateFixture } from './fixtures.mjs'
import { compareResults, deviceSlug, findLeaks, findPrevious, formatComparison, resultFileName, slugify } from './report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '../..')
const RESULTS_DIR = path.join(ROOT, 'bench-results')
const COMBINATION_TIMEOUT_MS = 15 * 60_000

/** @returns {{ formats: string[], sizes: number[], seed: number, cpu: number, device?: string, appUrl: string, serveOnly: boolean }} */
export function parseArgs(argv, env = process.env) {
  const options = {
    formats: [...BENCH_FORMATS],
    sizes: [...BENCH_SIZES],
    seed: DEFAULT_SEED,
    cpu: 1,
    device: undefined,
    appUrl: env.CCPLAY_APP_URL ?? 'http://localhost:5173',
    serveOnly: false,
  }
  const valueOf = (index, flag) => {
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} pede um valor.`)
    return value
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--serve-only') options.serveOnly = true
    else if (flag === '--formats') options.formats = valueOf(i, flag).split(',').map((value) => value.trim())
    else if (flag === '--sizes') options.sizes = valueOf(i, flag).split(',').map((value) => Number(value.trim()))
    else if (flag === '--seed') options.seed = Number(valueOf(i, flag))
    else if (flag === '--cpu') options.cpu = Number(valueOf(i, flag))
    else if (flag === '--device') options.device = valueOf(i, flag)
    else if (flag === '--app-url') options.appUrl = valueOf(i, flag)
    else throw new Error(`Opção desconhecida: ${flag}`)
    if (['--formats', '--sizes', '--seed', '--cpu', '--device', '--app-url'].includes(flag)) i += 1
  }
  for (const format of options.formats) if (!BENCH_FORMATS.includes(format)) throw new Error(`Formato desconhecido: ${format}`)
  for (const size of options.sizes) if (!Number.isInteger(size) || size < 1) throw new Error(`Tamanho inválido: ${size}`)
  if (!Number.isInteger(options.seed)) throw new Error('--seed pede um inteiro.')
  if (!(options.cpu >= 1)) throw new Error('--cpu pede um número ≥ 1.')
  return options
}

/**
 * Servidor das fontes fictícias. Cada combinação vive sob `/f/<formato>-<tamanho>/`; `/plan` descreve
 * a rodada (para a página da TV) e `POST /result` recebe o resultado dela. O corpo de cada fixture só
 * é gerado quando alguém o pede, e só a última fica na memória.
 * @param {{ getFixture: (format: string, size: number) => ReturnType<typeof generateFixture>, plan?: object, onResult?: (body: any) => void }} handlers
 */
export function createBenchServer({ getFixture, plan = {}, onResult = () => {} }) {
  let cached
  const fixtureFor = (id) => {
    if (cached?.id === id) return cached
    const match = /^(xtream|m3u|xmltv)-(\d+)$/.exec(id)
    if (!match) return undefined
    cached = { id, fixture: getFixture(match[1], Number(match[2])), parsed: new Map() }
    return cached
  }
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-allow-private-network': 'true',
  }
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://bench.local')
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { ...cors, 'content-type': `${type}; charset=utf-8` })
      res.end(body)
    }
    if (req.method === 'OPTIONS') return send(204, '')
    if (url.pathname === '/plan') return send(200, JSON.stringify(plan))
    if (url.pathname === '/result' && req.method === 'POST') {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        try {
          onResult(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          send(204, '')
        } catch {
          send(400, '{}')
        }
      })
      return undefined
    }
    const route = /^\/f\/([\w-]+)\/(player_api\.php|playlist\.m3u|epg\.xml)$/.exec(url.pathname)
    const entry = route ? fixtureFor(route[1]) : undefined
    if (!route || !entry) return send(404, '{}')
    const { files } = entry.fixture
    if (route[2] === 'playlist.m3u') return send(200, files['playlist.m3u'] ?? '', 'audio/x-mpegurl')
    if (route[2] === 'epg.xml') return send(200, files['epg.xml'] ?? '', 'application/xml')
    const action = url.searchParams.get('action') ?? 'auth'
    const body = files[action]
    if (body === undefined) return send(200, '[]')
    const category = url.searchParams.get('category_id')
    if (!category) return send(200, body)
    if (!entry.parsed.has(action)) entry.parsed.set(action, JSON.parse(body))
    return send(200, JSON.stringify(entry.parsed.get(action).filter((item) => String(item.category_id) === category)))
  })
}

const startedOk = (mode) => mode && mode.status === 'ok'

/**
 * Junta os dois modos de uma combinação no formato do resultado (§5). `stages` e `realPath` ficam
 * separados e nunca são somados (R-005). Falha em qualquer modo marca a combinação como `failed`,
 * guardando o que o outro modo mediu.
 */
export function mergeCombination({ format, size }, expected, stages, real) {
  const merged = { format, size, status: 'ok' }
  if (startedOk(stages)) merged.stages = stages.stages
  if (startedOk(real)) {
    merged.realPath = real.realPath
    merged.storage = real.storage
  }
  const failed = [stages, real].find((mode) => !startedOk(mode))
  if (failed) {
    merged.status = 'failed'
    merged.failedStage = `${failed?.mode ?? 'modo'}:${failed?.failedStage ?? 'desconhecida'}`
    merged.errorName = failed?.errorName ?? 'Error'
  }
  const counted = [real, stages].filter(startedOk)
  if (counted.length > 0) {
    merged.counts = counted[0].counts
    merged.expected = expected
    merged.countsMatch = counted.every(
      (mode) => mode.counts.categories === expected.categories && mode.counts.items === expected.items,
    )
  }
  return merged
}

export function buildResult({ device, commit, dirty, appVersion, seed, cpuThrottle, results, date = new Date().toISOString() }) {
  return { schema: 1, date, device, commit, dirty, appVersion, seed, cpuThrottle, results }
}

function gitInfo() {
  try {
    const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return { commit: git('rev-parse', '--short', 'HEAD'), dirty: git('status', '--porcelain').length > 0 }
  } catch {
    return { commit: 'sem-commit', dirty: false }
  }
}

function readPreviousResults() {
  if (!existsSync(RESULTS_DIR)) return []
  return readdirSync(RESULTS_DIR)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(path.join(RESULTS_DIR, name), 'utf8'))]
      } catch {
        return []
      }
    })
}

/** Grava o resultado (recusando se achar URL) e imprime a variação contra o anterior do mesmo aparelho. */
function saveAndCompare(result) {
  if (findLeaks(result).length > 0) throw new Error('O resultado contém uma URL e não foi gravado.')
  const previous = findPrevious(readPreviousResults(), result)
  mkdirSync(RESULTS_DIR, { recursive: true })
  // O nome tem resolução de minuto: duas rodadas no mesmo minuto nunca se sobrescrevem.
  const base = resultFileName({ date: result.date, device: result.device.slug, commit: result.commit })
  let name = base
  for (let n = 2; existsSync(path.join(RESULTS_DIR, name)); n += 1) name = base.replace(/\.json$/, `-${n}.json`)
  writeFileSync(path.join(RESULTS_DIR, name), `${JSON.stringify(result, null, 2)}\n`)
  console.log(`\nResultado gravado em bench-results/${name}`)
  console.log(formatComparison(compareResults(previous, result)).join('\n'))
}

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ status: 'failed', failedStage: 'timeout', errorName: 'TimeoutError' }), ms).unref()),
  ])

async function runBrowserMode(browser, options, combo, mode, serverUrl, clock) {
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  try {
    const page = await context.newPage()
    page.on('pageerror', () => {})
    if (options.cpu > 1) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.cpu })
    }
    await page.goto(`${options.appUrl}/bench.html`)
    await page.waitForFunction(() => Boolean(window.__importBench), undefined, { timeout: 30_000 })
    const request = { ...combo, mode, fixturesUrl: `${serverUrl}/f/${combo.format}-${combo.size}`, clock }
    return await withTimeout(page.evaluate((payload) => window.__importBench.run(payload), request), COMBINATION_TIMEOUT_MS)
  } catch (error) {
    return { mode, status: 'failed', failedStage: 'page', errorName: error instanceof Error ? error.name : 'Error' }
  } finally {
    await context.close().catch(() => {})
  }
}

async function listen(server, host) {
  await new Promise((resolve) => server.listen(0, host, resolve))
  return server.address().port
}

async function runWithBrowser(options) {
  const probe = await fetch(`${options.appUrl}/bench.html`).catch(() => undefined)
  if (!probe?.ok) throw new Error('O dev server não respondeu em /bench.html. Rode `npm run dev` em outro terminal (ou use --app-url).')
  const { chromium } = await import('playwright')
  const server = createBenchServer({ getFixture: (format, size) => generateFixture({ format, size, seed: options.seed }) })
  const port = await listen(server, '127.0.0.1')
  const browser = await chromium.launch({ headless: true })
  try {
    const results = []
    for (const format of options.formats) {
      for (const size of options.sizes) {
        console.log(`${format} ${size}…`)
        const expected = generateFixture({ format, size, seed: options.seed }).expected
        const stages = await runBrowserMode(browser, options, { format, size }, 'stages', `http://127.0.0.1:${port}`, BENCH_CLOCK)
        const real = await runBrowserMode(browser, options, { format, size }, 'real', `http://127.0.0.1:${port}`, BENCH_CLOCK)
        results.push(mergeCombination({ format, size }, expected, stages, real))
      }
    }
    const cpus = os.cpus()
    const slug = options.device ? slugify(options.device) : deviceSlug({ platform: os.platform(), cpuModel: cpus[0]?.model })
    return {
      device: {
        slug,
        platform: os.platform(),
        cpu: cpus[0]?.model ?? 'não informado',
        cores: cpus.length,
        memoryGb: Math.round(os.totalmem() / 2 ** 30),
        browser: `chromium ${browser.version()}`,
        runtime: 'playwright',
      },
      results,
    }
  } finally {
    await browser.close().catch(() => {})
    server.close()
  }
}

function lanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) if (address.family === 'IPv4' && !address.internal) return address.address
  }
  return '127.0.0.1'
}

async function runServeOnly(options) {
  let deliver
  const delivered = new Promise((resolve) => {
    deliver = resolve
  })
  const plan = { combos: options.formats.flatMap((format) => options.sizes.map((size) => ({ format, size }))), clock: BENCH_CLOCK }
  const server = createBenchServer({ getFixture: (format, size) => generateFixture({ format, size, seed: options.seed }), plan, onResult: deliver })
  const port = await listen(server, '0.0.0.0')
  const ip = lanAddress()
  console.log('Abra no navegador da TV (o dev server precisa estar com `npm run dev -- --host`):')
  console.log(`  http://${ip}:5173/bench.html?fixtures=http://${ip}:${port}&auto=1`)
  console.log('Aguardando o resultado… (Ctrl+C cancela)')
  const body = await delivered
  server.close()
  const grouped = new Map()
  for (const entry of body.results ?? []) {
    const key = `${entry.format}/${entry.size}`
    grouped.set(key, { ...(grouped.get(key) ?? {}), [entry.mode]: entry, format: entry.format, size: entry.size })
  }
  const results = [...grouped.values()].map((group) =>
    mergeCombination(group, generateFixture({ format: group.format, size: group.size, seed: options.seed }).expected, group.stages, group.real),
  )
  return {
    device: {
      slug: options.device ? slugify(options.device) : 'tv',
      platform: 'tizen',
      cpu: 'não informado',
      cores: 'não informado',
      memoryGb: 'não informado',
      browser: typeof body.browser === 'string' ? body.browser : 'navegador desconhecido',
      runtime: 'tv-browser',
    },
    results,
  }
}

export async function main(argv) {
  const options = parseArgs(argv)
  const { device, results } = options.serveOnly ? await runServeOnly(options) : await runWithBrowser(options)
  const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  saveAndCompare(buildResult({ device, ...gitInfo(), appVersion: packageJson.version, seed: options.seed, cpuThrottle: options.cpu, results }))
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (error) => {
      console.error(`bench: ${error instanceof Error ? error.message : 'falha do runner'}`)
      process.exit(error instanceof Error && /^(Opção|Formato|Tamanho|--)/.test(error.message) ? 2 : 1)
    },
  )
}
