// Roteiro E2E da feature 054 (idioma do app) — gate da constitution
// ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre: trocar o idioma PELA interface (Configurações › Acessibilidade &
// sistema › Idioma), a persistência depois de recarregar, e que a interface
// inteira (perfis, Início, TV ao vivo, Filmes, Séries, Busca, Configurações e a
// camada do player) deixa de mostrar português — em English e em Español — sem
// tocar nos nomes declarados pela lista do provedor (SC-005).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`fixtures/favoritos.m3u`), servidos por um HTTP server
// local criado por este próprio script — nunca uma fonte real.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'favoritos.m3u')
const APP_URL = 'http://localhost:5173'
const LANGUAGE_KEY = 'ccplaytv:app-language'

/** Nomes que vêm da lista do provedor (fixture) — nunca traduzidos, nunca contam como "português do app". */
const PROVIDER_TEXT = /Canais Teste|Filmes Teste|Séries Teste|Canal (Alfa|Beta)|Filme Exemplo \w+|Série Exemplo[^\n]*|Fonte E2E[^\n]*/g

/** Termos que só existem em português (nem en nem es compartilham a grafia). */
const PT_ONLY = [
  'Configurações',
  'Voltar',
  'Histórico',
  'Início',
  'Séries',
  'Filmes',
  'Canais',
  'Em breve',
  'Tentar de novo',
  'Carregando',
  'Nenhum',
  'Acessibilidade',
  'Selecionar',
  'Sem categoria',
  'Cancelar',
]
/** Termos extras que o português divide com o espanhol: só valem em English. */
const PT_ES_SHARED = ['Favoritos', 'Buscar', 'Idioma', 'Ao vivo']

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

/** Procura português do app no texto visível (provedor removido) e reporta cada termo achado. */
async function scan(page, tela, lang, seletor = 'body') {
  const texto = await page.locator(seletor).first().innerText()
  const semProvedor = texto.replace(PROVIDER_TEXT, ' ')
  const termos = lang === 'en' ? [...PT_ONLY, ...PT_ES_SHARED] : PT_ONLY
  const achados = termos.filter((termo) => new RegExp(`(^|[^\\p{L}])${termo}($|[^\\p{L}])`, 'u').test(semProvedor))
  assert(achados.length === 0, `${tela} (${lang}): sem português do app${achados.length ? ` — achou: ${achados.join(', ')}` : ''}`)
}

async function paraInicio(page) {
  await page.goto(APP_URL)
  await page.waitForSelector('.source-card, .home-content', { timeout: 15000 })
  if (await page.locator('.source-card').first().isVisible().catch(() => false)) await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 10000 })
}

/** Da Home, vai ao destino da topbar (índice: home 0, live 1, movies 2, series 3, [um item "Em breve" 4], search 5, settings 6). */
async function viaTopbar(page, indice) {
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < indice; i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Abre Configurações › Acessibilidade & sistema › Idioma e escolhe a opção `posicao` (0 pt, 1 en, 2 es). */
async function escolherIdiomaPelaInterface(page, posicao) {
  await paraInicio(page)
  await viaTopbar(page, 6)
  await page.waitForSelector('.settings-screen', { timeout: 8000 })
  // Configurações abre com a trilha em "Fontes IPTV": duas descidas chegam a Acessibilidade & sistema.
  await page.keyboard.press('ArrowDown') // -> Player
  await page.keyboard.press('ArrowDown') // -> Acessibilidade
  await page.keyboard.press('ArrowRight') // entra no painel (linha 0: Reduzir movimento)
  await page.waitForSelector('.accessibility-panel-toggle.tv-focus', { timeout: 4000 })
  await page.keyboard.press('ArrowDown') // linha 1: Idioma
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="radiogroup"]', { timeout: 4000 })
  // O seletor abre focado na opção atual (pt = 0): desce até a posição pedida a partir do que está marcado.
  const atual = await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].findIndex((el) => el.classList.contains('tv-focus')))
  for (let i = atual; i < posicao; i += 1) await page.keyboard.press('ArrowDown')
  for (let i = atual; i > posicao; i -= 1) await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="radiogroup"]', { state: 'detached', timeout: 4000 })
}

