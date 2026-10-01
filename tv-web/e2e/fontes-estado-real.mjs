// Roteiro REAL da feature 034 (SC-006) — mantido fora de `test:e2e`, como os
// `*-real.mjs` das features 030/031/032: lê a lista real do `.env` da raiz
// (`CCPLAY_PROBE_DNS/USER/PASS`), pergunta ao painel qual é o `exp_date` da
// conta e confere que a linha de Configurações do app mostra a MESMA data
// (ou "Sem data de vencimento"), e imprime a contagem de categorias que o app
// exibe para a lista.
//
// Imprime SÓ a data derivada, "confere sim/não" e contagens: nunca o
// endereço, o usuário, a senha nem a resposta crua do painel (constitution e
// memória do projeto). A lista é cadastrada num navegador descartável.
//
// Uso: `npm run dev` rodando e `node e2e/fontes-estado-real.mjs`.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = 'http://localhost:5173'
const LIST_NAME = 'Lista Real 034'

function loadEnv() {
  const env = {}
  for (const line of readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line)
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv()
let dns = env.CCPLAY_PROBE_DNS
if (!dns || !env.CCPLAY_PROBE_USER || !env.CCPLAY_PROBE_PASS) {
  console.error('Faltam CCPLAY_PROBE_DNS/USER/PASS no .env da raiz.')
  process.exit(2)
}
if (!/^https?:\/\//.test(dns)) dns = `http://${dns}`
dns = dns.replace(/\/+$/, '')

const formatDate = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** O que o painel declara, derivado com a mesma regra do app (`parseExpDate`: segundos Unix, ≤ 0 = sem data). */
async function declaredByPanel() {
  const query = new URLSearchParams({ username: env.CCPLAY_PROBE_USER, password: env.CCPLAY_PROBE_PASS })
  const response = await fetch(`${dns}/player_api.php?${query}`, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`o provedor respondeu ${response.status}`)
  const info = (await response.json())?.user_info ?? {}
  const seconds = Number(typeof info.exp_date === 'string' ? info.exp_date.trim() : info.exp_date)
  const expiresAt = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null
  return { expiresAt, authorized: [1, '1', true, 'true'].includes(info.auth) }
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

let failures = 0
const expected = await declaredByPanel()
const expectedText = expected.expiresAt === null ? 'Sem data de vencimento' : formatDate(expected.expiresAt)
console.log(`Painel declara: ${expected.expiresAt === null ? 'sem data de vencimento' : `vencimento em ${expectedText}`}; credencial ${expected.authorized ? 'aceita' : 'RECUSADA'}.`)

const browser = await launchBrowser()
try {
  const page = await (await browser.newContext()).newPage()
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 15000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaXtream(page, { nome: LIST_NAME, servidor: dns, usuario: env.CCPLAY_PROBE_USER, senha: env.CCPLAY_PROBE_PASS })
  // A importação de uma lista real pode demorar; vencida/recusada falha e ainda grava a conta.
  await page.waitForSelector('text=/Concluída|Tentar novamente/', { timeout: 240_000 })
  await page.getByRole('button', { name: 'Voltar' }).first().click()
  await page.waitForSelector('.source-card', { timeout: 10000 })
  await page.getByRole('button', { name: /Configurações/ }).click()
  const row = page.locator('.sources-panel-row', { hasText: LIST_NAME })
  await row.waitFor({ timeout: 10000 })
  await page.waitForTimeout(1500) // as contagens leem o disco depois de a linha aparecer
  const text = (await row.textContent()) ?? ''

  const shown = /(?:Conta válida até|Conta expirada em) (\d{2}\/\d{2}\/\d{4})/.exec(text)?.[1] ?? (text.includes('Sem data de vencimento') ? 'Sem data de vencimento' : null)
  const matches = shown === expectedText
  console.log(`App mostra: ${shown ?? '(nenhum texto de vencimento)'} — confere com o painel: ${matches ? 'SIM' : 'NÃO'}.`)
  if (!matches) failures += 1

  const countsText = (await row.locator('.sources-panel-counts').textContent().catch(() => null))?.trim() ?? null
  console.log(`Contagem exibida: ${countsText ?? '(nenhuma)'}`)
  if (/\b0 (?:de |categorias|canais|filmes|séries)/.test(text)) {
    console.error('  ✗ FALHOU: apareceu uma contagem "0" (FR-018).')
    failures += 1
  }
} finally {
  await browser.close()
}

if (failures > 0) {
  console.error(`\n${failures} verificação(ões) falharam.`)
  process.exit(1)
}
console.log('\nSC-006 conferido.')
