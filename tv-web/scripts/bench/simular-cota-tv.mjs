// Simulação da cota da TV (feature 082, T004).
//
// Uso: com `npm run dev` em outro terminal, rode `node scripts/bench/simular-cota-tv.mjs`.
// O script lê CCPLAY_PROBE_* do .env, mas nunca imprime credenciais, URLs ou nomes.
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from '../../e2e/lib/entrada.mjs'
import { focusFirstRealCategory, openShowcase } from '../../e2e/lib/vod.mjs'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const ENV_PATH = path.join(ROOT, '.env')
const APP_URL = process.env.CCPLAY_APP_URL ?? 'http://localhost:5173'
const QUOTA_BYTES = 80 * 1024 * 1024
const REPORT_DIR = path.join(ROOT, 'sdd/specs/082-orcamento-armazenamento-tv/evidencias')
const IMPORT_TIMEOUT_MS = Number(process.env.CCPLAY_SIM_IMPORT_TIMEOUT_MS ?? 180000)
const SIM_PHASE = process.env.CCPLAY_SIM_PHASE === 'after' ? 'depois' : 'antes'
/** Quanto esperar a pré-carga e o guia terminarem (feature 082: o uso só vale com a lista inteira no aparelho). */
const PREFETCH_TIMEOUT_MS = Number(process.env.CCPLAY_SIM_PREFETCH_TIMEOUT_MS ?? 15 * 60_000)
const STABLE_MS = 45_000

function readEnv() {
  if (!existsSync(ENV_PATH)) return {}
  return Object.fromEntries(
    readFileSync(ENV_PATH, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
      }),
  )
}

async function launch() {
  const executablePath = '/opt/pw-browsers/chromium'
  const browserType = chromium
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ccplaytv-082-'))
  const context = await browserType.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: existsSync(executablePath) ? executablePath : undefined,
    args: ['--disable-features=StaticStorageQuota'],
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
  })
  return { context, userDataDir }
}

async function setQuota(page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Storage.overrideQuotaForOrigin', { origin: new URL(APP_URL).origin, quotaSize: QUOTA_BYTES })
  return session
}

/** Progresso da pré-carga e do guia, lido do próprio app (só números). */
async function prefetchState(page) {
  return page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const categories = await db.categories.toArray()
    const sources = await db.sources.toArray()
    const status = document.querySelector('.home-status-line')?.textContent ?? null
    return {
      categories: categories.length,
      onDemand: categories.filter((category) => category.fetchMode === 'on_demand').length,
      fetched: categories.filter((category) => category.itemsFetchedAt !== undefined).length,
      epgGeneration: sources[0]?.epgActiveGeneration ?? null,
      epgError: sources[0]?.epgLastErrorKind ?? null,
      partial: status ? /Parte da lista/.test(status) : false,
    }
  })
}

/** Espera a pré-carga parar de avançar por `STABLE_MS` (ou acabar) e o guia sincronizar. Sem teclas: o portão abre ~2 s sem tecla. */
async function waitForPrefetch(page, mark) {
  const start = Date.now()
  let last = await prefetchState(page)
  let changedAt = Date.now()
  while (Date.now() - start < PREFETCH_TIMEOUT_MS) {
    await page.waitForTimeout(5_000)
    const state = await prefetchState(page)
    if (state.fetched !== last.fetched || state.epgGeneration !== last.epgGeneration) changedAt = Date.now()
    last = state
    const done = state.fetched >= state.categories || state.partial
    const guideSettled = state.epgGeneration !== null || state.epgError !== null
    if ((done && guideSettled) || Date.now() - changedAt > STABLE_MS) break
  }
  mark(`pre-carga-${Math.round((Date.now() - start) / 1000)}s`)
  return { ...last, waitedMs: Date.now() - start }
}

/** Conta própria do orçamento (bytes por lista) e o que o planejador vê. */
async function ledgerOf(page) {
  return page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { catalogLedger } = await import('/src/lib/catalog/storageLedger.ts')
    const { catalogCapBytes } = await import('/src/lib/catalog/storageBudget.ts')
    const ledger = await catalogLedger(db)
    const sources = await db.sources.toArray()
    const estimate = await navigator.storage.estimate()
    return { ledgerBytes: ledger.total, capBytes: catalogCapBytes(estimate.quota ?? 0), epgStoredBytes: sources[0]?.epgStoredBytes ?? null }
  })
}

