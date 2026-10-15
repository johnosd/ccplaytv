// Integração browser com serviço/provedor fictícios; não comprova TV ou nuvem.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium, expect } from '@playwright/test'
import { abrirPortalLicenca } from './lib/portal.mjs'
import { mkdir } from 'node:fs/promises'
const origin = 'https://portal.fixture.test'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5175', '--strictPort'], {
  env: { ...process.env, VITE_PORTAL_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
let browser
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('fixture_vite_timeout')), 30000)
    vite.stdout.on('data', value => { if (String(value).includes('http://127.0.0.1:5175')) { clearTimeout(timeout); resolve() } })
    vite.once('exit', () => { clearTimeout(timeout); reject(Error('fixture_vite_exit')) })
  })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  await context.addInitScript(() => { window.webapis = { productinfo: { getDuid: () => 'fake-browser-duid' } } })
  const credentials = { deviceId: 'fixture-tv', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'fixture-tv.' + 'a'.repeat(42) + 'A',
    deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
    recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  let operations = []
  const acks = []
  const snapshots = []
  const deletionIds = []
  let recoveryRequested = false
  let recoveryAckLost = false
  await context.route(origin + '/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }
    const reply = json => route.fulfill({ json, headers })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = request.postDataJSON()
    if (path.endsWith('/enroll')) return reply({ ...credentials, operationId: 'enrollment-a' })
    if (path.endsWith('/recovery/challenges')) {
      recoveryRequested = true
      return reply({ claimId: 'claim-fixture', deviceId: credentials.deviceId, token: 'a'.repeat(42) + 'A', claimSecret: 'b'.repeat(42) + 'A', expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' })
    }
    if (path.endsWith('/recovery/result')) return reply({ operationId: 'recovery-fixture', state: 'ready', credentials: { ...credentials, authEpoch: 2, recoveryCodeVersion: 2, bearer: 'fixture-tv.' + 'd'.repeat(42) + 'A' } })
    if (path.endsWith('/recovery/ack')) {
      if (recoveryRequested && !recoveryAckLost) { recoveryAckLost = true; return route.abort('failed') }
      return reply({ state: 'confirmed' })
    }
    if (path.endsWith('/invites')) return reply({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 299000).toISOString(),
      qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' })
    if (path.endsWith('/device/sources')) return reply({ results: body.sources.map(x => ({ sourceId: x.sourceId, state: 'stored' })) })
    if (path.endsWith('/deletions')) { deletionIds.push(...body.deletions.map(x => x.deletionId)); return reply({ acks: body.deletions.map(x => x.deletionId) }) }
    if (path.endsWith('/operations')) return reply({ operations })
    if (path.endsWith('/snapshot')) { snapshots.push(body); return reply({ snapshotRevision: snapshots.length }) }
    if (path.endsWith('/ack')) {
      const operationId = path.split('/').at(-2)
      acks.push({ operationId, ...body })
      if (body.state === 'applied' || body.state === 'conflict') operations = operations.filter(x => x.operationId !== operationId)
      return reply({ operationId, ...body })
    }
    return route.fulfill({ status: 404, headers, json: { code: 'not_found' } })
  })
  await context.route('https://provider.fixture.test/**', route => route.fulfill({
    contentType: 'audio/x-mpegurl', headers: { 'Access-Control-Allow-Origin': '*' },
    body: '#EXTM3U\n#EXTINF:-1 group-title="Canais | Fixture",Canal Fixture\nhttps://media.fixture.test/channel.ts\n',
  }))
  const page = await context.newPage()
  // 071: nada consulta sozinho — cada rodada do serviço fictício é um Atualizar (pausa de 10 s por escopo).
  const pull = async () => {
    for (let i = 0; i < 25; i++) {
      const result = await page.evaluate(async () => (await import('/src/lib/portal/portalRuntime.ts')).refreshPortal('lists'))
      if (result.ok || result.code !== 'wait') return result
      await page.waitForTimeout(1000)
    }
  }
  await page.goto('http://127.0.0.1:5175/')
  await page.locator('.add-card.tv-focus').waitFor({ timeout: 10000 })
  await abrirPortalLicenca(page)
  await page.getByRole('heading', { name: 'Portal & licença', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Gerar QR para o portal' }).click()
  await expect(page.getByRole('img', { name: /QR de acesso/ })).toBeVisible()
  await expect(page.getByText('ID da TV: fixture-tv')).toBeVisible()
  assert(!await page.locator('body').innerText().then(x => x.includes(credentials.deviceKey)))
  await page.getByRole('button', { name: 'Mostrar chave da TV' }).click()
  await expect(page.getByRole('dialog')).not.toContainText(credentials.deviceKey)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await mkdir('test-results/portal-configuracao', { recursive: true })
  await page.screenshot({ path: 'test-results/portal-configuracao/painel.png' })
  const operation = { operationId: 'operation-create', deviceId: 'fixture-tv', authEpoch: 1,
    sourceId: 'source-fixture', expectedRevision: 0, action: 'source.create', expiresAt: new Date(Date.now() + 600000).toISOString(),
    input: { type: 'm3u_url', displayName: 'Lista do portal', m3uUrl: 'https://provider.fixture.test/list?secret=fake-private' } }
  operations = [operation]
  await pull()
  await expect.poll(() => acks.some(x => x.operationId === operation.operationId && x.state === 'applied'), { timeout: 15000 }).toBe(true)
  await expect.poll(() => snapshots.some(x => x.sources.some(y => y.id === operation.sourceId)), { timeout: 15000 }).toBe(true)
  assert(!JSON.stringify(snapshots).includes('fake-private'))
  // Replay sem segunda fonte ou import; conflito local não sobrescreve o nome.
  operations = [operation]
  await pull()
  await expect.poll(() => acks.filter(x => x.operationId === operation.operationId).length, { timeout: 15000 }).toBeGreaterThan(1)
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { updateSource } = await import('/src/lib/catalog/sourceRepository.ts')
    await updateSource('source-fixture', { displayName: 'Nome local' }, db)
  })
  operations = [{ ...operation, operationId: 'operation-stale', action: 'source.update', expectedRevision: 1, input: { displayName: 'Nome remoto antigo' } }]
  await pull()
  await expect.poll(() => acks.some(x => x.operationId === 'operation-stale' && x.state === 'conflict'), { timeout: 15000 }).toBe(true)
  // Remoção offline persiste até reconectar; nenhum comando antigo recria a lista.
  await context.setOffline(true)
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { deleteSource } = await import('/src/lib/catalog/sourceRepository.ts')
    await deleteSource('source-fixture', db)
  })
  await context.setOffline(false)
  operations = [operation]
  await pull()
  await expect.poll(() => deletionIds.length, { timeout: 15000 }).toBeGreaterThan(0)
  await expect.poll(() => snapshots.at(-1)?.sources.length, { timeout: 15000 }).toBe(0)
  const count = await page.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return db.sources.count() })
  assert.equal(count, 0)
  operations = [{ ...operation, operationId: 'operation-second', sourceId: 'source-second' }]
  await pull()
  await expect.poll(() => acks.some(x => x.operationId === 'operation-second' && x.state === 'applied'), { timeout: 15000 }).toBe(true)
  operations = [{ operationId: 'operation-delete', deviceId: 'fixture-tv', authEpoch: 1,
    sourceId: 'source-second', expectedRevision: 1, action: 'source.delete', expiresAt: null }]
  await pull()
  await expect.poll(() => acks.some(x => x.operationId === 'operation-delete' && x.state === 'applied'), { timeout: 15000 }).toBe(true)
  assert.equal(await page.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return db.sources.count() }), 0)
  operations = []
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { createSource } = await import('/src/lib/catalog/sourceRepository.ts')
    await createSource({ type: 'm3u_url', displayName: 'Preservada na recuperação', m3uUrl: 'https://provider.fixture.test/list' }, db)
  })
  await page.getByRole('button', { name: 'Recuperar pelo site', exact: true }).click()
  await expect.poll(() => recoveryAckLost, { timeout: 15000 }).toBe(true)
  // Recarregar reproduz a perda do processo entre o commit das credenciais e o ACK.
  await page.reload()
  await page.locator('.add-card').waitFor({ timeout: 15000 })
  await abrirPortalLicenca(page)
  await expect.poll(() => page.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    return !(await db.table('portalDevice').get('bootstrap'))
  }), { timeout: 15000 }).toBe(true)
  assert.equal(await page.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return db.sources.count() }), 1)
  assert(!await page.locator('body').innerText().then(x => x.includes(credentials.recoveryCode)))
  console.log('Portal configuração: QR/proteção/atalho, aplicação, snapshot, replay, conflito e delete offline aprovados com fixtures.')
} finally {
  await browser?.close()
  vite.kill()
}
