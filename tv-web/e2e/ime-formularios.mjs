// Roteiro E2E da feature 045 (IME da TV nos formulários) — gate da constitution
// ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre, num Chromium real contra um painel FICTÍCIO que este script serve
// (`http.createServer`) e cujo estado ele muda entre os cenários:
//  1. credencial recusada → o formulário FICA, com os dados, uma faixa "SRC-401",
//     foco no botão; corrigir só a senha e confirmar abre o progresso (SC-001/SC-002);
//  2. servidor fora do ar → "NET-02" e o botão vira "Tentar de novo";
//  3. endereço sem host → "SRC-001" sem nenhuma requisição ao painel (FR-003);
//  4. painel sem protocolo Xtream cujo M3U serve → sem erro, abre o progresso (FR-004);
//  5. lista M3U que serve HTML → "SRC-422"; M3U enorme → a leitura para na primeira
//     entrada (o servidor vê a conexão fechar bem antes do fim) (D-002);
//  6. OK repetido durante a espera → 1 requisição; RETURN cancela e fica; RETURN de novo sai;
//  7. varredura de segredo: nenhum usuário, senha ou endereço do painel no HTML (SC-006).
//  8. cobertura do campo (7 campos dos 3 formulários na metade superior, 1920×1080),
//     "Mostrar senha" e Done do IME encadeando os campos sem enviar (SC-004/SC-005).
// O IME real da Samsung é simulado por `keyCode` (65376 = Done, valor de `lib/imeKeys.ts`,
// ainda NÃO medido na TV): o que este script prova é a lógica do app, não o aparelho.
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173), como os
// demais scripts em `e2e/`. Dados só fictícios.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { cadastrarListaM3u, cadastrarListaXtream } from './lib/entrada.mjs'

const APP_URL = 'http://localhost:5173'
const USER = 'usuario-e2e'
const PASS = 'senha-e2e'

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

const M3U_HEAD = '#EXTM3U\n#EXTINF:-1 group-title="Canais",Canal Um\nhttp://127.0.0.1/live/1.ts\n'

// Estado do painel falso, mudado pelos cenários.
const panel = {
  auth: true,
  hang: false,
  protocol: true, // false → o player_api responde 404 (painel sem protocolo Xtream)
  accountHits: 0,
  m3uMode: 'ok', // 'ok' | 'html' | 'endless'
  endlessClosedAt: null,
  endlessBytes: 0,
}
const sockets = new Set()

function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url.pathname === '/xmltv.php') {
      res.writeHead(200, { 'Content-Type': 'application/xml' })
      res.end('<?xml version="1.0"?><tv></tv>')
      return
    }

    if (url.pathname === '/lista.m3u' || url.pathname === '/get.php') {
      if (panel.m3uMode === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body>nada de lista</body></html>')
        return
      }
      if (panel.m3uMode === 'endless') {
        res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
        res.write(M3U_HEAD)
        panel.endlessBytes = M3U_HEAD.length
        const timer = setInterval(() => {
          const chunk = '#EXTINF:-1,Outro\nhttp://127.0.0.1/live/n.ts\n'.repeat(50)
          panel.endlessBytes += chunk.length
          res.write(chunk)
        }, 20)
        res.on('close', () => {
          clearInterval(timer)
          panel.endlessClosedAt = Date.now()
        })
        return
      }
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(M3U_HEAD)
      return
    }

    if (url.pathname !== '/player_api.php') {
      res.writeHead(404)
      res.end('não encontrado')
      return
    }
    if (!panel.protocol) {
      res.writeHead(404)
      res.end('')
      return
    }
    const action = url.searchParams.get('action')
    const json = (body, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const categories = (n, prefix) => json(Array.from({ length: n }, (_, i) => ({ category_id: String(i + 1), category_name: `${prefix} ${i + 1}` })))
    if (action === 'get_live_categories') return categories(2, 'Canais')
    if (action === 'get_vod_categories') return categories(2, 'Filmes')
    if (action === 'get_series_categories') return categories(2, 'Séries')
    if (action === 'get_live_streams' || action === 'get_vod_streams' || action === 'get_series') return json([])

    panel.accountHits += 1
    if (panel.hang) return // nunca responde
    if (!panel.auth) return json({}, 401)
    return json({ user_info: { auth: 1, exp_date: null, allowed_output_formats: ['ts'] } })
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

/** Contexto novo por cenário: o IndexedDB não vaza de um para o outro. */
async function freshPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  await page.goto(APP_URL)
  return { context, page }
}

