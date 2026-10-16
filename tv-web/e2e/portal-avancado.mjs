// Features 075/076 — Portal & licença só pelo controle (setas + OK + RETURN): Avançado, código de recuperação, nova chave com Cancelar e
// confirmar, aba Backup e Desvincular. Browser + portal fictício; não comprova TV, AVPlay nem leitura real do QR.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium, expect } from '@playwright/test'
import { abrirPortalLicenca, irParaFoco } from './lib/portal.mjs'

const origin = 'https://portal.fixture.test'
const PORT = 5180
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, NO_COLOR: '1', VITE_PORTAL_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
let browser
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('fixture_vite_timeout')), 30000)
    vite.stdout.on('data', value => { if (String(value).includes(`http://127.0.0.1:${PORT}`)) { clearTimeout(timeout); resolve() } })
    vite.once('exit', () => { clearTimeout(timeout); reject(Error('fixture_vite_exit')) })
  })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  await context.addInitScript(() => { window.webapis = { productinfo: { getDuid: () => 'fake-browser-duid' } } })
  const first = { deviceId: 'fixture-tv', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'fixture-tv.' + 'a'.repeat(42) + 'A', deviceKey: '1732049818',
    authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-1111-2222-3333-4444-5555-6666', recoveryCodeVersion: 1 }
  const second = { ...first, deviceKey: '9876543210', authEpoch: 2, bearer: 'fixture-tv.' + 'd'.repeat(42) + 'A',
    recoveryCode: '9999-8888-7777-6666-5555-4444-3333', recoveryCodeVersion: 2 }
  const requests = []
  await context.route(origin + '/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }
    const reply = json => route.fulfill({ json, headers })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    requests.push(path)
    let body = {}
    try { body = request.postDataJSON() ?? {} } catch { /* GET sem corpo */ }
    if (path.endsWith('/devices/enroll')) return reply({ ...first, operationId: 'enrollment-a' })
    if (path.endsWith('/device/revoke')) return reply({ operationId: body.operationId, state: 'ready' })
    if (path.endsWith('/devices/recovery/result')) return reply({ operationId: body.operationId, state: 'ready', credentials: second })
    if (path.endsWith('/devices/recovery/ack')) return reply({ state: 'confirmed' })
    return route.fulfill({ status: 404, headers, json: { code: 'not_found' } })
  })
  const page = await context.newPage()
  const focus = () => page.evaluate(() => (document.querySelector('.tv-focus')?.textContent ?? '').replace(/\s+/g, ' ').trim())
  const press = async (...keys) => { for (const key of keys) { await page.keyboard.press(key); await page.waitForTimeout(150) } }
  const body = () => page.locator('body').innerText()

  await page.goto(`http://127.0.0.1:${PORT}/`)
  await page.locator('.add-card.tv-focus').waitFor({ timeout: 15000 })
  await abrirPortalLicenca(page)

  // US1: tudo à vista; sem olho nem código na principal; foco inicial em Avançado (build não comercial, sem cartão Licença).
  await expect(page.getByRole('img', { name: /QR de acesso/ })).toBeVisible()
  await expect(page.getByText('173 204 9818', { exact: true })).toBeVisible()
  assert.equal(await focus(), 'Avançado')
  await expect(page.getByText('Guarde seu código de recuperação em Avançado.')).toBeVisible()
  assert.equal(await page.getByRole('heading', { name: 'Licença', exact: true }).count(), 0, 'sem cartão Licença fora do build comercial')
  assert.ok(!(await body()).includes(first.recoveryCode) && !(await body()).includes('••••'), 'sem código nem máscara na principal')

  // US2: Avançado — subtela com texto de para que serve; o olho revela sem modal; RETURN volta com o foco em Avançado.
  await press('Enter')
  const advanced = page.getByRole('region', { name: 'Avançado' })
  await expect(advanced).toBeVisible()
  await expect(advanced).toContainText('não é uma licença comprada')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.equal(await focus(), 'Mostrar código de recuperação')
  assert.ok(!(await body()).includes(first.recoveryCode), 'focar o olho não revela')
  await press('Enter')
  await expect(page.getByText(first.recoveryCode, { exact: true })).toBeVisible()
  await press('Escape')
  await expect(advanced).toHaveCount(0)
  assert.equal(await focus(), 'Avançado')
  assert.ok(!(await body()).includes(first.recoveryCode), 'sair do Avançado oculta o código')
  await press('Enter')
  assert.ok(!(await body()).includes(first.recoveryCode), 'reabrir o Avançado mostra o código oculto')

  // Rolagem (relato do usuário, 2026-10-16): descer até o último item e voltar ao primeiro não pode deixar o título e o
  // texto do primeiro item cortados em cima; o painel rola dentro de `.settings-panel`.
  await press('ArrowDown', 'ArrowDown', 'ArrowDown')
  assert.equal(await focus(), 'Desvincular esta TV')
  await press('ArrowUp', 'ArrowUp', 'ArrowUp')
  assert.equal(await focus(), 'Mostrar código de recuperação')
  await page.waitForTimeout(300)
  const visivel = await page.evaluate(() => {
    const painel = document.querySelector('.settings-panel').getBoundingClientRect()
    const titulo = document.querySelector('.portal-advanced h2').getBoundingClientRect()
    const primeiro = document.querySelector('.portal-advanced-item h3').getBoundingClientRect()
    return { titulo: titulo.top >= painel.top - 1, primeiro: primeiro.top >= painel.top - 1 }
  })
  assert.deepEqual(visivel, { titulo: true, primeiro: true }, 'ao voltar ao primeiro item o topo do painel aparece inteiro')
  // US3: nova chave — Cancelar não gira nada e fica no Avançado; confirmar volta à principal com a chave nova.
  await press('ArrowDown')
  assert.equal(await focus(), 'Gerar nova chave e código')
  await press('Enter')
  await expect(page.getByRole('dialog')).toContainText('o site é desconectado')
  assert.equal(await focus(), 'Cancelar')
  await press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(advanced).toBeVisible()
  assert.equal(await focus(), 'Gerar nova chave e código')
  assert.ok(!requests.some(path => path.endsWith('/device/revoke')), 'cancelar não gira a chave')
  await press('Enter', 'ArrowRight', 'Enter')
  await expect(page.getByText('987 654 3210', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(advanced).toHaveCount(0)
  await expect(page.getByText('173 204 9818', { exact: true })).toHaveCount(0)
  assert.ok(requests.some(path => path.endsWith('/device/revoke')), 'uma rotação')
  assert.ok(!(await body()).includes(second.recoveryCode), 'código novo nasce oculto')
  assert.equal(await focus(), 'Avançado')

  // US4: Backup é aba própria logo depois de Portal & licença; nenhuma ação de backup sobra no Portal.
  assert.equal(await page.getByRole('button', { name: 'Fazer backup agora' }).count(), 0)
  await abrirBackupPelasAbas(page, press, focus)
  const backup = page.locator('.portal-backup')
  await expect(backup.getByRole('button')).toHaveText(['Fazer backup agora', 'Restaurar backup', 'Apagar backup'])
  assert.equal(await focus(), 'Fazer backup agora')

  // Desvincular vive no Avançado.
  await press('ArrowLeft', 'ArrowUp', 'Enter')
  await page.locator('.portal-license-panel').waitFor({ timeout: 5000 })
  await irParaFoco(page, 'Avançado')
  await press('Enter', 'ArrowDown', 'ArrowDown', 'ArrowDown')
  assert.equal(await focus(), 'Desvincular esta TV')
  await press('Enter')
  await expect(page.getByRole('dialog', { name: 'Desvincular esta TV do portal?' })).toBeVisible()
  assert.equal(await focus(), 'Cancelar')
  await press('ArrowRight', 'Enter')
  await expect(page.getByText(/TV desvinculada/)).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: 'Vincular de novo' })).toBeVisible()
  console.log('Portal & licença: Avançado, código de recuperação, nova chave, aba Backup e Desvincular só pelo controle aprovados com fixtures.')} finally {
  await browser?.close()
  vite.kill()
}

/** Da aba Portal & licença (painel) → ← abas → ↓ Backup → OK. */
async function abrirBackupPelasAbas(page, press, focus) {
  await press('ArrowLeft')
  assert.equal(await focus(), 'Portal & licença')
  await press('ArrowDown')
  assert.equal(await focus(), 'Backup')
  await press('Enter')
  await page.locator('.portal-backup').waitFor({ timeout: 5000 })
}
