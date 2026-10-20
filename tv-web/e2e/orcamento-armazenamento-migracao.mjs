// Roteiro E2E da feature 082 — o caso da TV de 2026-10-18: o banco JÁ CHEIO no formato antigo (blocos com `items`,
// projeção 065 e guia em linhas), acima da cota. O app novo precisa se recuperar sozinho: apagar as projeções, converter
// ou liberar as categorias, regravar o guia, e a pessoa conseguir favoritar e abrir categoria sem STO-01.
//
// Painel Xtream FICTÍCIO deste script e cota reduzida por CDP num contexto PERSISTENTE (num contexto efêmero o Chromium
// ignora a cota sobrescrita). Pré-requisito: `npm run dev` rodando (http://localhost:5173).
//
// Limite conhecido: no PC o espaço apagado volta na hora; na TV o `estimate()` demora a cair (R-002) — a T050 confirma lá.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'
import { openShowcase, openVodCategory } from './lib/vod.mjs'

const APP_URL = process.env.CCPLAY_APP_URL ?? 'http://localhost:5173'
const MB = 1024 * 1024
const QUOTA_BYTES = 16 * MB
const VOD = Array.from({ length: 8 }, (_, i) => ({ category_id: String(100 + i), category_name: `Filmes ${String(i + 1).padStart(2, '0')}` }))
const PER_CATEGORY = 3_000

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
    stream_id: base + i, name: `Filme ${categoryId}-${i} ${['Ação', 'Drama', 'Comédia'][i % 3]} (${1970 + (i % 55)})`, category_id: categoryId,
    stream_type: 'movie', container_extension: 'mp4', stream_icon: `http://img.fixture.invalid/p/${((base + i) * 7919).toString(36)}.jpg`,
  }))
}

function xmltv(now) {
  const stamp = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<tv>',
    `<programme channel="canal.a" start="${stamp(now - 1_800_000)}" stop="${stamp(now + 1_800_000)}"><title>Jornal Novo</title></programme>`, '</tv>'].join('\n')
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
    if (url.pathname !== '/player_api.php') { res.writeHead(404); res.end(); return }
    const action = url.searchParams.get('action')
    const categoryId = url.searchParams.get('category_id')
    if (action === 'get_live_categories') return send([{ category_id: '1', category_name: 'Canais E2E' }])
    if (action === 'get_vod_categories') return send(VOD)
    if (action === 'get_series_categories') return send([])
    if (action === 'get_live_streams') return send([{ stream_id: 1, name: 'Canal A', category_id: '1', epg_channel_id: 'canal.a' }])
    if (action === 'get_vod_streams') return send(categoryId ? movies(categoryId) : VOD.flatMap((c) => movies(c.category_id)))
    if (action) return send([])
    return send({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function launchContext() {
  const fixedPath = '/opt/pw-browsers/chromium'
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ccplaytv-e2e-082m-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true, executablePath: existsSync(fixedPath) ? fixedPath : undefined,
    args: ['--disable-features=StaticStorageQuota'], viewport: { width: 1920, height: 1080 }, locale: 'pt-BR',
  })
  return { context, userDataDir }
}

/** O que está no banco (só números). */
async function state(page) {
  return page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const blocks = await db.categoryBlocks.toArray()
    const estimate = await navigator.storage.estimate()
    return {
      usage: estimate.usage ?? 0,
      legacyBlocks: blocks.filter((block) => block.format !== 2).length,
      compressed: blocks.filter((block) => block.format === 2).length,
      projections: await db.catalogReadManifests.count(),
      epgRows: await db.epgPrograms.count(),
      epgChunks: await db.table('epgChunks').count(),
      ledger: (await (await import('/src/lib/catalog/storageLedger.ts')).catalogLedger(db)).total,
      // Carimbadas como obtidas sem itens (liberadas com o banco cheio) — o reparo em segundo plano as zera.
      orphans: (await db.categories.toArray()).filter((category) => category.itemsFetchedAt !== undefined && (category.itemsCount ?? 0) > 0
        && !blocks.some((block) => block.categoryId === category.id)).length,
    }
  })
}

/**
 * Espera do lado do Node (`waitForFunction` com função `async` devolve uma Promise, sempre "verdadeira": não espera).
 */
async function until(page, predicate, timeout) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (predicate(await state(page))) return true
    await page.waitForTimeout(1000)
  }
  return false
}

