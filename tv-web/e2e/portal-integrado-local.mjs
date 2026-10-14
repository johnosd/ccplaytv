// Pilha local integrada: emulador Firestore + API real do portal + portal-web + TV (vite --mode commercial).
// Fora do SUITE do runner (exige gcloud/emulador e api/.venv). Não comprova DUID real, AVPlay, relógio físico,
// IAM/nuvem nem pagamento. Chaves geradas em memória por execução; nunca gravadas em disco nem impressas.
import assert from 'node:assert/strict'
import { execSync, spawn } from 'node:child_process'
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { connect } from 'node:net'
import { chromium, expect } from '@playwright/test'
import { abrirPortalLicenca } from './lib/portal.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const ports = { emulator: 8085, api: 3001, portal: 5174, tv: 5176 }
const tvOrigin = `http://127.0.0.1:${ports.tv}`, portalOrigin = `http://127.0.0.1:${ports.portal}`, apiOrigin = `http://127.0.0.1:${ports.api}`
const b64 = () => randomBytes(32).toString('base64url')
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const signingPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const publicJwk = createPublicKey(createPrivateKey(signingPem)).export({ format: 'jwk' })
const children = []
const log = message => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`)

function listening(port) {
  return new Promise(done => { const socket = connect(port, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); done(true) }); socket.once('error', () => done(false)) })
}
async function waitFor(check, label, ms = 60000) {
  const limit = Date.now() + ms
  while (Date.now() < limit) { if (await check()) return; await new Promise(r => setTimeout(r, 500)) }
  throw new Error(`timeout: ${label}`)
}
function start(label, command, args, options) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...options })
  child.output = ''
  const keep = chunk => { child.output = (child.output + chunk).slice(-4000) }
  child.stdout.on('data', keep); child.stderr.on('data', keep)
  child.once('exit', code => { child.exited = code ?? -1 })
  children.push({ label, child })
  return child
}
function stopAll() {
  for (const { child } of children) {
    if (child.exited !== undefined || !child.pid) continue
    try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }) } catch { /* já encerrado */ }
  }
}

let browser, portalBrowser
try {
  const sdk = execSync('gcloud info --format="value(installation.sdk_root)"', { shell: true, encoding: 'utf8' }).trim()
  const emulatorCmd = join(sdk, 'platform', 'cloud-firestore-emulator', 'cloud_firestore_emulator.cmd')
  assert.equal(await listening(ports.emulator), false, `porta ${ports.emulator} já em uso: encerre o emulador antigo (estado limpo é requisito)`)
  log('subindo emulador Firestore')
  // O emulador atual exige Java 21+; o launcher usa o `java` do PATH. Priorizar CCPLAY_EMULATOR_JAVA_HOME
  // (padrão: JAVA_HOME) apenas no processo filho, sem alterar a configuração da máquina.
  const javaHome = process.env.CCPLAY_EMULATOR_JAVA_HOME ?? process.env.JAVA_HOME
  const emulatorEnv = javaHome ? { ...process.env, PATH: `${join(javaHome, 'bin')};${process.env.PATH}` } : process.env
  start('emulador', 'cmd.exe', ['/c', emulatorCmd, 'start', `--host=127.0.0.1`, `--port=${ports.emulator}`], { cwd: root, env: emulatorEnv })
  await waitFor(() => listening(ports.emulator), 'emulador Firestore', 90000)

  log('subindo API do portal (development + emulator, journal em memória)')
  const api = start('api', join(root, 'api', '.venv', 'Scripts', 'python.exe'), [join(root, 'infra', 'portal', 'dev', 'local_portal.py')], {
    cwd: join(root, 'api'),
    env: {
      ...process.env, CCPLAY_PORTAL_ENVIRONMENT: 'development', FIRESTORE_EMULATOR_HOST: `127.0.0.1:${ports.emulator}`,
      PORT: String(ports.api), CCPLAY_PORTAL_PUBLIC_ORIGIN: portalOrigin, CCPLAY_PORTAL_AES_KEY: b64(),
      CCPLAY_PORTAL_SIGNING_KEY: signingPem, CCPLAY_PORTAL_IDENTITY_HMAC_KEY: b64(), CCPLAY_PORTAL_RECOVERY_HMAC_KEY: b64(),
      CCPLAY_PORTAL_SERVICE_RECOVERY_EPOCH: b64(),
    },
  })
  await waitFor(async () => { if (api.exited !== undefined) throw new Error('api encerrou: ' + api.output); try { return (await fetch(apiOrigin + '/health')).ok } catch { return false } }, 'API /health')

  log('subindo portal-web e TV (commercial)')
  const portal = start('portal-web', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(ports.portal), '--strictPort'], { cwd: join(root, 'portal-web') })
  const tv = start('tv-web', process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'commercial', '--host', '127.0.0.1', '--port', String(ports.tv), '--strictPort'], {
    cwd: join(root, 'tv-web'), env: { ...process.env, VITE_PORTAL_ORIGIN: apiOrigin, VITE_LICENSE_PUBLIC_KEYS: JSON.stringify({ v1: publicJwk }) },
  })
  await waitFor(() => portal.output.includes(portalOrigin) || portal.exited !== undefined, 'vite portal-web')
  await waitFor(() => tv.output.includes(tvOrigin) || tv.exited !== undefined, 'vite tv-web')

  // web-security desligada = análogo à política de acesso do config.xml (a API não envia CORS).
  browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] })
  const m3u = '#EXTM3U\n#EXTINF:-1 group-title="Teste" tvg-id="a",Canal A\nhttps://media.fixture.test/a.m3u8\n#EXTINF:-1 group-title="Teste" tvg-id="b",Canal B\nhttps://media.fixture.test/b.m3u8\n'
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  await tvContext.addInitScript(() => { window.webapis = { productinfo: { getDuid: () => 'local-integrated-duid' } } })
  await tvContext.route('https://iptv.fixture.test/**', route => route.fulfill({ status: 200, contentType: 'audio/x-mpegurl', headers: { 'Access-Control-Allow-Origin': '*' }, body: m3u }))
  await tvContext.route('https://media.fixture.test/**', () => {})
  const tvPage = await tvContext.newPage()
  let inviteToken
  let appliedAt = 0 // instante (s) em que a TV aplicou a última mutação; o portal precisa de snapshot posterior
  const diag = []
  const note = line => { diag.push(line); if (diag.length > 60) diag.shift() }
  tvPage.on('response', async response => {
    const url = new URL(response.url())
    if (url.origin === apiOrigin) note(`${response.request().method()} ${url.pathname} -> ${response.status()}`)
    if (url.pathname === '/portal/v1/device/invites' && response.ok()) inviteToken = (await response.json()).token
  })
  tvPage.on('requestfailed', request => { if (request.url().startsWith(apiOrigin)) note(`FALHOU ${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`) })
  tvPage.on('console', message => { if (message.type() === 'error') note('console.error: ' + message.text().slice(0, 200)) })
  tvPage.on('pageerror', error => note('pageerror: ' + String(error.message).slice(0, 200)))
  globalThis.printDiag = async () => {
    console.error('--- TV: chamadas/erros recentes\n' + diag.join('\n'))
    console.error('--- TV: texto da tela\n' + (await tvPage.locator('body').innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 600))
  }
  await tvPage.goto(tvOrigin)

  log('TV: abrir "Adicionar pelo site" e gerar QR')
  await abrirPortalLicenca(tvPage)
  await expect(tvPage.getByText('Licença: Período de teste', { exact: true })).toBeVisible({ timeout: 20000 })
  await tvPage.getByRole('button', { name: 'Gerar QR para o portal', exact: true }).click()
  await expect(tvPage.getByRole('img', { name: 'QR de acesso temporário ao portal desta TV' })).toBeVisible()
  await waitFor(() => Boolean(inviteToken), 'convite do portal', 10000)

  log('Portal: entrar pelo convite e criar lista M3U URL')
  // O portal é same-origin pelo proxy do Vite: navegador separado, com segurança web NORMAL (Origin real).
  portalBrowser = await chromium.launch({ headless: true })
  const portalContext = await portalBrowser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })
  const portalPage = await portalContext.newPage()
  const portalDiag = []
  portalPage.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/portal/v1')) portalDiag.push(`> ${request.method()} ${url.pathname} origin=${request.headers().origin ?? '-'}`)
  })
  portalPage.on('response', response => {
    const url = new URL(response.url())
    if (!url.pathname.startsWith('/portal/v1')) return
    portalDiag.push(`< ${response.request().method()} ${url.pathname} ${response.status()}`)
    if (!response.ok()) void response.text().then(text => portalDiag.push(`  corpo: ${text.slice(0, 120)}`)).catch(() => {})
  })
  portalPage.on('console', message => { if (message.type() === 'error') portalDiag.push('console.error: ' + message.text().slice(0, 200)) })
  portalPage.on('pageerror', error => portalDiag.push('pageerror: ' + String(error.message).slice(0, 200)))
  const previousPrint = globalThis.printDiag
  globalThis.printDiag = async () => {
    await previousPrint()
    console.error('--- Portal: mutações e erros\n' + portalDiag.filter(line => !/GET \/portal\/v1\/(configurations|operations|snapshot)( origin=-| 200)$/.test(line)).slice(0, 40).join('\n'))
    // Sonda: a sessão ainda vale? sequencial x concorrente (mesmo cookie, mesma origem).
    const probe = await portalPage.evaluate(async () => {
      const status = () => fetch('/portal/v1/configurations').then(r => r.status).catch(() => 'erro')
      const sequential = []
      for (let i = 0; i < 3; i++) sequential.push(await status())
      const concurrent = await Promise.all([status(), status(), status()])
      return { sequential, concurrent }
    }).catch(error => ({ erro: String(error).slice(0, 120) }))
    console.error('--- Portal: sonda de sessão ' + JSON.stringify(probe))
    console.error('--- Portal: texto da tela\n' + (await portalPage.locator('body').innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 500))
  }
  await portalPage.goto(`${portalOrigin}/#invite=${inviteToken}`)
  await expect(portalPage.getByRole('heading', { name: 'Suas listas' })).toBeVisible({ timeout: 20000 })
  await portalPage.getByRole('button', { name: 'Adicionar lista', exact: true }).click()
  await portalPage.getByLabel('Nome da lista').fill('Lista integrada')
  await portalPage.getByRole('group', { name: 'Tipo de lista' }).getByRole('radio', { name: 'M3U por URL' }).check()
  await portalPage.getByLabel('URL da lista M3U', { exact: true }).fill('https://iptv.fixture.test/list.m3u?key=segredo-fixture')
  await portalPage.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  await expect(portalPage.getByRole('heading', { name: 'Lista integrada', exact: true })).toBeVisible()
  expect(await portalPage.locator('body').innerText()).not.toContain('segredo-fixture')

  log('TV: aplicar a lista recebida (tela rápida ~10 s)')
  await expect.poll(() => tvPage.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return (await db.sources.toArray()).map(source => source.displayName ?? source.name) }),
    { timeout: 60000, intervals: [1000] }).toContain('Lista integrada')
  appliedAt = Math.floor(Date.now() / 1000) * 1000
  log('TV aplicou a lista do portal')
  console.log('PORTAL (texto após aplicar):', (await portalPage.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400))
  log('Pilha local integrada: criação portal → TV PASS')

  const tvSources = () => tvPage.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return (await db.sources.toArray()).map(source => source.displayName ?? source.name) })
  const refresh = () => portalPage.getByRole('button', { name: 'Atualizar estado', exact: true }).click()

  // O card só reflete "aplicada" depois do ACK da TV; a próxima mutação usa a revisão que o portal conhece.
  // "Último estado recebido: dd/mm/aaaa, hh:mm:ss" (hora local) é o snapshot da TV; precisa ser posterior à
  // aplicação, senão o portal ainda usa a revisão antiga e a próxima mutação vira conflito (previsto na UI).
  const snapshotAt = text => {
    const m = /Último estado recebido: (\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/.exec(text)
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime() : 0
  }
  const settled = label => expect.poll(async () => {
    await refresh()
    const text = await portalPage.locator('body').innerText()
    return text.includes('Configuração aplicada') && !text.includes('Aguardando TV') && snapshotAt(text) >= appliedAt
  }, { timeout: 60000, intervals: [2000], message: label }).toBe(true)
  await settled('portal sincronizado após criar')
  log('Portal: card sincronizado (aplicada + importação concluída)')
  expect(await portalPage.locator('body').innerText()).toContain('Importação concluída')

  log('Portal: editar nome (segredo vazio preserva) → TV reflete')
  await portalPage.getByRole('button', { name: 'Editar', exact: true }).click()
  await portalPage.getByLabel('Nome da lista').fill('Lista renomeada')
  await expect(portalPage.getByLabel('URL da lista M3U', { exact: true })).toHaveValue('')
  await portalPage.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  await expect.poll(tvSources, { timeout: 60000, intervals: [1000] }).toContain('Lista renomeada')
  appliedAt = Math.floor(Date.now() / 1000) * 1000
  log('TV aplicou a edição')
  await settled('portal sincronizado após editar')

  log('Portal: remover lista → TV remove')
  await portalPage.getByRole('button', { name: 'Remover lista', exact: true }).click()
  await portalPage.getByRole('button', { name: 'Confirmar remoção' }).click()
  await expect.poll(tvSources, { timeout: 60000, intervals: [1000] }).toEqual([])
  log('TV removeu a lista excluída pelo portal')
  const sourceCount = await tvPage.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return db.sources.count() })
  assert.equal(sourceCount, 0)

  log('Portal: criar 2ª lista, TV aplica; depois remover NA TV → portal reflete')
  await portalPage.getByRole('button', { name: 'Adicionar lista', exact: true }).click()
  await portalPage.getByLabel('Nome da lista').fill('Lista removida na TV')
  await portalPage.getByRole('group', { name: 'Tipo de lista' }).getByRole('radio', { name: 'M3U por URL' }).check()
  await portalPage.getByLabel('URL da lista M3U', { exact: true }).fill('https://iptv.fixture.test/list2.m3u?key=segredo-fixture')
  await portalPage.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  await expect.poll(tvSources, { timeout: 60000, intervals: [1000] }).toContain('Lista removida na TV')
  const focused = () => tvPage.evaluate(() => (document.querySelector('.tv-focus')?.className ?? '-') + ' | ' + (document.querySelector('.tv-focus')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 50))
  await tvPage.keyboard.press('Escape')
  for (let tries = 0; tries < 8 && !(await tvPage.locator('.source-card.tv-focus').count()); tries++) {
    log('foco TV: ' + await focused())
    await tvPage.keyboard.press(tries % 2 ? 'ArrowUp' : 'ArrowLeft')
  }
  log('foco TV (card): ' + await focused())
  await tvPage.keyboard.press('ArrowDown')
  await tvPage.keyboard.press('ArrowRight'); await tvPage.keyboard.press('ArrowRight')
  log('foco TV (ações): ' + await focused())
  await tvPage.keyboard.press('Enter')
  const dialog = tvPage.getByRole('dialog', { name: /Excluir a lista/ })
  await expect(dialog).toBeVisible()
  await tvPage.keyboard.press('ArrowRight'); await tvPage.keyboard.press('Enter')
  await expect.poll(tvSources, { timeout: 15000, intervals: [500] }).toEqual([])
  log('TV excluiu localmente, fora da tela rápida (ciclo normal de 24 h): a outbox deve sair na hora')
  const requestsAfterDelete = diag.length
  const portalShows = async () => { await refresh(); await new Promise(resolve => setTimeout(resolve, 1000)); return (await portalPage.locator('body').innerText()).includes('Lista removida na TV') }
  await expect.poll(async () => !(await portalShows()), { timeout: 30000, intervals: [2000] }).toBe(true)
  log('Portal refletiu a exclusão feita na TV sem abrir a tela rápida')
  // Só outbox + snapshot: nenhum pull de comandos nem refresh de licença por causa da exclusão.
  const after = diag.slice(requestsAfterDelete)
  assert.ok(after.some(line => line.includes('/portal/v1/device/deletions')), 'envio da outbox esperado')
  assert.ok(after.some(line => line.startsWith('PUT') && line.includes('/portal/v1/device/snapshot')), 'snapshot esperado após a exclusão')
  assert.equal(after.filter(line => /GET \/portal\/v1\/device\/operations|entitlement/.test(line)).length, 0, 'exclusão não deve disparar pull/licença: ' + after.join(' | '))
  console.log('PORTAL (final):', (await portalPage.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300))
  log('Exclusão nos dois sentidos + edição: PASS')
} catch (error) {
  console.error('FALHA:', String(error?.message ?? error).split('\n').slice(0, 6).join('\n'))
  await globalThis.printDiag?.()
  for (const { label, child } of children) if (child.output) console.error(`--- ${label} (final da saída)\n${child.output.slice(-1200)}`)
  process.exitCode = 1
} finally {
  await portalBrowser?.close()
  await browser?.close()
  stopAll()
}
