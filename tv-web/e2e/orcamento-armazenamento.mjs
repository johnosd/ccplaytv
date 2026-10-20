// Roteiro E2E da feature 082 (orçamento de armazenamento, T048) — gate da constitution ("Testes E2E antes da TV").
//
// Painel Xtream FICTÍCIO criado por este script (nunca uma fonte real) e cota do navegador REDUZIDA por CDP
// (`Storage.overrideQuotaForOrigin`), para o catálogo inteiro NÃO caber no teto (cota − reserva) — o caso da TV com uma
// lista maior que o espaço. Pré-requisito: `npm run dev` rodando (http://localhost:5173).
//
// Cenários:
//   1 — a pré-carga para no teto: o Início mostra a cobertura parcial (`home.status.partial`), nunca STO-01, e a conta
//       própria fica dentro do teto;
//   2 — entrar em categorias além do teto: a categoria abre com itens (a entrada libera as menos usadas), sem STO-01;
//   3 — Voltar de um detalhe restaura o item focado;
//   4 — o guia (EPG) abre, gravado comprimido por canal;
//   5 — trocar de lista e voltar: as categorias continuam listadas e a entrada obtém de novo, sem STO-01.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'
import { openShowcase, openVodCategory, openViaTopbar } from './lib/vod.mjs'

const APP_URL = process.env.CCPLAY_APP_URL ?? 'http://localhost:5173'
const MB = 1024 * 1024
// Reserva mínima = 12 MiB (`BUDGET_RESERVE_MIN_BYTES`): com 13 MiB de cota, o catálogo + guia tem 1 MiB de teto.
const QUOTA_BYTES = 13 * MB
const CAP_BYTES = QUOTA_BYTES - 12 * MB
const VOD = Array.from({ length: 12 }, (_, i) => ({ category_id: String(100 + i), category_name: `Filmes ${String(i + 1).padStart(2, '0')}` }))
const PER_CATEGORY = 4_000
const LIVE = [{ category_id: '1', category_name: 'Canais E2E' }]
const SERIES = [{ category_id: '200', category_name: 'Séries E2E' }]

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

function movies(categoryId) {
  const base = Number(categoryId) * 10_000
  return Array.from({ length: PER_CATEGORY }, (_, i) => ({
    stream_id: base + i,
    // Nomes e capas variados: a compressão precisa de dado parecido com o real.
    name: `Filme ${categoryId}-${i} ${['Ação', 'Drama', 'Comédia', 'Terror'][i % 4]} (${1970 + (i % 55)})`,
    category_id: categoryId,
    stream_type: 'movie',
    container_extension: i % 3 ? 'mp4' : 'mkv',
    stream_icon: `http://img.fixture.invalid/t/p/w600/${((base + i) * 7919).toString(36)}.jpg`,
    added: String(1_600_000_000 + i * 97),
    rating: String((i % 100) / 10),
  }))
}

const channels = () => [
  { stream_id: 1, name: 'Canal A', category_id: '1', epg_channel_id: 'canal.a' },
  { stream_id: 2, name: 'Canal B', category_id: '1', epg_channel_id: 'canal.b' },
]

function xmltv(now) {
  const stamp = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
  const programme = (channel, start, end, title) => `<programme channel="${channel}" start="${stamp(start)}" stop="${stamp(end)}"><title>${title}</title></programme>`
  const hour = 3_600_000
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<tv>', '<channel id="canal.a"><display-name>Canal A</display-name></channel>',
    programme('canal.a', now - hour / 2, now + hour / 2, 'Jornal Comprimido'), programme('canal.a', now + hour / 2, now + 2 * hour, 'Filme Comprimido'),
    programme('canal.b', now - hour, now + hour, 'Esporte Comprimido'), '</tv>'].join('\n')
}

