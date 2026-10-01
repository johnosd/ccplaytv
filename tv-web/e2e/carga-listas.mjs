// Roteiro E2E da feature 038 (carga de listas, pré-carga, contagens e
// atualização) — gate da constitution ("Testes E2E antes da TV física").
//
// Painel Xtream FICTÍCIO criado por este script (nunca uma fonte real), com
// atraso por categoria para dar para observar a ordem e a cadência dos
// pedidos. O servidor registra quando cada pedido de categoria começa.
//
// Pré-requisito: `npm run dev` rodando (http://localhost:5173).
//
// Cenários (quickstart.md): 3 pré-carga ociosa + entrada instantânea +
// contagem no trilho; 4 cede à navegação; 5 player aberto pausa.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const APP_URL = 'http://localhost:5173'
const PANEL_USER = 'usuario'
const PANEL_PASS = 'senha'
/** Atraso de cada resposta de categoria — a pré-carga do catálogo leva segundos, não milissegundos. */
const CATEGORY_DELAY_MS = 250
/** Atraso da seção inteira — maior, para os cenários verem a gravação pausar (tecla/player). */
const SECTION_DELAY_MS = 1200

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

const LIVE = [1, 2, 3].map((n) => ({ category_id: String(n), category_name: `Canais ${n}` }))
const VOD = Array.from({ length: 12 }, (_, i) => ({ category_id: String(100 + i), category_name: `Filmes ${i + 1}` }))
const SERIES = [200, 201].map((id, i) => ({ category_id: String(id), category_name: `Séries ${i + 1}` }))

function itemsFor(action, categoryId) {
  const base = Number(categoryId) * 100
  if (action === 'get_live_streams') {
    return Array.from({ length: 4 }, (_, i) => ({ stream_id: base + i, name: `Canal ${base + i}`, category_id: categoryId }))
  }
  if (action === 'get_vod_streams') {
    return Array.from({ length: 5 }, (_, i) => ({
      stream_id: base + i,
      name: panel.rename[String(base + i)] ?? `Filme ${base + i}`,
      category_id: categoryId,
      stream_type: 'movie',
    }))
  }
  return Array.from({ length: 3 }, (_, i) => ({ series_id: String(base + i), name: `Série ${base + i}`, category_id: categoryId }))
}

/** Configuração do painel falso, mudada entre cenários. */
const panel = {
  seriesEmpty: false,
  xmltv: 'ok',
  /** stream_id → nome novo (renovação troca o nome, mantém a identidade). */
  rename: {},
  /** Categorias de filmes que o painel deixou de declarar. */
  removedVod: new Set(),
  /** Conteúdo do M3U avulso servido em /lista.m3u. */
  m3u: '',
}

const XMLTV_OK =
  '<?xml version="1.0" encoding="UTF-8"?><tv>' +
  '<channel id="c100"><display-name>Canal 100</display-name></channel>' +
  '<programme channel="c100" start="20260101000000 +0000" stop="20260101010000 +0000"><title>Programa</title></programme>' +
  '</tv>'

