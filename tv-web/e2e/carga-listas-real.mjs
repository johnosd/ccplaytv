// Medição da primeira entrada fria (feature 038, FR-012, `research.md` R0-1)
// contra a lista REAL do `.env` da raiz (`CCPLAY_PROBE_USER/PASS/DNS`).
//
// **Fora do `npm run test:e2e` de propósito**: depende de rede, de um painel de
// terceiros e de credenciais locais. Roda sob demanda:
//
//   npm run dev                          (em outro terminal)
//   node e2e/carga-listas-real.mjs [repetições=3] [categorias por seção=3]
//
// Para cada repetição: contexto novo (IndexedDB vazio), importa a lista, e em
// Canais/Filmes/Séries entra nas N primeiras categorias reais sem deixar o
// cursor parar (a pré-busca de 300 ms não dispara — é a entrada fria de
// verdade). Liga `ccplaytv:perf` e lê `window.__ccplayEntryTimings`; a rede
// vem do Playwright (`request.timing()`, `sizes()`).
//
// **Segredos**: o `.env` é lido e NUNCA impresso. A saída só tem números e o
// nome da seção — sem endereço, usuário, senha, nome de categoria ou item.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')
const APP_URL = 'http://localhost:5173'
const REPETITIONS = Number(process.argv[2] ?? 3)
const CATEGORIES_PER_SECTION = Number(process.argv[3] ?? 3)
const ENTRY_TIMEOUT_MS = 180_000

const SECTIONS = [
  { name: 'canais', topbar: 'live', action: 'get_live_streams', ready: '.live-column-groups' },
  { name: 'filmes', topbar: 'movies', action: 'get_vod_streams', ready: '.side-category-nav' },
  { name: 'series', topbar: 'series', action: 'get_series', ready: '.side-category-nav' },
]

