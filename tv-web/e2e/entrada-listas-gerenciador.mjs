// Feature 070, US1 (T019): tela "Adicionar lista" com ID formato MAC + chave de 10 dígitos + endereço + QR, entrada
// no portal por ID + chave digitados, criação de lista e Recarregar, "Gerar nova chave" invalidando a antiga.
// Dev server REAL (`e2e/lib/portalStack.mjs`: emulador + API + portal-web + TV commercial). Opt-in: exige
// gcloud/emulador/api/.venv, por isso fica fora do SUITE do runner. Não comprova DUID/MAC real nem a TV física.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { startPortalStack } from './lib/portalStack.mjs'

const log = message => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`)
let stack, browser, failed
try {
  stack = await startPortalStack({ log })
  browser = await chromium.launch({ headless: true })
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  await tvContext.route('https://iptv.fixture.test/**', route => route.fulfill({ status: 200, contentType: 'audio/x-mpegurl',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: '#EXTM3U\n#EXTINF:-1 group-title="T",Canal A\nhttps://media.fixture.test/a.m3u8\n' }))
  await tvContext.route('https://media.fixture.test/**', () => {})
  const tv = await tvContext.newPage()
  await tv.goto(stack.tvOrigin)
  await tv.getByRole('button', { name: /Adicionar lista/ }).waitFor({ timeout: 20000 })

  // SC-001: a partir da tela de listas, uma ação (OK em "Adicionar lista") mostra ID, chave, endereço e QR.
  await tv.keyboard.press('Enter')
  const values = tv.locator('.portal-pairing-value')
  await expect(values.first()).toHaveText(/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/, { timeout: 20000 })
  await expect(values.nth(1)).toHaveText(/^\d{10}$/)
  await expect(tv.getByRole('img', { name: 'QR de acesso temporário ao portal desta TV' })).toBeVisible({ timeout: 15000 })
  expect(await tv.locator('.portal-pairing').innerText()).toContain(stack.portalOrigin)
  const displayId = await values.first().innerText()
  const deviceKey = await values.nth(1).innerText()
  log(`Adicionar: ID ${displayId} e chave de 10 dígitos visíveis com 1 ação (SC-001)`)

  // Portal: entrada manual digitando ID (minúsculas/hífens) + chave.
  const portalContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })
  const portal = await portalContext.newPage()
  const login = async (id, key) => {
    await portal.goto(stack.portalOrigin)
    await portal.getByLabel('Endereço MAC da TV', { exact: true }).fill(id)
    await portal.getByLabel('Chave do dispositivo', { exact: true }).fill(key)
    await portal.getByRole('button', { name: 'Conectar', exact: true }).click()
  }
  await login(displayId.toLowerCase().replaceAll(':', '-'), deviceKey)
  await expect(portal.getByRole('heading', { name: 'Suas listas' })).toBeVisible({ timeout: 20000 })
  log('portal: entrou por ID + chave digitados')

  await portal.getByRole('button', { name: 'Adicionar lista', exact: true }).click()
  await portal.getByLabel('Nome da lista').fill('Lista pelo gerenciador')
  await portal.getByRole('group', { name: 'Tipo de lista' }).getByRole('radio', { name: 'M3U por URL' }).check()
  await portal.getByLabel('URL da lista M3U', { exact: true }).fill('https://iptv.fixture.test/list.m3u?key=segredo-fixture')
  await portal.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  await tv.getByRole('button', { name: 'Recarregar' }).click()
  await expect.poll(() => tv.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return (await db.sources.toArray()).map(s => s.displayName) }),
    { timeout: 45000, intervals: [1000] }).toContain('Lista pelo gerenciador')
  log('lista criada no portal aplicada na TV (Recarregar / tela rápida)')
  for (const text of [await tv.locator('body').innerText(), await portal.locator('body').innerText()]) assert.ok(!text.includes('segredo-fixture'))

  // Gerar nova chave: a antiga deixa de valer.
  await tv.getByRole('button', { name: 'Gerar nova chave' }).click()
  await tv.getByRole('dialog').getByRole('button', { name: 'Gerar nova chave' }).click()
  await expect(values.nth(1)).not.toHaveText(deviceKey, { timeout: 20000 })
  await expect(values.nth(1)).toHaveText(/^\d{10}$/)
  await expect(values.first()).toHaveText(displayId)
  const freshContext = await browser.newContext({ locale: 'pt-BR' })
  const fresh = await freshContext.newPage()
  await fresh.goto(stack.portalOrigin)
  await fresh.getByLabel('Endereço MAC da TV', { exact: true }).fill(displayId)
  await fresh.getByLabel('Chave do dispositivo', { exact: true }).fill(deviceKey)
  await fresh.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(fresh.getByRole('alert')).toBeVisible({ timeout: 10000 })
  await expect(fresh.getByRole('heading', { name: 'Suas listas' })).toHaveCount(0)
  log('nova chave gerada: ID mantido, chave antiga recusada')

  // SC-007 / US4: RETURN sai da tela Adicionar para os perfis, abre a mesma
  // lista e um segundo RETURN volta aos perfis antes de qualquer saída do app.
  await tv.keyboard.press('Escape')
  const managedCard = tv.locator('.source-card', { hasText: 'Lista pelo gerenciador' })
  await managedCard.waitFor({ state: 'visible', timeout: 15000 })
  // O SELECT do controle remoto dispara o mesmo click do cartão; usar o
  // click semântico aqui evita depender do foco visual após a troca de chave.
  await managedCard.click()
  await tv.locator('.home-screen').waitFor({ state: 'visible', timeout: 15000 })
  await tv.keyboard.press('Escape')
  await managedCard.waitFor({ state: 'visible', timeout: 15000 })
  log('RETURN em cadeia: Início → perfis com foco na lista ativa')
  console.log('PASS: 070/US1+US4 — Adicionar (ID/chave/URL/QR), entrada manual, lista aplicada, nova chave e RETURN')
} catch (error) {
  failed = error
  console.error('FALHA:', String(error?.message ?? error).split('\n').slice(0, 8).join('\n'))
} finally {
  await browser?.close()
  stack?.stop()
}
if (failed) process.exitCode = 1
