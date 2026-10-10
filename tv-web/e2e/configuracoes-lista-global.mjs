// Roteiro E2E da feature 067 (configurações da lista × globais, PIN por lista).
//
// Duas listas M3U fictícias servidas por este script ("Sala", a ativa, e "Quarto"). Percorre: Configurações só com as
// abas globais e o aviso de escopo; a linha de cada lista só com "Configurar"; a tela "Configurações da lista" aberta
// para a lista que NÃO é a ativa (esconder uma categoria dela sem tocar a ativa, sem trocar a lista ativa); RETURN com o
// foco na linha da mesma lista; PIN por lista (o PIN de uma lista não vale na outra; ligar numa não protege a outra);
// "Configurar" pelo cartão da tela de perfis e RETURN com o foco no cartão.
//
// Pré-requisito: `npm run dev` em http://localhost:5173. Dados só fictícios; o PIN e as listas nunca vêm do .env.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const APP_URL = 'http://localhost:5173'

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else console.log(`  ✓ ${message}`)
}

// O tipo de cada item vem do nome do grupo no M3U: o prefixo "Canais |" faz do grupo uma categoria de canais.
const LISTAS = {
  '/sala.m3u': `#EXTM3U
#EXTINF:-1 group-title="Canais | Noticias Sala",Canal S1
http://exemplo.test/live/s1.ts
#EXTINF:-1 group-title="Canais | Esportes Sala",Canal S2
http://exemplo.test/live/s2.ts
`,
  '/quarto.m3u': `#EXTM3U
#EXTINF:-1 group-title="Canais | Desenhos Quarto",Canal Q1
http://exemplo.test/live/q1.ts
#EXTINF:-1 group-title="Canais | Infantil Quarto",Canal Q2
http://exemplo.test/live/q2.ts
`,
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const body = LISTAS[new URL(req.url, 'http://127.0.0.1').pathname]
      res.writeHead(body ? 200 : 404, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
      res.end(body ?? '')
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const typePin = async (page, pin) => {
  for (const digit of pin) await page.keyboard.press(digit)
}
const dialog = (page, name) => page.getByRole('dialog', { name, exact: true }).waitFor({ timeout: 8000 })
const row = (page, nome) => page.locator('.sources-panel-row', { hasText: nome })
const focusedTab = async (page) => ((await page.locator('.side-category-nav-item.tv-focus').first().textContent().catch(() => '')) ?? '').trim()

/** Do Início/qualquer tela com topbar, abre Configurações (a engrenagem tem nome acessível). */
async function openSettings(page) {
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.waitForSelector('.settings-screen .sources-panel-row', { timeout: 8000 })
}

/** Em Configurações › Fontes IPTV, "Configurar" da lista pelo nome → tela da lista (aba Conta & lista). */
async function configure(page, nome) {
  await row(page, nome).getByRole('button', { name: 'Configurar' }).click()
  await page.getByRole('heading', { name: /Configurações da lista/ }).waitFor({ timeout: 8000 })
}

/** Na tela da lista: abre a aba pelo nome e deixa o foco no painel. */
async function openListTab(page, nome) {
  await page.locator('.side-category-nav-item', { hasText: nome }).click()
}

async function focusCategory(page, label) {
  const button = page.getByRole('button', { name: label })
  await button.waitFor({ timeout: 8000 })
  for (let i = 0; i < 6 && !((await button.getAttribute('class')) ?? '').includes('tv-focus'); i += 1) await page.keyboard.press('ArrowDown')
}

async function run() {
  const server = await startServer()
  const base = `http://127.0.0.1:${server.address().port}`
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })).newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  const consoleLines = []
  page.on('console', (message) => consoleLines.push(message.text()))

  try {
    console.log('=== Duas listas fictícias ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaM3u(page, { nome: 'Sala', url: `${base}/sala.m3u` })
    await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.locator('.source-card-wrap', { hasText: 'Sala' }).waitFor({ timeout: 8000 })
    await cadastrarListaM3u(page, { nome: 'Quarto', url: `${base}/quarto.m3u` })
    await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.locator('.source-card-wrap', { hasText: 'Quarto' }).waitFor({ timeout: 8000 })
    await page.locator('.source-card', { hasText: 'Sala' }).click() // "Sala" é a lista ativa
    await page.waitForSelector('.home-content', { timeout: 10000 })

    console.log('=== US2: Configurações só com o que é global ===')
    await openSettings(page)
    const tabs = (await page.locator('.side-category-nav-item .side-category-nav-label').allTextContents()).map((t) => t.trim())
    assert(
      JSON.stringify(tabs) === JSON.stringify(['Integrações & BYOK', 'Fontes IPTV', 'Player & reprodução', 'Acessibilidade & sistema', 'Sobre & créditos']),
      `abas globais: ${tabs.join(' | ')}`,
    )
    assert((await page.getByText('Estas configurações valem para todas as listas.').count()) === 1, 'aviso de escopo global')
    for (const nome of ['Sala', 'Quarto']) {
      const buttons = (await row(page, nome).getByRole('button').allTextContents()).map((t) => t.trim())
      assert(buttons.length === 1 && buttons[0] === 'Configurar', `a linha de "${nome}" só tem "Configurar" (${buttons.join(', ')})`)
    }
    assert((await row(page, 'Sala').getByText('Lista ativa').count()) === 1, '"Sala" é marcada como Lista ativa')
    assert((await row(page, 'Quarto').getByText('Lista ativa').count()) === 0, '"Quarto" não é a ativa')

    console.log('=== US1: tela da lista para uma lista que NÃO é a ativa ===')
    await configure(page, 'Quarto')
    assert(((await page.locator('.list-settings-name').textContent()) ?? '').includes('Quarto'), 'o título traz o nome da lista escolhida')
    assert((await page.getByText('Estas configurações valem só para esta lista.').count()) === 1, 'aviso: vale só para esta lista')
    const listTabs = (await page.locator('.side-category-nav-item .side-category-nav-label').allTextContents()).map((t) => t.trim())
    assert(
      JSON.stringify(listTabs) === JSON.stringify(['Conta & lista', 'EPG', 'Categorias & controle parental', 'Histórico']),
      `abas da lista: ${listTabs.join(' | ')}`,
    )
    assert((await focusedTab(page)) === 'Conta & lista', 'abre em Conta & lista')
    await openListTab(page, 'Categorias & controle parental')
    await page.getByRole('button', { name: 'Controle parental: Desligado' }).waitFor({ timeout: 8000 })
    await page.keyboard.press('ArrowDown') // seções (Canais)
    await page.keyboard.press('ArrowDown') // 1ª categoria
    assert((await page.getByRole('button', { name: /Noticias Sala/ }).count()) === 0, 'só aparecem as categorias de "Quarto"')
    await focusCategory(page, 'Canais | Desenhos Quarto: Visível')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Canais | Desenhos Quarto: Escondida' }).waitFor({ timeout: 8000 })
    assert(true, 'categoria de "Quarto" escondida pela tela dela')

    console.log('=== RETURN volta a Fontes IPTV com o foco na mesma lista ===')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.settings-screen:not(.list-settings-screen) .sources-panel-row', { timeout: 8000 })
    assert((await row(page, 'Quarto').locator('.tv-focus').count()) === 1, 'foco em "Configurar" da linha de "Quarto"')
    assert((await row(page, 'Sala').locator('.tv-focus').count()) === 0, 'nada focado na linha de "Sala"')
    await page.keyboard.press('Escape') // Configurações -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    assert(((await page.locator('.topbar-profile-name').textContent()) ?? '').includes('Sala'), 'a lista ativa continua "Sala"')

    console.log('=== FR-009: Editar → RETURN volta à tela da lista, na aba Conta & lista, com "Editar" focado ===')
    await openSettings(page)
    await configure(page, 'Quarto')
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.locator('#add-source-title').waitFor({ timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.getByRole('heading', { name: /Configurações da lista/ }).waitFor({ timeout: 8000 })
    assert(((await page.locator('.side-category-nav-item.is-selected').textContent()) ?? '').includes('Conta & lista'), 'voltou na aba "Conta & lista"')
    assert(((await page.getByRole('button', { name: 'Editar', exact: true }).getAttribute('class')) ?? '').includes('tv-focus'), '"Editar" voltou com o foco')
    await page.keyboard.press('Escape') // tela da lista -> Configurações
    await page.waitForSelector('.settings-screen:not(.list-settings-screen)', { timeout: 8000 })
    await page.keyboard.press('Escape') // Configurações -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== D-010: "Gerenciar categorias" do vazio "todas escondidas" abre a tela da lista ativa ===')
    await openSettings(page)
    await configure(page, 'Sala')
    await openListTab(page, 'Categorias & controle parental')
    await page.keyboard.press('ArrowDown') // seções (Canais)
    await page.keyboard.press('ArrowDown') // 1ª categoria
    for (const nome of ['Canais | Noticias Sala', 'Canais | Esportes Sala']) {
      await focusCategory(page, `${nome}: Visível`)
      await page.keyboard.press('Enter')
      await page.getByRole('button', { name: `${nome}: Escondida` }).waitFor({ timeout: 8000 })
    }
    await page.keyboard.press('Escape') // tela da lista -> Configurações
    await page.waitForSelector('.settings-screen:not(.list-settings-screen)', { timeout: 8000 })
    await page.keyboard.press('Escape') // Configurações -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.getByRole('button', { name: 'TV ao vivo', exact: true }).click()
    await page.getByText('Todas as categorias estão escondidas').waitFor({ timeout: 10000 })
    assert(
      (await page.getByText(/Fontes IPTV › Configurar › Categorias & controle parental/).count()) === 1,
      'o vazio aponta o caminho novo (Fontes IPTV › Configurar › Categorias & controle parental)',
    )
    await page.getByRole('button', { name: 'Gerenciar categorias' }).click()
    await page.getByRole('heading', { name: /Configurações da lista/ }).waitFor({ timeout: 8000 })
    assert(((await page.locator('.list-settings-name').textContent()) ?? '').includes('Sala'), 'abre a tela da lista ativa ("Sala")')
    assert(
      (((await page.locator('.side-category-nav-item.is-selected').textContent()) ?? '').includes('Categorias & controle parental')),
      'já na aba Categorias & controle parental',
    )
    await page.keyboard.press('Escape')
    await page.getByText('Todas as categorias estão escondidas').waitFor({ timeout: 8000 })
    assert(true, 'RETURN volta à TV ao vivo, no mesmo estado')
    await page.keyboard.press('Escape') // Live -> Início

    console.log('=== US3: PIN por lista ===')
    await openSettings(page)
    await configure(page, 'Quarto')
    await openListTab(page, 'Categorias & controle parental')
    await page.getByRole('button', { name: 'Controle parental: Desligado' }).click()
    await dialog(page, 'Categorias que parecem adultas')
    await page.getByText('Nenhuma categoria adulta encontrada nesta lista.').waitFor({ timeout: 8000 })
    await page.keyboard.press('Enter') // Confirmar (sem categorias adultas, "Confirmar" já vem focado)
    await dialog(page, 'Crie um PIN de 4 dígitos')
    await typePin(page, '1111')
    await dialog(page, 'Digite o PIN de novo')
    await typePin(page, '1111')
    await page.getByRole('button', { name: 'Controle parental: Ligado' }).waitFor({ timeout: 8000 })
    assert(true, 'PIN 1111 ligado em "Quarto"')

    await page.keyboard.press('Escape') // volta a Fontes IPTV
    await page.waitForSelector('.settings-screen:not(.list-settings-screen) .sources-panel-row', { timeout: 8000 })
    await configure(page, 'Sala')
    await openListTab(page, 'Categorias & controle parental')
    await page.getByRole('button', { name: 'Controle parental: Desligado' }).waitFor({ timeout: 8000 })
    assert((await page.getByRole('dialog').count()) === 0, '"Sala" não é protegida: a gestão abre sem pedir PIN')
    await page.getByRole('button', { name: 'Controle parental: Desligado' }).click()
    await dialog(page, 'Categorias que parecem adultas')
    await page.getByText('Nenhuma categoria adulta encontrada nesta lista.').waitFor({ timeout: 8000 })
    await page.keyboard.press('Enter')
    await dialog(page, 'Crie um PIN de 4 dígitos')
    await typePin(page, '2222')
    await dialog(page, 'Digite o PIN de novo')
    await typePin(page, '2222')
    await page.getByRole('button', { name: 'Controle parental: Ligado' }).waitFor({ timeout: 8000 })
    assert(true, 'PIN 2222 ligado em "Sala"')

    await page.keyboard.press('Escape')
    await page.waitForSelector('.settings-screen:not(.list-settings-screen) .sources-panel-row', { timeout: 8000 })
    await configure(page, 'Quarto')
    await openListTab(page, 'Categorias & controle parental')
    await page.getByRole('button', { name: 'Digite o PIN' }).waitFor({ timeout: 8000 })
    if ((await page.getByRole('dialog', { name: 'Digite o PIN', exact: true }).count()) === 0) await page.keyboard.press('Enter')
    await dialog(page, 'Digite o PIN')
    await typePin(page, '2222') // o PIN de "Sala" não vale em "Quarto"
    await page.getByText('PIN incorreto').waitFor({ timeout: 8000 })
    assert(true, 'o PIN de "Sala" é recusado em "Quarto"')
    await typePin(page, '1111')
    await page.getByRole('button', { name: 'Controle parental: Ligado' }).waitFor({ timeout: 8000 })
    assert(true, 'o PIN de "Quarto" abre a gestão dela')

    console.log('=== FR-012: "Configurar" pelo cartão da tela de perfis ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.source-card', { timeout: 10000 })
    await page.locator('.source-card', { hasText: 'Quarto' }).focus().catch(() => {})
    // Teclado: o foco inicial é a última lista usada ("Sala"); → vai a "Quarto" (2º cartão), ↓ abre as ações.
    await page.keyboard.press('ArrowRight') // posiciona o foco no cartão de "Quarto" (não conta: é só o ponto de partida)
    // SC-001 (emendado): do foco no cartão até a tela da lista, no máximo 5 teclas.
    let keys = 0
    const tecla = async (key) => {
      keys += 1
      await page.keyboard.press(key)
    }
    await tecla('ArrowDown')
    for (let i = 0; i < 3; i += 1) await tecla('ArrowRight') // Ressincronizar → Editar → Excluir → Configurar
    const actions = (await page.locator('.source-actions button').allTextContents()).map((t) => t.trim())
    assert(JSON.stringify(actions) === JSON.stringify(['Ressincronizar', 'Editar', 'Excluir', 'Configurar']), `ações do cartão: ${actions.join(', ')}`)
    await tecla('Enter')
    await page.getByRole('heading', { name: /Configurações da lista/ }).waitFor({ timeout: 8000 })
    assert(keys <= 5, `SC-001: do cartão à tela da lista em ≤ 5 teclas (${keys})`)
    assert(((await page.locator('.list-settings-name').textContent()) ?? '').includes('Quarto'), 'o cartão de "Quarto" abre a tela de "Quarto"')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    assert(((await page.locator('.source-card.tv-focus').textContent()) ?? '').includes('Quarto'), 'RETURN devolve o foco ao cartão de "Quarto"')
    assert((await page.locator('.add-card').count()) === 1, 'tela de perfis intacta')

    console.log('=== 067 FR-021: adicionar lista não pede PIN, mesmo com listas protegidas ===')
    await page.locator('.add-card').click()
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    assert((await page.getByRole('dialog', { name: 'Digite o PIN', exact: true }).count()) === 0, 'o cadastro abre direto')

    console.log('=== US1/AC7: excluir a lista ATIVA pela tela dela cai nos perfis, sem lista ativa e sem tela em branco ===')
    await page.keyboard.press('Escape') // cadastro -> perfis
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.locator('.source-card', { hasText: 'Sala' }).click() // "Sala" volta a ser a ativa
    await page.waitForSelector('.home-content', { timeout: 10000 })
    await openSettings(page)
    await configure(page, 'Sala')
    await page.getByRole('button', { name: 'Excluir', exact: true }).click()
    await page.getByRole('dialog', { name: 'Excluir a lista Sala?' }).getByRole('button', { name: 'Excluir', exact: true }).click()
    await dialog(page, 'Digite o PIN') // "Sala" tem PIN: excluir pede o PIN dela
    await typePin(page, '2222')
    await page.waitForSelector('.add-card', { timeout: 10000 })
    assert((await page.locator('.list-settings-screen').count()) === 0, 'a tela da lista excluída não fica aberta')
    assert((await page.locator('.source-card', { hasText: 'Sala' }).count()) === 0, '"Sala" saiu da tela de perfis')
    assert((await page.locator('.source-card', { hasText: 'Quarto' }).count()) === 1, '"Quarto" continua cadastrada')
    assert((await page.locator('.topbar').count()) === 0, 'sem lista ativa: perfis como tela base (sem topbar)')

    const leaked = consoleLines.filter((line) => /1111|2222/.test(line))
    assert(leaked.length === 0, 'nenhum PIN no console')
    assert(pageErrors.length === 0, `sem erro de página (${pageErrors.join(' | ')})`)
  } catch (error) {
    failures += 1
    console.error(`  ✗ ERRO: ${error?.stack ?? error}`)
  } finally {
    await browser.close()
    server.close()
  }
  if (failures > 0) {
    console.error(`\n${failures} falha(s).`)
    process.exit(1)
  }
  console.log('\nTudo certo.')
}

run()
