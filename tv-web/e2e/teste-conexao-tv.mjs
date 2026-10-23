// Features 062 e 064 (upload): motor real, transporte/relógio controlados; não prova a rede da TV.
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
      const upload = url.pathname === '/__up'
      const bytes = upload ? options.body.byteLength : Number(url.searchParams.get('bytes'))
      state.calls.push({ bytes, method: options.method, credentials: options.credentials, cache: options.cache,
        redirect: options.redirect, headers: options.headers, path: url.pathname, search: url.search })
      if (mode === 'error') throw new Error('unsafe-untrusted-details')
      if (mode === '429') return new Response('', { status: 429 })
      if (mode === 'partial' && bytes > 1) throw new Error('unsafe-untrusted-details')
      if (upload) {
        // Envio: o destino só confirma. cancel-up não responde até o aborto; 	imeout e partial recusam.
        if (mode === 'timeout') throw new Error('unsafe-untrusted-details')
        if (mode === 'cancel-up') {
          state.active++
          return new Promise((_, reject) => options.signal.addEventListener('abort', () => {
            state.active--; reject(new DOMException('Aborted', 'AbortError'))
          }, { once: true }))
        }
        clock += mode === 'bytes' ? 1 : 1050
        return new Response(null, { status: 200 })
      }
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
/**
 * Com a lista "Fixture 062" já cadastrada: abre a lista, vai à engrenagem da topbar e desce até a aba de Integrações e o card
 * do teste de conexão — guiado pelo texto em foco, não por contagem de teclas (as abas mudam com as features).
 */