function readEnv() {
  if (!existsSync(ENV_PATH)) return null
  const entries = readFileSync(ENV_PATH, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
  return Object.fromEntries(entries)
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  // Folga: o foco pode estar dezenas de categorias abaixo na trilha — ↑ a mais
  // na topbar não faz nada.
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

const reportCount = (page) => page.evaluate(() => (window.__ccplayEntryTimings ?? []).length)
const lastReport = (page) => page.evaluate(() => (window.__ccplayEntryTimings ?? []).at(-1) ?? null)

/** Entra na categoria em foco e espera o relatório da medição (primeiro quadro com itens). */
async function measureEntry(page) {
  const before = await reportCount(page)
  const t0 = Date.now()
  await page.keyboard.press('ArrowRight')
  try {
    await page.waitForFunction((n) => (window.__ccplayEntryTimings ?? []).length > n, before, {
      timeout: ENTRY_TIMEOUT_MS,
    })
  } catch {
    return { wallMs: null, report: null }
  }
  return { wallMs: Date.now() - t0, report: await lastReport(page) }
}

function stats(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b)
  if (sorted.length === 0) return '—'
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  return `p50=${pick(0.5)} max=${sorted.at(-1)} (n=${sorted.length})`
}

async function run() {
  const env = readEnv()
  const dns = env?.CCPLAY_PROBE_DNS
  const user = env?.CCPLAY_PROBE_USER
  const pass = env?.CCPLAY_PROBE_PASS
  if (!dns || !user || !pass) {
    console.log('PULADO: `.env` da raiz sem CCPLAY_PROBE_DNS/USER/PASS.')
    return
  }

  const rows = []
  const browser = await launchBrowser()
  try {
    for (let rep = 1; rep <= REPETITIONS; rep += 1) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
      await context.addInitScript(() => localStorage.setItem('ccplaytv:perf', '1'))
      const page = await context.newPage()
      page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error'))
      // Não carregar capas: a medição é da entrada, não da CDN de imagens do painel.
      // (Desligar isto numa rodada à parte mede o custo das capas.)
      const network = []
      page.on('requestfinished', async (request) => {
        const url = request.url()
        const section = SECTIONS.find((s) => url.includes(`action=${s.action}`) && url.includes('category_id='))
        if (!section) return
        const timing = request.timing()
        const sizes = await request.sizes().catch(() => null)
        network.push({
          section: section.name,
          ttfbMs: Math.round(timing.responseStart),
          totalMs: Math.round(timing.responseEnd),
          bytes: sizes?.responseBodySize ?? null,
        })
      })

      console.log(`=== Repetição ${rep}/${REPETITIONS}: importar a lista real ===`)
      await page.goto(APP_URL)
      await page.waitForSelector('.add-card', { timeout: 10000 })
      await page.keyboard.press('Enter')
      await page.waitForSelector('#add-source-title', { timeout: 8000 })
      await cadastrarListaXtream(page, { nome: `Medição ${rep}`, servidor: dns, usuario: user, senha: pass })
      await page.waitForSelector('text=/Concluída/', { timeout: 120000 })
      await page.getByRole('button', { name: 'Abrir lista' }).click()
      await page.waitForSelector('.topbar', { timeout: 10000 })

      for (const section of SECTIONS) {
        await openViaTopbar(page, section.topbar)
        await page.waitForSelector(section.ready, { timeout: 15000 })
        // Sem espera longa aqui: a pré-busca por repouso (300 ms) anteciparia a
        // primeira categoria. 150 ms basta para a trilha montar.
        await page.waitForTimeout(150)
        const onSection = await page.evaluate(
          (label) => (document.querySelector('.topbar-item.is-active, .topbar-item[aria-current="page"]')?.textContent ?? '').includes(label),
          section.topbar === 'live' ? 'TV' : section.topbar === 'movies' ? 'Filmes' : 'Séries',
        )
        if (!onSection) console.log(`  (aviso: não confirmei a seção ${section.name} pela topbar)`)
        for (let i = 0; i < CATEGORIES_PER_SECTION; i += 1) {
          const networkBefore = network.length
          const { wallMs, report } = await measureEntry(page)
          await page.waitForTimeout(300) // deixa `requestfinished` chegar
          const net = network.slice(networkBefore).find((n) => n.section === section.name) ?? null
          rows.push({ rep, section: section.name, wallMs, report, net })
          console.log(
            `  ${section.name} #${i + 1}: parede=${wallMs ?? 'TIMEOUT'}ms` +
              (report ? ` fases=${JSON.stringify(report.phases)} itens=${report.items ?? '?'}` : '') +
              (net ? ` rede: ttfb=${net.ttfbMs}ms total=${net.totalMs}ms bytes=${net.bytes ?? '?'}` : ' rede: (categoria já no aparelho ou sem pedido)'),
          )
          await page.keyboard.press('ArrowLeft') // volta à trilha
          await page.keyboard.press('ArrowDown') // próxima categoria
          // Sem espera: entrar antes dos 300 ms da pré-busca por repouso.
        }
      }
      await context.close()
    }
  } catch (error) {
    console.error('  ✗ EXCEÇÃO:', error?.name ?? 'Error')
  } finally {
    await browser.close()
  }

  console.log('\n=== Resumo por seção (ms) ===')
  for (const section of SECTIONS) {
    const mine = rows.filter((row) => row.section === section.name)
    const phase = (name) => mine.map((row) => row.report?.phases?.[name])
    console.log(`  ${section.name}:`)
    console.log(`    parede OK→quadro:  ${stats(mine.map((row) => row.wallMs))}`)
    console.log(`    rede ttfb:         ${stats(mine.map((row) => row.net?.ttfbMs))}`)
    console.log(`    rede total:        ${stats(mine.map((row) => row.net?.totalMs))}`)
    console.log(`    app mapped:        ${stats(phase('mapped'))}   (rede + JSON + mapear)`)
    console.log(`    app written:       ${stats(phase('written'))}`)
    console.log(`    app read:          ${stats(phase('read'))}`)
    console.log(`    app firstPaint:    ${stats(phase('firstPaint'))}`)
    console.log(`    itens:             ${stats(mine.map((row) => row.report?.items))}`)
    console.log(`    bytes:             ${stats(mine.map((row) => row.net?.bytes))}`)
  }
}

run()
