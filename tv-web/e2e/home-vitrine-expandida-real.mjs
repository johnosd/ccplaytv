// Quickstart da feature 060 (T042) contra a lista REAL do `.env` da raiz — cenários de navegador com dado real.
// **Fora do `npm run test:e2e` de propósito**: depende de rede, de um painel de terceiros, do TMDB e de credenciais locais.
//
//   npm run dev                                   (em outro terminal)
//   node e2e/home-vitrine-expandida-real.mjs
//
// Usa `CCPLAY_PROBE_DNS/USER/PASS` e, se houver, `CCPLAY_PROBE_TMDB_KEY` (semeada no IndexedDB como a pessoa faria em
// Configurações › Integrações & BYOK; só vai ao TMDB). `CCPLAY_USER_DATA=<pasta>` mantém o perfil do navegador entre
// rodadas (o painel real recusa importações seguidas).
//
// Estado semeado direto no IndexedDB (mesmo formato do `userStateRepository`): 1 filme em andamento, 1 concluído,
// favoritos de filme/série e 3 canais favoritos, tirados do catálogo real já obtido.
//
// **Segredos**: o `.env` é lido e NUNCA impresso. A saída só tem contagens e rótulos do app — sem endereço, usuário,
// senha, chave ou nome de categoria/título do provedor. As capturas vão para a pasta temporária do sistema
// (`os.tmpdir()`), fora do repositório, porque mostram capas e títulos reais: não as publique.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { openShowcase, openVodCategory } from './lib/vod.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = process.env.CCPLAY_APP_URL ?? 'http://localhost:5173'
const USER_DATA = process.env.CCPLAY_USER_DATA
// As capturas mostram capas e títulos REAIS: ficam na pasta temporária do sistema, nunca dentro do repositório.
const SHOTS = path.join(os.tmpdir(), 'ccplay-home-vitrine-expandida-real')

function loadEnv() {
  const env = {}
  for (const line of readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line)
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}
const env = loadEnv()
const DNS = env.CCPLAY_PROBE_DNS
if (!DNS || !env.CCPLAY_PROBE_USER || !env.CCPLAY_PROBE_PASS) {
  console.error('Faltam CCPLAY_PROBE_DNS/USER/PASS no .env da raiz.')
  process.exit(2)
}
const SERVER = /^https?:\/\//.test(DNS) ? DNS : `http://${DNS}`
const TMDB_KEY = env.CCPLAY_PROBE_TMDB_KEY || ''
const SECRETS = [env.CCPLAY_PROBE_PASS, TMDB_KEY, env.CCPLAY_PROBE_USER].filter((value) => value && value.length >= 6)
const LISTA = 'Lista Real E2E Home'

// FR-018: ordem das fileiras (rótulos em pt; `data-row` é a chave estável).
const ROW_ORDER = ['channels', 'continue', 'mylist', 'added-movies', 'added-series']

let failures = 0
let inconclusive = 0
let current = ''
const assert = (condition, message) => {
  if (condition) return console.log(`  ✓ ${message}`)
  failures += 1
  console.error(`  ✗ FALHOU: ${message}`)
}
const note = (message) => console.log(`  · ${message}`)
const unknown = (message) => {
  inconclusive += 1
  console.log(`  ? NÃO VERIFICADO: ${message}`)
}

async function scenario(name, fn) {
  console.log(`\n=== ${(current = name)} ===`)
  try {
    await fn()
  } catch (error) {
    failures += 1
    console.error(`  ✗ FALHOU (erro no roteiro): ${String(error.message ?? error).split('\n')[0].slice(0, 160)}`)
    // Diagnóstico: a tela no momento da falha (fica só em `test-results/`) e a classe dos elementos principais.
    if (pageRef) {
      await shot(pageRef, `erro-${failures}`).catch(() => {})
      const classes = await pageRef
        .evaluate(() => [...document.querySelectorAll('#root *')].slice(0, 12).map((el) => el.className).filter((c) => typeof c === 'string' && c))
        .catch(() => [])
      console.error(`    tela no erro (classes): ${classes.slice(0, 8).join(' | ')}`)
    }
  }
}
let pageRef = null

