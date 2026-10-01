// Roteiro E2E da feature 034 (Fontes IPTV completas: estado, contagem e
// expiração da conta) — gate da constitution ("Testes E2E (Playwright) antes
// de validação em TV física").
//
// Cobre, num Chromium real contra um painel Xtream FICTÍCIO que este script
// serve (`http.createServer`) e cujo estado ele muda entre os cenários:
//  1. vencimento em +30 dias (linha de Configurações com "Conta válida até…",
//     cartão sem chip) e a contagem real ("2 categorias de canais · 3 de
//     filmes · 4 de séries"); mover o foco NUNCA consulta o painel (FR-020);
//  2. vencimento em +3 dias → chip âmbar "Vence em 3 dias" na linha e no cartão;
//  3. conta vencida → a sincronização falha, o cartão ganha "Conta expirada",
//     escolher a lista abre a tela de acesso (foco em "Editar lista", RETURN
//     volta ao cartão) e "Verificar de novo" com o painel renovado abre o Início;
//  4. painel que não responde → "Verificando…" e a decisão sai em até ~5 s
//     pelo dado guardado (SC-003);
//  5. sem internet → bloqueio pelo dado guardado, com "Não foi possível
//     confirmar agora" (US2 AC6);
//  6. credencial recusada → "Credencial inválida" na linha e no cartão, tela
//     de acesso com a mensagem do FR-010, "Editar lista" abre a edição, e uma
//     sincronização boa limpa o bloqueio (FR-014);
//  7. "Sincronizando" no cartão enquanto a sincronização roda (FR-015).
// E, em todas as telas tocadas, uma varredura de segredo (SC-004): nenhum
// usuário, senha ou endereço do painel no HTML nem no console.
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173), como os
// demais scripts em `e2e/`. Dados só fictícios. Para a data de vencimento
// contra a lista real do `.env`, ver `fontes-estado-real.mjs`.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'

const APP_URL = 'http://localhost:5173'
const LIST_NAME = 'Lista Conta E2E'
const PANEL_USER = 'usuario-e2e'
const PANEL_PASS = 'senha-e2e'
const DAY = 24 * 60 * 60 * 1000

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

async function eventually(check, message, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs
  let ok = false
  while (Date.now() < deadline) {
    try {
      ok = Boolean(await check())
    } catch {
      ok = false
    }
    if (ok) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert(ok, message)
}

/** Meio-dia local de daqui a `days` dias, em segundos Unix (como o painel declara `exp_date`). */
const expSeconds = (days) => {
  const d = new Date(Date.now() + days * DAY)
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime() / 1000)
}

// Estado do painel falso, mudado pelos cenários.
const panel = { expSec: expSeconds(30), auth: true, hang: false, categoryDelayMs: 0, accountHits: 0 }
const sockets = new Set()

