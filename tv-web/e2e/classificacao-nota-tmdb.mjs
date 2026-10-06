// Feature 061: quickstart 1–10 com fixtures locais e TMDB simulado, sem credenciais reais.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { expect } from '@playwright/test'
import { openSectionCategory } from './lib/vod.mjs'

const KEY = '0123456789abcdef0123456789abcdef'
const SOURCE = 'e2e-061'
const TITLE = 'Uma jornada muito longa pelo deserto e pelas montanhas de um mundo distante'
const SHOTS = 'test-results/classificacao-nota-tmdb'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
const page = await context.newPage()
const logs = []
const errors = []
const details = []
let apiRequests = 0
page.on('console', (msg) => logs.push(msg.text()))
page.on('pageerror', (error) => errors.push(error.message))
await context.route('https://api.themoviedb.org/**', (route) => {
  const url = new URL(route.request().url())
  apiRequests++
  let body = { results: [] }
  if (url.pathname === '/3/trending/movie/week' || url.pathname === '/3/discover/movie') {
    body = { page: 1, total_pages: 1, total_results: 5, results: [2, 3, 4, 5, 6].map((id) => ({ id, title: `Filme ${id}`, original_title: `Filme ${id}`, release_date: '2025-01-01', vote_average: 8.4, vote_count: 900, popularity: 50 })) }
  }
  const match = /^\/3\/(movie|tv)\/(\d+)$/.exec(url.pathname)
  if (match) {
    const id = Number(match[2])
    details.push({ id, language: url.searchParams.get('language'), append: url.searchParams.get('append_to_response') })
    body = {
      id, title: id === 1 ? TITLE : `Filme ${id}`, name: 'Série 061', original_language: 'pt',
      release_date: '2025-01-01', first_air_date: '2025-01-01', overview: 'Uma aventura guardada no aparelho.',
      vote_average: 7.83, vote_count: id === 3 ? 49 : 800,
      credits: { cast: [], crew: [] }, aggregate_credits: { cast: [] }, videos: { results: [] },
      recommendations: { results: [] }, similar: { results: [] },
      release_dates: { results: [
        ...(id === 2 ? [] : [{ iso_3166_1: 'BR', release_dates: [{ type: 3, certification: '14' }] }]),
        { iso_3166_1: 'US', release_dates: [{ type: 3, certification: 'R' }] },
        { iso_3166_1: 'ES', release_dates: [{ type: 3, certification: '16' }] },
      ] },
      content_ratings: { results: [{ iso_3166_1: 'BR', rating: '16' }, { iso_3166_1: 'US', rating: 'TV-MA' }] },
    }
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
})

async function seed() {
  await page.goto('http://localhost:5173')
  await page.locator('.add-card').waitFor()
  await page.evaluate(async ({ key, source, title }) => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { PROVIDER_FIELDS_VERSION } = await import('/src/lib/metadata/titleMetadataStore.ts')
    const now = Date.now()
    await db.sources.put({ id: source, type: 'm3u_url', displayName: 'Fixture 061', activeGeneration: 1, connectionState: 'synced', createdAt: now, updatedAt: now, epgIdsCapturedAt: now })
    await db.integrations.put({ id: 'tmdb', key, format: 'v3', state: 'connected' })
    for (const kind of ['movie', 'series']) {
      const categoryId = await db.categories.add({ sourceId: source, generation: 1, kind, fetchMode: 'eager', name: kind === 'movie' ? 'Filmes 061' : 'Séries 061', order: 0, count: kind === 'movie' ? 6 : 1, itemsFetchedAt: now })
      for (let id = 1; id <= (kind === 'movie' ? 6 : 1); id++) {
        await db.channels.add({ sourceId: source, generation: 1, kind, categoryId, groupOrder: 0, name: kind === 'movie' ? id === 1 ? title : `Filme ${id}` : 'Série 061', originalName: kind === 'movie' ? id === 1 ? title : `Filme ${id}` : 'Série 061', originalGroup: kind === 'movie' ? 'Filmes 061' : 'Séries 061', providerStreamId: kind === 'movie' ? String(id) : undefined, seriesId: kind === 'series' ? '1' : undefined, directUrl: kind === 'movie' ? `https://media.test/movie/${id}.mp4` : undefined, year: 2025, providerRating: 7.4, addedAt: now - id })
        const stableId = `${source}|${kind}|id:${id}`
        await db.titleMetadata.put({ stableId, sourceId: source, kind, provider: { synopsis: 'Uma aventura.', durationSeconds: 7200 }, providerVersion: PROVIDER_FIELDS_VERSION, providerFetchedAt: now, providerTmdbId: id, tmdbFetchedAt: now, tmdb: { status: 'matched', tmdbId: id, language: 'pt', fields: { trailerVideos: [], similar: [] } } })
        if (kind === 'series') {
          await db.channels.add({ sourceId: source, generation: 1, kind: 'episode', categoryId, groupOrder: 0, name: 'Piloto 061', originalName: 'Piloto 061', seriesId: '1', providerStreamId: '101', seasonNumber: 1, episodeNumber: 1, directUrl: 'https://media.test/series/101.mp4' })
        }
      }
    }
  }, { key: KEY, source: SOURCE, title: TITLE })
  await page.reload()
  await page.locator('.source-card-wrap', { hasText: 'Fixture 061' }).locator('.source-card').click()
  await page.locator('.home-content').waitFor()
}