const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const heroState = (page) => page.locator('.home-hero').getAttribute('data-state')
const rowKeys = (page) => page.locator('.home-row').evaluateAll((els) => els.map((el) => el.getAttribute('data-row')))
const focusedRow = (page) => page.evaluate(() => document.querySelector('.home-row .tv-focus')?.closest('.home-row')?.getAttribute('data-row') ?? null)
const focusedCard = (page) =>
  page.evaluate(() => document.querySelector('.home-row .tv-focus')?.getAttribute('data-item-id') ?? null)
const press = async (page, key, times = 1, delay = 0) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key)
    if (delay) await page.waitForTimeout(delay)
  }
}

/** Do estado inicial do app (perfil/lista) até o Início da lista real. */
async function abrirInicio(page) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card, .source-card-wrap', { timeout: 15000 })
  // `.source-card-wrap` também envolve o cartão "Adicionar lista": a lista real é a que traz o nome dela.
  const cartaoDaLista = page.locator('.source-card-wrap', { hasText: LISTA })
  if ((await cartaoDaLista.count()) === 0) {
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaXtream(page, { nome: LISTA, servidor: SERVER, usuario: env.CCPLAY_PROBE_USER, senha: env.CCPLAY_PROBE_PASS })
    await page.waitForSelector('text=/Concluída/', { timeout: 300000 })
    await page.getByRole('button', { name: 'Voltar' }).click()
    await cartaoDaLista.first().waitFor({ timeout: 10000 })
  }
  // Leva o foco ao cartão da lista (a tela abre no "Adicionar lista") antes do OK.
  for (let i = 0; i < 5; i += 1) {
    const naLista = await page.evaluate((nome) => (document.querySelector('.tv-focus')?.closest('.source-card-wrap')?.textContent ?? '').includes(nome), LISTA)
    if (naLista) break
    await page.keyboard.press('ArrowLeft')
  }
  await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 20000 })
  await page.waitForSelector('.home-hero', { timeout: 20000 })
}

/** Sobe com ↑ até a topbar e desce com ↓ para a 1ª ação do billboard — o ponto de partida de cada cenário. */
async function voltarAoInicio(page) {
  if ((await page.locator('.home-hero').count()) > 0) return
  // De uma vitrine com o foco fundo nas fileiras, 6 ↑ não bastam para a topbar (openViaTopbar assume pouco): sobe até ela.
  for (let i = 0; i < 40; i += 1) {
    if ((await page.locator('.topbar .tv-focus').count()) > 0) break
    await page.keyboard.press('ArrowUp')
  }
  await press(page, 'ArrowLeft', 6)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.home-hero', { timeout: 15000 })
}

async function irAoBillboard(page) {
  await voltarAoInicio(page)
  for (let i = 0; i < 25; i += 1) {
    if ((await page.locator('.topbar .tv-focus').count()) > 0) break
    await page.keyboard.press('ArrowUp')
  }
  await page.keyboard.press('ArrowDown')
  await page.waitForSelector('.home-hero-action.tv-focus', { timeout: 6000 })
  await page.waitForTimeout(400)
}

/** Do billboard, desce até a fileira `key` (ou a 1ª fileira de títulos, se `key` for omitida). */
async function irAFileira(page, key) {
  const alvo = key ?? (await rowKeys(page)).find((k) => k !== 'continue' && k !== 'channels' && k !== 'ai')
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(120)
    if ((await focusedRow(page)) === alvo) return alvo
  }
  throw new Error('não cheguei na fileira pedida')
}

const idb = (page, fn, arg) =>
  page.evaluate(
    async ({ source, arg: payload }) => {
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open('ccplaytv')
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      try {
        // eslint-disable-next-line no-new-func
        return await new Function('db', 'arg', `return (${source})(db, arg)`)(db, payload)
      } finally {
        db.close()
      }
    },
    { source: fn.toString(), arg },
  )

/** Conta itens por tipo nos blocos já obtidos da lista (só números). */
const contarBlocos = (page) =>
  idb(page, async (db) => {
    const counts = { movie: 0, series: 0, channel: 0 }
    await new Promise((resolve) => {
      const cursor = db.transaction('categoryBlocks').objectStore('categoryBlocks').openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) return resolve()
        if (counts[c.value.kind] !== undefined) counts[c.value.kind] += c.value.items.length
        c.continue()
      }
      cursor.onerror = () => resolve()
    })
    return counts
  })