const banner = (page) => page.locator('.connection-banner')
const submit = (page) => page.getByRole('button', { name: /^(Conectar e sincronizar|Tentar de novo)$/ })
const focusedName = (page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')

/** SC-006: nenhum usuário, senha ou endereço do painel no HTML (inclui atributos) nem no texto da tela. */
async function sweep(page, secrets, label) {
  const html = await page.evaluate(() => document.documentElement.outerHTML)
  // O `value` dos <input> vive na propriedade, não no atributo, mas o HTML serializado pode refleti-lo: tira os inputs da conta.
  const withoutInputs = html.replace(/<input[^>]*>/g, '')
  const leaked = secrets.filter((secret) => withoutInputs.includes(secret))
  assert(leaked.length === 0, `varredura de segredo (${label}): nada de usuário, senha ou endereço fora dos campos`)
}

/**
 * Foca o campo e confere (depois da rolagem assentar) que o bloco inteiro dele —
 * rótulo, campo, dica e erro — está na metade superior do contêiner rolável.
 */
async function naMetadeSuperior(page, input, label) {
  await input.focus()
  await page.waitForTimeout(300)
  const medida = await input.evaluate((element) => {
    const block = element.closest('.text-field').getBoundingClientRect()
    let container = element.parentElement
    while (container && !['auto', 'scroll'].includes(getComputedStyle(container).overflowY)) container = container.parentElement
    const rect = container ? container.getBoundingClientRect() : { top: 0, height: window.innerHeight }
    return { top: Math.round(block.top - rect.top), bottom: Math.round(block.bottom - rect.top), half: Math.round(rect.height / 2), scrolls: Boolean(container) }
  })
  assert(
    medida.scrolls && medida.top >= -1 && medida.bottom <= medida.half + 1,
    `${label}: bloco em ${medida.top}–${medida.bottom}px, metade superior até ${medida.half}px`,
  )
}

async function main() {
  const server = await startPanelServer()
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`
  const secrets = [USER, PASS, `127.0.0.1:${port}`]
  const browser = await launchBrowser()

  try {
    console.log('1. Credencial recusada: o formulário fica; corrigir só a senha abre o progresso')
    {
      const { context, page } = await freshPage(browser)
      panel.auth = false
      panel.accountHits = 0
      await cadastrarListaXtream(page, { nome: 'Lista E2E', servidor: base, usuario: USER, senha: 'errada' })
      await eventually(async () => (await banner(page).count()) === 1, 'uma única faixa de erro aparece')
      assert((await banner(page).textContent()).includes('SRC-401'), 'a faixa traz o código SRC-401')
      assert((await banner(page).textContent()).includes('Credencial inválida'), 'a faixa traz o título da tabela')
      assert(await page.locator('#add-source-title').isVisible(), 'continua no formulário (não abriu o progresso)')
      assert((await page.getByLabel('Servidor', { exact: true }).inputValue()) === base, 'o servidor continua preenchido')
      assert((await page.getByLabel('Usuário', { exact: true }).inputValue()) === USER, 'o usuário continua preenchido')
      assert((await page.getByLabel('Nome da lista', { exact: true }).inputValue()) === 'Lista E2E', 'o nome continua preenchido')
      assert((await focusedName(page)) === 'Conectar e sincronizar', 'o foco está no botão de ação')
      await sweep(page, secrets, 'faixa SRC-401')

      panel.auth = true
      await page.getByLabel('Senha', { exact: true }).fill(PASS)
      await submit(page).click()
      await page.locator('#progress-title').waitFor({ timeout: 10000 })
      assert(true, 'corrigindo só a senha, a confirmação passa e o progresso abre')
      await context.close()
    }

    console.log('2. Servidor fora do ar: NET-02 e "Tentar de novo"')
    {
      const { context, page } = await freshPage(browser)
      await cadastrarListaXtream(page, { nome: 'Fora do ar', servidor: 'http://127.0.0.1:1', usuario: USER, senha: PASS })
      await eventually(async () => (await banner(page).count()) === 1, 'a faixa de erro aparece')
      assert((await banner(page).textContent()).includes('NET-02'), 'a faixa traz o código NET-02')
      assert((await focusedName(page)) === 'Tentar de novo', 'o botão virou "Tentar de novo" e tem o foco')
      await context.close()
    }

    console.log('3. Endereço sem host: SRC-001, sem consultar o painel')
    {
      const { context, page } = await freshPage(browser)
      panel.accountHits = 0
      await cadastrarListaXtream(page, { nome: 'Sem host', servidor: 'http://', usuario: USER, senha: PASS })
      await eventually(async () => (await banner(page).count()) === 1, 'a faixa de erro aparece')
      assert((await banner(page).textContent()).includes('SRC-001'), 'a faixa traz o código SRC-001')
      assert(panel.accountHits === 0, 'o painel não recebeu nenhuma requisição')
      await context.close()
    }

    console.log('4. Painel sem protocolo Xtream cujo M3U serve: sem erro (Modo limitado)')
    {
      const { context, page } = await freshPage(browser)
      panel.protocol = false
      panel.m3uMode = 'ok'
      await cadastrarListaXtream(page, { nome: 'Limitado', servidor: base, usuario: USER, senha: PASS })
      await page.locator('#progress-title').waitFor({ timeout: 10000 })
      assert((await banner(page).count()) === 0, 'nenhuma faixa de erro; o progresso abriu')
      panel.protocol = true
      await context.close()
    }

    console.log('5. Lista M3U: HTML é SRC-422; lista enorme só tem o começo lido')
    {
      const { context, page } = await freshPage(browser)
      panel.m3uMode = 'html'
      await cadastrarListaM3u(page, { nome: 'Html', url: `${base}/lista.m3u` })
      await eventually(async () => (await banner(page).count()) === 1, 'a faixa de erro aparece')
      assert((await banner(page).textContent()).includes('SRC-422'), 'a faixa traz o código SRC-422')
      assert((await focusedName(page)) === 'Conectar e sincronizar', 'SRC-422 não é recuperável: o rótulo da ação não muda')
      await context.close()
    }
    {
      const { context, page } = await freshPage(browser)
      panel.m3uMode = 'endless'
      panel.endlessClosedAt = null
      panel.endlessBytes = 0
      const started = Date.now()
      await cadastrarListaM3u(page, { nome: 'Enorme', url: `${base}/lista.m3u` })
      await eventually(() => panel.endlessClosedAt !== null, 'o servidor vê a conexão da confirmação fechar', 8000)
      assert(panel.endlessClosedAt !== null && panel.endlessClosedAt - started < 4000, 'a leitura parou rápido (primeira entrada), sem baixar a lista inteira')
      await context.close()
      panel.m3uMode = 'ok'
    }

    console.log('6. OK repetido durante a espera; RETURN cancela e fica; RETURN de novo sai')
    {
      const { context, page } = await freshPage(browser)
      panel.hang = true
      panel.accountHits = 0
      await cadastrarListaXtream(page, { nome: 'Espera', servidor: base, usuario: USER, senha: PASS })
      await eventually(() => panel.accountHits >= 1, 'a confirmação chegou ao painel')
      const busy = page.getByRole('button', { name: 'Conectando…' })
      await busy.click()
      await busy.click()
      await page.waitForTimeout(300)
      assert(panel.accountHits === 1, 'dois OK extras não geraram outra requisição (1 só)')
      assert((await busy.getAttribute('aria-busy')) === 'true', 'o botão sinaliza ocupado e segue focável (sem disabled)')

      await page.keyboard.press('Escape')
      await eventually(async () => (await page.getByRole('button', { name: 'Conectar e sincronizar' }).count()) === 1, 'RETURN cancela a espera e o botão volta ao normal')
      assert(await page.locator('#add-source-title').isVisible(), 'continua no formulário depois do RETURN')
      assert((await banner(page).count()) === 0, 'cancelar não é erro: nenhuma faixa')
      assert((await page.getByLabel('Senha', { exact: true }).inputValue()) === PASS, 'os dados foram preservados')
      assert((await focusedName(page)) === 'Conectar e sincronizar', 'o foco voltou à ação')

      panel.hang = false
      await page.keyboard.press('Escape')
      await eventually(async () => !(await page.locator('#add-source-title').isVisible()), 'sem nada pendente, RETURN sai da tela')
      await context.close()
    }

    console.log('7. Cobertura: o campo focado fica inteiro na metade superior da tela (SC-005)')
    {
      const { context, page } = await freshPage(browser)
      await page.locator('.add-card').click()
      await page.locator('#add-source-title').waitFor({ timeout: 8000 })
      for (const label of ['Nome da lista', 'Servidor', 'Usuário', 'Senha']) {
        await naMetadeSuperior(page, page.getByLabel(label, { exact: true }), `cadastro Xtream › ${label}`)
      }
      await page.getByRole('button', { name: /^Lista M3U/ }).click()
      await naMetadeSuperior(page, page.getByLabel('URL M3U', { exact: true }), 'cadastro M3U › URL M3U')

      // Uma lista de verdade para chegar às telas de Configurações.
      panel.m3uMode = 'ok'
      await cadastrarListaM3u(page, { nome: 'Cobertura', url: `${base}/lista.m3u` })
      await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
      await page.getByRole('button', { name: 'Abrir lista' }).click()
      await page.waitForSelector('.topbar', { timeout: 8000 })
      await page.getByRole('button', { name: 'Configurações', exact: true }).click()
      await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })

      await page.getByRole('button', { name: 'EPG', exact: true }).click()
      await page.waitForSelector('.epg-settings', { timeout: 8000 })
      await naMetadeSuperior(page, page.getByLabel(/Endereço XMLTV/), 'EPG manual › Endereço XMLTV')
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Integrações & BYOK' }).click()
      await page.getByRole('region', { name: 'TMDB' }).getByRole('button', { name: 'Configurar' }).click()
      await page.waitForSelector('#tmdb-key-title', { timeout: 8000 })
      await naMetadeSuperior(page, page.getByLabel(/Chave da API/), 'chave TMDB › Chave da API')
      await context.close()
    }

    console.log('8. "Mostrar senha": revela, alterna o nome, e volta mascarada ao sair e voltar')
    {
      const { context, page } = await freshPage(browser)
      await page.locator('.add-card').click()
      await page.locator('#add-source-title').waitFor({ timeout: 8000 })
      const senha = page.getByLabel('Senha', { exact: true })
      await senha.fill(PASS)
      assert((await senha.getAttribute('type')) === 'password', 'a senha nasce mascarada')
      await page.getByRole('button', { name: 'Mostrar senha' }).click()
      assert((await senha.getAttribute('type')) === 'text', 'Mostrar revela o texto')
      assert((await page.getByRole('button', { name: 'Ocultar senha' }).getAttribute('aria-pressed')) === 'true', 'o controle vira "Ocultar senha" com aria-pressed')
      const labels = await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label')).join(' '))
      assert(!labels.includes(PASS), 'revelada, a senha não aparece em nenhum nome acessível')
      await page.keyboard.press('Escape') // sai do cadastro (RETURN fora de qualquer espera)
      await page.locator('.add-card').click()
      await page.locator('#add-source-title').waitFor({ timeout: 8000 })
      assert((await page.getByLabel('Senha', { exact: true }).getAttribute('type')) === 'password', 'ao voltar ao cadastro, a senha está mascarada de novo')
      await context.close()
    }

    console.log('9. Done do IME (simulado por keyCode): encadeia os campos, foca a ação e não envia (SC-004)')
    {
      const { context, page } = await freshPage(browser)
      await page.locator('.add-card').click()
      await page.locator('#add-source-title').waitFor({ timeout: 8000 })
      panel.accountHits = 0
      const done = (label) =>
        page.getByLabel(label, { exact: true }).evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 65376, bubbles: true, cancelable: true })))
      const activeLabel = () => page.evaluate(() => document.activeElement?.labels?.[0]?.textContent ?? document.activeElement?.textContent?.trim() ?? '')

      await page.getByLabel('Nome da lista', { exact: true }).fill('Encadeada')
      await page.getByLabel('Servidor', { exact: true }).fill(base)
      await page.getByLabel('Usuário', { exact: true }).fill(USER)
      await page.getByLabel('Senha', { exact: true }).fill(PASS)
      await page.getByLabel('Nome da lista', { exact: true }).focus()

      const ordem = []
      for (const campo of ['Nome da lista', 'Servidor', 'Usuário', 'Senha']) {
        await done(campo)
        ordem.push(await activeLabel())
      }
      assert(ordem.join(' → ') === 'Servidor → Usuário → Senha → Conectar e sincronizar', `Done anda Nome → Servidor → Usuário → Senha → ação, sem nenhuma seta (${ordem.join(' → ')})`)
      await page.waitForTimeout(300)
      assert(panel.accountHits === 0, 'nada foi enviado ao painel')
      assert(await page.locator('#add-source-title').isVisible(), 'continua no formulário')

      // Enter sozinho num campo NÃO é tomado (na TV é o OK que abre o teclado do sistema).
      await page.getByLabel('Senha', { exact: true }).focus()
      const enterPrevented = await page.getByLabel('Senha', { exact: true }).evaluate((el) => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
        el.dispatchEvent(event)
        return event.defaultPrevented
      })
      assert(enterPrevented === false, 'Enter num campo continua do teclado do sistema (sem preventDefault)')
      assert((await page.evaluate(() => document.activeElement?.labels?.[0]?.textContent)) === 'Senha', 'e o foco fica no campo')
      await context.close()
    }

    for (const sock of sockets) sock.destroy()
  } finally {
    await browser.close()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTodas as verificações passaram.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