function startPanelServer(log) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname === '/lista.m3u') {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(panel.m3u)
      return
    }
    if (url.pathname === '/xmltv.php') {
      if (panel.xmltv === 'ok') {
        res.writeHead(200, { 'Content-Type': 'application/xml' })
        res.end(XMLTV_OK)
      } else {
        res.writeHead(500)
        res.end()
      }
      return
    }
    if (url.pathname !== '/player_api.php') {
      res.writeHead(404)
      res.end()
      return
    }
    const action = url.searchParams.get('action')
    const categoryId = url.searchParams.get('category_id')
    const send = (body, delay = 0) =>
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
      }, delay)

    if (action === 'get_live_categories') return send(LIVE)
    if (action === 'get_vod_categories') return send(VOD.filter((c) => !panel.removedVod.has(c.category_id)))
    if (action === 'get_series_categories') return send(panel.seriesEmpty ? [] : SERIES)
    if (categoryId && ['get_live_streams', 'get_vod_streams', 'get_series'].includes(action)) {
      log.push({ at: Date.now(), action, categoryId })
      return send(itemsFor(action, categoryId), CATEGORY_DELAY_MS)
    }
    // Seção inteira (feature 038, R0-3): todos os itens de todas as categorias declaradas.
    if (['get_live_streams', 'get_vod_streams', 'get_series'].includes(action)) {
      log.push({ at: Date.now(), action, categoryId: '*' })
      const declared =
        action === 'get_live_streams'
          ? LIVE
          : action === 'get_vod_streams'
            ? VOD.filter((c) => !panel.removedVod.has(c.category_id))
            : panel.seriesEmpty
              ? []
              : SERIES
      return send(declared.flatMap((c) => itemsFor(action, c.category_id)), SECTION_DELAY_MS)
    }
    if (action) return send([])
    return send({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Lista nova, num contexto novo (IndexedDB vazio), aberta no Início. */
async function freshListOpen(browser, panelUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error', error?.message ?? ''))
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: name, url: panelUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.home-content', { timeout: 10000 })
  return { context, page }
}

const TOTAL_CATEGORIES = LIVE.length + VOD.length + SERIES.length

/** Quantas categorias já têm itens no aparelho (lido do IndexedDB do próprio app). */
async function readyCount(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('ccplaytv')
    const handle = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = await new Promise((resolve) => {
      const query = handle.transaction('categories').objectStore('categories').getAll()
      query.onsuccess = () => resolve(query.result)
    })
    handle.close()
    return all.filter((category) => category.itemsFetchedAt !== undefined).length
  })
}

/** Configurações › Fontes IPTV › "Ressincronizar" da (única) lista, até voltar ao Início. */
async function resyncViaSettings(page) {
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })
  await page.keyboard.press('ArrowRight') // abas -> painel (coluna "Editar")
  await page.waitForSelector('.sources-panel-row .tv-focus', { timeout: 4000 })
  await page.keyboard.press('ArrowRight') // Editar -> Ressincronizar
  await page.keyboard.press('Enter')
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.home-content', { timeout: 10000 })
}

const focusedCardTitle = (page) =>
  page.evaluate(
    () =>
      document.querySelector('.vod-grid-cell .tv-focus')?.closest('.vod-grid-cell')?.querySelector('.content-card-title')
        ?.textContent ?? null,
  )

/** Envelhece uma categoria direto no IndexedDB do app (> 24 h) — sem mexer no relógio. */
async function ageCategory(page, name, ageMs) {
  await page.evaluate(
    async ({ name, ageMs }) => {
      const request = indexedDB.open('ccplaytv')
      const handle = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const tx = handle.transaction('categories', 'readwrite')
      const store = tx.objectStore('categories')
      const all = await new Promise((resolve) => {
        const query = store.getAll()
        query.onsuccess = () => resolve(query.result)
      })
      for (const category of all) {
        if (category.name === name && category.itemsFetchedAt !== undefined) {
          category.itemsFetchedAt = Date.now() - ageMs
          store.put(category)
        }
      }
      await new Promise((resolve) => {
        tx.oncomplete = resolve
      })
      handle.close()
    },
    { name, ageMs },
  )
}

async function waitAllPrefetched(page, log, total) {
  const deadline = Date.now() + 30000
  while (new Set(log.map((e) => `${e.action}:${e.categoryId}`)).size < total && Date.now() < deadline) {
    await page.waitForTimeout(250)
  }
}