/** Semeia estado do usuário a partir do catálogo real (sem devolver nenhum nome/id). */
const semear = (page) =>
  idb(page, async (db) => {
    const getAll = (store) => new Promise((resolve) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result) })
    const sourceId = (await getAll('sources'))[0]?.id
    const want = { movie: 4, series: 2, channel: 3 }
    const got = { movie: [], series: [], channel: [] }
    await new Promise((resolve) => {
      const cursor = db.transaction('categoryBlocks').objectStore('categoryBlocks').openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) return resolve()
        const { kind, items } = c.value
        if (got[kind]) {
          for (const item of items) {
            if (got[kind].length >= want[kind]) break
            const own = kind === 'series' ? item.seriesId : item.providerStreamId
            if (own) got[kind].push({ kind, own })
          }
        }
        c.continue()
      }
      cursor.onerror = () => resolve()
    })
    const now = Date.now()
    const base = (entry) => ({ stableId: `${sourceId}|${entry.kind}|id:${entry.own}`, sourceId, isFavorite: false, createdAt: now })
    const states = []
    got.movie.forEach((entry, i) => {
      const s = base(entry)
      if (i === 0) Object.assign(s, { progressSeconds: 900, lastWatched: now })
      if (i === 1) Object.assign(s, { progressSeconds: 0, lastWatched: now - 3600_000, completedAt: now - 3600_000 })
      if (i >= 2) Object.assign(s, { isFavorite: true, favoritedAt: now - i * 1000 })
      states.push(s)
    })
    got.series.forEach((entry, i) => states.push(Object.assign(base(entry), { isFavorite: true, favoritedAt: now - i * 1000 })))
    got.channel.forEach((entry, i) => states.push(Object.assign(base(entry), { isFavorite: true, favoritedAt: now - i * 1000 })))
    await new Promise((resolve, reject) => {
      const tx = db.transaction('userStates', 'readwrite')
      for (const state of states) tx.objectStore('userStates').put(state)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return { movie: got.movie.length, series: got.series.length, channel: got.channel.length }
  })

const guardarChave = (page, key) =>
  idb(
    page,
    (db, payload) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction('integrations', 'readwrite')
        tx.objectStore('integrations').put({ id: 'tmdb', key: payload.key, format: payload.format, state: 'connected', lastTestedAt: 0 })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
    { key, format: key.length > 40 ? 'v4' : 'v3' },
  )

