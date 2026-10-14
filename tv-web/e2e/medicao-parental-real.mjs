// Medição da feature 066 (quickstart passo 9, T036) contra a lista REAL do `.env` da raiz
// (`CCPLAY_PROBE_USER/PASS/DNS`). Fora do `SUITE` de `run.mjs`: depende de rede e de credenciais.
//
// Importa a lista, espera a pré-carga trabalhar um pouco e, dentro da página (módulos do próprio app pelo Vite), mede:
// `getCategoryAccess`, `listVisibleCategories('movie')` e `listAllOfKind('movie')` — sem preferências, e depois com
// 5 categorias escondidas + controle parental ligado com 5 bloqueadas. Meta do plano: < 10 ms por `getCategoryAccess`.
//
// **Segredos**: o `.env` é lido e NUNCA impresso; a saída só tem contagens e tempos.
// Uso: `npm run dev` no ar; `node e2e/medicao-parental-real.mjs [segundosDePreCarga=40]`.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')
const APP_URL = 'http://localhost:5173'
const PREFETCH_SECONDS = Number(process.argv[2] ?? 40)

function readEnv() {
  if (!existsSync(ENV_PATH)) return null
  return Object.fromEntries(
    readFileSync(ENV_PATH, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

async function run() {
  const env = readEnv()
  if (!env?.CCPLAY_PROBE_DNS || !env?.CCPLAY_PROBE_USER || !env?.CCPLAY_PROBE_PASS) {
    console.log('PULADO: `.env` da raiz sem CCPLAY_PROBE_DNS/USER/PASS.')
    return
  }
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  try {
    const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })).newPage()
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaXtream(page, { nome: 'Medição 066', servidor: env.CCPLAY_PROBE_DNS, usuario: env.CCPLAY_PROBE_USER, senha: env.CCPLAY_PROBE_PASS })
    await page.waitForSelector('text=/Concluída/', { timeout: 180000 })
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.topbar', { timeout: 10000 })
    console.log(`Pré-carga por ${PREFETCH_SECONDS}s…`)
    await page.waitForTimeout(PREFETCH_SECONDS * 1000)

    const result = await page.evaluate(async () => {
      const access = await import('/src/lib/catalog/categoryAccess.ts')
      const repo = await import('/src/lib/catalog/catalogRepository.ts')
      const pin = await import('/src/lib/parental/pin.ts')
      const { db } = await import('/src/lib/catalog/db.ts')
      const sourceId = (await db.sources.toArray())[0].id
      const time = async (fn, runs = 5) => {
        const samples = []
        let value
        for (let i = 0; i < runs; i += 1) {
          const t0 = performance.now()
          value = await fn()
          samples.push(performance.now() - t0)
        }
        samples.sort((a, b) => a - b)
        return { p50: Math.round(samples[Math.floor(runs / 2)] * 10) / 10, max: Math.round(samples.at(-1) * 10) / 10, value }
      }
      const measure = async () => {
        const accessT = await time(() => access.getCategoryAccess(sourceId))
        const trail = await time(() => access.listVisibleCategories(sourceId, 'movie'))
        const all = await time(() => repo.listAllOfKind(sourceId, 'movie'), 3)
        return {
          getCategoryAccess: { p50: accessT.p50, max: accessT.max, excluded: accessT.value.excluded.size },
          trail: { p50: trail.p50, max: trail.max, categories: trail.value.length },
          listAllOfKind: { p50: all.p50, max: all.max, items: all.value.length },
        }
      }
      const totals = { categories: await db.categories.where('sourceId').equals(sourceId).count() }
      const before = await measure()
      const movies = await repo.listCategories(sourceId, 'movie')
      for (const category of movies.slice(0, 5)) await access.setCategoryPreference({ sourceId, kind: 'movie', providerCategoryId: category.providerCategoryId, name: category.name }, { hidden: true })
      await pin.enableParentalControl('9999', movies.slice(5, 10).map((category) => ({ category: { sourceId, kind: 'movie', providerCategoryId: category.providerCategoryId, name: category.name }, locked: true })))
      // Ligar o controle refaz as consultas do catálogo (reset, D-005): mede "na hora" e depois de o app assentar.
      const afterNow = await measure()
      await new Promise((resolve) => setTimeout(resolve, 8000))
      const after = await measure()
      await pin.disableParentalControl()
      return { totals, before, afterNow, after }
    })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await browser.close()
  }
}

run()