/**
 * Reescreve o que o app gravou no FORMATO ANTIGO (como a versão anterior à 082 deixava na TV) e enche a cota com linhas
 * de guia antigas até o `QuotaExceededError`.
 */
async function seedLegacyFull(page) {
  return page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { readBlockChunks } = await import('/src/lib/catalog/blockChunks.ts')
    const { categoryChunks } = await import('/src/lib/catalog/chunkTables.ts')
    const { nextReadRevision, projectReadItem, READ_PROJECTION_CHUNK_SIZE } = await import('/src/lib/catalog/readProjection.ts')
    const isQuota = (error) => /Quota/.test(`${error?.name} ${error?.inner?.name} ${error?.message}`)
    let full = false
    for (const block of await db.categoryBlocks.toArray()) {
      if (block.format !== 2) continue
      const records = await readBlockChunks(db, block.categoryId)
      const items = records.map(({ sourceId: _s, generation: _g, kind: _k, groupOrder: _o, categoryId: _c, categoryPosition: _p, ...item }) => item)
      const revision = nextReadRevision()
      const projected = records.map((record, position) => projectReadItem(record, { sourceId: block.sourceId, generation: block.generation, kind: block.kind, categoryId: block.categoryId, groupOrder: block.groupOrder, categoryPosition: position }))
      const parts = Array.from({ length: Math.ceil(projected.length / READ_PROJECTION_CHUNK_SIZE) }, (_, chunk) => projected.slice(chunk * READ_PROJECTION_CHUNK_SIZE, (chunk + 1) * READ_PROJECTION_CHUNK_SIZE))
      try {
        await db.transaction('rw', [db.categoryBlocks, db.categories, db.catalogReadManifests, db.catalogReadChunks, categoryChunks(db)], async () => {
          await categoryChunks(db).where('[categoryId+chunk]').between([block.categoryId, -1], [block.categoryId, Number.MAX_SAFE_INTEGER], true, true).delete()
          await db.categoryBlocks.put({ categoryId: block.categoryId, sourceId: block.sourceId, generation: block.generation, kind: block.kind, groupOrder: block.groupOrder, items })
          await db.categories.update(block.categoryId, { storedBytes: undefined })
          await db.catalogReadChunks.bulkAdd(parts.map((part, chunk) => ({ id: [block.categoryId, revision, chunk], categoryId: block.categoryId, sourceId: block.sourceId, generation: block.generation, kind: block.kind, revision, chunk, items: part })))
          await db.catalogReadManifests.put({ categoryId: block.categoryId, sourceId: block.sourceId, generation: block.generation, kind: block.kind, revision, formatVersion: 1, count: projected.length, chunkSize: READ_PROJECTION_CHUNK_SIZE, chunkCount: parts.length, ready: true })
        })
      } catch (error) {
        if (!isQuota(error)) throw error
        full = true
        break
      }
    }
    // Guia no formato antigo, com sinopses que não comprimem, até a cota.
    const [source] = await db.sources.toArray()
    await db.table('epgChunks').clear()
    await db.sources.update(source.id, { epgActiveGeneration: 1, epgStoredBytes: undefined })
    const random = () => Array.from(crypto.getRandomValues(new Uint8Array(300)), (byte) => byte.toString(36)).join('')
    for (let round = 0; round < 400 && !full; round += 1) {
      try {
        await db.epgPrograms.bulkAdd(Array.from({ length: 200 }, (_, i) => ({ sourceId: source.id, generation: 1, channelKey: 'canal.a', start: round * 1e6 + i, end: round * 1e6 + i + 1, title: 'Velho', description: random() })))
      } catch (error) {
        if (!isQuota(error)) throw error
        full = true
      }
    }
    return { full, sourceId: source.id }
  })
}

