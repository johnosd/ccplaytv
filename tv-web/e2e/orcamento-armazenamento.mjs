// Smoke E2E do orçamento (082, T048). Usa somente fixture local; a lista real
// e a quota de 80 MiB ficam no roteiro de simulação da feature.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const pageUrl = 'http://localhost:5173'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await context.newPage()
try {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: pageUrl, quotaSize: 80 * 1024 * 1024 })
  await page.goto(pageUrl)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: 'Orçamento fixture', url: `${pageUrl}/e2e/fixtures/legibilidade-tv.m3u` })
  await page.waitForSelector('text=/Concluída|Importação concluída/', { timeout: 30000 })
  const body = await page.locator('body').innerText()
  assert.equal(/STO-01/i.test(body), false)
  console.log('orçamento E2E: fixture importada sem STO-01')
} finally {
  await context.close()
  await browser.close()
}
