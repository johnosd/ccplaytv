// Roteiro E2E da feature 047 contra a lista REAL do `.env` da raiz
// (`CCPLAY_PROBE_USER/PASS/DNS`) — o que a fixture fictícia de
// `player-dev-mpegts.mjs` não substitui: painel Xtream real, canais reais,
// SC-002 (tempo até tocar) e SC-003 (conexões residuais em 10 trocas).
//
// **Fora do `npm run test:e2e` de propósito**: depende de rede, de um painel
// de terceiros e de credenciais locais. Roda sob demanda:
//
//   npm run dev                              (em outro terminal)
//   node e2e/player-dev-mpegts-real.mjs
//
// **Segredos** (constitution; ADR-008/ADR-010): o `.env` é lido em tempo de
// execução e NUNCA impresso. A saída só tem contagens, milissegundos e nomes
// de etapa — sem endereço, usuário, senha, URL nem nome de canal. Sem captura
// de tela e sem dump de console. Sem `.env`, PULA com aviso.
//
// Honestidade (FR-011): isto prova o caminho de DEV no Chromium — nada sobre
// o AVPlay, o codec ou o desempenho da TV.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')
const APP_URL = 'http://localhost:5173'
const SOURCE_NAME = 'Fonte real E2E TS 047'
const START_BUDGET_MS = 15000
const SWITCHES = 10

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

function readEnv() {
  if (!existsSync(ENV_PATH)) return null
  const entries = readFileSync(ENV_PATH, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
  return Object.fromEntries(entries)
}

async function waitFor(predicate, timeoutMs, stepMs = 100) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
  return false
}

const isReallyPlaying = (page) =>
  page.evaluate(() => {
    const v = document.querySelector('video.player-video')
    return Boolean(v) && v.readyState >= 3 && v.currentTime > 0.5 && !v.paused
  })

async function run() {
  const env = readEnv()
  const dns = env?.CCPLAY_PROBE_DNS
  const user = env?.CCPLAY_PROBE_USER
  const pass = env?.CCPLAY_PROBE_PASS
  if (!dns || !user || !pass) {
    console.log('PULADO: `.env` da raiz sem CCPLAY_PROBE_DNS/USER/PASS — nada a testar com dado real.')
    return
  }

  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
  // Só o NOME do erro: a mensagem de uma falha de rede embute a URL com credencial.
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error'))

  // Requisições de stream abertas: iniciadas − (terminadas + falhas/abortadas). Só a contagem é usada.
  const open = new Set()
  const isStream = (request) => /\/(live|auth)\//.test(request.url()) && request.resourceType() !== 'document'
  page.on('request', (request) => {
    if (isStream(request)) open.add(request)
  })
  page.on('requestfinished', (request) => open.delete(request))
  page.on('requestfailed', (request) => open.delete(request))

  try {
    console.log('=== Adicionar a lista Xtream real ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaXtream(page, { nome: SOURCE_NAME, servidor: dns, usuario: user, senha: pass })
    await page.waitForSelector('text=/Concluída/', { timeout: 90000 })
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.topbar', { timeout: 15000 })
    await page.getByRole('button', { name: 'TV ao vivo', exact: true }).click()
    await page.waitForSelector('.live-column-groups', { timeout: 15000 })

    console.log('=== Abrir uma categoria com canais ===')
    let entered = false
    for (let attempt = 0; attempt < 6 && !entered; attempt += 1) {
      await page.keyboard.press('ArrowRight')
      entered = await page
        .waitForSelector('.live-column-channels .live-item-name', { timeout: 15000 })
        .then(() => true)
        .catch(() => false)
      if (!entered) {
        await page.keyboard.press('ArrowLeft')
        await page.keyboard.press('ArrowDown')
      }
    }
    assert(entered, 'uma categoria real com canais abriu')

    console.log('=== SC-002: um canal real chega a tocar ===')
    const startedAt = Date.now()
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    const playing = await waitFor(() => isReallyPlaying(page), START_BUDGET_MS)
    const startMs = Date.now() - startedAt
    console.log(`  (tempo até tocar: ${startMs} ms)`)
    assert(playing, `o primeiro canal chegou a tocar em ${START_BUDGET_MS} ms ou menos`)

    console.log(`=== SC-003: ${SWITCHES} trocas de canal, conexões residuais ===`)
    let played = 0
    let worstOpen = 0
    const times = []
    for (let i = 0; i < SWITCHES; i += 1) {
      await page.keyboard.press('Enter') // lista de zapping
      await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
      await page.keyboard.press(i % 2 === 0 ? 'ArrowDown' : 'ArrowUp')
      const swapStart = Date.now()
      await page.keyboard.press('Enter')
      const closed = await page
        .waitForSelector('.player-zap-columns', { state: 'detached', timeout: START_BUDGET_MS })
        .then(() => true)
        .catch(() => false)
      if (!closed) {
        // Canal que não tocou: a lista fica aberta; fecha para seguir, a troca conta como "não tocou".
        await page.keyboard.press('Escape')
        await page.waitForSelector('.player-zap-columns', { state: 'detached', timeout: 8000 }).catch(() => {})
      } else if (await waitFor(() => isReallyPlaying(page), START_BUDGET_MS)) {
        played += 1
        times.push(Date.now() - swapStart)
      }
      await waitFor(() => open.size <= 1, 3000)
      worstOpen = Math.max(worstOpen, open.size)
    }
    const sorted = [...times].sort((a, b) => a - b)
    console.log(`  (trocas que tocaram: ${played}/${SWITCHES}; mediana ${sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0} ms; pior caso de conexões abertas: ${worstOpen})`)
    assert(played >= SWITCHES - 2, `ao menos ${SWITCHES - 2} das ${SWITCHES} trocas terminaram tocando (canais reais indisponíveis podem falhar)`)
    assert(worstOpen <= 1, `no máximo uma conexão de stream aberta depois de cada troca (pior caso: ${worstOpen})`)

    console.log('=== RETURN fecha sem nada residual ===')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(await waitFor(() => open.size === 0, 5000), `nenhuma conexão de stream aberta depois de fechar (${open.size})`)
    assert((await page.locator('video').count()) === 0, 'nenhum <video> restante depois de fechar')
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error?.name ?? 'Error')
  } finally {
    await browser.close()
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
