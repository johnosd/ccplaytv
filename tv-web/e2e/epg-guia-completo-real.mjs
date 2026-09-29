// Roteiro E2E da feature 031 (Guia completo) contra a lista e o EPG REAIS do
// `.env` da raiz (`CCPLAY_PROBE_USER/PASS/DNS`) — a passada "com dado de
// verdade" que os fictícios de `epg-guia-completo.mjs` não substituem: painel
// Xtream real, XMLTV real (esparso: poucos canais com programa — R-001),
// milhares de canais em "Todos" (R-003, desempenho).
//
// **Fora do `npm run test:e2e` de propósito**: depende de rede, de um painel
// de terceiros e de credenciais locais. Roda sob demanda:
//
//   npm run dev                          (em outro terminal)
//   node e2e/epg-guia-completo-real.mjs
//
// **Segredos** (constitution; ADR-008/ADR-010): o `.env` é lido em tempo de
// execução e NUNCA impresso. A saída só tem contagens, milissegundos e nomes
// de etapa — sem endereço, usuário, senha, nome de canal ou de programa reais.
// Sem captura de tela e sem dump de console. Sem `.env`, PULA com aviso.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')
const APP_URL = 'http://localhost:5173'
const SOURCE_NAME = 'Fonte real E2E Guia'
const MAX_CATEGORIES_TRIED = 12
/** Quantos canais se percorre (↓) no guia procurando um com programação. */
const MAX_GUIDE_ROWS_SCANNED = 160
/** Orçamento de "uma tecla → foco atualizado" no guia com muitos canais (R-003). */
const KEY_BUDGET_MS = 250

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

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

/** Tempo até o `.tv-focus` do guia mudar de lugar depois de uma tecla. */
async function timedKey(page, key) {
  const before = await page.evaluate(() => {
    const el = document.querySelector('.epg-guide-block.tv-focus')
    return el ? el.getBoundingClientRect().top + '|' + (el.textContent ?? '') : ''
  })
  const start = Date.now()
  await page.keyboard.press(key)
  try {
    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector('.epg-guide-block.tv-focus')
        return el && el.getBoundingClientRect().top + '|' + (el.textContent ?? '') !== prev
      },
      before,
      { timeout: 2000 },
    )
  } catch {
    // Sem mudança visível (limite da lista): não conta como amostra.
    return null
  }
  return Date.now() - start
}