/** Entra na 1ª categoria "de verdade" (nem Todos/Favoritos/Histórico) de Filmes/Séries para o app obtê-la. */
async function obterUmaCategoria(page, destino) {
  await openShowcase(page, destino)
  const nome = await page.locator('.vod-showcase .side-category-nav-item').evaluateAll((els) => {
    const itens = els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    // Os itens fixos (Todos, Favoritos, Histórico) trazem um glifo na frente do texto: fora todos eles.
    return itens.find((texto) => !/Todos|Favoritos|Histórico|^[★↺]/.test(texto)) ?? null
  })
  if (!nome) throw new Error(`sem categoria real em ${destino}`)
  // O texto do item traz o glifo na frente e a contagem atrás: `openVodCategory` procura só o nome.
  await openVodCategory(page, nome.replace(/^\S/, '').replace(/\d+$/, '').trim())
  await page.waitForSelector('.vod-grid .content-card', { timeout: 60000 })
  await page.keyboard.press('Escape')
  await page.waitForSelector('.vod-showcase', { timeout: 8000 })
}

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const fixedPath = '/opt/pw-browsers/chromium'
  const options = { locale: 'pt-BR', viewport: { width: 1920, height: 1080 } }
  const launch = existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true }
  let browser = null
  let context
  if (USER_DATA) context = await chromium.launchPersistentContext(USER_DATA, { ...launch, ...options })
  else {
    browser = await chromium.launch(launch)
    context = await browser.newContext(options)
  }
  const page = context.pages()[0] ?? (await context.newPage())
  pageRef = page

  const pageErrors = []
  const consoleTexts = []
  let dataRequests = 0
  const dataHosts = new Set()
  page.on('pageerror', (error) => pageErrors.push(`[${current}] ${String(error).slice(0, 90)}`))
  page.on('console', (message) => consoleTexts.push(message.text()))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/player_api.php' || url.hostname === 'api.themoviedb.org') {
      dataRequests += 1
      dataHosts.add(url.hostname === 'api.themoviedb.org' ? 'tmdb' : 'painel')
    }
  })

  try {
    // Perfil persistente: nunca começa num idioma deixado por uma rodada interrompida.
    await page.goto(APP_URL)
    await page.evaluate(() => window.localStorage.removeItem('ccplaytv:app-language'))
    await scenario('Preparo: lista real importada (só estrutura) e Início aberto', async () => {
      await abrirInicio(page)
      assert((await page.locator('.home-content').count()) === 1, 'o Início abre com a lista real')
    })
    if (failures > 0) throw new Error('o preparo falhou: sem Início da lista real não há o que verificar')

    await scenario('7. Boas-vindas: lista sem progresso nem favoritos (US1/AC8)', async () => {
      const estado = await idb(page, async (db) => {
        const count = (store) => new Promise((resolve) => { const r = db.transaction(store).objectStore(store).count(); r.onsuccess = () => resolve(r.result) })
        return { userStates: await count('userStates') }
      })
      if (estado.userStates > 0) return unknown('o perfil reaproveitado já tem estado do usuário; rode sem CCPLAY_USER_DATA para ver a boas-vindas')
      const description = await page.locator('.home-hero-description').count()
      assert(description === 1, 'o billboard de boas-vindas aparece (descrição com os atalhos)')
      assert((await heroState(page)) === 'expanded', 'e abre expandido')
      assert((await page.locator('.home-hero-action').count()) >= 1, 'com atalhos focáveis (nenhum beco)')
      await shot(page, '07-boas-vindas')
    })

    await scenario('Preparo: categorias obtidas, chave TMDB e estado do usuário semeado', async () => {
      await obterUmaCategoria(page, 'movies')
      await obterUmaCategoria(page, 'series')
      let counts = { movie: 0, series: 0, channel: 0 }
      for (let i = 0; i < 45; i += 1) {
        counts = await contarBlocos(page)
        if (counts.movie >= 4 && counts.series >= 2 && counts.channel >= 3) break
        await page.waitForTimeout(2000)
      }
      note(`itens já obtidos no aparelho: ${counts.movie} filmes, ${counts.series} séries, ${counts.channel} canais`)
      const semeado = await semear(page)
      note(`estado semeado: ${semeado.movie} filmes, ${semeado.series} séries, ${semeado.channel} canais`)
      assert(semeado.movie >= 4, 'filmes suficientes para semear progresso, concluído e favoritos')
      if (semeado.channel < 3) unknown('canais favoritos: a lista não tinha canais já obtidos no aparelho (cenário "Canais favoritos" limitado)')
      if (TMDB_KEY) await guardarChave(page, TMDB_KEY)
      else unknown('sem CCPLAY_PROBE_TMDB_KEY: cenários de TMDB (Trailer, Top 10, Dica, Porque você assistiu) ficam limitados')
      dataRequests = 0
      await abrirInicio(page)
    })
    if (failures > 0) throw new Error('o preparo falhou: sem categorias obtidas e estado semeado os cenários não valem')

    await scenario('1. Billboard com título em andamento (US1/AC1)', async () => {
      assert((await heroState(page)) === 'expanded', 'o Início abre com o billboard expandido')
      await irAoBillboard(page)
      const primary = page.locator('.home-hero-action--primary')
      // Os dados do billboard (duração, imagens) chegam adiados: espera e lê texto e barra no MESMO instante.
      await page.waitForTimeout(2500)
      const lido = await primary.evaluate((el) => ({ label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(), bar: el.querySelector('.home-hero-progress') !== null }))
      const label = lido.label
      assert(/Continuar/.test(label), 'a ação primária é "Continuar" (há título em andamento)')
      const hasBar = lido.bar
      const hasRemaining = /faltam/i.test(label)
      assert(hasBar === hasRemaining, `barra e "faltam X" andam juntos, só com duração conhecida (barra: ${hasBar}, faltam: ${hasRemaining}; rótulo lido: "${label.slice(0, 40)}")`)
      assert((await page.locator('.home-row').count()) >= 1, 'a 1ª fileira aparece abaixo do billboard')
      await shot(page, '01-billboard')
      if (!hasBar) {
        // Abre o detalhe para o app guardar a duração (get_vod_info) e volta: agora o "faltam X" pode aparecer.
        await press(page, 'ArrowRight')
        await page.keyboard.press('Enter')
        await page.waitForSelector('.vod-detail', { timeout: 15000 })
        await page.waitForTimeout(4000)
        await page.keyboard.press('Escape')
        await page.waitForSelector('.home-content', { timeout: 15000 })
        await page.waitForTimeout(1500)
        const after = page.locator('.home-hero-action--primary')
        const barAfter = (await after.locator('.home-hero-progress').count()) > 0
        const remainingAfter = /faltam/i.test(clean(await after.textContent()))
        note(`depois de abrir o detalhe (duração guardada): barra ${barAfter}, faltam ${remainingAfter}`)
        assert(barAfter === remainingAfter, 'barra e "faltam X" continuam consistentes')
      }
    })

    await scenario('2. Fundo do billboard nunca vazio (US1/AC2)', async () => {
      const fundo = await page.evaluate(() => {
        const ambient = document.querySelector('.home-ambient')
        if (!ambient) return { exists: false }
        const style = getComputedStyle(ambient)
        return { exists: true, img: ambient.querySelectorAll('img').length, bg: style.backgroundImage !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)' }
      })
      assert(fundo.exists, 'a camada de fundo ambiente existe')
      assert(fundo.img > 0 || fundo.bg, `o fundo tem imagem (${fundo.img}) ou cor/gradiente (${fundo.bg}) — nunca área vazia`)
      unknown('título sem backdrop e sem imagem na listagem: não dá para forçar com a lista real (coberto pelo E2E com fixtures e pelo teste do `useCoverColor`)')
    })

    await scenario('3. Recolher e expandir (US1/AC3)', async () => {
      await irAoBillboard(page)
      const antes = await page.locator('.home-hero-action.tv-focus').textContent()
      await page.keyboard.press('ArrowDown')
      await page.waitForSelector('.home-row .tv-focus', { timeout: 6000 })
      await page.waitForTimeout(600)
      assert((await heroState(page)) === 'collapsed', '↓ recolhe o billboard')
      const topo = await page.evaluate(() => {
        const row = document.querySelector('.home-row .tv-focus')?.closest('.home-row')
        const topbar = document.querySelector('.topbar')
        return { rowTop: row?.getBoundingClientRect().top ?? -1, topbarBottom: topbar?.getBoundingClientRect().bottom ?? 0 }
      })
      assert(topo.rowTop >= topo.topbarBottom - 1 && topo.rowTop <= topo.topbarBottom + 160, `a fileira focada sobe para logo abaixo da topbar (distância ${Math.round(topo.rowTop - topo.topbarBottom)} px)`)
      assert((await page.locator('.home-card.is-expanded, .home-live-card.tv-focus').count()) >= 1, 'o card focado está expandido')
      await shot(page, '03-recolhido')
      await page.keyboard.press('ArrowUp')
      await page.waitForSelector('.home-hero-action.tv-focus', { timeout: 6000 })
      assert((await heroState(page)) === 'expanded', '↑ expande o billboard de novo')
      assert(clean(await page.locator('.home-hero-action.tv-focus').textContent()) === clean(antes), 'com a última ação focada')
      // Ad-hoc 2026-10-09: sem o dock, ↑ nas ações sai direto à topbar.
      assert((await page.locator('.home-dock, .home-hero-dock').count()) === 0, 'o billboard não tem dock de serviços')
      await page.keyboard.press('ArrowUp')
      assert((await page.locator('.topbar .tv-focus').count()) === 1, '↑ nas ações sai para a topbar')
    })

    await scenario('4. Fundo sem consulta: seta segurada não faz requisição (US1/AC4)', async () => {
      await irAoBillboard(page)
      await irAFileira(page) // 1ª fileira de títulos
      await page.waitForTimeout(1500)
      const antes = dataRequests
      await press(page, 'ArrowRight', 14, 40)
      await press(page, 'ArrowDown', 2, 40)
      await press(page, 'ArrowRight', 8, 40)
      await page.waitForTimeout(800)
      assert(dataRequests === antes, `andar pelos cards (com seta segurada) não consulta painel nem TMDB (${dataRequests - antes} requisições)`)
    })

    await scenario('8/9. Cards, selos, expansão e ponta da fileira (US2)', async () => {
      await irAoBillboard(page)
      await irAFileira(page, 'added-movies').catch(() => irAFileira(page))
      await page.waitForTimeout(800)
      const sizes = await page.evaluate(() => {
        const box = (el) => (el ? { w: el.offsetWidth, h: el.offsetHeight } : null)
        return {
          portrait: box(document.querySelector('.home-card--poster:not(.is-expanded), .home-card--rank:not(.is-expanded)')),
          expanded: box(document.querySelector('.home-card.is-expanded')),
          numerals: document.querySelectorAll('.home-rank-numeral').length,
          newBadges: document.querySelectorAll('.home-badge--new').length,
          ratingBadges: [...document.querySelectorAll('.home-badge--rating')].map((el) => (el.textContent ?? '').trim()),
          marks: document.querySelectorAll('.home-mark').length,
        }
      })
      if (sizes.portrait) assert(sizes.portrait.w === 250 && sizes.portrait.h === 375, `o pôster tem 250 × 375 (${sizes.portrait.w} × ${sizes.portrait.h})`)
      else unknown('nenhum pôster fora do foco na tela para medir')
      if (sizes.expanded) note(`card expandido mede ${sizes.expanded.w} × ${sizes.expanded.h} (667 × 375 no pôster; 600 × 338 no Continuar)`)
      assert(sizes.ratingBadges.every((text) => /\d/.test(text)), `todo selo ★ traz uma nota (${sizes.ratingBadges.length} selos)`)
      note(`selos NOVO visíveis: ${sizes.newBadges}; marcas ✓/♥: ${sizes.marks}; numerais do Top 10: ${sizes.numerals}`)
      // Ponta da fileira: → muitas vezes não sai da fileira e o foco fica no último card.
      const linha = await focusedRow(page)
      await press(page, 'ArrowRight', 60, 20)
      const fim1 = await focusedCard(page)
      await press(page, 'ArrowRight', 3, 20)
      assert((await focusedRow(page)) === linha, '→ no último card não sai da fileira')
      assert((await focusedCard(page)) === fim1, 'o foco para na ponta')
      await shot(page, '09-ponta')
    })

    await scenario('5. Voltar restaura a fileira e o card de origem (US1/AC6)', async () => {
      await irAoBillboard(page)
      await irAFileira(page) // a 1ª fileira de títulos abre o detalhe com OK
      await press(page, 'ArrowRight', 2, 60)
      await page.waitForTimeout(400)
      const linha = await focusedRow(page)
      const card = await focusedCard(page)
      await page.keyboard.press('Enter')
      await page.waitForSelector('.vod-detail, .player-overlay, .person-screen', { timeout: 15000 })
      if ((await page.locator('.player-overlay').count()) > 0) await page.keyboard.press('Escape')
      else await page.keyboard.press('Escape')
      await page.waitForSelector('.home-content', { timeout: 15000 })
      await page.waitForSelector('.home-row .tv-focus', { timeout: 8000 })
      assert((await focusedRow(page)) === linha && (await focusedCard(page)) === card, 'voltar reabre o Início na mesma fileira e no mesmo card (por id)')
      assert((await heroState(page)) === 'collapsed', 'sem varrer a tela a partir do billboard')
    })

    await scenario('10/11. Fileiras novas e ordem do FR-018 (US3)', async () => {
      const keys = await rowKeys(page)
      note(`fileiras presentes: ${keys.join(' > ')}`)
      const ordem = keys.map((k) => ROW_ORDER.indexOf(k))
      assert(ordem.every((v) => v >= 0) && ordem.every((v, i) => i === 0 || v > ordem[i - 1]), 'as fileiras presentes seguem a ordem do FR-018')
      assert(keys.includes('continue'), '"Continuar assistindo" presente')
      for (const key of ['added-movies']) {
        if (keys.includes(key)) {
          const aviso = await page.locator(`.home-row[data-row="${key}"] .home-row-coverage`).count()
          note(`"${key}": aviso de cobertura parcial ${aviso > 0 ? 'presente' : 'ausente (cobertura total ou ainda carregando)'}`)
        } else unknown(`fileira "${key}" ausente (sem categorias de filmes com data de inclusão já obtidas?)`)
      }
      assert(!keys.includes('added-series') || (await page.locator('.home-row[data-row="added-series"] .home-card').count()) > 0, '"Séries adicionadas" só existe com dado (no Xtream a série não traz data de inclusão)')
      if (keys.includes('channels')) {
        const live = await page.locator('.home-row[data-row="channels"] .home-live-card').count()
        note(`"Canais favoritos": ${live} ícones`)
        assert(live >= 1, '"Canais favoritos" traz os canais favoritos')
        assert((await page.locator('.home-row[data-row="channels"] .home-see-all').count()) === 1, '"Canais favoritos" termina no "Ver todos"')
      } else unknown('"Canais favoritos" ausente (sem canais favoritos semeados)')
      // Ad-hoc 2026-10-09: o Início só tem fileiras do aparelho — nada de Top 10, Dica, "Porque você assistiu" nem Curadoria IA.
      assert(keys.every((k) => ROW_ORDER.includes(k)), `só fileiras do aparelho no Início (${keys.join(', ')})`)
      await shot(page, '10-fileiras')
      // Filmes: o "Porque você assistiu" real ou ausente, nunca um "Em breve".
      await openShowcase(page, 'movies')
      // A vitrine é virtualizada (só as fileiras perto do foco existem no DOM): percorre com ↓ e junta os rótulos vistos.
      const rotulosDe = () => page.locator('.vod-showcase section.vod-row').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))
      const vistos = new Set()
      await page.waitForTimeout(2500)
      await page.keyboard.press('ArrowRight') // da lista lateral para as fileiras
      for (let i = 0; i < 16; i += 1) {
        for (const rotulo of await rotulosDe()) vistos.add(rotulo)
        await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(350)
      }
      const rotulos = [...vistos]
      const porque = rotulos.some((r) => /porque você assistiu/i.test(r))
      note(`Filmes: ${rotulos.length} fileiras percorridas; "Porque você assistiu" ${porque ? 'presente' : 'ausente'}; Dica ${rotulos.some((r) => /^Dica/i.test(r)) ? 'presente' : 'ausente'}`)
      assert((await page.locator('.vod-showcase .vod-slot-card').count()) === 0, 'Filmes sem nenhum slot "Em breve"')
      await shot(page, '11-filmes')
    })

    await scenario('6. Billboard só com a primária e "Minha Lista" (ad-hoc 2026-10-09)', async () => {
      await irAoBillboard(page)
      const acoes = await page.locator('.home-hero-action').evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()))
      note(`ações do billboard: ${acoes.join(' | ')}`)
      assert(acoes.length === 2, 'o billboard tem duas ações')
      assert(!acoes.some((a) => /Mais informações|More info|Más información|Trailer|Tráiler/.test(a)), 'sem "Mais informações" e sem Trailer')
    })

    await scenario('12. Player a partir do Continuar (FR-027)', async () => {
      await page.waitForSelector('.home-hero-action', { timeout: 6000 })
      for (let i = 0; i < 5; i += 1) {
        if (/Continuar|Assistir/.test(clean(await page.locator('.home-hero-action.tv-focus').textContent().catch(() => '')))) break
        await page.keyboard.press('ArrowLeft')
      }
      await page.keyboard.press('Enter')
      await page.waitForSelector('.player-overlay', { timeout: 20000 })
      const estrutura = await page.evaluate(() => {
        const overlay = document.querySelector('.player-overlay')
        const style = overlay ? getComputedStyle(overlay) : null
        const root = overlay?.closest('.screen')
        const topEl = document.elementFromPoint(960, 540)
        return {
          noScreen: Boolean(root),
          opaco: style ? style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent' : false,
          porCima: Boolean(topEl && overlay?.contains(topEl)),
          homeNoDom: document.querySelectorAll('.home-hero, .home-row').length,
        }
      })
      assert(estrutura.noScreen, 'a camada do player vive dentro do `.screen` (a regra do plano de hardware cobre o Início)')
      assert(estrutura.opaco && estrutura.porCima, 'no navegador a camada é opaca e fica por cima do Início (nada da Home pintado sobre o vídeo)')
      unknown('o plano de hardware do AVPlay (`video-plane-visible`) nunca vale no navegador de dev; a prova real é da TV física (declarada)')
      await page.keyboard.press('Escape')
      await page.waitForSelector('.home-content', { timeout: 15000 })
      await page.waitForSelector('.home-hero-action.tv-focus', { timeout: 8000 })
      assert(/Continuar|Assistir/.test(clean(await page.locator('.home-hero-action.tv-focus').textContent())), 'ao fechar, o foco volta ao "Continuar" do billboard')
    })

    await scenario('13. Idiomas: en e es (FR-025)', async () => {
      // id do item → nome mostrado, para o que está desenhado agora (o nome é do provedor e nunca se traduz).
      const nomes = () =>
        page.locator('.home-card[data-item-id], .home-live-card[data-item-id]').evaluateAll((els) =>
          Object.fromEntries(els.map((el) => [el.getAttribute('data-item-id'), (el.querySelector('.home-card-title, .home-live-name')?.textContent ?? '').replace(/\s+/g, ' ').trim()])),
        )
      await irAoBillboard(page)
      await irAFileira(page)
      await page.waitForTimeout(600)
      const nomesPt = await nomes()
      const esperado = { en: ['Continue watching', 'Welcome', '▶ Continue'], es: ['Seguir viendo', 'Bienvenida', '▶ Continuar'] }
      try {
      for (const language of ['en', 'es']) {
        await page.evaluate((value) => window.localStorage.setItem('ccplaytv:app-language', value), language)
        await abrirInicio(page)
        await irAoBillboard(page)
        const heroText = clean(await page.locator('.home-hero-action--primary').textContent())
        assert(heroText.includes(esperado[language][2]), `[${language}] a ação primária está traduzida ("${heroText.slice(0, 40)}")`)
        // Os rótulos das fileiras chegam depois do 1º desenho (dados adiados): espera até 8 s pelo da 1ª fileira.
        let rotulos = []
        for (let i = 0; i < 16; i += 1) {
          rotulos = await page.locator('.home-row').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))
          if (rotulos.includes(esperado[language][0])) break
          await page.waitForTimeout(500)
        }
        assert(rotulos.includes(esperado[language][0]), `[${language}] o rótulo "${esperado[language][0]}" da fileira está traduzido`)
        assert(!rotulos.some((r) => /Continuar assistindo|Filmes adicionados|Canais favoritos/.test(r)), `[${language}] nenhum rótulo de fileira ficou em português`)
        await irAFileira(page)
        await page.waitForTimeout(600)
        const nomesOutro = await nomes()
        const comuns = Object.keys(nomesOutro).filter((id) => id in nomesPt && nomesPt[id] !== '')
        assert(comuns.length > 0 && comuns.every((id) => nomesOutro[id] === nomesPt[id]), `[${language}] nomes de título/canal do provedor permanecem intactos (${comuns.length} itens comparados por id)`)
      }
      await shot(page, '13-es')
      } finally {
        await page.evaluate(() => window.localStorage.removeItem('ccplaytv:app-language')).catch(() => {})
      }
    })

    await scenario('Checklist: segredos e erros', async () => {
      const html = await page.content()
      assert(!SECRETS.some((secret) => html.includes(secret)), 'nenhuma credencial/chave no DOM')
      assert(!consoleTexts.some((text) => SECRETS.some((secret) => text.includes(secret))), 'nenhuma credencial/chave no console')
      assert(!consoleTexts.some((text) => /\/player_api\.php\?|username=|password=/.test(text)), 'nenhuma URL de painel com credencial no console')
      assert(pageErrors.length === 0, `sem erros de página (${pageErrors.length}${pageErrors[0] ? `: ${pageErrors[0]}` : ''})`)
      note(`hosts de dados consultados nesta rodada: ${[...dataHosts].join(', ') || 'nenhum'}`)
    })
  } finally {
    await context.close()
    if (browser) await browser.close()
  }

  console.log(`\n${failures === 0 ? 'Tudo certo' : `${failures} verificação(ões) falharam`}; ${inconclusive} item(ns) não verificável(is) no navegador.`)
  process.exit(failures > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error(String(error.message ?? error).split('\n')[0])
  process.exit(1)
})