async function run() {
  const log = []
  const server = await startPanelServer(log)
  const panelUrl = `http://127.0.0.1:${server.address().port}/get.php?username=${PANEL_USER}&password=${PANEL_PASS}`
  const browser = await launchBrowser()

  try {
    for (const [scenario, xmltv] of [['1', 'ok'], ['2', 'fail']]) {
      console.log(`=== Cenário ${scenario}: tela de importação por parte (guia ${xmltv === 'ok' ? 'sincroniza' : 'falha'}) ===`)
      panel.seriesEmpty = true
      panel.xmltv = xmltv
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
      const page = await context.newPage()
      await page.goto(APP_URL)
      await page.waitForSelector('.add-card', { timeout: 10000 })
      await page.keyboard.press('Enter')
      await page.waitForSelector('#add-source-title', { timeout: 8000 })
      await cadastrarListaM3u(page, { nome: `Lista E2E 038 tela ${scenario}`, url: panelUrl })
      await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
      const rowsText = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.progress-section')].map((li) => li.textContent ?? ''),
        )
      await page.waitForFunction(
        () => !/GuiaCarregando|GuiaAguardando/.test([...document.querySelectorAll('.progress-section')].map((li) => li.textContent).join('|')),
        null,
        { timeout: 20000 },
      )
      const rows = await rowsText()
      assert(rows[0] === 'CanaisPronto — 3 categorias', `Canais com a contagem real (${rows[0]})`)
      assert(rows[1] === 'FilmesPronto — 12 categorias', `Filmes com a contagem real (${rows[1]})`)
      assert(rows[2] === 'SériesNão disponível nesta lista', `Séries vazia = "Não disponível", nunca "0" (${rows[2]})`)
      if (xmltv === 'ok') assert(rows[3] === 'GuiaPronto', `Guia pronto (${rows[3]})`)
      else assert(/^GuiaFalhou — .*\(EPG-02\)$/.test(rows[3]), `Guia falhou com motivo categorizado (${rows[3]})`)
      const body = (await page.textContent('body')) ?? ''
      assert(!/\d\s?%/.test(body), 'nenhum percentual na tela')
      assert(!/https?:\/\//.test(rows.join(' ')), 'nenhum endereço nas linhas')
      const focused = await page.evaluate(() => document.activeElement?.textContent ?? '')
      assert(focused.includes('Abrir lista'), `"Abrir lista" em foco (${focused})`)
      assert(body.includes('continuam chegando em segundo plano'), 'a tela diz que os itens continuam chegando')
      await context.close()
    }
    panel.seriesEmpty = false
    panel.xmltv = 'ok'

    console.log('=== Cenário 3: pré-carga ociosa, uma por vez, e entrada instantânea ===')
    {
      log.length = 0
      const { context, page } = await freshListOpen(browser, panelUrl, 'Lista E2E 038 A')
      // US6: linha de estado no Início enquanto a pré-carga corre.
      await page.waitForSelector('.home-status-line', { timeout: 5000 }).catch(() => {})
      await page
        .waitForFunction(() => /Preparando catálogo — \d+ de 17 categorias/.test(document.querySelector('.home-status-line')?.textContent ?? ''), null, {
          timeout: 8000,
        })
        .catch(() => {})
      const preparing = await page.locator('.home-status-line').textContent().catch(() => null)
      assert(/^Preparando catálogo — \d+ de 17 categorias$/.test(preparing ?? ''), `Início diz "Preparando catálogo — N de M" (${preparing})`)
      const lineFocusable = await page.evaluate(() => {
        const line = document.querySelector('.home-status-line')
        return !!line && (line.tabIndex >= 0 || line.classList.contains('tv-focus') || document.activeElement === line)
      })
      assert(!lineFocusable, 'a linha de estado não é focável nem tem foco')
      const deadline = Date.now() + 30000
      while ((await readyCount(page)) < TOTAL_CATEGORIES && Date.now() < deadline) {
        await page.waitForTimeout(250)
      }
      assert((await readyCount(page)) === TOTAL_CATEGORIES, `parado no Início, as ${TOTAL_CATEGORIES} categorias ficam prontas sozinhas`)
      // R0-3: uma requisição por SEÇÃO, nunca uma por categoria (o painel limita a frequência).
      const sections = log.filter((e) => e.categoryId === '*').map((e) => e.action)
      assert(
        JSON.stringify(sections) === JSON.stringify(['get_live_streams', 'get_vod_streams', 'get_series']),
        `3 pedidos, um por seção, Canais primeiro (${sections.join(', ')})`,
      )
      assert(log.filter((e) => e.categoryId !== '*').length === 0, 'nenhum pedido por categoria com a pessoa parada')
      const gaps = log.slice(1).map((e, i) => e.at - log[i].at)
      assert(gaps.every((gap) => gap >= SECTION_DELAY_MS), 'uma seção por vez (nenhum pedido começa antes do anterior responder)')
      await page
        .waitForFunction(() => (document.querySelector('.home-status-line')?.textContent ?? '').startsWith('Catálogo atualizado'), null, {
          timeout: 5000,
        })
        .catch(() => {})
      const done = await page.locator('.home-status-line').textContent().catch(() => null)
      assert(done === 'Catálogo atualizado agora', `ao terminar, a linha diz há quanto tempo foi atualizado (${done})`)
      // Descer pelo Início nunca passa pela linha (foco só em controles).
      for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown')
      for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
      assert(
        (await page.locator('.home-status-line.tv-focus').count()) === 0,
        'navegar pelo Início não põe foco na linha',
      )

      const before = log.length
      await openViaTopbar(page, 'movies')
      await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, { timeout: 8000 })
      const counted = await page.evaluate(() => {
        const item = [...document.querySelectorAll('.side-category-nav-item')].find(
          (el) => el.querySelector('.side-category-nav-label')?.textContent === 'Filmes 1',
        )
        return item?.querySelector('.side-category-nav-count')?.textContent ?? null
      })
      if (counted !== '5') {
        const dom = await page.evaluate(() =>
          [...document.querySelectorAll('.side-category-nav-item')].slice(0, 6).map((el) => el.outerHTML.slice(0, 260)),
        )
        console.log('  [debug trilho]', JSON.stringify(dom))
      }
      assert(counted === '5', `a contagem real aparece no trilho antes de entrar (${counted})`)
      await page.keyboard.press('ArrowRight')
      await page.waitForSelector('.vod-grid .content-card, .vod-grid-cell', { timeout: 3000 })
      await page.waitForTimeout(500)
      assert(log.length === before, 'entrar numa categoria já pré-carregada não pede nada ao painel')
      await context.close()
    }

    console.log('=== Cenário 3b: contagem chega sem mover foco nem rolagem (US4-AC4, FR-022) ===')
    {
      log.length = 0
      const { context, page } = await freshListOpen(browser, panelUrl, 'Lista E2E 038 A2')
      await openViaTopbar(page, 'movies')
      await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, { timeout: 8000 })
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown') // Filmes 1 -> Filmes 3
      const focusedLabel = () => page.locator('.side-category-nav-item.tv-focus .side-category-nav-label').textContent()
      const countsNow = () => page.locator('.side-category-nav-count').count()
      const before = await countsNow()
      const scrollBefore = await page.evaluate(() => document.querySelector('.side-category-nav')?.scrollTop ?? 0)
      // Parado: a pré-carga começa pela focada e vizinhas, e as contagens aparecem.
      await page.waitForFunction((n) => document.querySelectorAll('.side-category-nav-count').length > n + 3, before, { timeout: 15000 })
      assert((await countsNow()) > before, `contagens aparecem com a pessoa parada no trilho (${before} → ${await countsNow()})`)
      assert((await focusedLabel()) === 'Filmes 3', 'o foco continua em "Filmes 3" enquanto os números chegam')
      const scrollAfter = await page.evaluate(() => document.querySelector('.side-category-nav')?.scrollTop ?? 0)
      assert(scrollAfter === scrollBefore, 'a rolagem do trilho não muda')
      const sectionOrder = log.filter((e) => e.categoryId === '*').map((e) => e.action)
      // Canais já foram pedidos no Início (sem dica ainda); com a pessoa em Filmes, Filmes passa na frente de Séries.
      assert(
        sectionOrder.indexOf('get_vod_streams') !== -1 &&
          (sectionOrder.indexOf('get_series') === -1 || sectionOrder.indexOf('get_vod_streams') < sectionOrder.indexOf('get_series')),
        `a seção de onde a pessoa está (Filmes) vem antes de Séries (${sectionOrder.join(', ')})`,
      )
      await context.close()
    }

    console.log('=== Cenário 4: cede à navegação ===')
    {
      log.length = 0
      const { context, page } = await freshListOpen(browser, panelUrl, 'Lista E2E 038 B')
      // Tecla a cada 150 ms por 5 s (nunca repousa os 300 ms da pré-busca por foco).
      const start = Date.now()
      while (Date.now() - start < 5000) {
        await page.keyboard.press(Math.floor((Date.now() - start) / 600) % 2 === 0 ? 'ArrowRight' : 'ArrowLeft')
        await page.waitForTimeout(150)
      }
      const readyWhilePressing = await readyCount(page)
      // A seção de canais já chegou (1,2 s), mas nada foi gravado com a pessoa apertando teclas.
      assert(log.some((e) => e.categoryId === '*'), 'a seção foi pedida')
      assert(readyWhilePressing === 0, `nenhuma categoria é gravada enquanto a pessoa aperta teclas (${readyWhilePressing})`)
      await page.waitForTimeout(3500)
      const readyAfter = await readyCount(page)
      assert(readyAfter > 0, `uns 2 s depois da última tecla, a gravação retoma sozinha (${readyAfter})`)
      await context.close()
    }

    console.log('=== Cenário 5: player aberto pausa a pré-carga ===')
    {
      log.length = 0
      const { context, page } = await freshListOpen(browser, panelUrl, 'Lista E2E 038 C')
      await page.route('**/live/**', (route) => route.abort())
      await openViaTopbar(page, 'live')
      await page.waitForSelector('.live-column-groups', { timeout: 10000 })
      await page.keyboard.press('ArrowRight') // entra na categoria em foco
      await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
      await page.keyboard.press('Enter') // abre o canal: camada de reprodução montada
      await page.waitForSelector('.player-layer, [data-testid="player-layer"], .player-video', { timeout: 8000 })
      await page.waitForTimeout(400) // uma gravação já em curso pode terminar
      const readyAtOpen = await readyCount(page)
      await page.waitForTimeout(6000)
      const readyWhilePlaying = await readyCount(page)
      assert(readyWhilePlaying === readyAtOpen, `nada é gravado com o player aberto (${readyAtOpen} → ${readyWhilePlaying})`)
      assert(readyAtOpen < TOTAL_CATEGORIES, `ainda havia categorias por gravar (${readyAtOpen} de ${TOTAL_CATEGORIES})`)
      await page.keyboard.press('Escape') // RETURN fecha a camada
      await page.waitForTimeout(4000)
      const readyAfterClose = await readyCount(page)
      assert(readyAfterClose > readyWhilePlaying, `ao fechar o player, a pré-carga volta sozinha (${readyAfterClose})`)
      await context.close()
    }

    console.log('=== Cenário 6: atualizar (Xtream) sem esfriar; renovação troca o nome sem mover o foco ===')
    {
      log.length = 0
      panel.rename = {}
      panel.removedVod = new Set()
      const { context, page } = await freshListOpen(browser, panelUrl, 'Lista E2E 038 D')
      await waitAllPrefetched(page, log, TOTAL_CATEGORIES)

      panel.rename = { '10000': 'Filme Renomeado' }
      panel.removedVod = new Set(['111']) // "Filmes 12" saiu do painel
      await resyncViaSettings(page)

      await openViaTopbar(page, 'movies')
      await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, { timeout: 8000 })
      const labels = await page.$$eval('.side-category-nav-label', (els) => els.map((el) => el.textContent))
      assert(!labels.includes('Filmes 12'), 'categoria removida pelo painel sai do trilho')
      assert(labels.includes('Filmes 11'), 'as demais continuam')

      const t0 = Date.now()
      await page.keyboard.press('ArrowRight') // entra em "Filmes 1" (já carregada antes da atualização)
      await page.waitForSelector('.vod-grid-cell .content-card-title', { timeout: 3000 })
      const elapsed = Date.now() - t0
      assert(elapsed < 1500, `categoria que estava pronta abre na hora depois de atualizar (${elapsed} ms)`)

      // Parado na grade: a renovação chega e troca o nome — mesmo item (id preservado), foco no mesmo lugar.
      await page
        .waitForFunction(
          () =>
            document.querySelector('.vod-grid-cell .tv-focus')?.closest('.vod-grid-cell')?.querySelector('.content-card-title')
              ?.textContent === 'Filme Renomeado',
          null,
          { timeout: 20000 },
        )
        .catch(() => {})
      assert((await focusedCardTitle(page)) === 'Filme Renomeado', `o item em foco ganha o nome novo sem o foco sair dele (${await focusedCardTitle(page)})`)

      console.log('=== Cenário 8: categoria vencida (> 24 h) abre na hora e renova atrás ===')
      await page.keyboard.press('ArrowLeft') // volta à trilha ("Filmes 1")
      // As renovações pedidas pela atualização acima ainda correm: espera a
      // fila esvaziar (4 s sem pedido novo), senão "Filmes 2" seria renovada
      // logo depois de envelhecida e a entrada já a encontraria fresca.
      for (let quietSince = Date.now(), seen = log.length; Date.now() - quietSince < 4000; ) {
        await page.waitForTimeout(250)
        if (log.length !== seen) {
          seen = log.length
          quietSince = Date.now()
        }
      }
      const before = log.length
      await ageCategory(page, 'Filmes 2', 25 * 60 * 60 * 1000)
      await page.keyboard.press('ArrowDown') // "Filmes 2"
      const t1 = Date.now()
      await page.keyboard.press('ArrowRight') // entra antes dos 300 ms da pré-busca por foco
      await page.waitForSelector('.vod-grid-cell .content-card-title', { timeout: 3000 })
      const openedAt = Date.now()
      assert(openedAt - t1 < 1500, `vencida abre na hora com o que tem (${openedAt - t1} ms)`)
      const noteShown = await page.locator('text=Não foi possível atualizar agora').count()
      assert(noteShown === 0, 'sem aviso falso de falha ao servir do aparelho')
      await page.waitForTimeout(5000)
      const renewal = log.slice(before).find((e) => e.action === 'get_vod_streams' && e.categoryId === '101')
      assert(renewal !== undefined, 'a renovação da vencida acontece em segundo plano')
      assert(renewal === undefined || renewal.at >= openedAt, 'a entrada não esperou a renovação')
      await context.close()
    }

    console.log('=== Cenário 7: atualizar (M3U guardado) sem esfriar ===')
    {
      panel.m3u = [
        '#EXTM3U',
        '#EXTINF:-1 group-title="Canais",Canal A',
        'http://127.0.0.1:1/live/a.ts',
        '#EXTINF:-1 group-title="Canais",Canal B',
        'http://127.0.0.1:1/live/b.ts',
      ].join('\n')
      const m3uUrl = `http://127.0.0.1:${server.address().port}/lista.m3u`
      const { context, page } = await freshListOpen(browser, m3uUrl, 'Lista E2E 038 M3U')
      await page.waitForTimeout(4000) // pré-carga materializa a categoria (sem rede)

      panel.m3u += '\n#EXTINF:-1 group-title="Canais",Canal C\nhttp://127.0.0.1:1/live/c.ts'
      await resyncViaSettings(page)

      await openViaTopbar(page, 'live')
      await page.waitForSelector('.live-column-groups', { timeout: 10000 })
      const t0 = Date.now()
      await page.keyboard.press('ArrowRight')
      await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 3000 })
      const elapsed = Date.now() - t0
      assert(elapsed < 1500, `categoria M3U que estava pronta abre na hora depois de atualizar (${elapsed} ms)`)
      await page
        .waitForFunction(() => document.querySelectorAll('.live-column-channels .live-item-name').length === 3, null, {
          timeout: 15000,
        })
        .catch(() => {})
      const names = await page.$$eval('.live-column-channels .live-item-name', (els) => els.map((el) => el.textContent))
      assert(names.length === 3 && names.includes('Canal C'), `a renovação traz o canal novo do arquivo (${names.join(', ')})`)
      await context.close()
    }
  } catch (error) {
    failures += 1
    console.error('  ✗ EXCEÇÃO:', error)
  } finally {
    await browser.close()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTodas as verificações passaram.')
}

run()
