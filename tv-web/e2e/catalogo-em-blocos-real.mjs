// Medição da feature 039 (catálogo em blocos) contra a lista REAL do `.env` da
// raiz (`CCPLAY_PROBE_USER/PASS/DNS`), com a CPU 4× mais lenta (perto da TV).
//
// **Fora do `npm run test:e2e` de propósito**: depende de rede, de um painel de
// terceiros e de credenciais locais. Roda sob demanda:
//
//   npm run dev                          (em outro terminal)
//   node e2e/catalogo-em-blocos-real.mjs [repetições=2] [cpu=4]
//
// Por repetição (contexto novo, IndexedDB vazio):
//   1. importa a lista e mede, a partir de "Abrir lista", quando cada seção
//      fica toda em blocos (SC-002: catálogo inteiro ≤ 60 s);
//   2. em Filmes, entra na maior categoria e em outras 4, e em 3 de Canais —
//      todas já no aparelho (SC-001: ≤ 300 ms);
//   3. entra em "Todos" de Filmes (SC-003: ≤ 1 s).
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
// `CCPLAY_APP_URL=http://localhost:4173` mede o build de produção (`npm run build; npx vite preview`),
// que é o que roda na TV — o React do `npm run dev` é bem mais lento.
const APP_URL = process.env.CCPLAY_APP_URL ?? 'http://localhost:5173'
const REPETITIONS = Number(process.argv[2] ?? 2)
const CPU_RATE = Number(process.argv[3] ?? 4)
const READY_TIMEOUT_MS = 300_000
// `CCPLAY_PROFILE=1`: perfil de CPU (CDP) da entrada na maior categoria de filmes,
// impresso como as funções com mais tempo próprio (nome + arquivo, sem dados).
const PROFILE = process.env.CCPLAY_PROFILE === '1'
// `CCPLAY_USER_DATA=<pasta>`: perfil persistente do navegador. A 1ª rodada importa;
// as seguintes reaproveitam a lista (o painel real recusa importações seguidas).
const USER_DATA = process.env.CCPLAY_USER_DATA
// `CCPLAY_TRACE=1`: linha do tempo (CDP Tracing) da entrada na maior categoria —
// soma de duração por tipo de evento do navegador (layout, estilo, GC, script).
const TRACE = process.env.CCPLAY_TRACE === '1'

function printTrace(events) {
  const NAMES = [
    'Layout',
    'UpdateLayoutTree',
    'Paint',
    'PrePaint',
    'Layerize',
    'MajorGC',
    'MinorGC',
    'V8.GC_SCAVENGER',
    'FunctionCall',
    'EventDispatch',
    'TimerFire',
    'FireAnimationFrame',
    'RunMicrotasks',
    'v8.callFunction',
  ]
  const totals = new Map()
  for (const event of events) {
    if (!NAMES.includes(event.name) || event.ph !== 'X' || typeof event.dur !== 'number') continue
    const entry = totals.get(event.name) ?? { ms: 0, n: 0 }
    entry.ms += event.dur / 1000
    entry.n += 1
    totals.set(event.name, entry)
  }
  console.log('  linha do tempo (soma por evento; eventos aninhados se sobrepõem):')
  for (const [name, { ms, n }] of [...totals.entries()].sort((a, b) => b[1].ms - a[1].ms)) {
    console.log(`    ${String(Math.round(ms)).padStart(5)} ms  ${name} ×${n}`)
  }
}

function printProfile(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const self = new Map()
  const deltas = profile.timeDeltas
  profile.samples.forEach((id, i) => {
    const frame = byId.get(id).callFrame
    const file = frame.url.split('/').pop()?.split('?')[0] || '(nativo)'
    const key = `${frame.functionName || '(anônima)'} @ ${file}:${frame.lineNumber + 1}`
    self.set(key, (self.get(key) ?? 0) + (deltas[i] ?? 0))
  })
  const total = [...self.values()].reduce((a, b) => a + b, 0)
  console.log(`  perfil: ${Math.round(total / 1000)} ms amostrados; maiores tempos próprios:`)
  for (const [key, us] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`    ${String(Math.round(us / 1000)).padStart(5)} ms  ${key}`)
  }
}

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
  for (let i = 0; i < 60; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Por seção: categorias da geração ativa, quantas já em bloco e o tamanho de cada bloco. Só números. */
async function storageState(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('ccplaytv')
    const handle = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = (store) =>
      new Promise((resolve) => {
        const query = handle.transaction(store).objectStore(store).getAll()
        query.onsuccess = () => resolve(query.result)
      })
    const [sources, categories, blocks] = await Promise.all([all('sources'), all('categories'), all('categoryBlocks')])
    handle.close()
    const source = sources[0]
    const active = source?.activeGeneration
    const byKind = {}
    const sizes = new Map(blocks.map((block) => [block.categoryId, block.items.length]))
    for (const category of categories) {
      if (category.generation !== active) continue
      const entry = (byKind[category.kind] ??= { categories: 0, blocks: 0, items: 0 })
      entry.categories += 1
      if (sizes.has(category.id)) {
        entry.blocks += 1
        entry.items += sizes.get(category.id)
      }
    }
    return byKind
  })
}