function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    const send = (body, type = 'application/json') => {
      res.writeHead(200, { 'Content-Type': type })
      res.end(typeof body === 'string' ? body : JSON.stringify(body))
    }
    if (url.pathname === '/xmltv.php') return send(xmltv(Date.now()), 'application/xml')
    if (url.pathname !== '/player_api.php') {
      res.writeHead(404)
      res.end()
      return
    }
    const action = url.searchParams.get('action')
    const categoryId = url.searchParams.get('category_id')
    if (action === 'get_live_categories') return send(LIVE)
    if (action === 'get_vod_categories') return send(VOD)
    if (action === 'get_series_categories') return send(SERIES)
    if (action === 'get_live_streams') return send(channels())
    if (action === 'get_vod_streams') return send(categoryId ? movies(categoryId) : VOD.flatMap((c) => movies(c.category_id)))
    if (action === 'get_series') return send([{ series_id: '9001', name: 'Série E2E', category_id: '200' }])
    if (action === 'get_series_info') return send({ episodes: { 1: [{ id: '90011', episode_num: 1, title: 'Episódio 1', container_extension: 'mp4' }] } })
    if (action) return send([])
    return send({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/**
 * Contexto PERSISTENTE com `StaticStorageQuota` desligado: num contexto comum (efêmero) o Chromium ignora
 * `Storage.overrideQuotaForOrigin` e informa a cota do disco (medido: 6,4 GB) — a cota reduzida nunca valeria.
 */
async function launchContext() {
  const fixedPath = '/opt/pw-browsers/chromium'
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ccplaytv-e2e-082-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: existsSync(fixedPath) ? fixedPath : undefined,
    args: ['--disable-features=StaticStorageQuota'],
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
  })
  return { context, userDataDir }
}

/** Conta própria do orçamento e o que está gravado, lidos pelo próprio app (só números). */
async function ledger(page) {
  return page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { catalogLedger } = await import('/src/lib/catalog/storageLedger.ts')
    const value = await catalogLedger(db)
    const categories = await db.categories.toArray()
    return {
      total: value.total,
      fetched: categories.filter((category) => category.kind === 'movie' && category.itemsFetchedAt !== undefined).length,
      epgChunks: await db.table('epgChunks').count(),
      epgRows: await db.epgPrograms.count(),
      projections: await db.catalogReadManifests.count(),
    }
  })
}

const hasSto01 = async (page) => /STO-01/.test(await page.locator('body').innerText())

async function registerPanel(page, name, panelUrl, first) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  if (first) await page.keyboard.press('Enter')
  else await page.locator('.add-card').click()
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: name, url: panelUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 30000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.home-content', { timeout: 10000 })
}

/** Na tela de categoria, espera cartões com títulos de filme e devolve quantos há. */
async function gridCount(page) {
  await page.waitForFunction(() => document.querySelectorAll('.content-card-title').length > 0, null, { timeout: 15000 }).catch(() => {})
  return page.locator('.content-card-title').count()
}

async function backToHome(page) {
  for (let i = 0; i < 6 && (await page.locator('.home-content').count()) === 0; i += 1) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  await page.waitForSelector('.home-content', { timeout: 8000 })
}