async function run() {
  const env = readEnv()
  const dns = env?.CCPLAY_PROBE_DNS
  const user = env?.CCPLAY_PROBE_USER
  const pass = env?.CCPLAY_PROBE_PASS
  if (!dns || !user || !pass) {
    console.log('PULADO: `.env` da raiz sem CCPLAY_PROBE_DNS/USER/PASS — nada a testar com dado real.')
    return
  }

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  // Só o NOME do erro: a mensagem de uma falha de rede embute a URL com credencial.
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error'))

  try {
    console.log('=== Adicionar a lista Xtream real ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await page.getByText('Endereço, usuário e senha', { exact: true }).click()
    await page.getByLabel('Nome de exibição').fill(SOURCE_NAME)
    await page.getByLabel('Endereço do servidor (DNS do provedor)').fill(dns)
    await page.getByLabel('Usuário', { exact: true }).fill(user)
    await page.getByLabel('Senha', { exact: true }).fill(pass)
    await page.getByRole('button', { name: 'Adicionar lista' }).click()
    await page.waitForSelector('text=/Concluída/', { timeout: 60000 })
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.topbar', { timeout: 10000 })
    assert(true, 'lista real importada')

    console.log('=== EPG sincroniza sozinho ===')
    await page.getByRole('button', { name: 'Configurações', exact: true }).click()
    await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })
    let linked = false
    try {
      await page.waitForFunction(() => /EPG vinculado/.test(document.querySelector('.sources-panel-epg')?.textContent ?? ''), undefined, { timeout: 120000 })
      linked = true
    } catch {
      linked = false
    }
    assert(linked, 'a lista chega a "EPG vinculado" com o XMLTV real')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== Abrir o guia do preview e percorrer categorias reais até achar programação (R-001/R-003) ===')
    await page.getByRole('button', { name: 'TV ao vivo', exact: true }).click()
    await page.waitForSelector('.live-column-groups', { timeout: 10000 })
    const samples = []
    let withProgramme = 0
    let rowsSeen = 0
    let categoriesTried = 0
    let openedGrid = 0
    for (; categoriesTried < MAX_CATEGORIES_TRIED && withProgramme === 0; categoriesTried += 1) {
      await page.keyboard.press('ArrowRight') // entra na categoria em foco
      await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1500)
      await page.keyboard.press('ArrowRight') // preview
      await page.waitForSelector('.live-preview-action.tv-focus', { timeout: 4000 })
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      const openStart = Date.now()
      await page.keyboard.press('Enter')
      await page.waitForSelector('.epg-guide', { timeout: 8000 })
      const stateOrGrid = await page.waitForSelector('.epg-guide-grid, .epg-guide-state', { timeout: 15000 })
      if ((await stateOrGrid.getAttribute('class'))?.includes('epg-guide-grid')) {
        openedGrid += 1
        if (openedGrid === 1) {
          console.log(`  (guia aberto em ${Date.now() - openStart} ms)`)
          assert((await page.locator('.tv-focus').count()) === 1, 'exatamente um .tv-focus no guia')
        }
        for (let i = 0; i < MAX_GUIDE_ROWS_SCANNED; i += 1) {
          const ms = await timedKey(page, 'ArrowDown')
          if (ms === null) break
          samples.push(ms)
          rowsSeen += 1
          const focusedText = (await page.locator('.epg-guide-block.tv-focus').first().textContent()) ?? ''
          if (!focusedText.includes('Sem programação')) {
            withProgramme += 1
            break
          }
        }
      }
      if (withProgramme > 0) break
      await page.keyboard.press('Escape') // fecha o guia: volta ao canal de origem
      await page.waitForSelector('.epg-guide', { state: 'detached', timeout: 4000 })
      await page.keyboard.press('ArrowLeft') // canal → trilha
      await page.keyboard.press('ArrowDown') // próxima categoria
    }
    console.log(`  (categorias tentadas: ${categoriesTried + (withProgramme > 0 ? 1 : 0)}; com grade: ${openedGrid}; linhas percorridas: ${rowsSeen}; canais com programa: ${withProgramme}; p50 ${percentile(samples, 0.5)} ms; p95 ${percentile(samples, 0.95)} ms)`)
    assert(openedGrid > 0, 'o guia mostra a grade (a lista real tem EPG vinculado)')
    assert(rowsSeen > 0, 'o guia percorre canais reais com ↓')
    assert(percentile(samples, 0.95) <= KEY_BUDGET_MS, `p95 de "tecla → foco" dentro de ${KEY_BUDGET_MS} ms nas categorias reais`)
    if (withProgramme > 0) {
      const detail = (await page.locator('.epg-guide-detail').innerText()).trim()
      assert(detail.length > 0 && !detail.includes('Sem programação'), 'um canal real com programa mostra o painel de detalhe preenchido')
      assert((await page.locator('.epg-guide-block.is-now, .epg-guide-block.tv-focus').count()) >= 1, 'a linha do canal com programa desenha blocos reais')
      assert((await page.locator('.tv-focus').count()) === 1, 'foco único no canal com programa real')
    } else {
      console.log('  (nenhuma das categorias tentadas tem programa na janela — esperado com o XMLTV esparso, R-001)')
    }
    console.log('=== "Todos": milhares de canais, cobertura e desempenho ===')
    await page.keyboard.press('ArrowUp') // até a barra: sobe linha a linha seria lento, então usa CH−
    for (let i = 0; i < 400; i += 1) {
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ChannelUp', bubbles: true })))
      const atTop = await page.evaluate(() => {
        const el = document.querySelector('.epg-guide-block.tv-focus')
        return el ? el.getBoundingClientRect().top < 300 : false
      })
      if (atTop) break
    }
    await page.keyboard.press('ArrowUp')
    const selectorFocused = await page.evaluate(() => document.querySelector('.epg-guide-selector')?.classList.contains('tv-focus') ?? false)
    if (!selectorFocused) await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.epg-guide-selector-panel', { timeout: 4000 })
    await page.keyboard.press('ArrowUp') // categoria → "Todos" (ou Favoritos → Todos, conforme a posição)
    const focusedEntry = (await page.locator('.epg-guide-selector-entry.tv-focus').textContent()) ?? ''
    if (focusedEntry !== 'Todos') await page.keyboard.press(focusedEntry.startsWith('★') ? 'ArrowDown' : 'ArrowUp')
    const todosStart = Date.now()
    await page.keyboard.press('Enter')
    await page.waitForSelector('.epg-guide-coverage', { timeout: 20000 })
    console.log(`  ("Todos" pronto em ${Date.now() - todosStart} ms)`)
    const coverage = /Guia de (\d+) de (\d+) categorias/.exec((await page.locator('.epg-guide-coverage').textContent()) ?? '')
    assert(coverage !== null, `"Todos" mostra a cobertura (${coverage ? `${coverage[1]} de ${coverage[2]}` : 'ausente'})`)
    const todosSamples = []
    for (let i = 0; i < 60; i += 1) {
      const ms = await timedKey(page, 'ArrowDown')
      if (ms !== null) todosSamples.push(ms)
    }
    console.log(`  ("Todos": ${todosSamples.length} passos; p50 ${percentile(todosSamples, 0.5)} ms; p95 ${percentile(todosSamples, 0.95)} ms)`)
    assert(todosSamples.length > 0, 'o guia em "Todos" percorre canais')
    assert(percentile(todosSamples, 0.95) <= KEY_BUDGET_MS, `p95 de "tecla → foco" em "Todos" dentro de ${KEY_BUDGET_MS} ms`)
  } catch (error) {
    failures += 1
    // Só o nome: a mensagem pode embutir a URL do painel (ADR-010).
    console.error('  ✗ EXCEÇÃO:', error?.name ?? 'Error')
  } finally {
    await browser.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTodas as verificações passaram.')
}

run()