async function run() {
  const server = await startPanelServer()
  const panelUrl = `http://127.0.0.1:${server.address().port}/get.php?username=usuario&password=senha`
  const { context, userDataDir } = await launchContext()
  const page = context.pages()[0] ?? (await context.newPage())
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error', error?.message ?? ''))
  await page.route((url) => url.hostname === '127.0.0.1' && /\/(movie|series|live)\//.test(url.pathname), () => {})
  const cdp = await context.newCDPSession(page)
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: new URL(APP_URL).origin, quotaSize: QUOTA_BYTES })

  try {
    await page.goto(APP_URL)
    assert((await page.evaluate(async () => (await navigator.storage.estimate()).quota)) === QUOTA_BYTES, 'a cota simulada (16 MiB) vale')
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaM3u(page, { nome: 'Lista E2E migração', url: panelUrl })
    await page.waitForSelector('text=/Concluída/', { timeout: 30000 })
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.home-content', { timeout: 10000 })
    assert(await until(page, (now) => now.compressed >= VOD.length, 60000), `pré-carga gravou as ${VOD.length} categorias comprimidas`)

    console.log('=== Semeia o formato antigo e enche a cota (o estado da TV) ===')
    // Com o app PARADO (página estática da mesma origem): senão uma gravação dele bate na cota durante a semeadura e a
    // liberação de emergência apaga as categorias antes da medição — certo na TV, mas o ensaio quer o estado cheio.
    await page.goto(`${APP_URL}/e2e/fixtures/legibilidade-tv.m3u`)
    const seeded = await seedLegacyFull(page)
    const before = await state(page)
    console.log(`  · antes: ${JSON.stringify(before)}`)
    assert(seeded.full, 'o banco ficou cheio (QuotaExceededError ao semear)')
    assert(before.legacyBlocks > 0 && before.projections > 0 && before.epgRows > 0, 'há blocos antigos, projeção 065 e guia em linhas')

    console.log('=== O app novo se recupera sozinho ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.home-content, .add-card', { timeout: 15000 })
    if ((await page.locator('.add-card').count()) > 0) {
      await page.getByText('Lista E2E migração', { exact: true }).first().click()
      await page.waitForSelector('.home-content', { timeout: 10000 })
    }
    const recovered = await until(page, (now) => now.projections === 0 && now.legacyBlocks === 0 && now.orphans === 0, 120000)
    assert(recovered, 'em segundo plano: projeções apagadas, nenhum bloco antigo (convertido ou liberado) e nenhuma categoria órfã')

    // O guia é regravado na próxima sincronização (12 h ou Atualizar): aqui chamada direto.
    const synced = await page.evaluate(async (sourceId) => {
      const { syncEpg } = await import('/src/lib/epg/epgSync.ts')
      return (await syncEpg(sourceId)).outcome
    }, seeded.sourceId)
    assert(synced === 'synced', `o guia sincroniza mesmo com o banco cheio de linhas antigas (${synced})`)
    const after = await state(page)
    assert(after.compressed + after.legacyBlocks <= VOD.length + 1, 'nenhuma categoria duplicada (8 de filmes + 1 de canais)')
    console.log(`  · depois: ${JSON.stringify(after)}`)
    assert(after.epgRows === 0 && after.epgChunks >= 1, 'guia só no formato comprimido')
    // O uso físico pode subir logo depois de apagar e regravar (o LevelDB compacta depois — o mesmo R-002 da TV): decide a
    // conta própria, como o orçamento; o físico vai só como informação.
    assert(after.ledger < before.ledger && after.ledger <= QUOTA_BYTES - 12 * MB, `a conta caiu para dentro do teto (${before.ledger} → ${after.ledger} B)`)
    await page.waitForTimeout(10000)
    console.log(`  · uso físico: ${before.usage} → ${after.usage} → ${(await state(page)).usage} B (10 s depois)`)

    const favorite = await page.evaluate(async (sourceId) => {
      const { toggleFavorite } = await import('/src/lib/catalog/userStateRepository.ts')
      await toggleFavorite(`${sourceId}|movie|id:1000001`, sourceId, true)
      const { db } = await import('/src/lib/catalog/db.ts')
      return (await db.userStates.get(`${sourceId}|movie|id:1000001`))?.isFavorite === true
    }, seeded.sourceId)
    assert(favorite, 'favoritar grava')

    await openShowcase(page, 'movies')
    await openVodCategory(page, 'Filmes 01')
    await page.waitForFunction(() => document.querySelectorAll('.content-card-title').length > 0, null, { timeout: 15000 }).catch(() => {})
    assert((await page.locator('.content-card-title').count()) > 0, '"Filmes 01" abre com filmes')
    assert(!/STO-01/.test(await page.locator('body').innerText()), 'nenhum STO-01')
  } catch (error) {
    failures += 1
    console.error('  ✗ FALHOU (exceção):', error?.message ?? error)
  } finally {
    await context.close()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
    server.close()
  }
  if (failures > 0) {
    console.error(`orcamento-armazenamento-migracao: ${failures} falha(s)`)
    process.exit(1)
  }
  console.log('orcamento-armazenamento-migracao: ok')
}

await run()
