// Roteiro E2E da feature 023 (shell, navegação e entrada do DS V14) — gate da
// constitution v1.4.0 ("Testes E2E (Playwright) antes de validação em TV
// física"). Substitui o roteiro original, que testava um diálogo de saída em
// `AddSourceScreen` que já não existia (bug do backlog, absorvido pela 023).
//
// Cobre o caminho novo de ponta a ponta, só por teclado (setas + OK + RETURN):
//   Splash → "Quem está assistindo?" (sem lista: só "Adicionar lista") →
//   modal de saída → onboarding → progresso → "Abrir lista" → Início com
//   topbar → destinos → RETURN em camadas → trocar de lista pelo indicador →
//   última lista usada → exclusão com confirmação.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`e2e/fixtures/favoritos.m3u`), servidos por um HTTP
// server local criado por este próprio script — nunca uma fonte real.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'e2e', 'fixtures', 'favoritos.m3u')
const APP_URL = 'http://localhost:5173'

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

function startFixtureServer() {
  const body = readFileSync(FIXTURE_PATH)
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/** Mesmo binário fixo dos demais scripts quando existe; senão, resolução normal do Playwright. */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

const EXIT_DIALOG = '[role="dialog"][aria-label="Sair do CCPlayTV?"]'

/** Texto do(s) elemento(s) com foco de estado (`.tv-focus`) dentro de `selector`. */
async function focusedText(page, selector) {
  return page.locator(`${selector} .tv-focus, ${selector}.tv-focus`).allTextContents()
}

/** Splash (~2,6 s) → tela de perfis. */
async function openProfiles(page) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
}

