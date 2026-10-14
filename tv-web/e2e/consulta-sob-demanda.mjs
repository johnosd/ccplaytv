// Feature 071 — consulta sob demanda e QR fixo, ponta a ponta contra a pilha local (emulador + API real + portal-web
// + TV comercial). Fora do SUITE do runner: exige gcloud/emulador (Java 21+) e `api/.venv`. Não comprova DUID real,
// AVPlay, relógio físico, IAM/nuvem nem pagamento (a venda continua desligada; a liberação aqui vem do serviço).
//
//   node e2e/consulta-sob-demanda.mjs
//
// Cenários (quickstart §3 da 071): 1 (0 requisições), 2 (cadastro único + âncora), 3 (QR entra sem digitar),
// 4 (Recarregar volta com foco na nova + 1ª subida de todas), 5 (TV → site, fila offline → Atualizar, valores),
// exclusão na TV sem pull, 7–8 (bloqueio local sem rede; Atualizar libera e retoma), 9 (parado: 0 requisições),
// 10 (nova chave em Portal & licença: QR antigo recusado, QR da tela muda) e a contagem de requisições (SC-001, SC-007).
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { cadastrarListaM3u } from './lib/entrada.mjs'
import { abrirPortalLicenca } from './lib/portal.mjs'
import { startPortalStack } from './lib/portalStack.mjs'

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`)
const MARKER_USER = 'usuario-marcador-071'
const MARKER_PASSWORD = 'senha-marcador-071'
const M3U = '#EXTM3U\n#EXTINF:-1 group-title="Teste" tvg-id="a",Canal A\nhttps://media.fixture.test/a.m3u8\n'

/** Abre "Adicionar lista" e espera a rota lazy do cadastro (o helper de cadastro só espera 2 s por ela). */
const openAdd = async (page) => {
  await page.locator('.add-card').click()
  await page.locator('#add-source-title').waitFor({ timeout: 20000 })
}
/** "Adicionar lista" → aba "Pelo site" (071/A006): ID, chave e QR na mesma tela de Xtream Codes e Lista M3U. */
const openSite = async (page) => {
  await openAdd(page)
  await page.getByRole('button', { name: /^Pelo site/ }).click()
  await page.waitForSelector('.portal-pairing .fixed-qr', { timeout: 20000 })
}

let stack, browser, portalBrowser
try {
  stack = await startPortalStack({ log })

  browser = await chromium.launch({ headless: true })
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  // A lista do site (site.m3u) demora um pouco: a entrada nela cai no progresso, não numa lista vazia (A008).
  await tvContext.route('https://iptv.fixture.test/**', async (route) => {
    if (route.request().url().includes('/site.m3u')) await new Promise((resolve) => setTimeout(resolve, 3000))
    await route.fulfill({ status: 200, contentType: 'audio/x-mpegurl', headers: { 'Access-Control-Allow-Origin': '*' }, body: M3U })
  })
  await tvContext.route('https://media.fixture.test/**', () => {})
  // Painel Xtream fictício: autentica e devolve listas vazias (só importa a lista existir e subir ao site).
  await tvContext.route('https://painel.fixture.test:8080/**', (route) => {
    const action = new URL(route.request().url()).searchParams.get('action')
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(action ? [] : { user_info: { auth: 1, status: 'Active', exp_date: null, max_connections: '1' },
        server_info: { url: 'painel.fixture.test', port: '8080', server_protocol: 'https', time_now: '2026-10-14 12:00:00', timestamp_now: Math.floor(Date.now() / 1000) } }) })
  })
  let blockApi = false
  await tvContext.route(stack.tvOrigin + '/portal/v1/**', (route) => (blockApi ? route.abort('connectionrefused') : route.continue()))
  const tv = await tvContext.newPage()

  // Toda requisição da TV ao serviço, em ordem: é a régua de SC-001/SC-007.
  const calls = []
  tv.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === stack.tvOrigin && url.pathname.startsWith('/portal/v1')) calls.push(`${request.method()} ${url.pathname}`)
  })
  const callsSince = (mark) => calls.slice(mark)
  globalThis.diagnose = async () => {
    console.error('--- chamadas da TV\n' + calls.join('\n'))
    if (process.env.E2E_SHOT) await tv.screenshot({ path: process.env.E2E_SHOT }).catch(() => {})
    console.error('--- texto da TV\n' + (await tv.locator('body').innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 500))
    console.error('--- texto do portal\n' + (await globalThis.portalPage?.locator('body').innerText().catch(() => '?') ?? '-').replace(/\s+/g, ' ').slice(0, 700))
  }
  const device = () => tv.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return db.table('portalDevice').get('device') })
  const sourceNames = () => tv.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return (await db.sources.toArray()).map((source) => source.displayName) })
  const uploadedIds = () => tv.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return (await db.table('sourceUploads').toArray()).map((row) => row.sourceId) })
  const credentialsOnScreen = async () => {
    const values = await tv.locator('.portal-pairing-value').allInnerTexts()
    return { displayId: values[0], deviceKey: values[1] }
  }
  const qrUrlOf = () => tv.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { buildFixedQrUrl } = await import('/src/lib/portal/fixedQr.ts')
    const row = await db.table('portalDevice').get('device')
    return buildFixedQrUrl({ site: 'http://127.0.0.1:5174', displayId: row.displayId, deviceKey: row.deviceKey })
  })

  // ── 1. App novo: abre, o teste começa no aparelho, nenhuma requisição ────────────────────────────────────────
  log('1. app novo: sem requisições; teste local criado')
  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.add-card', { timeout: 20000 })
  await tv.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    for (const [id, name] of [['pre-a', 'Lista pre-a'], ['pre-b', 'Lista pre-b']]) {
      await db.sources.put({ id, type: 'm3u_url', displayName: name, m3uUrl: 'https://iptv.fixture.test/' + id + '.m3u',
        connectionState: 'synced', createdAt: 1, updatedAt: 1 })
      await db.table('sourceRevisions').put({ sourceId: id, revision: 1 })
    }
  })
  await tv.reload()
  await expect(tv.locator('.source-card')).toHaveCount(2)
  await tv.waitForTimeout(3000)
  assert.deepEqual(calls, [], 'abrir o app e ficar parado não pode consultar o serviço')
  await expect.poll(() => tv.evaluate(async () => (await (await import('/src/lib/catalog/db.ts')).db.table('localTrial').get('trial'))?.startedAt ?? null))
    .toBeGreaterThan(0)

  // ── 2. Adicionar lista: cadastro único; ID, chave e QR aparecem; teste ancorado ──────────────────────────
  log('2. Adicionar lista: cadastro único, ID/chave/QR, âncora')
  await openAdd(tv)
  const tabs = tv.getByRole('group', { name: 'Tipo de lista' }).getByRole('button')
  assert.deepEqual((await tabs.allInnerTexts()).map((text) => text.replace('✓', '').trim()), ['Pelo site', 'Xtream Codes', 'Lista M3U'], 'abas na mesma tela, o site primeiro')
  assert.equal(await tv.getByRole('button', { name: /^Pelo site/ }).getAttribute('aria-pressed'), 'true', 'o cadastro abre na aba Pelo site')
  await tv.waitForSelector('.portal-pairing .fixed-qr', { timeout: 20000 })
  assert.deepEqual(await tv.locator('.portal-pairing-actions button').allInnerTexts(), ['Recarregar', 'Voltar'], 'tela do site: só Recarregar e Voltar')
  assert.equal(await tv.getByRole('button', { name: 'Conectar e sincronizar' }).count(), 0, 'aba do site sem o botão do cadastro manual')
  const first = await credentialsOnScreen()
  assert.match(first.displayId, /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/)
  assert.match(first.deviceKey, /^\d{10}$/)
  assert.ok(calls.every((line) => /\/devices\/(enroll|recovery\/ack)$/.test(line)), 'só o cadastro único: ' + calls.join(' | '))
  assert.equal(calls.filter((line) => line.endsWith('/devices/enroll')).length, 1)
  await expect.poll(() => tv.evaluate(async () => (await (await import('/src/lib/catalog/db.ts')).db.table('localTrial').get('trial'))?.anchoredAt ?? null))
    .toBeGreaterThan(0)

  // ── 3. Ler o QR: o painel abre autenticado, sem digitar, e o endereço fica limpo ─────────────────────────
  log('3. QR: painel autenticado sem digitar, endereço sem fragmento')
  portalBrowser = await chromium.launch({ headless: true })
  const portalContext = await portalBrowser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })
  const portal = await portalContext.newPage()
  globalThis.portalPage = portal
  const portalBodies = []
  portal.on('request', (request) => { if (request.url().includes('/portal/v1/')) portalBodies.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`) })
  const firstQr = await qrUrlOf()
  await portal.goto(firstQr)
  await expect(portal.getByRole('heading', { name: 'Suas listas' })).toBeVisible({ timeout: 20000 })
  assert.ok(!portal.url().includes('#') && !portal.url().includes(first.deviceKey), 'fragmento removido do endereço')
  assert.ok(portalBodies.every((line) => !line.split(' ')[1].includes(first.deviceKey)), 'chave nunca na URL de requisição')

  // ── 4. Lista criada no site → Recarregar na TV: volta à lista com foco na nova; as pré-existentes sobem ──
  log('4. site cria lista; Recarregar na TV traz com foco e sobe as listas existentes')
  await portal.getByRole('button', { name: 'Adicionar lista', exact: true }).click()
  await portal.getByLabel('Nome da lista').fill('Lista do site')
  await portal.getByRole('group', { name: 'Tipo de lista' }).getByRole('radio', { name: 'M3U por URL' }).check()
  await portal.getByLabel('URL da lista M3U', { exact: true }).fill('https://iptv.fixture.test/site.m3u?key=segredo-fixture')
  await portal.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  await expect(portal.getByRole('heading', { name: 'Lista do site', exact: true })).toBeVisible()
  let mark = calls.length
  await tv.getByRole('button', { name: 'Recarregar', exact: true }).click()
  await expect(tv.locator('.source-card.tv-focus')).toContainText('Lista do site', { timeout: 30000 })
  // A008: a lista nova ainda importa em segundo plano; entrar nela mostra o progresso (categorias carregando).
  await tv.locator('.source-card.tv-focus').click()
  await expect(tv.locator('#progress-title')).toBeVisible({ timeout: 10000 })
  await expect(tv.getByRole('button', { name: 'Abrir lista' })).toBeVisible({ timeout: 30000 })
  await tv.getByRole('button', { name: 'Voltar', exact: true }).click()
  await tv.waitForSelector('.add-card', { timeout: 15000 })
  const reloadCalls = callsSince(mark)
  assert.ok(reloadCalls.some((line) => line.endsWith('/device/sources')), 'a 1ª atualização sobe as listas existentes')
  assert.ok(reloadCalls.some((line) => line.endsWith('/device/operations')), 'e busca as alterações do site')
  // Pelo mesmo cookie da sessão do QR: as listas pré-existentes já têm configuração salva no serviço (subiram uma vez).
  const portalNames = () => portal.evaluate(async () => (await (await fetch('/portal/v1/configurations')).json()).configurations.map((item) => item.displayName))
  await expect.poll(portalNames, { timeout: 30000, intervals: [1000] }).toEqual(expect.arrayContaining(['Lista pre-a', 'Lista pre-b']))

  // ── 5. Lista criada na TV aparece no site com os valores; offline vai para a fila e sobe no Atualizar ────
  log('5. TV → site: valores no site; fila offline sobe no Atualizar')
  await openAdd(tv)
  await cadastrarListaM3u(tv, { nome: 'Lista da TV', url: 'https://iptv.fixture.test/tv.m3u?token=' + MARKER_PASSWORD })
  await expect.poll(sourceNames, { timeout: 20000 }).toContain('Lista da TV')
  const portalValues = (name) => portal.evaluate(async (displayName) => {
    const list = await (await fetch('/portal/v1/configurations')).json()
    const row = list.configurations.find((item) => item.displayName === displayName)
    return row ? (await (await fetch('/portal/v1/configurations/' + row.sourceId + '/values')).json()) : null
  }, name)
  await expect.poll(() => portalValues('Lista da TV'), { timeout: 20000, intervals: [1000] }).toMatchObject({ type: 'm3u_url' })
  assert.equal((await portalValues('Lista da TV')).m3uUrl, 'https://iptv.fixture.test/tv.m3u?token=' + MARKER_PASSWORD)

  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.source-card', { timeout: 20000 })
  // Portal fora do ar (o provedor de IPTV segue acessível, então a lista é criada): a tentativa no ato falha e a lista
  // fica na fila. (Sem internet nenhuma o cadastro nem passa do teste de conexão do provedor.)
  blockApi = true
  mark = calls.length
  await openAdd(tv)
  await cadastrarListaM3u(tv, { nome: 'Lista offline', url: 'https://iptv.fixture.test/offline.m3u' })
  await expect.poll(sourceNames, { timeout: 20000 }).toContain('Lista offline')
  await tv.waitForTimeout(1500)
  assert.equal((await portalValues('Lista offline')), null, 'offline: ainda não está no site')
  blockApi = false
  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.source-card', { timeout: 20000 })
  assert.ok(!(await uploadedIds()).includes((await tv.evaluate(async () => (await (await import('/src/lib/catalog/db.ts')).db.sources.toArray()).find((s) => s.displayName === 'Lista offline')?.id))),
    'a lista offline segue na fila')
  const queued = calls.length
  await tv.locator('.profiles-portal-corner').click()
  await expect.poll(() => portalValues('Lista offline'), { timeout: 30000, intervals: [1000] }).toMatchObject({ type: 'm3u_url' })
  assert.ok(callsSince(queued).some((line) => line.endsWith('/device/sources')), 'Atualizar esvazia a fila')

  // Xtream com marcadores: usuário e senha chegam ao site, só pela sessão da mesma TV.
  await openAdd(tv)
  await tv.getByRole('button', { name: /^Xtream Codes/ }).click()
  await tv.getByLabel('Nome da lista', { exact: true }).fill('Xtream marcado')
  await tv.getByLabel('Servidor', { exact: true }).fill('https://painel.fixture.test:8080')
  await tv.getByLabel('Usuário', { exact: true }).fill(MARKER_USER)
  await tv.getByLabel('Senha', { exact: true }).fill(MARKER_PASSWORD)
  await tv.getByRole('button', { name: 'Conectar e sincronizar' }).click()
  await expect.poll(() => portalValues('Xtream marcado'), { timeout: 30000, intervals: [1000] }).toMatchObject({
    providerUsername: MARKER_USER, providerPassword: MARKER_PASSWORD })

  // ── Exclusão na TV: outbox + snapshot, sem pull nem licença ──────────────────────────────────────────────
  log('exclusão na TV: só outbox + snapshot')
  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.source-card', { timeout: 20000 })
  const focusedText = () => tv.locator('.source-card.tv-focus').innerText().catch(() => '')
  const targetName = 'Lista pre-b'
  for (let i = 0; i < 8; i++) await tv.keyboard.press('ArrowLeft')
  for (let i = 0; i < 8 && !(await focusedText()).includes(targetName); i++) await tv.keyboard.press('ArrowRight')
  assert.ok((await focusedText()).includes(targetName), 'cartão da lista a excluir em foco')
  await tv.keyboard.press('ArrowDown')
  await tv.keyboard.press('ArrowRight'); await tv.keyboard.press('ArrowRight')
  mark = calls.length
  await tv.keyboard.press('Enter')
  await expect(tv.getByRole('dialog', { name: /Excluir a lista/ })).toBeVisible()
  await tv.keyboard.press('ArrowRight'); await tv.keyboard.press('Enter')
  await expect.poll(sourceNames, { timeout: 15000 }).not.toContain(targetName)
  await expect.poll(() => callsSince(mark).some((line) => line.endsWith('/device/deletions')), { timeout: 20000 }).toBe(true)
  await expect.poll(() => callsSince(mark).some((line) => line.startsWith('PUT') && line.endsWith('/device/snapshot')), { timeout: 20000 }).toBe(true)
  assert.equal(callsSince(mark).filter((line) => /\/device\/operations$|entitlement/.test(line)).length, 0, 'exclusão não faz pull nem consulta de licença')
  // A007: sem apertar Atualizar, o site já deixou de listar a lista excluída na TV.
  await expect.poll(portalNames, { timeout: 20000, intervals: [1000] }).not.toContain(targetName)

  // ── 7. Teste vencido (marca de 8 dias): bloqueio sem rede, com QR, endereço, ID e chave ─────────────────────
  log('7. teste vencido: bloqueio local com QR/ID/chave, 0 requisições')
  await tv.evaluate(async () => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const row = await db.table('localTrial').get('trial')
    await db.table('localTrial').put({ ...row, startedAt: Date.now() - 8 * 86400000 })
  })
  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.source-card', { timeout: 20000 })
  mark = calls.length
  await tv.locator('.source-card').first().click()
  const gate = tv.getByRole('dialog', { name: 'Licença necessária para abrir a lista' })
  await expect(gate.locator('.fixed-qr')).toBeVisible()
  const dev = await device()
  await expect(gate).toContainText(dev.displayId)
  await expect(gate).toContainText(dev.deviceKey)
  assert.deepEqual(callsSince(mark), [], 'o bloqueio é decidido no aparelho, sem consulta')

  // ── 8. Atualizar no bloqueio: consulta só a licença, libera e retoma a entrada negada ────────────────────
  log('8. Atualizar no bloqueio: só a licença; libera e entra na lista')
  await gate.getByRole('button', { name: 'Atualizar', exact: true }).click()
  await expect(tv.locator('.home-content')).toBeVisible({ timeout: 30000 })
  const gateCalls = callsSince(mark)
  assert.deepEqual(gateCalls.filter((line) => !/entitlement\/refresh$/.test(line)).filter((line) => /device\/(operations|sources|snapshot|deletions)/.test(line)), [],
    'Atualizar do bloqueio não mexe nas listas: ' + gateCalls.join(' | '))
  assert.equal(gateCalls.filter((line) => /entitlement\/refresh$/.test(line)).length, 1)

  // ── 9. Parado em qualquer tela: 0 requisições ────────────────────────────────────────────────────────────
  log('9. TV parada: 0 requisições')
  mark = calls.length
  await tv.waitForTimeout(5000)
  assert.deepEqual(callsSince(mark), [], 'parado, o app não consulta o serviço')

  // ── 10. Gerar nova chave: QR antigo recusado, QR da tela muda ─────────────────────────────────────────────
  log('10. nova chave: QR antigo recusado e QR da tela muda')
  await tv.goto(stack.tvOrigin)
  await openSite(tv)
  const before = await credentialsOnScreen()
  const oldQr = await qrUrlOf()
  // A nova chave sai da tela do site: fica em Configurações → Portal & licença → "Revogar acessos ao portal".
  await tv.goto(stack.tvOrigin)
  await abrirPortalLicenca(tv)
  await tv.getByRole('button', { name: 'Revogar acessos ao portal', exact: true }).click()
  await tv.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect.poll(async () => (await device())?.deviceKey, { timeout: 30000 }).not.toBe(before.deviceKey)
  await tv.goto(stack.tvOrigin)
  await openSite(tv)
  const rotated = await credentialsOnScreen()
  const newQr = await qrUrlOf()
  assert.notEqual(newQr, oldQr)
  assert.ok(!newQr.includes(before.deviceKey))
  const stale = await (await portalBrowser.newContext()).newPage()
  await stale.goto(oldQr)
  await expect(stale.getByRole('alert')).toBeVisible({ timeout: 15000 })
  await expect(stale.getByRole('heading', { name: 'Suas listas' })).toHaveCount(0)
  const fresh = await (await portalBrowser.newContext()).newPage()
  await fresh.goto(newQr)
  await expect(fresh.getByRole('heading', { name: 'Suas listas' })).toBeVisible({ timeout: 20000 })

  // ── Revisão de segredos (SC-008, T028): marcadores fora de DOM comum, URL, histórico e logs do serviço ─────────
  log('revisão de segredos: DOM, URL, histórico e logs')
  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.source-card', { timeout: 20000 })
  const profilesText = await tv.locator('body').innerText()
  for (const secret of [MARKER_PASSWORD, MARKER_USER, before.deviceKey, rotated.deviceKey]) {
    assert.ok(!profilesText.includes(secret), 'segredo na tela de listas: ' + secret.slice(0, 6))
  }
  const portalText = await fresh.locator('body').innerText()
  assert.ok(!portalText.includes(MARKER_PASSWORD) && !portalText.includes(MARKER_USER), 'painel não lista usuário/senha fora da edição')
  assert.equal(await fresh.evaluate(() => document.referrer), '', 'sem Referer ao entrar pelo QR')
  assert.ok(!fresh.url().includes('#') && !fresh.url().includes('key='), 'endereço limpo depois do QR')
  const serviceLogs = (stack.children ?? []).filter(({ label }) => label === 'api').map(({ child }) => child.output).join('\n')
  for (const secret of [MARKER_PASSWORD, MARKER_USER, before.deviceKey]) assert.ok(!serviceLogs.includes(secret), 'segredo no log da API')

  // Régua de SC-007: tudo acima são ações da pessoa; nenhuma chamada fora da lista de rotas esperadas.
  const unexpected = calls.filter((line) => !/\/(devices\/(enroll|recovery\/(ack|result|challenges))|device\/(operations|sources|snapshot|deletions|entitlement\/refresh)|device\/operations\/[^/]+\/ack|device\/(revoke|recovery-code\/rotate))$/.test(line.replace(/^\w+ /, '')))
  assert.deepEqual(unexpected, [], 'rotas inesperadas: ' + unexpected.join(' | '))
  log(`consulta sob demanda: PASS (${calls.length} requisições da TV, todas por ação da pessoa)`)
} catch (error) {
  console.error('FALHA:', String(error?.message ?? error).split('\n').slice(0, 8).join('\n'))
  await globalThis.diagnose?.()
  console.error((stack?.children ?? []).filter(({ child }) => child.output).map(({ label, child }) => `--- ${label}\n${child.output.slice(-800)}`).join('\n'))
  process.exitCode = 1
} finally {
  await portalBrowser?.close()
  await browser?.close()
  stack?.stop()
}