/** Nome (só dentro do navegador, nunca impresso) e tamanho das categorias de um tipo, pela maior. */
async function categoriesBySize(page, kind) {
  return page.evaluate(async (kind) => {
    const request = indexedDB.open('ccplaytv')
    const handle = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = (store) =>
      new Promise((resolve) => {
        const query = handle.transaction(store).objectStore(store).getAll()
        query.onsuccess = () => resolve(query.result)
      })
    const [categories, blocks] = await Promise.all([all('categories'), all('categoryBlocks')])
    handle.close()
    const sizes = new Map(blocks.map((block) => [block.categoryId, block.items.length]))
    return categories
      .filter((category) => category.kind === kind && sizes.has(category.id))
      .map((category) => ({ name: category.name, items: sizes.get(category.id) }))
      .sort((a, b) => b.items - a.items)
  }, kind)
}

/** Índice (na trilha) da categoria com esse rótulo; -1 se não achar. */
async function trailIndexOf(page, label) {
  return page.evaluate(
    (label) =>
      [...document.querySelectorAll('.side-category-nav-item .side-category-nav-label')].findIndex(
        (node) => node.textContent === label,
      ),
    label,
  )
}

const focusedTrailIndex = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.side-category-nav-item')].findIndex((node) => node.classList.contains('tv-focus')))

/** Leva o foco da trilha até `target` e entra; devolve ms de OK até o primeiro quadro com itens. */
async function enterTrailItem(page, target, readySelector) {
  let current = await focusedTrailIndex(page)
  const key = target > current ? 'ArrowDown' : 'ArrowUp'
  // Sem pausa: entrar antes dos 300 ms da pré-busca por repouso do foco.
  while (current !== target) {
    await page.keyboard.press(key)
    current += key === 'ArrowDown' ? 1 : -1
  }
  const before = await page.evaluate(() => (window.__ccplayEntryTimings ?? []).length)
  const t0 = Date.now()
  await page.keyboard.press('ArrowRight')
  try {
    await page.waitForFunction(
      ({ selector, before }) =>
        document.querySelectorAll(selector).length > 0 && (window.__ccplayEntryTimings ?? []).length > before,
      { selector: readySelector, before },
      { timeout: 30_000, polling: 'raf' },
    )
  } catch {
    return { wallMs: null, report: null }
  }
  const wallMs = Date.now() - t0
  const report = await page.evaluate((measureLayout) => {
    const last = (window.__ccplayEntryTimings ?? []).at(-1) ?? null
    // `CCPLAY_LAYOUT=1`: custo de um layout completo forçado com esta grade aberta
    // (mediana de 5) — diz se o layout cresce com o nº de itens da categoria.
    let layoutMs
    if (measureLayout) {
      const samples = []
      for (let k = 0; k < 5; k += 1) {
        document.body.style.paddingTop = k % 2 ? '1px' : '0px'
        const t = performance.now()
        void document.body.offsetHeight
        samples.push(performance.now() - t)
      }
      document.body.style.paddingTop = ''
      layoutMs = Math.round(samples.sort((a, b) => a - b)[2] * 10) / 10
    }
    // Quantas células a grade montou (virtualização saudável = poucas dezenas).
    return last && { ...last, cells: document.querySelectorAll('.vod-grid-cell').length, layoutMs }
  }, process.env.CCPLAY_LAYOUT === '1')
  await page.keyboard.press('Escape') // conteúdo -> trilha
  await page.waitForTimeout(100)
  return { wallMs, report }
}

