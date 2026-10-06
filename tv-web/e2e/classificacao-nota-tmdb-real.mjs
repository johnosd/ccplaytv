// SC-006 da feature 061. Fora da SUITE: usa serviços e credenciais reais somente com autorização.
// Saída com contagens; capturas e títulos reais ficam apenas no temporário do sistema.
import { readFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect } from '@playwright/test'
import { openSectionCategory } from './lib/vod.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = 'qa-061-real-isolada'
const SHOTS = path.join(os.tmpdir(), 'ccplay-classificacao-061-real')
const APP = process.env.CCPLAY_APP_URL ?? 'http://localhost:5173'
let stage = 'preparação'
let browser

function loadEnv() {
  const env = {}
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)=(.*)$/.exec(line)
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function brCertification(detail) {
  const priorities = [3, 2, 4, 5, 6, 1]
  const valid = ['L', '10', '12', '14', '16', '18']
  const rows = (detail.release_dates?.results ?? []).filter((row) => row.iso_3166_1 === 'BR')
    .flatMap((row) => row.release_dates ?? [])
    .sort((a, b) => {
      const priority = (type) => priorities.includes(type) ? priorities.indexOf(type) : priorities.length
      return priority(a.type) - priority(b.type)
    })
  return rows.map((row) => typeof row.certification === 'string' ? row.certification.trim() : '')
    .find((value) => valid.includes(value))
}

function check(condition) {
  if (!condition) throw new Error('Verificação não atendida')
}