async function run() {
  const server = await startPanelServer()
  const panelUrl = `http://127.0.0.1:${server.address().port}/get.php?username=usuario&password=senha`
  const { context, userDataDir } = await launchContext()
  const page = context.pages()[0] ?? (await context.newPage())
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error', error?.message ?? ''))
  // O player de desenvolvimento nunca recebe fluxo de verdade (só o host do painel; `**/movie/**` pegaria o Vite).
  await page.route((url) => url.hostname === '127.0.0.1' && /\/(movie|series|live)\//.test(url.pathname), () => {})
  const cdp = await context.newCDPSession(page)
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: new URL(APP_URL).origin, quotaSize: QUOTA_BYTES })

  try {
    await page.goto(APP_URL)
    const quota = await page.evaluate(async () => (await navigator.storage.estimate()).quota)
    assert(quota === QUOTA_BYTES, `a cota simulada vale no navegador (${quota} B)`)
    console.log(`=== Cenário 1: pré-carga para no teto (${CAP_BYTES / MB} MiB) com cobertura parcial, sem STO-01 ===`)
    await registerPanel(page, 'Lista grande E2E', panelUrl, true)
    const partial = await page.waitForSelector('.home-status-line:has-text("Parte da lista fica no aparelho")', { timeout: 90000 }).then(() => true, () => false)
    assert(partial, 'o Início mostra "Parte da lista fica no aparelho; o restante carrega ao entrar"')
    assert(!(await hasSto01(page)), 'nenhum STO-01 na pré-carga')
    const afterPrefetch = await ledger(page)
    console.log(`  · conta: ${afterPrefetch.total} B; filmes gravados: ${afterPrefetch.fetched}/${VOD.length}`)
    assert(afterPrefetch.total <= CAP_BYTES, 'a conta do catálogo + guia fica dentro do teto')
    assert(afterPrefetch.fetched > 0 && afterPrefetch.fetched < VOD.length, 'parte das categorias de filmes ficou no aparelho, parte não')
    assert(afterPrefetch.projections === 0, 'nenhuma projeção 065 gravada (a 2ª cópia acabou)')

    console.log('=== Cenário 2: entrar em categorias além do teto ===')
    await openShowcase(page, 'movies')
    for (const name of ['Filmes 12', 'Filmes 11']) {
      await openVodCategory(page, name)
      const count = await gridCount(page)
      assert(count > 0, `"${name}" abre com filmes (${count} cartões na tela)`)
      assert(!(await hasSto01(page)), `"${name}": nenhum STO-01`)
      await page.keyboard.press('Escape')
      await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    }
    const afterEntries = await ledger(page)
    assert(afterEntries.total <= CAP_BYTES, `depois das entradas a conta continua no teto (${afterEntries.total} B)`)

    console.log('=== Cenário 3: Voltar de um detalhe restaura o item ===')
    await openVodCategory(page, 'Filmes 12')
    await gridCount(page)
    await page.waitForSelector('.content-card:has(.tv-focus)', { timeout: 8000 }).catch(async () => {
      await page.keyboard.press('ArrowDown')
    })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const chosen = await page.locator('.content-card:has(.tv-focus) .content-card-title').textContent()
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    assert((await page.locator('.vod-detail-title').textContent()) === chosen, `o detalhe abre "${chosen}"`)
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card:has(.tv-focus)', { timeout: 8000 })
    assert((await page.locator('.content-card:has(.tv-focus) .content-card-title').textContent()) === chosen, 'Voltar devolve o foco ao mesmo item')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    await backToHome(page)

    console.log('=== Cenário 4: o guia abre, gravado comprimido por canal ===')
    const guide = await ledger(page)
    assert(guide.epgChunks >= 1 && guide.epgRows === 0, `guia gravado só no formato comprimido (${guide.epgChunks} canais, 0 linhas)`)
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.live-column-groups', { state: 'attached', timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await page.keyboard.press('ArrowUp') // 1º canal -> lupa
    await page.keyboard.press('ArrowRight') // lupa -> Guia completo
    await page.waitForSelector('.live-guide-button.tv-focus', { timeout: 4000 })
    await page.keyboard.press('Enter')
    const grid = await page.waitForSelector('.epg-guide-grid', { timeout: 8000 }).then(() => true, () => false)
    assert(grid, 'o guia completo abre')
    assert(((await page.locator('.epg-guide').innerText().catch(() => '')) ?? '').includes('Jornal Comprimido'), 'o guia mostra o programa gravado comprimido')
    await backToHome(page)

    console.log('=== Cenário 5: trocar de lista e voltar ===')
    await registerPanel(page, 'Outra lista E2E', `${APP_URL}/e2e/fixtures/legibilidade-tv.m3u`, false)
    assert(!(await hasSto01(page)), 'a 2ª lista abre sem STO-01')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.getByText('Lista grande E2E', { exact: true }).first().click()
    await page.waitForSelector('.home-content', { timeout: 10000 })
    await openShowcase(page, 'movies')
    const listed = await page.locator('.vod-showcase .side-category-nav-item').allTextContents()
    assert(VOD.every((category) => listed.some((text) => text.includes(category.category_name))), 'as 12 categorias continuam listadas na lista reativada')
    await openVodCategory(page, 'Filmes 01')
    assert((await gridCount(page)) > 0, '"Filmes 01" abre com filmes na lista reativada')
    assert(!(await hasSto01(page)), 'nenhum STO-01 ao voltar à lista')
    const final = await ledger(page)
    assert(final.total <= CAP_BYTES, `a conta segue no teto com duas listas (${final.total} B)`)
  } catch (error) {
    failures += 1
    console.error('  ✗ FALHOU (exceção):', error?.message ?? error)
  } finally {
    await context.close()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
    server.close()
  }
  if (failures > 0) {
    console.error(`orcamento-armazenamento: ${failures} falha(s)`)
    process.exit(1)
  }
  console.log('orcamento-armazenamento: ok')
}

await run()