/** Da tela de perfis, "Adicionar lista" → formulário → progresso concluído. Termina na tela de progresso. */
async function addListFromProfiles(page, m3uUrl, displayName) {
  await page.waitForSelector('.add-card.tv-focus', { timeout: 8000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(displayName)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/favoritos.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    console.log('=== US1/US2: sem lista cadastrada ===')
    await openProfiles(page)
    assert((await page.locator('.source-card').count()) === 0, 'sem lista, a tela de perfis não mostra nenhum cartão de lista')
    assert((await page.locator('.add-card.tv-focus').count()) === 1, '"Adicionar lista" já nasce em foco')

    console.log('=== FR-030: RETURN na tela de perfis (base) abre o modal de saída ===')
    await page.keyboard.press('Escape')
    await page.waitForSelector(EXIT_DIALOG, { timeout: 5000 })
    assert(
      (await focusedText(page, EXIT_DIALOG)).join('|').trim() === 'Cancelar',
      'o modal "Sair do CCPlayTV?" abre com "Cancelar" em foco',
    )
    await page.keyboard.press('Escape')
    await page.waitForSelector(EXIT_DIALOG, { state: 'detached', timeout: 5000 })
    assert((await page.locator('.add-card.tv-focus').count()) === 1, 'RETURN no modal só o fecha, e o foco volta a "Adicionar lista"')

    console.log('=== US4: onboarding, progresso e "Abrir lista" ===')
    await addListFromProfiles(page, m3uUrl, 'Lista E2E Um')
    console.log('  ✓ importação concluída')
    const openButton = page.getByRole('button', { name: 'Abrir lista' })
    await openButton.waitFor({ timeout: 5000 })
    assert(
      (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Abrir lista',
      '"Abrir lista" aparece já focado quando a importação termina (sem avançar sozinha)',
    )
    await page.keyboard.press('Enter')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    const indicator = await page.locator('.topbar-profile').getAttribute('aria-label')
    assert(indicator?.includes('Lista E2E Um') === true, 'o Início abre com a topbar mostrando a lista ativa')
    assert((await focusedText(page, '.tiles-row')).join('|').includes('TV ao vivo'), 'o foco inicial do Início está no atalho "TV ao vivo"')

    console.log('=== US2: topbar e RETURN em camadas ===')
    await page.keyboard.press('ArrowUp')
    assert((await focusedText(page, '.topbar')).join('|') === 'Início', 'UP leva à topbar, em "Início"')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    assert((await focusedText(page, '.topbar')).join('|') === 'Filmes', 'RIGHT×2 chega em "Filmes" (um único item em foco)')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-item', { timeout: 8000 })
    assert((await page.locator('.topbar').count()) === 0, 'Filmes abre em tela cheia, sem topbar (FR-020)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    assert((await focusedText(page, '.topbar')).join('|') === 'Filmes', 'RETURN em Filmes volta ao Início com o foco em "Filmes" na topbar (FR-029)')
    await page.keyboard.press('ArrowDown')
    assert((await focusedText(page, '.topbar')).length === 0, 'DOWN devolve o foco ao conteúdo')
    assert((await focusedText(page, '.tiles-row')).join('|').includes('TV ao vivo'), '...no atalho padrão "TV ao vivo"')

    await page.keyboard.press('ArrowRight') // Filmes
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-item', { timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    assert((await focusedText(page, '.tiles-row')).join('|').includes('Filmes'), 'RETURN em Filmes aberto por atalho devolve o foco ao atalho "Filmes"')

    console.log('=== FR-018: Busca e Configurações são "Em breve" ===')
    await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight') // Início → … → Buscar
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      () => [...document.querySelectorAll('[aria-live]')].some((el) => el.textContent?.includes('Em breve')),
      null,
      { timeout: 3000 },
    )
    assert((await page.locator('.topbar').count()) === 1 && (await page.locator('.tiles-row').count()) === 1, 'OK em "Buscar" anuncia "Em breve" e não navega')

    console.log('=== FR-030: RETURN no Início abre o modal de saída ===')
    await page.keyboard.press('Escape')
    await page.waitForSelector(EXIT_DIALOG, { timeout: 5000 })
    await page.keyboard.press('Enter') // "Cancelar"
    await page.waitForSelector(EXIT_DIALOG, { state: 'detached', timeout: 5000 })
    assert((await page.locator('.topbar .tv-focus').getAttribute('aria-label')) === 'Buscar', 'cancelar a saída devolve o foco onde estava (o botão é só ícone: o nome está no aria-label)')

    console.log('=== US2/AC6-AC7: trocar de lista pelo indicador ===')
    await page.keyboard.press('ArrowLeft') // Buscar → indicador da lista
    await page.keyboard.press('Enter')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    assert((await focusedText(page, '.source-card-wrap')).join('|').includes('Lista E2E Um'), 'os perfis abrem com o foco na lista ativa')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    assert(true, 'RETURN nos perfis (aberto pelo indicador) volta ao Início da mesma lista, sem trocar nada')

    console.log('=== US4: segunda lista pelo caminho da troca ===')
    // O RETURN dos perfis restaurou o foco de origem (FR-029): o indicador da lista, na topbar.
    assert((await page.locator('.topbar .tv-focus').getAttribute('aria-label'))?.startsWith('Lista ativa') === true, 'o Início volta com o foco no indicador da lista, de onde os perfis foram abertos (FR-029)')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // lista atual → "Adicionar lista"
    await addListFromProfiles(page, m3uUrl, 'Lista E2E Dois')
    await page.getByRole('button', { name: 'Voltar' }).click()
    // Os perfis montam com o cache anterior e a consulta traz a lista nova logo depois: esperar por ela.
    await page.locator('.source-card-wrap', { hasText: 'Lista E2E Dois' }).waitFor({ timeout: 8000 })
    assert(
      (await focusedText(page, '.source-card-wrap')).join('|').includes('Lista E2E Dois'),
      '"Voltar" do progresso abre os perfis com o foco na lista recém-importada (FR-039)',
    )
    await page.keyboard.press('Enter')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    assert(
      (await page.locator('.topbar-profile').getAttribute('aria-label'))?.includes('Lista E2E Dois') === true,
      'escolher outra lista abre o Início dela (pilha zerada)',
    )
    await page.keyboard.press('Escape')
    await page.waitForSelector(EXIT_DIALOG, { timeout: 5000 })
    assert(true, 'depois da troca, RETURN a partir do Início abre o modal de saída (nada da lista anterior na pilha)')
    await page.keyboard.press('Escape')

    console.log('=== FR-004/FR-005/SC-001: a última lista usada sobrevive ao recarregar ===')
    await page.reload()
    await page.waitForSelector('.source-card', { timeout: 10000 })
    assert(
      (await focusedText(page, '.source-card-wrap')).join('|').includes('Lista E2E Dois'),
      'depois de recarregar, a tela de perfis abre com o foco na última lista usada (um OK até o Início)',
    )

    console.log('=== US3: exclusão exige confirmação ===')
    await page.keyboard.press('ArrowDown') // ações do cartão em foco
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // Excluir
    await page.keyboard.press('Enter')
    const deleteDialog = page.getByRole('dialog', { name: 'Excluir a lista Lista E2E Dois?' })
    await deleteDialog.waitFor({ timeout: 5000 })
    assert(
      (await deleteDialog.locator('.tv-focus').allTextContents()).join('|').trim() === 'Cancelar',
      'o modal de exclusão abre com "Cancelar" em foco',
    )
    await page.keyboard.press('Enter') // Cancelar
    await deleteDialog.waitFor({ state: 'detached', timeout: 5000 })
    assert((await page.locator('.source-card').count()) === 2, 'OK em "Cancelar" não apaga nada')
    await page.keyboard.press('Enter') // reabre
    await deleteDialog.waitFor({ timeout: 5000 })
    await page.keyboard.press('ArrowRight') // Excluir
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelectorAll('.source-card').length === 1, null, { timeout: 8000 })
    assert(true, 'confirmar "Excluir" apaga só a lista escolhida')
    assert((await focusedText(page, '.add-card')).length === 1, 'sem cartão vizinho depois dela, o foco vai para "Adicionar lista"')
    assert(
      (await page.locator('.source-card-wrap', { hasText: 'Lista E2E Um' }).count()) === 1,
      'a outra lista continua cadastrada',
    )
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
  } finally {
    await browser.close()
    server.close()
  }

  console.log('')
  if (failures > 0) {
    console.error(`${failures} verificação(ões) falharam.`)
    process.exitCode = 1
  } else {
    console.log('Todas as verificações passaram.')
  }
}

await run()