async function openSettingsCard(open = 'Abrir teste') {
  const focusedText = () => page.evaluate(() => document.querySelector('.tv-focus')?.textContent ?? '')
  await page.locator('.source-card-wrap', { hasText: 'Fixture 062' }).locator('.source-card').click()
  await page.locator('.home-content').waitFor()
  await page.keyboard.press('ArrowUp') // billboard -> topbar
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight') // -> engrenagem (última; a lupa está escondida)
  await page.keyboard.press('Enter')
  await page.locator('.settings-screen').waitFor()
  // A aba de Integrações fica acima de "Fontes IPTV" (a que abre focada): sobe até ela.
  for (let i = 0; i < 10 && !/Integra/.test(await focusedText()); i++) await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight') // aba -> painel
  for (let i = 0; i < 10 && !(await focusedText()).includes(open); i++) await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: open })).toHaveClass(/tv-focus/)
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
  // do card do TMDB: OpenSubtitles, SubDL, Atualizar das legendas (091, só com portal), IA, Clima, teste de conexão
  const onOpenCard = () => page.evaluate(() => (document.querySelector('.tv-focus')?.textContent ?? '').includes('Abrir teste'))
  for (let i = 0; i < 10 && !(await onOpenCard()); i++) await page.keyboard.press('ArrowDown')
  await openCard()
  assert.equal((await stats()).calls.length, 0)
  await page.screenshot({ path: `${shots}/ready-pt.png` })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Repetir teste' })).toHaveClass(/tv-focus/)
  await expect(page.getByText('Resultado completo', { exact: true })).toBeVisible()
  await expect.poll(async () => (await last())?.status).toBe('complete')
  const saved = await last()
  assert.ok(saved.downloadMbps > 0 && saved.latencyMs > 0 && saved.jitterMs >= 0)
  assert.ok(saved.uploadMbps > 0 && saved.uploadSamples >= 1 && saved.uploadSentBytes > 0, 'feature 064: o resultado salvo traz o upload')
  assert.equal((await stats()).active, 0)
  await expect(page.getByRole('dialog').getByText('Upload', { exact: true })).toBeVisible()
  const calls = (await stats()).calls
  for (const call of calls) {
    assert.equal(call.method, call.path === '/__up' ? 'POST' : 'GET'); assert.equal(call.credentials, 'omit'); assert.equal(call.cache, 'no-store')
    assert.equal(call.redirect, 'error'); assert.equal(call.headers, undefined)
    if (call.path === '/__up') assert.equal(call.search, '', 'o envio não leva parâmetro nenhum')
  }
  const firstUp = calls.findIndex((call) => call.path === '/__up')
  assert.ok(firstUp > 0 && calls.slice(0, firstUp).every((call) => call.path === '/__down') && calls.slice(firstUp).every((call) => call.path === '/__up'), 'download inteiro antes do primeiro envio')
  await page.screenshot({ path: `${shots}/result-pt.png` })
  await closeDialog()
  const scroll = await page.locator('.settings-panel').evaluate((el) => el.scrollTop)
  assert.ok(scroll > 0)

  for (const mode of ['error', '429', 'cancel', 'cancel-up']) {
    await transport(mode); await openCard(); await page.keyboard.press('Enter')
    if (mode === 'cancel' || mode === 'cancel-up') {
      await page.waitForFunction((upload) => window.__speedTransport.calls.some((call) => (upload ? call.path === '/__up' : call.bytes > 1)), mode === 'cancel-up')
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
    assert.ok(result.requestedBytes <= 75_000_000 && result.requestedBytes + result.uploadRequestedBytes <= 150_000_000)
    assert.equal((await stats()).active, 0)
    if (mode === 'bytes') assert.equal(result.requestedBytes, 75_000_000)
    if (mode !== 'bytes') assert.equal(result.uploadMbps, null)
    await closeDialog()
    if (mode === 'timeout') await page.clock.resume()
  }

  const beforeStorageFailure = await last()
  // Falha de guarda: diagnóstico seguro, resultado atual visível e anterior preservado.
  await page.evaluate(async () => {
    window.__speedOriginalIdbPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'networkDiagnostics') throw new DOMException('unsafe-untrusted-details', 'QuotaExceededError')
      return window.__speedOriginalIdbPut.apply(this, args)
    }
  })
  await transport('success'); await openCard(); await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByText(/NET-W-QUOTA/)).toBeVisible()
  await expect(page.getByText('Resultado completo', { exact: true })).toBeVisible()
  assert.ok(!(await page.textContent('body')).includes('unsafe-untrusted-details'))
  assert.deepEqual(await last(), beforeStorageFailure)
  await page.evaluate(async () => {
    IDBObjectStore.prototype.put = window.__speedOriginalIdbPut
  })
  await closeDialog()

  // Persistência após reload. O Início não tem mais o dock de serviços (ad-hoc 2026-10-09): o teste só se abre por
  // Configurações › Integrações, o mesmo caminho do começo deste roteiro.
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    await db.sources.put({ id: 'e2e-speed', type: 'm3u_url', displayName: 'Fixture 062', connectionState: 'synced',
      activeGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() })
  })
  await page.reload()
  await transport('error')
  await page.locator('.source-card-wrap', { hasText: 'Fixture 062' }).locator('.source-card').click()
  await page.locator('.home-content').waitFor()
  assert.equal(await page.locator('.home-dock, .home-hero-dock').count(), 0, 'o Início não tem dock de serviços')
  await page.reload()
  await transport('error')
  await openSettingsCard()
  await page.keyboard.press('Enter')
  // O diálogo abre pronto para medir de novo; o último resultado salvo continua no card depois de fechar.
  await expect(page.getByRole('dialog').locator('.tv-focus')).toHaveText(/Iniciar teste|Repetir teste/)
  await page.screenshot({ path: `${shots}/persistido-pt.png` })
  await closeDialog()
  assert.equal((await stats()).calls.length, 0)

  for (const [language, open, start] of [['en', 'Open test', 'Start test'], ['es', 'Abrir prueba', 'Iniciar prueba']]) {
    await page.evaluate((language) => { localStorage.setItem('ccplaytv:app-language', language) }, language)
    await page.reload(); await transport('error')
    await openSettingsCard(open)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: start })).toHaveClass(/tv-focus/)
    assert.equal(await page.getByRole('dialog').getByRole('button').evaluateAll((buttons) => buttons.filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length), 0)
    assert.equal((await stats()).calls.length, 0)
    await page.screenshot({ path: `${shots}/ready-${language}.png` })
  }
  assert.deepEqual(errors, [])
  console.log('062/064: sucesso com upload/parcial/erro/429/limites/cancelamento (download e upload), persistência, scroll/RETURN e pt/en/es aprovados (transporte controlado).')
} finally { await browser.close() }