async function collect(page) {
  const session = await page.context().newCDPSession(page)
  const cdp = await session.send('Storage.getUsageAndQuota', { origin: new URL(APP_URL).origin }).catch(() => null)
  const measured = await page.evaluate(async () => {
    const estimate = await navigator.storage.estimate()
    const { db } = await import('/src/lib/catalog/db.ts')
    const tables = {}
    for (const table of db.tables) {
      if (!['categoryBlocks', 'categoryChunks', 'catalogReadChunks', 'catalogReadManifests', 'epgChunks', 'epgPrograms', 'categories'].includes(table.name)) continue
      tables[table.name] = await table.count()
    }
    return {
      usage: estimate.usage ?? null,
      quota: estimate.quota ?? null,
      tables,
    }
  })
  return {
    usage: cdp?.usage ?? measured.usage,
    quota: cdp?.quota ?? measured.quota,
    tables: measured.tables,
  }
}

async function run() {
  const env = readEnv()
  if (!env.CCPLAY_PROBE_DNS || !env.CCPLAY_PROBE_USER || !env.CCPLAY_PROBE_PASS) {
    console.log('PULADO: .env sem CCPLAY_PROBE_DNS/USER/PASS.')
    return
  }
  mkdirSync(REPORT_DIR, { recursive: true })
  const { context, userDataDir } = await launch()
  let page
  try {
    page = await context.newPage()
    await page.addInitScript(() => localStorage.setItem('ccplaytv:perf', '1'))
    const mark = (name) => console.log(`marco:${name}`)
    page.on('pageerror', (error) => console.error(`pageerror:${error?.name ?? 'Error'}`))
    page.on('console', (message) => { if (message.type() === 'error') console.error(`console-error:${message.text().replace(/https?:\/\/\S+/gi, '<url>')}`) })
    const storageErrors = []
    page.on('pageerror', (error) => {
      const name = error?.name ?? 'Error'
      if (/quota|storage|STO-01/i.test(`${name} ${error?.message ?? ''}`)) storageErrors.push(name)
    })
    page.on('console', (message) => {
      const text = message.text()
      if (/quota|storage|STO-01/i.test(text)) storageErrors.push(message.type())
    })
    await setQuota(page)
    mark('quota')
    await page.goto(APP_URL)
    mark('pagina')
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaXtream(page, {
      nome: 'Simulação 082',
      servidor: env.CCPLAY_PROBE_DNS,
      usuario: env.CCPLAY_PROBE_USER,
      senha: env.CCPLAY_PROBE_PASS,
    })
    mark('importacao-iniciada')
    await page.waitForSelector('text=/Concluída/', { timeout: IMPORT_TIMEOUT_MS })
    mark('importacao-concluida')
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.topbar', { timeout: 10000 })
    mark('lista-aberta')
    const prefetch = await waitForPrefetch(page, mark)
    const afterPrefetch = { ...(await collect(page)), ...(await ledgerOf(page)) }
    // CPU 4× só para as entradas (como a TV): na pré-carga deixaria a espera longa demais.
    const cdpSession = await page.context().newCDPSession(page)
    await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const entryWallMs = []
    for (const topbar of ['movies', 'series']) {
      await openShowcase(page, topbar)
      await page.waitForTimeout(300)
      await focusFirstRealCategory(page)
      const entryStart = Date.now()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      entryWallMs.push({ section: topbar, ms: Date.now() - entryStart })
      await page.keyboard.press('Escape')
      mark(`secao-${topbar}`)
    }
    const perf = await page.evaluate(() => (window.__ccplayEntryTimings ?? []).map((report) => ({ phases: report.phases, items: report.items })))
    const result = await collect(page)
    const report = {
      date: new Date().toISOString().slice(0, 10),
      quotaBytes: QUOTA_BYTES,
      storageErrors: [...new Set(storageErrors)],
      cpuThrottlingRate: 4,
      prefetch,
      afterPrefetch,
      perf,
      entryWallMs,
      ...result,
      ...(await ledgerOf(page)),
    }
    const output = path.join(REPORT_DIR, `simulacao-pc-${SIM_PHASE}-${report.date}.json`)
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify({ output: path.relative(ROOT, output), ...report }))
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      const state = await page?.evaluate(() => {
        const text = document.body?.innerText ?? ''
        return { length: text.length, completed: /Concluída/i.test(text), failed: /falha|erro|storage_full/i.test(text), markers: [...text.matchAll(/conclu[ií]da|importa[^\s]*|sincron[^\s]*|falha|erro|armazen[^\s]*/gi)].map((match) => match[0].toLowerCase()) }
      }).catch(() => null)
      const dbState = await page?.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); const runs = await db.importRuns.toArray(); return { runs: runs.map((run) => ({ status: run.status, step: run.step, entries: run.entriesRead, stored: run.channelsStored, errorKind: run.errorKind, sections: run.sections })) } }).catch(() => null)
      console.error(`estado-timeout:${JSON.stringify({ state, dbState })}`)
    }
    const detail = String(error?.message ?? '').replace(/https?:\/\/\S+/gi, '<url>')
    console.error(`FALHA: ${error?.name ?? 'Error'}${detail ? ` — ${detail}` : ''}`)
    process.exitCode = 1
  } finally {
    await context.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
}

run()