/** "Todos" não publica relatório de medição: mede de OK até o primeiro cartão. */
async function enterAll(page) {
  let current = await focusedTrailIndex(page)
  while (current > 2) {
    await page.keyboard.press('ArrowUp')
    current -= 1
  }
  const t0 = Date.now()
  await page.keyboard.press('ArrowRight')
  // A troca de entrada tira os cartões antigos no mesmo quadro em que "Todos"
  // fica selecionado; os novos só aparecem quando o agregado chega.
  try {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.side-category-nav-item')[2]?.classList.contains('is-selected') &&
        document.querySelectorAll('.content-card-title').length > 0,
      null,
      { timeout: 30_000, polling: 'raf' },
    )
  } catch {
    return null
  }
  return Date.now() - t0
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

  const results = { ready: [], biggest: [], movies: [], live: [], all: [], search: [] }
  const browser = USER_DATA ? null : await launchBrowser()
  try {
    for (let rep = 1; rep <= REPETITIONS; rep += 1) {
      const viewport = { width: 1920, height: 1080 }
      const context = USER_DATA
        ? await chromium.launchPersistentContext(USER_DATA, { headless: true, viewport })
        : await browser.newContext({ viewport })
      await context.addInitScript(() => localStorage.setItem('ccplaytv:perf', '1'))
      const page = await context.newPage()
      page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error'))
      // Capas não entram na medição (CDN do painel).
      await page.route(/\.(jpe?g|png|webp)(\?|$)/i, (route) => route.abort())
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE })

      console.log(`=== Repetição ${rep}/${REPETITIONS} (CPU ${CPU_RATE}×): importar a lista real ===`)
      await page.goto(APP_URL)
      await page.waitForSelector('.add-card, .source-card', { timeout: 20000 })
      let state = {}
      if (USER_DATA && (await page.locator('.source-card').count()) > 0) {
        // Perfil reaproveitado: a lista já está no aparelho, toda em blocos.
        console.log('  (lista reaproveitada do perfil; sem importar)')
        await page.keyboard.press('Enter')
        await page.waitForSelector('.topbar', { timeout: 20000 })
        state = await storageState(page)
      } else {
      await page.keyboard.press('Enter')
      await page.waitForSelector('#add-source-title', { timeout: 8000 })
      const tImport = Date.now()
      await cadastrarListaXtream(page, { nome: `Medição ${rep}`, servidor: dns, usuario: user, senha: pass })
      try {
        // "Falhou" aqui costuma ser o limite de frequência do painel (recusa sem CORS,
        // 038 research.md R0-2) depois de várias importações seguidas: esperar e repetir.
        await page.waitForSelector('text=/Concluída|Status: Falhou/', { timeout: 180000 })
        if (await page.getByText(/Status: Falhou/).count()) throw new Error('importação falhou (painel)')
      } catch (error) {
        // Só o estado visível da tela de importação (textos de status), nunca a URL.
        const status = await page.evaluate(() => (document.querySelector('main, .screen, body')?.innerText ?? '').slice(0, 600))
        console.log('  tela ao estourar o tempo:', JSON.stringify(status))
        throw error
      }
      const importMs = Date.now() - tImport
      const tOpen = Date.now()
      await page.getByRole('button', { name: 'Abrir lista' }).click()
      await page.waitForSelector('.topbar', { timeout: 20000 })

      // 1. Catálogo inteiro em blocos, parado no Início.
      const readyAt = {}
      while (Date.now() - tOpen < READY_TIMEOUT_MS) {
        state = await storageState(page)
        for (const [kind, entry] of Object.entries(state)) {
          if (readyAt[kind] === undefined && entry.blocks === entry.categories) readyAt[kind] = Date.now() - tOpen
        }
        if (Object.keys(state).length > 0 && Object.values(state).every((entry) => entry.blocks === entry.categories)) break
        await page.waitForTimeout(500)
      }
      const totalMs = Object.values(state).every((entry) => entry.blocks === entry.categories) ? Date.now() - tOpen : null
      console.log(`  importação (estrutura): ${importMs} ms`)
      for (const [kind, entry] of Object.entries(state)) {
        console.log(
          `  ${kind}: ${entry.blocks}/${entry.categories} categorias, ${entry.items} itens, pronto em ${readyAt[kind] ?? 'NÃO'} ms`,
        )
      }
      console.log(`  catálogo inteiro pronto em: ${totalMs ?? `NÃO (em ${READY_TIMEOUT_MS} ms)`} ms`)
      results.ready.push(totalMs)
      }

      // 2. Filmes: a maior categoria e outras 4.
      const movieCategories = await categoriesBySize(page, 'movie')
      await openViaTopbar(page, 'movies')
      await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, {
        timeout: 20000,
      })
      await page.waitForTimeout(300)
      // `CCPLAY_BIGGEST_LAST=1`: entra na maior por último — separa o custo da 1ª
      // montagem da grade na tela do custo do tamanho da categoria.
      const targets = movieCategories.slice(0, 5)
      if (process.env.CCPLAY_BIGGEST_LAST === '1') targets.push(targets.shift())
      for (const [position, category] of targets.entries()) {
        const i = category === movieCategories[0] ? 0 : position + 1
        const index = await trailIndexOf(page, category.name)
        if (index < 0) {
          console.log(`  filmes #${i + 1}: categoria não achada na trilha`)
          continue
        }
        const profiling = PROFILE && i === 0
        if (profiling) {
          await cdp.send('Profiler.enable')
          await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
          await cdp.send('Profiler.start')
        }
        const tracing = TRACE && i === 0
        const traceEvents = []
        if (tracing) {
          cdp.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value))
          await cdp.send('Tracing.start', {
            categories: 'devtools.timeline,v8,disabled-by-default-devtools.timeline',
            transferMode: 'ReportEvents',
          })
        }
        const { wallMs, report } = await enterTrailItem(page, index, '.content-card-title')
        if (profiling) printProfile((await cdp.send('Profiler.stop')).profile)
        if (tracing) {
          const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
          await cdp.send('Tracing.end')
          await done
          printTrace(traceEvents)
        }
        console.log(
          `  filmes #${i + 1} (${category.items} itens): OK→quadro=${wallMs ?? 'TIMEOUT'} ms` +
            (report ? ` fases=${JSON.stringify(report.phases)} células=${report.cells}${report.layoutMs !== undefined ? ` layout=${report.layoutMs}ms` : ''}` : ''),
        )
        results.movies.push(wallMs)
        if (i === 0) results.biggest.push(wallMs)
      }

      // 3. "Todos" de Filmes.
      // `CCPLAY_PROFILE_ALL=1`: perfil de CPU da entrada em "Todos".
      const profilingAll = process.env.CCPLAY_PROFILE_ALL === '1'
      if (profilingAll) {
        await cdp.send('Profiler.enable')
        await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
        await cdp.send('Profiler.start')
      }
      const allMs = await enterAll(page)
      if (profilingAll) printProfile((await cdp.send('Profiler.stop')).profile)

      // Busca dentro de "Todos": de digitar o termo até a grade mudar. Termos
      // genéricos (sem dado da lista); só a contagem e o tempo são impressos.
      if (allMs !== null) {
        await page.keyboard.press('ArrowUp') // grade -> "Pesquisar"
        await page.keyboard.press('Enter')
        const field = page.locator('input.search-field')
        await field.waitFor({ timeout: 8000 })
        for (const term of ['the', 'amo', 'man']) {
          const before = await page.evaluate(() =>
            [...document.querySelectorAll('.content-card-title')].map((node) => node.textContent).join('\u0001'),
          )
          const t0 = Date.now()
          await field.fill(term)
          const changed = await page
            .waitForFunction(
              (previous) =>
                [...document.querySelectorAll('.content-card-title')].map((node) => node.textContent).join('\u0001') !== previous,
              before,
              { timeout: 15_000, polling: 'raf' },
            )
            .then(() => true, () => false)
          const searchMs = changed ? Date.now() - t0 : null
          console.log(`  busca em "Todos" (termo de 3 letras): resultado=${searchMs ?? 'SEM MUDANÇA'} ms`)
          results.search.push(searchMs)
        }
        await page.keyboard.press('Escape') // campo -> "Pesquisar"
      }
      console.log(`  "Todos" de Filmes (${state.movie?.items ?? '?'} itens): OK→1º cartão=${allMs ?? 'TIMEOUT'} ms`)
      results.all.push(allMs)
      await page.keyboard.press('Escape')

      // 4. Canais: as 3 maiores.
      const liveCategories = await categoriesBySize(page, 'channel')
      await page.keyboard.press('Escape') // trilha -> Início
      await page.waitForSelector('.home-content', { timeout: 10000 })
      await openViaTopbar(page, 'live')
      await page.waitForSelector('.live-column-groups', { timeout: 20000 })
      await page.waitForTimeout(300)
      for (const [i, category] of liveCategories.slice(0, 3).entries()) {
        const index = await trailIndexOf(page, category.name)
        if (index < 0) {
          const trailSize = await page.evaluate(() => document.querySelectorAll('.side-category-nav-item').length)
          console.log(`  canais #${i + 1}: categoria não achada na trilha (${trailSize} itens na trilha)`)
          continue
        }
        const { wallMs } = await enterTrailItem(page, index, '.live-column-channels .live-item-name')
        console.log(`  canais #${i + 1} (${category.items} itens): OK→quadro=${wallMs ?? 'TIMEOUT'} ms`)
        results.live.push(wallMs)
      }
      await context.close()
    }
  } catch (error) {
    console.error('  ✗ EXCEÇÃO:', error?.name ?? 'Error', String(error?.message ?? '').split('\n')[0])
  } finally {
    await browser?.close()
  }

  console.log(`\n=== Resumo (CPU ${CPU_RATE}×, ms) ===`)
  console.log(`  catálogo inteiro pronto (SC-002 ≤ 60000): ${stats(results.ready)}`)
  console.log(`  maior categoria de filmes (SC-001 ≤ 300): ${stats(results.biggest)}`)
  console.log(`  categorias de filmes:                     ${stats(results.movies)}`)
  console.log(`  categorias de canais:                     ${stats(results.live)}`)
  console.log(`  "Todos" de Filmes (SC-003 ≤ 1000):        ${stats(results.all)}`)
  console.log(`  busca em "Todos" por tecla:               ${stats(results.search)}`)
}

run()