try {
  const env = loadEnv()
  check(env.CCPLAY_PROBE_DNS && env.CCPLAY_PROBE_USER && env.CCPLAY_PROBE_PASS && env.CCPLAY_PROBE_TMDB_KEY)
  const base = /^https?:\/\//.test(env.CCPLAY_PROBE_DNS) ? env.CCPLAY_PROBE_DNS : `http://${env.CCPLAY_PROBE_DNS}`
  const providerGet = async (action, extra = {}) => {
    const url = new URL('/player_api.php', base)
    url.search = new URLSearchParams({ username: env.CCPLAY_PROBE_USER, password: env.CCPLAY_PROBE_PASS, action, ...extra }).toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    check(response.ok)
    return response.json()
  }
  stage = 'amostragem do provedor'
  const catalog = await providerGet('get_vod_streams')
  check(Array.isArray(catalog))
  const samples = []
  const seen = new Set()
  for (const item of catalog.slice(0, 40)) {
    const payload = await providerGet('get_vod_info', { vod_id: String(item.stream_id) })
    const tmdbId = Number(payload.info?.tmdb_id)
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || seen.has(tmdbId)) continue
    seen.add(tmdbId)
    samples.push({ name: item.name, info: payload.info, tmdbId })
    if (samples.length === 10) break
  }
  check(samples.length === 10)
  console.log('Amostra: 10 títulos reais distintos com id TMDB declarado pelo provedor.')

  stage = 'semente local isolada'
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const logs = []
  const errors = []
  const detailResponses = new Map()
  const responseReads = []
  let detailRequests = 0
  let tmdbResponses = 0
  let responseReadFailures = 0
  const detailStatuses = []
  page.on('console', (message) => logs.push(message.text()))
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('request', (request) => {
    if (/api\.themoviedb\.org\/3\/movie\/\d+\?/.test(request.url())) detailRequests++
  })
  page.on('response', (response) => {
    if (new URL(response.url()).hostname === 'api.themoviedb.org') tmdbResponses++
    const match = /api\.themoviedb\.org\/3\/movie\/(\d+)\?/.exec(response.url())
    if (match) detailStatuses.push(response.status())
    if (!match || !response.ok()) return
    responseReads.push(response.json().then((detail) => {
      detailResponses.set(Number(match[1]), { br: brCertification(detail), average: detail.vote_average, votes: detail.vote_count })
    }).catch(() => { responseReadFailures++ }))
  })
  await page.goto(APP)
  await page.evaluate(async ({ key, samples, source }) => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { normalizeVodInfo } = await import('/src/lib/metadata/providerMetadata.ts')
    const { PROVIDER_FIELDS_VERSION } = await import('/src/lib/metadata/titleMetadataStore.ts')
    const { writeAppLanguage } = await import('/src/lib/i18n/appLanguage.ts')
    writeAppLanguage('pt')
    const now = Date.now()
    await db.sources.put({ id: source, type: 'm3u_url', displayName: 'QA real 061', activeGeneration: 1, connectionState: 'synced', createdAt: now, updatedAt: now, epgIdsCapturedAt: now })
    await db.integrations.put({ id: 'tmdb', key, format: 'v3', state: 'connected' })
    const categoryId = await db.categories.add({ sourceId: source, generation: 1, kind: 'movie', fetchMode: 'eager', name: 'Amostra 061', order: 0, count: samples.length, itemsFetchedAt: now })
    for (const [index, sample] of samples.entries()) {
      const id = String(index + 1)
      const { fields } = normalizeVodInfo(sample.info)
      await db.channels.add({ sourceId: source, generation: 1, kind: 'movie', categoryId, groupOrder: 0, name: sample.name, originalName: sample.name, originalGroup: 'Amostra 061', providerStreamId: id, directUrl: `https://media.invalid/qa/${id}.mp4`, addedAt: now - index })
      await db.titleMetadata.put({ stableId: `${source}|movie|id:${id}`, sourceId: source, kind: 'movie', provider: fields, providerVersion: PROVIDER_FIELDS_VERSION, providerFetchedAt: now, providerTmdbId: sample.tmdbId, tmdbFetchedAt: now, tmdb: { status: 'matched', tmdbId: sample.tmdbId, language: 'pt', fields: { trailerVideos: [], similar: [] } } })
    }
  }, { key: env.CCPLAY_PROBE_TMDB_KEY, samples, source: SOURCE })
  await page.reload()
  await page.locator('.source-card-wrap', { hasText: 'QA real 061' }).locator('.source-card').click()
  await page.locator('.home-content').waitFor()
  await openSectionCategory(page, 'movies', 'Todos')
  mkdirSync(SHOTS, { recursive: true })
  let withCertification = 0
  let shown = 0
  let withRating = 0
  for (const [index, sample] of samples.entries()) {
    stage = `título ${index + 1}: foco na grade`
    await page.locator('.content-card:has(.tv-focus)').waitFor()
    for (let attempt = 0; attempt < 24; attempt++) {
      const move = await page.evaluate((name) => {
        const target = [...document.querySelectorAll('.vod-grid-cell')].find((cell) => cell.querySelector('.content-card-title')?.textContent === name)
        const focused = document.querySelector('.vod-grid-cell:has(.tv-focus)')
        if (!target || !focused) return 'ArrowRight'
        if (target === focused) return null
        const to = target.getBoundingClientRect()
        const from = focused.getBoundingClientRect()
        return Math.abs(to.top - from.top) > 10 ? to.top > from.top ? 'ArrowDown' : 'ArrowUp' : to.left > from.left ? 'ArrowRight' : 'ArrowLeft'
      }, sample.name)
      if (!move) break
      await page.keyboard.press(move)
    }
    check(await page.locator('.content-card:has(.tv-focus) .content-card-title').textContent() === sample.name)
    stage = `título ${index + 1}: abertura do detalhe`
    await page.keyboard.press('Enter')
    await page.locator('.vod-detail-action--primary.tv-focus').waitFor()
    stage = `título ${index + 1}: renovação do cache`
    await expect.poll(() => page.evaluate(async ({ source, id }) => {
      const { db } = await import('/src/lib/catalog/db.ts')
      return (await db.titleMetadata.get(`${source}|movie|id:${id}`))?.tmdb?.fields?.certifications !== undefined
    }, { source: SOURCE, id: index + 1 }), { timeout: 30000 }).toBe(true)
    stage = `título ${index + 1}: conferência da origem`
    await Promise.all(responseReads)
    const refreshed = await page.evaluate(async ({ source, id }) => {
      const { db } = await import('/src/lib/catalog/db.ts')
      const tmdb = (await db.titleMetadata.get(`${source}|movie|id:${id}`))?.tmdb
      return { matched: tmdb?.status === 'matched', id: tmdb?.tmdbId }
    }, { source: SOURCE, id: index + 1 })
    if (!detailResponses.has(refreshed.id)) console.log(`Diagnóstico: casado=${refreshed.matched}; mesmo id declarado=${refreshed.id === sample.tmdbId}; requisições de detalhe=${detailRequests}; respostas TMDB=${tmdbResponses}; status de detalhe=${detailStatuses.join(',')}; leituras falhas=${responseReadFailures}; respostas de detalhe=${detailResponses.size}.`)
    check(refreshed.matched && detailResponses.has(refreshed.id))
    const expected = detailResponses.get(refreshed.id)
    const badge = page.locator('.vod-detail-meta .content-rating-badge')
    stage = `título ${index + 1}: selo na tela`
    if (expected.br) {
      withCertification++
      await badge.waitFor()
      check((await badge.textContent()).trim() === expected.br)
      shown++
    } else {
      check(await badge.count() === 0)
    }
    const expectsRating = expected.average > 0 && expected.votes >= 50
    if (expectsRating) {
      await page.locator('.vod-detail-meta .tmdb-rating-badge').waitFor()
      withRating++
    } else check(await page.locator('.vod-detail-meta .tmdb-rating-badge').count() === 0)
    await page.screenshot({ path: path.join(SHOTS, `${String(index + 1).padStart(2, '0')}-detalhe.png`) })
    const before = detailRequests
    await page.keyboard.press('Escape')
    await page.locator('.content-card:has(.tv-focus)').waitFor()
    await page.keyboard.press('Enter')
    await page.locator('.vod-detail-action--primary.tv-focus').waitFor()
    await page.waitForTimeout(200)
    check(detailRequests === before)
    await page.keyboard.press('Escape')
    console.log(`Título ${index + 1}: cache renovado; classificação ${expected.br ? 'conferida' : 'ausente na origem'}; segunda abertura sem consulta.`)
  }
  stage = 'resultado final'
  check(withCertification > 0 && shown === withCertification)
  check(errors.length === 0)
  check(!(await page.locator('body').textContent()).includes(env.CCPLAY_PROBE_TMDB_KEY))
  check(!logs.join('\n').includes(env.CCPLAY_PROBE_TMDB_KEY))
  console.log(`SC-006: ${shown}/${withCertification} títulos com classificação BR exibiram o selo (100%); 10 títulos verificados, ${withRating} com nota elegível.`)
  console.log('Capturas guardadas apenas no temporário do sistema; nenhum segredo nos resultados.')
} catch (error) {
  console.error(`Falha na medição real, etapa: ${stage}, tipo: ${error.name === 'TimeoutError' ? 'timeout' : 'verificação'}. Detalhes sensíveis suprimidos.`)
  process.exitCode = 1
} finally {
  await browser?.close()
}