async function openMovie(name) {
  await openSectionCategory(page, 'movies', 'Todos')
  await page.locator('.content-card:has(.tv-focus)').waitFor()
  for (let attempt = 0; attempt < 12; attempt++) {
    if ((await page.locator('.content-card:has(.tv-focus) .content-card-title').textContent()) === name) break
    await page.keyboard.press('ArrowRight')
  }
  assert.equal(await page.locator('.content-card:has(.tv-focus) .content-card-title').textContent(), name)
  await page.keyboard.press('Enter')
  await page.locator('.vod-detail-action--primary.tv-focus').waitFor()
}

async function readMeta() {
  return page.locator('.vod-detail-meta').textContent()
}

try {
  mkdirSync(SHOTS, { recursive: true })
  await seed()
  assert.equal(await page.locator('.home-hero .content-rating-badge, .home-hero .tmdb-rating-badge').count(), 0)
  await openMovie(TITLE)
  await page.getByLabel('Classificação indicativa: 14 anos').waitFor()
  const text = await readMeta()
  assert.ok(text.indexOf('14') > text.indexOf('7,4'))
  assert.ok(text.indexOf('TMDB 7,8') > text.indexOf('14'))
  assert.equal(details.filter((call) => call.id === 1).length, 1)
  assert.ok(details[0].append.includes('release_dates'))
  assert.equal(await page.locator('.vod-detail-meta [tabindex], .vod-detail-meta button').count(), 0)
  const bounds = await page.locator('.vod-detail-meta').boundingBox()
  const actionBounds = await page.locator('.vod-detail-action--primary').boundingBox()
  assert.ok(bounds.y + bounds.height <= actionBounds.y)
  await page.screenshot({ path: `${SHOTS}/01-detalhe-titulo-longo.png` })
  console.log('✓ Filme, ordem das notas, título longo, classificação acessível e uma renovação do registro antigo')

  await page.keyboard.press('Escape')
  await page.locator('.content-card:has(.tv-focus)').waitFor()
  await page.keyboard.press('Enter')
  await page.getByLabel('Classificação indicativa: 14 anos').waitFor()
  assert.equal(details.filter((call) => call.id === 1).length, 1)
  const beforeLanguage = details.length
  await page.evaluate(async () => (await import('/src/lib/i18n/appLanguage.ts')).writeAppLanguage('en'))
  await page.getByLabel('Content rating: R').waitFor()
  assert.ok((await readMeta()).includes('TMDB 7.8'))
  // A 054 relê a metadata em inglês. A classificação vai nessa mesma chamada, nunca uma consulta separada (SC-005/R-002).
  assert.ok(details.length <= beforeLanguage + 1)
  await page.evaluate(async () => (await import('/src/lib/i18n/appLanguage.ts')).writeAppLanguage('es'))
  await page.getByLabel('Calificación por edades: 16').waitFor()
  await page.evaluate(async () => (await import('/src/lib/i18n/appLanguage.ts')).writeAppLanguage('pt'))
  await expect.poll(() => page.evaluate(async (source) => {
    const { db } = await import('/src/lib/catalog/db.ts')
    return (await db.titleMetadata.get(`${source}|movie|id:1`))?.tmdb?.language === 'pt'
  }, SOURCE)).toBe(true)
  const beforeReopen = details.length
  await page.keyboard.press('Escape')
  await page.locator('.vod-detail').waitFor({ state: 'hidden' })
  await page.locator('.content-card:has(.tv-focus)').waitFor()
  await page.keyboard.press('Enter')
  await page.getByLabel('Classificação indicativa: 14 anos').waitFor()
  assert.equal(details.length, beforeReopen)
  console.log('✓ Troca pt/en/es usa os dados guardados e a releitura existente da 054; RETURN/SELECT sem reconsulta')

  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.locator('.home-content').waitFor()
  // Favorito/progresso são fixtures de estado local; a nota continua vindo da metadata real da execução.
  await page.evaluate(async (source) => {
    const { db } = await import('/src/lib/catalog/db.ts')
    await db.userStates.put({ stableId: `${source}|movie|id:1`, sourceId: source, isFavorite: 1, favoritedAt: Date.now(), progressSeconds: 300, lastWatched: Date.now() })
  }, SOURCE)
  await page.reload()
  await page.locator('.source-card-wrap', { hasText: 'Fixture 061' }).locator('.source-card').click()
  await page.locator('.home-hero-meta .content-rating-badge').waitFor()
  assert.ok((await page.locator('.home-hero-meta').textContent()).includes('TMDB 7,8'))
  await page.waitForTimeout(300)
  const beforeFocus = apiRequests
  await page.keyboard.press('ArrowDown')
  await page.locator('.home-card-expanded .content-rating-badge').waitFor()
  await page.waitForTimeout(500)
  assert.equal(apiRequests, beforeFocus)
  await page.screenshot({ path: `${SHOTS}/02-card-expandido.png` })
  console.log('✓ Billboard e card expandido com dados guardados, sem requisição por foco')

  await page.keyboard.press('ArrowDown')
  await page.locator('.home-row[data-row="top10-movies"] .home-card.tv-focus').waitFor()
  for (let index = 0; index < 4; index++) await page.keyboard.press('ArrowRight')
  await page.locator('.home-card-expanded .tmdb-rating-badge').waitFor()
  assert.equal(await page.locator('.home-card-expanded .tmdb-rating-badge').textContent(), 'TMDB 8,4')
  assert.equal(await page.locator('.home-card-expanded .content-rating-badge').count(), 0)
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('ArrowDown')
    if (await page.locator('.home-row[data-row="tip-movies"] .home-card.tv-focus').count()) break
  }
  await page.locator('.home-row[data-row="tip-movies"] .home-card.tv-focus').waitFor()
  assert.equal(await page.locator('.home-card-expanded .tmdb-rating-badge').textContent(), 'TMDB 8,4')
  assert.equal(apiRequests, beforeFocus)
  assert.equal(await page.locator('.home-card:not(.is-expanded) .content-rating-badge, .home-card:not(.is-expanded) .tmdb-rating-badge').count(), 0)
  console.log('✓ Top 10/Dica mostram a nota da descoberta sem classificação ou consultas por foco; pôsteres pequenos intactos')

  await openMovie('Filme 2')
  await page.locator('.vod-detail-meta .tmdb-rating-badge').waitFor()
  assert.equal(await page.locator('.vod-detail-meta .content-rating-badge').count(), 0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await openMovie('Filme 3')
  await page.locator('.vod-detail-meta .content-rating-badge').waitFor()
  assert.equal(await page.locator('.vod-detail-meta .tmdb-rating-badge').count(), 0)
  assert.ok((await readMeta()).includes('Provedor'))
  console.log('✓ Sem classificação brasileira não usa outro país; 49 votos omite TMDB e conserva Provedor')

  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.content-card .content-rating-badge, .content-card .tmdb-rating-badge').count(), 0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await openSectionCategory(page, 'series', 'Todos')
  await page.locator('.content-card:has(.tv-focus)').waitFor()
  await page.keyboard.press('Enter')
  await page.getByLabel('Classificação indicativa: 16 anos').waitFor()
  assert.ok(details.some((call) => call.append.includes('content_ratings')))
  console.log('✓ Série usa content_ratings; pôsteres da grade sem novos selos')

  await page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    await db.integrations.clear()
    await db.titleMetadata.clear()
  })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  const beforeNoKey = details.length
  await openMovie('Filme 4')
  assert.equal(await page.locator('.vod-detail-meta .content-rating-badge, .vod-detail-meta .tmdb-rating-badge').count(), 0)
  assert.equal(details.length, beforeNoKey)
  assert.ok(!(await page.locator('body').textContent()).includes(KEY))
  assert.ok(!logs.join('\n').includes(KEY))
  assert.deepEqual(errors, [])
  console.log('✓ Sem chave: nenhum selo/consulta; chave ausente do DOM e console; nenhum erro de página')
} catch (error) {
  await page.screenshot({ path: `${SHOTS}/erro.png` }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
