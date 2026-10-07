// Feature 062: motor real, transporte/relógio controlados; não prova a rede da TV.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { expect } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
const shots = 'test-results/teste-conexao-tv'
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

async function transport(mode) {
  await page.evaluate((mode) => {
    const original = window.__speedOriginalFetch ?? window.fetch.bind(window)
    window.__speedOriginalFetch = original
    let clock = 0
    const state = { mode, calls: [], active: 0 }
    window.__speedTransport = state
    Object.defineProperty(performance, 'now', { configurable: true, value: () => clock })
    window.fetch = async (input, options) => {
      const url = new URL(String(input), location.href)
      if (url.origin !== 'https://speed.cloudflare.com') return original(input, options)
      const bytes = Number(url.searchParams.get('bytes'))
      state.calls.push({ bytes, method: options.method, credentials: options.credentials, cache: options.cache,
        redirect: options.redirect, headers: options.headers })
      if (mode === 'error') throw new Error('unsafe-untrusted-details')
      if (mode === '429') return new Response('', { status: 429 })
      if (mode === 'partial' && bytes > 1) throw new Error('unsafe-untrusted-details')
      const duration = bytes === 1 ? 10 + state.calls.length : mode === 'bytes' ? 1 : 1050
      let remaining = bytes
      let stopped = false
      let streamController
      state.active++
      const finish = () => { if (!stopped) { stopped = true; state.active--; options.signal.removeEventListener('abort', abort) } }
      const abort = () => { if (!stopped) { finish(); streamController.error(new DOMException('Aborted', 'AbortError')) } }
      const body = new ReadableStream({
        start(controller) { streamController = controller; options.signal.addEventListener('abort', abort, { once: true }) },
        pull(controller) {
          if (stopped || ((mode === 'cancel' || mode === 'timeout') && bytes > 1)) return
          if (remaining > 0) { const size = Math.min(remaining, 1_000_000); remaining -= size; controller.enqueue(new Uint8Array(size)) }
          else { clock += duration; finish(); controller.close() }
        },
        cancel() { finish() },
      })
      return new Response(body, { headers: { 'content-length': String(bytes) } })
    }
  }, mode)
}
async function stats() { return page.evaluate(() => window.__speedTransport) }
async function last() {
  return page.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return db.networkDiagnostics.get('last') })
}
async function openCard() {
  await expect(page.getByRole('button', { name: 'Abrir teste' })).toHaveClass(/tv-focus/)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Iniciar teste' })).toHaveClass(/tv-focus/)
}
async function closeDialog() {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Abrir teste' })).toHaveClass(/tv-focus/)
}

try {
  mkdirSync(shots, { recursive: true })
  await page.goto('http://localhost:5173')
  await page.locator('.add-card').waitFor()
  await transport('success')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.locator('.settings-screen').waitFor()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
  await openCard()
  assert.equal((await stats()).calls.length, 0)
  await page.screenshot({ path: `${shots}/ready-pt.png` })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Repetir teste' })).toHaveClass(/tv-focus/)
  await expect(page.getByText('Resultado completo', { exact: true })).toBeVisible()
  await expect.poll(async () => (await last())?.status).toBe('complete')
  const saved = await last()
  assert.ok(saved.downloadMbps > 0 && saved.latencyMs > 0 && saved.jitterMs >= 0)
  assert.equal((await stats()).active, 0)
  for (const call of (await stats()).calls) {
    assert.equal(call.method, 'GET'); assert.equal(call.credentials, 'omit'); assert.equal(call.cache, 'no-store')
    assert.equal(call.redirect, 'error'); assert.equal(call.headers, undefined)
  }
  await page.screenshot({ path: `${shots}/result-pt.png` })
  await closeDialog()
  const scroll = await page.locator('.settings-panel').evaluate((el) => el.scrollTop)
  assert.ok(scroll > 0)

  for (const mode of ['error', '429', 'cancel']) {
    await transport(mode); await openCard(); await page.keyboard.press('Enter')
    if (mode === 'cancel') {
      await page.waitForFunction(() => window.__speedTransport.calls.some((call) => call.bytes > 1))
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      assert.equal((await stats()).active, 0)
      assert.equal(await page.locator('.settings-panel').evaluate((el) => el.scrollTop), scroll)
    } else {
      await expect(page.getByRole('button', { name: 'Repetir teste' })).toHaveClass(/tv-focus/)
      assert.ok(!(await page.textContent('body')).includes('unsafe-untrusted-details'))
      await closeDialog()
    }
    assert.deepEqual(await last(), saved)
  }

  for (const mode of ['partial', 'bytes', 'timeout']) {
    await transport(mode); await openCard()
    if (mode === 'timeout') await page.clock.install()
    await page.keyboard.press('Enter')
    if (mode === 'timeout') {
      await page.waitForFunction(() => window.__speedTransport.calls.some((call) => call.bytes > 1))
      await page.clock.runFor(30_000)
    }
    await expect(page.getByRole('button', { name: 'Repetir teste' })).toHaveClass(/tv-focus/)
    await expect(page.getByText('Resultado parcial', { exact: true })).toBeVisible()
    await expect.poll(async () => (await last())?.reason).toBe(mode === 'partial' ? 'measurement_error' : mode === 'bytes' ? 'byte_limit' : 'time_limit')
    const result = await last()
    assert.ok(result.requestedBytes <= 100_000_000)
    assert.equal((await stats()).active, 0)
    if (mode === 'bytes') assert.equal(result.requestedBytes, 100_000_000)
    await closeDialog()
    if (mode === 'timeout') await page.clock.resume()
  }

  // Persistência após reload e entrada pelo dock, incluindo RETURN em duas camadas.
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    await db.sources.put({ id: 'e2e-speed', type: 'm3u_url', displayName: 'Fixture 062', connectionState: 'synced',
      activeGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() })
  })
  await page.reload()
  await transport('error')
  await page.locator('.source-card-wrap', { hasText: 'Fixture 062' }).locator('.source-card').click()
  await page.locator('.home-content').waitFor()
  await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.home-dock [data-service="speedtest"]')).toHaveClass(/tv-focus/)
  await expect(page.locator('.home-dock-summary')).toContainText('Cloudflare')
  await page.screenshot({ path: `${shots}/dock-pt.png` })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Abrir teste' })).toHaveClass(/tv-focus/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await openCard(); await closeDialog(); await page.keyboard.press('Escape')
  await expect(page.locator('.home-dock [data-service="speedtest"]')).toHaveClass(/tv-focus/)
  assert.equal((await stats()).calls.length, 0)

  for (const [language, open, start] of [['en', 'Open test', 'Start test'], ['es', 'Abrir prueba', 'Iniciar prueba']]) {
    await page.evaluate((language) => { localStorage.setItem('ccplaytv:app-language', language) }, language)
    await page.reload(); await transport('error')
    await page.locator('.source-card-wrap', { hasText: 'Fixture 062' }).locator('.source-card').click()
    await page.locator('.home-content').waitFor()
    await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: open })).toHaveClass(/tv-focus/)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: start })).toHaveClass(/tv-focus/)
    assert.equal(await page.getByRole('dialog').getByRole('button').evaluateAll((buttons) => buttons.filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length), 0)
    assert.equal((await stats()).calls.length, 0)
    await page.screenshot({ path: `${shots}/ready-${language}.png` })
  }
  assert.deepEqual(errors, [])
  console.log('062: sucesso/parcial/erro/429/limites/cancelamento, persistência, dock/scroll/RETURN e pt/en/es aprovados (transporte controlado).')
} finally { await browser.close() }
