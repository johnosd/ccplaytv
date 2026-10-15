// Feature 072 — desvincular a TV e backup dos dados de uso, ponta a ponta contra a pilha local (emulador + API real +
// portal-web + TV comercial). Fora do SUITE do runner: exige gcloud/emulador (Java 21+) e `api/.venv`. Não comprova
// DUID real, AVPlay nem a TV física.
//
//   node e2e/desvincular-backup.mjs
//
// Cenários (quickstart §3 da 072): 2 (backup no Atualizar), 3 (desvincular com backup antes; dados intactos),
// 4 (Atualizar volta ao MESMO ID com chave nova), 5/7 (dados perdidos → oferta → Restaurar; "nada sobe" enquanto a
// oferta está aberta), 6 (lista ausente fica pendente e entra quando volta), 8 (apagar desliga o envio),
// 10 (marcadores fora de URL e do log da API).
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { abrirPortalLicenca } from './lib/portal.mjs'
import { startPortalStack } from './lib/portalStack.mjs'

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`)
const MARKER_TMDB = 'tmdbmarcador072abcdef0123456789ab'

let stack, browser
try {
  stack = await startPortalStack({ log })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  const tv = await context.newPage()
  const calls = []
  tv.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === stack.tvOrigin && url.pathname.startsWith('/portal/v1')) calls.push(`${request.method()} ${url.pathname}${url.search}`)
  })
  const since = (mark) => calls.slice(mark)
  const evaluate = (fn, arg) => tv.evaluate(fn, arg)
  const state = () => evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const device = await db.table('portalDevice').get('device')
    return { deviceId: device?.deviceId, deviceKey: device?.deviceKey, relink: !!(await db.table('portalDevice').get('relink')),
      backup: await db.table('portalDevice').get('backup'), favorites: (await db.userStates.toArray()).filter((row) => row.isFavorite).map((row) => row.stableId).sort(),
      tmdb: (await db.integrations.get('tmdb'))?.key ?? null, pending: await db.table('pendingRestore').count() }
  })
  const atualizar = async () => {
    await tv.goto(stack.tvOrigin)
    await tv.locator('.profiles-portal-corner').click()
    await tv.waitForTimeout(500)
    await expect(tv.locator('.profiles-portal-corner')).not.toHaveAttribute('aria-busy', 'true', { timeout: 30000 })
  }

  // ── Preparação: duas listas locais, favoritos e chave TMDB; cadastro na 1ª tela que precisa (Adicionar lista) ──
  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.add-card', { timeout: 20000 })
  await evaluate(async (marker) => {
    const { db } = await import('/src/lib/catalog/db.ts')
    for (const id of ['lista-a', 'lista-b']) {
      await db.sources.put({ id, type: 'm3u_url', displayName: 'Lista ' + id, m3uUrl: 'https://iptv.fixture.test/' + id + '.m3u',
        connectionState: 'synced', createdAt: 1, updatedAt: 1 })
      await db.table('sourceRevisions').put({ sourceId: id, revision: 1 })
      await db.userStates.put({ stableId: id + ':movie:1', sourceId: id, isFavorite: true, favoritedAt: 10, createdAt: 10, updatedAt: 10 })
    }
    await db.integrations.put({ id: 'tmdb', key: marker, format: 'v3', state: 'connected', lastTestedAt: 1 })
  }, MARKER_TMDB)
  await tv.reload()
  await tv.locator('.add-card').click()
  await tv.waitForSelector('.portal-pairing .fixed-qr', { timeout: 20000 })
  const first = await state()
  assert.ok(first.deviceId, 'cadastrado')

  // ── 2. Atualizar de listas faz o backup (não havia backup: sobe) ──────────────────────────────────────────────
  log('2. Atualizar de listas faz o backup')
  let mark = calls.length
  await atualizar()
  await expect.poll(async () => (await state()).backup?.lastBackupAt ?? 0, { timeout: 30000 }).toBeGreaterThan(0)
  assert.ok(since(mark).some((line) => line === 'PUT /portal/v1/device/backup'), 'subiu o backup')

  // ── 3. Desvincular (backup antes): pareamento sai, dados ficam, lembrete guardado ───────────────────────────────
  log('3. Desvincular preserva os dados e guarda o lembrete')
  await tv.goto(stack.tvOrigin)
  await abrirPortalLicenca(tv)
  await tv.getByRole('button', { name: 'Desvincular esta TV', exact: true }).click()
  const dialog = tv.getByRole('dialog', { name: 'Desvincular esta TV do portal?' })
  await expect(dialog).toBeVisible()
  assert.equal(await dialog.locator('.tv-focus').innerText(), 'Cancelar', 'foco inicial em Cancelar')
  await dialog.getByRole('button', { name: 'Desvincular esta TV', exact: true }).click()
  await expect(tv.getByText(/TV desvinculada/)).toBeVisible({ timeout: 30000 })
  const unlinked = await state()
  assert.equal(unlinked.deviceId, undefined)
  assert.ok(unlinked.relink, 'lembrete guardado')
  assert.deepEqual(unlinked.favorites, first.favorites)
  assert.equal(unlinked.tmdb, MARKER_TMDB)

  // ── 4. Atualizar: volta ao MESMO registro com chave nova, sem cadastro novo ─────────────────────────────────────
  log('4. Atualizar reassocia ao mesmo ID com chave nova')
  mark = calls.length
  await atualizar()
  await expect.poll(async () => (await state()).deviceId, { timeout: 30000 }).toBe(first.deviceId)
  const relinked = await state()
  assert.notEqual(relinked.deviceKey, first.deviceKey, 'chave nova')
  assert.equal(relinked.relink, false, 'lembrete consumido')
  assert.ok(since(mark).includes('POST /portal/v1/devices/recovery/self'), 'reassociação pela própria TV')

  // ── 5/6/7. Dados perdidos (e uma lista ausente) → oferta; nada sobe com a oferta aberta; Restaurar devolve ─────
  log('5–7. perda local → oferta → Restaurar; lista ausente fica pendente e entra quando volta')
  await evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    await db.userStates.clear(); await db.integrations.delete('tmdb'); await db.sources.delete('lista-b')
    await db.table('portalDevice').put({ id: 'backup', state: 'unknown' })
  })
  await tv.waitForTimeout(10500) // pausa de 10 s do Atualizar de listas (071)
  mark = calls.length
  await atualizar()
  const offer = tv.getByRole('dialog', { name: /Restaurar backup de/ })
  await expect(offer).toBeVisible({ timeout: 30000 })
  assert.equal(await offer.locator('.tv-focus').innerText(), 'Agora não', 'foco inicial em Agora não')
  assert.ok(!since(mark).includes('PUT /portal/v1/device/backup'), 'com a oferta aberta nada sobe')
  await offer.getByRole('button', { name: 'Restaurar', exact: true }).click()
  await expect(offer).toBeHidden({ timeout: 30000 })
  const restored = await state()
  assert.deepEqual(restored.favorites, ['lista-a:movie:1'], 'lista presente restaurada')
  assert.equal(restored.tmdb, MARKER_TMDB, 'chave TMDB restaurada (a TV não tinha)')
  assert.equal(restored.pending, 1, 'lista ausente pendente')
  await evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    await db.sources.put({ id: 'lista-b', type: 'm3u_url', displayName: 'Lista lista-b', m3uUrl: 'https://iptv.fixture.test/lista-b.m3u',
      connectionState: 'synced', createdAt: 1, updatedAt: 1 })
  })
  await tv.waitForTimeout(10500)
  await atualizar()
  await expect.poll(async () => (await state()).favorites, { timeout: 30000 }).toEqual(['lista-a:movie:1', 'lista-b:movie:1'])
  assert.equal((await state()).pending, 0)

  // ── 8. Apagar o backup desliga o envio automático ───────────────────────────────────────────────────────────────
  log('8. apagar o backup desliga o envio')
  await tv.goto(stack.tvOrigin)
  await abrirPortalLicenca(tv)
  await tv.getByRole('button', { name: 'Apagar backup', exact: true }).click()
  await tv.getByRole('dialog', { name: 'Apagar o backup?' }).getByRole('button', { name: 'Apagar backup', exact: true }).click()
  await expect(tv.getByText('Backup apagado. Nada nesta TV mudou.')).toBeVisible({ timeout: 30000 })
  assert.equal((await state()).backup?.state, 'disabled')
  await tv.waitForTimeout(10500)
  mark = calls.length
  await atualizar()
  await tv.waitForTimeout(1500)
  assert.ok(!since(mark).some((line) => line.includes('/device/backup')), 'backup desligado: nenhuma chamada de backup')

  // ── 10. Segredos: chave TMDB e código de recuperação fora de URL e do log da API ───────────────────────────────
  log('10. marcadores fora de URL e do log')
  assert.ok(calls.every((line) => !line.includes(MARKER_TMDB) && !line.includes('recoveryCode')), 'nada sensível em URL')
  const apiLog = (stack.children ?? []).filter(({ label }) => label === 'api').map(({ child }) => child.output).join('\n')
  assert.ok(!apiLog.includes(MARKER_TMDB), 'chave TMDB fora do log da API')
  log(`desvincular e backup: PASS (${calls.length} requisições da TV, todas por ação da pessoa)`)
} catch (error) {
  console.error('FALHA:', String(error?.message ?? error).split('\n').slice(0, 8).join('\n'))
  console.error((stack?.children ?? []).filter(({ child }) => child.output).map(({ label, child }) => `--- ${label}\n${child.output.slice(-800)}`).join('\n'))
  process.exitCode = 1
} finally {
  await browser?.close()
  stack?.stop()
}