function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    // EPG fictício vazio e válido: sem ele a sincronização de EPG falharia e o cartão ganharia "Erro no EPG" (FR-006).
    if (url.pathname === '/xmltv.php') {
      res.writeHead(200, { 'Content-Type': 'application/xml' })
      res.end('<?xml version="1.0"?><tv></tv>')
      return
    }
    if (url.pathname !== '/player_api.php') {
      res.writeHead(404)
      res.end('não encontrado')
      return
    }
    const action = url.searchParams.get('action')
    const json = (body, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const categories = (n, prefix) => json(Array.from({ length: n }, (_, i) => ({ category_id: String(i + 1), category_name: `${prefix} ${i + 1}` })))
    const delayed = (fn) => (panel.categoryDelayMs > 0 ? setTimeout(fn, panel.categoryDelayMs) : fn())

    if (action === 'get_live_categories') return delayed(() => categories(2, 'Canais'))
    if (action === 'get_vod_categories') return delayed(() => categories(3, 'Filmes'))
    if (action === 'get_series_categories') return delayed(() => categories(4, 'Séries'))
    if (action === 'get_live_streams' || action === 'get_vod_streams' || action === 'get_series') return json([])

    // Qualquer outra consulta é o status da conta.
    panel.accountHits += 1
    if (panel.hang) return // nunca responde (e a conexão fica aberta)
    if (!panel.auth) return json({}, 401)
    return json({ user_info: { auth: 1, exp_date: String(panel.expSec), allowed_output_formats: ['ts'] } })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

const consoleTexts = []
let secrets = []

/** SC-004: nenhum usuário, senha ou endereço do painel no HTML (inclui atributos) da tela. */
async function sweep(page, label) {
  const html = await page.evaluate(() => document.documentElement.outerHTML)
  const leaked = secrets.filter((secret) => html.includes(secret))
  assert(leaked.length === 0, `varredura de segredo (${label}): nada de usuário, senha ou endereço do painel`)
}

/** Reabre o app do zero (os dados ficam no IndexedDB) e espera os cartões. */
async function toProfiles(page) {
  await page.goto(APP_URL)
  await page.waitForSelector('.source-card', { timeout: 15000 })
}

const card = (page) => page.locator('.source-card', { hasText: LIST_NAME })
const cardBadges = async (page) => (await card(page).locator('.source-card-badge').allTextContents()).map((t) => t.trim())

async function openSettings(page) {
  await page.getByRole('button', { name: /Configurações/ }).click()
  await page.waitForSelector('.settings-screen .sources-panel-row', { timeout: 8000 })
}

const settingsRow = (page) => page.locator('.sources-panel-row', { hasText: LIST_NAME })

/** Ressincroniza pela linha de Configurações, espera o desfecho e volta aos perfis. */
async function resync(page) {
  await openSettings(page)
  await settingsRow(page).getByRole('button', { name: 'Ressincronizar' }).click()
  await page.waitForSelector('text=/Concluída|Tentar novamente/', { timeout: 30000 })
  await page.getByRole('button', { name: 'Voltar' }).first().click()
  await page.waitForSelector('.source-card', { timeout: 8000 })
}

/** Edita direto no IndexedDB (como uma lista sincronizada antes da feature, ou com verificação velha). */
async function patchSource(page, patch) {
  await page.evaluate(async (changes) => {
    const dbs = await indexedDB.databases()
    for (const info of dbs) {
      const opened = await new Promise((resolve, reject) => {
        const request = indexedDB.open(info.name)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      if (!opened.objectStoreNames.contains('sources')) {
        opened.close()
        continue
      }
      await new Promise((resolve, reject) => {
        const tx = opened.transaction('sources', 'readwrite')
        const store = tx.objectStore('sources')
        const all = store.getAll()
        all.onsuccess = () => {
          for (const record of all.result) store.put({ ...record, ...changes })
        }
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      })
      opened.close()
      return
    }
  }, patch)
}

async function addSource(page, panelUrl) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaXtream(page, { nome: LIST_NAME, servidor: panelUrl, usuario: PANEL_USER, senha: PANEL_PASS })
  await page.waitForSelector('text=/Concluída/', { timeout: 30000 })
  await page.getByRole('button', { name: 'Voltar' }).first().click()
  await page.waitForSelector('.source-card', { timeout: 8000 })
}

async function run() {
  const server = await startPanelServer()
  const panelUrl = `http://127.0.0.1:${server.address().port}`
  secrets = [PANEL_USER, PANEL_PASS, panelUrl, `127.0.0.1:${server.address().port}`]

  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => consoleTexts.push(msg.text()))

  try {
    console.log('=== 1) Vencimento em +30 dias e contagem real (US1, US4) ===')
    await addSource(page, panelUrl)
    const initialBadges = await cardBadges(page)
    assert(initialBadges.length === 0, `cartão sem nenhum chip (vence daqui a 30 dias, nada a agir) — achou: [${initialBadges.join(', ')}]`)
    await sweep(page, 'cartão')
    await openSettings(page)
    await eventually(async () => /Conta válida até \d{2}\/\d{2}\/\d{4}/.test((await settingsRow(page).textContent()) ?? ''), 'a linha mostra "Conta válida até DD/MM/AAAA"')
    await eventually(
      async () => ((await settingsRow(page).textContent()) ?? '').includes('2 categorias de canais · 3 de filmes · 4 de séries'),
      'a linha mostra a contagem real "2 categorias de canais · 3 de filmes · 4 de séries"',
    )
    assert(!/\b0 de /.test((await settingsRow(page).textContent()) ?? ''), 'nenhuma contagem "0 de …"')
    await sweep(page, 'Configurações')

    // FR-020: mover o foco nunca consulta o painel.
    const hitsBeforeFocus = panel.accountHits
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown')
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft')
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowUp')
    assert(panel.accountHits === hitsBeforeFocus, 'mover o foco em Configurações não fez nenhuma consulta à conta (FR-020)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    const hitsBeforeCards = panel.accountHits
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    assert(panel.accountHits === hitsBeforeCards, 'mover o foco pelos cartões não fez nenhuma consulta à conta (FR-020)')

    console.log('=== 2) Vence em 3 dias: chip âmbar na linha e no cartão (US1) ===')
    panel.expSec = expSeconds(3)
    await resync(page)
    assert((await cardBadges(page)).includes('Vence em 3 dias'), 'o cartão mostra o chip "Vence em 3 dias"')
    await sweep(page, 'cartão com chip')
    await openSettings(page)
    await eventually(
      async () => (await settingsRow(page).locator('.sources-panel-chip--warning').textContent())?.trim() === 'Vence em 3 dias',
      'a linha mostra o chip âmbar "Vence em 3 dias"',
    )
    await page.keyboard.press('Escape')
    await page.waitForSelector('.source-card', { timeout: 8000 })

    console.log('=== 3) Conta vencida: a lista não abre; "Verificar de novo" com o painel renovado abre (US2, US3) ===')
    panel.expSec = Math.floor((Date.now() - 2 * DAY) / 1000)
    await resync(page)
    assert((await cardBadges(page)).includes('Conta expirada'), 'o cartão mostra o chip "Conta expirada"')
    assert(!(await cardBadges(page)).includes('Erro na última sincronização'), 'sem "Erro na última sincronização" junto (a conta explica a falha)')
    await card(page).click()
    await page.waitForSelector('.source-access', { timeout: 6000 })
    assert(/A assinatura desta lista venceu em \d{2}\/\d{2}\/\d{4}\./.test((await page.locator('.source-access-message').textContent()) ?? ''), 'a tela de acesso diz que a assinatura venceu, com a data')
    assert((await page.locator('.home-content').count()) === 0, 'o Início NÃO abriu')
    assert((await page.getByRole('button', { name: 'Editar lista' }).getAttribute('class'))?.includes('tv-focus') ?? false, 'o foco inicial é "Editar lista"')
    assert((await page.locator('.tv-focus').count()) === 1, 'exatamente um foco na tela de acesso')
    await sweep(page, 'tela de acesso')
    const hitsBeforeGateFocus = panel.accountHits
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    assert(panel.accountHits === hitsBeforeGateFocus, 'mover o foco na tela de acesso não consulta o painel (FR-020)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.source-card.tv-focus', { timeout: 6000 })
    assert(true, 'RETURN volta aos perfis com o foco no cartão da lista')

    panel.expSec = expSeconds(60) // renovou no provedor
    await page.keyboard.press('Enter')
    await page.waitForSelector('.source-access', { timeout: 6000 })
    await page.keyboard.press('ArrowRight') // Verificar de novo
    const hitsBeforeRecheck = panel.accountHits
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })
    assert(panel.accountHits > hitsBeforeRecheck, '"Verificar de novo" consultou o painel na hora')
    assert(true, 'com o painel renovado, o Início da lista abriu')

    console.log('=== 4) Painel que não responde: decide pelo dado guardado em até ~5 s (SC-003) ===')
    await toProfiles(page)
    await patchSource(page, { accountStatus: 'active', accountExpiresAt: Date.now() + 90 * DAY, accountCheckedAt: 0 })
    await toProfiles(page)
    panel.hang = true
    const startedAt = Date.now()
    await card(page).click()
    await page.waitForSelector('text=/Verificando a conta da lista/', { timeout: 3000 })
    assert(true, 'aparece "Verificando a conta da lista…"')
    assert((await page.getByRole('button', { name: 'Voltar' }).getAttribute('class'))?.includes('tv-focus') ?? false, '"Voltar" fica focado durante a verificação (nunca um beco)')
    await page.waitForSelector('.home-content', { timeout: 9000 })
    const elapsed = Date.now() - startedAt
    assert(elapsed <= 8000, `a lista abriu pelo dado guardado em ${elapsed} ms (limite de 5 s + folga)`)
    panel.hang = false

    console.log('=== 5) Sem internet: bloqueio pelo dado guardado (US2 AC6) ===')
    await toProfiles(page)
    await patchSource(page, { accountStatus: 'active', accountExpiresAt: Date.now() - 3 * DAY, accountCheckedAt: 0 })
    await toProfiles(page)
    await context.setOffline(true)
    await card(page).click()
    await page.waitForSelector('text=/Não foi possível confirmar agora/', { timeout: 10000 })
    assert((await page.locator('.home-content').count()) === 0, 'sem internet, a conta vencida guardada continua bloqueando')
    assert(/venceu em \d{2}\/\d{2}\/\d{4}/.test((await page.locator('.source-access-message').textContent()) ?? ''), 'e a tela mostra a data para a pessoa conferir')
    await context.setOffline(false)
    await page.keyboard.press('Escape')
    await page.waitForSelector('.source-card', { timeout: 6000 })

    console.log('=== 6) Credencial recusada e correção (US3, FR-014) ===')
    panel.expSec = expSeconds(60)
    panel.auth = false
    await resync(page)
    assert((await cardBadges(page)).includes('Credencial inválida'), 'o cartão mostra "Credencial inválida"')
    await openSettings(page)
    await eventually(async () => ((await settingsRow(page).locator('.sources-panel-status').textContent()) ?? '').trim() === 'Credencial inválida', 'a linha mostra o estado "Credencial inválida"')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await card(page).click()
    await page.waitForSelector('.source-access', { timeout: 6000 })
    assert((await page.locator('.source-access-message').textContent())?.includes('O provedor recusou o usuário ou a senha desta lista.') ?? false, 'a tela de acesso diz que o provedor recusou o usuário ou a senha')
    await sweep(page, 'tela de acesso (recusada)')
    await page.keyboard.press('Enter') // Editar lista (foco inicial)
    await page.waitForSelector('#add-source-title', { timeout: 6000 })
    assert(true, '"Editar lista" abre o formulário de edição da lista')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.source-access', { timeout: 6000 })
    assert(true, 'RETURN da edição volta à tela de acesso')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.source-card', { timeout: 6000 })

    panel.auth = true // a credencial foi corrigida
    await resync(page)
    assert(!(await cardBadges(page)).includes('Credencial inválida'), 'a sincronização boa limpa o aviso "Credencial inválida" (FR-014)')
    await card(page).click()
    await page.waitForSelector('.home-content', { timeout: 10000 })
    assert((await page.locator('.source-access').count()) === 0, 'e a lista abre direto, sem a tela de acesso')

    console.log('=== 7) "Sincronizando" no cartão (US3, FR-015) ===')
    await toProfiles(page)
    panel.categoryDelayMs = 3000
    await openSettings(page)
    await settingsRow(page).getByRole('button', { name: 'Ressincronizar' }).click()
    await page.waitForTimeout(600) // a tela de progresso abriu e a importação segue rodando (o painel demora 3 s)
    await page.keyboard.press('Escape') // RETURN na tela de progresso, com a importação ainda rodando
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await eventually(async () => (await cardBadges(page)).includes('Sincronizando'), 'o cartão mostra "Sincronizando" enquanto a sincronização roda', 8000)
    await eventually(async () => !(await cardBadges(page)).includes('Sincronizando'), 'e o chip some quando a sincronização termina', 20000)
    panel.categoryDelayMs = 0

    const leakedInConsole = consoleTexts.filter((text) => secrets.some((secret) => text.includes(secret)))
    assert(leakedInConsole.length === 0, 'nenhum usuário, senha ou endereço do painel no console (SC-004)')
  } finally {
    await browser.close()
    for (const socket of sockets) socket.destroy()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTodas as verificações passaram.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