async function percorrer(page, lang) {
  console.log(`=== Telas em ${lang} ===`)
  await page.goto(APP_URL)
  await page.waitForSelector('.source-card', { timeout: 15000 })
  await scan(page, 'Perfis (listas)', lang)

  await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 10000 })
  await scan(page, 'Início', lang)

  await viaTopbar(page, 1)
  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
  await scan(page, 'TV ao vivo', lang)
  await page.keyboard.press('Enter') // entra na categoria
  await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
  assert(
    (await page.locator('.live-column-channels .live-item-name').first().textContent()) === 'Canal Alfa',
    `nome do canal do provedor intacto em ${lang} ("Canal Alfa")`,
  )
  await page.keyboard.press('Enter') // abre o player (a URL da fixture não responde: cai no erro traduzido)
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
  await page.waitForTimeout(2500)
  await scan(page, 'Player', lang, '[role="dialog"]')
  await page.keyboard.press('Escape')

  await paraInicio(page)
  await viaTopbar(page, 2)
  await page.waitForSelector('.side-category-nav-item', { timeout: 8000 })
  await scan(page, 'Filmes', lang)

  await paraInicio(page)
  await viaTopbar(page, 3)
  await page.waitForSelector('.side-category-nav-item', { timeout: 8000 })
  await scan(page, 'Séries', lang)

  await paraInicio(page)
  await viaTopbar(page, 5)
  await page.waitForSelector('.search-screen', { timeout: 8000 })
  await scan(page, 'Busca', lang)

  await paraInicio(page)
  await viaTopbar(page, 6)
  await page.waitForSelector('.settings-screen', { timeout: 8000 })
  await scan(page, 'Configurações', lang)
}

async function run() {
  const server = await startFixtureServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/favoritos.m3u`

  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const context = await browser.newContext({ locale: 'pt-BR' })
  const page = await context.newPage()

  try {
    console.log('=== Adicionar fonte M3U fictícia (idioma padrão: o da TV, pt-BR) ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
    await cadastrarListaM3u(page, { nome: 'Fonte E2E Idioma', url: m3uUrl })
    await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
    assert((await page.evaluate(() => document.documentElement.lang)).startsWith('pt'), 'idioma padrão segue a TV (<html lang="pt…">)')

    console.log('=== Trocar para English pela interface ===')
    await escolherIdiomaPelaInterface(page, 1)
    assert((await page.evaluate((key) => window.localStorage.getItem(key), LANGUAGE_KEY)) === 'en', 'English gravado como preferência do aparelho')
    assert((await page.evaluate(() => document.documentElement.lang)).startsWith('en'), '<html lang="en-US"> logo após a troca')
    await scan(page, 'Configurações (logo após a troca, sem recarregar)', 'en')
    await percorrer(page, 'en')

    console.log('=== A escolha sobrevive a reabrir o app ===')
    await page.reload()
    await page.waitForSelector('.source-card', { timeout: 15000 })
    assert((await page.evaluate(() => document.documentElement.lang)).startsWith('en'), 'depois de recarregar continua em English')

    console.log('=== Trocar para Español pela interface ===')
    await escolherIdiomaPelaInterface(page, 2)
    assert((await page.evaluate((key) => window.localStorage.getItem(key), LANGUAGE_KEY)) === 'es', 'Español gravado como preferência do aparelho')
    await percorrer(page, 'es')

    console.log('=== Voltar para Português ===')
    await escolherIdiomaPelaInterface(page, 0)
    assert((await page.evaluate((key) => window.localStorage.getItem(key), LANGUAGE_KEY)) === 'pt', 'Português gravado de volta')
    await paraInicio(page)
    assert((await page.locator('body').innerText()).includes('Início'), 'a interface voltou ao português')
  } catch (error) {
    failures += 1
    console.error(`  ✗ ERRO: ${error instanceof Error ? error.message : String(error)}`)
    await page.screenshot({ path: 'idioma-do-app-falha.png' }).catch(() => undefined)
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

run()
