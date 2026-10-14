// Pacote EMPACOTADO (CCPlayTv/index.html sob file://, como na TV) contra o staging real, só por teclado
// (setas + OK), com o relógio da TV atrasado. Pré-requisito: `build:tizen:commercial` já sincronizado.
// Não comprova DUID real, AVPlay nem o Chromium da TV. Uso: node e2e/portal-pacote-file.mjs [--list]
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { abrirPortalLicenca } from './lib/portal.mjs'

const entry = pathToFileURL(resolve(import.meta.dirname, '..', '..', 'CCPlayTv', 'index.html')).href
const clockOffsetMs = Number(process.env.TV_CLOCK_OFFSET_MS ?? -5000)
const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files', '--disable-web-security'] })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
const duid = 'pkg-' + crypto.randomUUID()
await context.addInitScript(([d, offset]) => {
  window.webapis = { productinfo: { getDuid: () => d } }
  const nativeNow = Date.now.bind(Date)
  Date.now = () => nativeNow() + offset
}, [duid, clockOffsetMs])
const page = await context.newPage()
const net = []
page.on('response', r => { if (r.url().includes('/portal/v1/')) net.push(`${r.request().method()} ${new URL(r.url()).pathname.replace('/portal/v1', '')} ${r.status()}`) })
page.on('pageerror', e => net.push('pageerror: ' + String(e.message).slice(0, 200)))
const focus = () => page.evaluate(() => { const el = document.querySelector('.tv-focus'); return (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) })
const key = async name => { await page.keyboard.press(name); await page.waitForTimeout(250) }
const step = msg => console.log('•', msg)
let failed
try {
  await page.goto(entry)
  await abrirPortalLicenca(page)
  step('perfis → Configurações → Portal & licença pelo controle')
  const panel = page.locator('.portal-license-panel')
  await panel.waitFor({ timeout: 10000 })
  step('painel aberto pelo controle')

  await page.getByText('Licença: Período de teste', { exact: true }).waitFor({ timeout: 20000 })
  assert.ok(await panel.getByText(/Validade até:/).count(), 'validade da licença visível')
  assert.ok(await panel.getByText(/R\$ 35 por 12 meses/).count(), 'oferta visível')
  assert.equal(await panel.getByText('O portal ainda não está disponível neste app', { exact: false }).count(), 0, 'portal configurado')
  step('licença: período de teste, validade e oferta visíveis')

  assert.equal(await focus(), 'Gerar QR para o portal')
  await key('Enter')
  await page.getByRole('img', { name: /QR de acesso ao portal/ }).waitFor({ timeout: 15000 })
  step(`QR visível com relógio da TV ${clockOffsetMs} ms em relação ao servidor`)

  await key('ArrowDown')
  assert.equal(await focus(), 'Mostrar chave da TV')
  await key('Enter')
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 5000 })
  step('diálogo da chave: ' + (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 140))
  await page.screenshot({ path: process.env.PKG_SHOT_DIR ? process.env.PKG_SHOT_DIR + '/chave.png' : undefined }).catch(() => {})
  await key('Escape')
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})

  console.log('PASS: pacote empacotado — painel, licença, QR e chave por controle')
} catch (error) {
  failed = error
  console.error('FALHA:', String(error?.message ?? error).split('\n').slice(0, 5).join('\n'))
  console.error('painel:', (await page.locator('body').innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 700))
  console.error('rede:', net.slice(-12).join(' | '))
} finally {
  await browser.close()
}
if (failed) process.exitCode = 1
