// Roteiro E2E da feature 030 contra a lista e o EPG REAIS do `.env` da raiz
// (`CCPLAY_PROBE_USER/PASS/DNS`) — a passada "com dado de verdade" que os
// fictícios de `epg-dados-agora.mjs` não substituem: painel Xtream real,
// `xmltv.php` real (~2 MB), `epg_channel_id` real casando por id exato.
//
// **Fora do `npm run test:e2e` de propósito**: depende de rede, de um painel
// de terceiros e de credenciais locais. Roda sob demanda:
//
//   npm run dev                       (em outro terminal)
//   node e2e/epg-dados-agora-real.mjs
//
// **Segredos** (constitution; ADR-008/ADR-010): o `.env` é lido em tempo de
// execução e NUNCA impresso. A saída só tem contagens e nomes de etapa — sem
// endereço, usuário, senha, nome de canal ou de programa reais. Não há
// captura de tela nem dump de console (uma linha de erro de rede do
// navegador embute a URL completa, com credencial). Sem `.env`, o roteiro
// PULA com aviso e sai com sucesso.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')
const APP_URL = 'http://localhost:5173'
const SOURCE_NAME = 'Fonte real E2E EPG'
/** Categorias de canais tentadas até achar uma com "Agora" (cada uma busca `get_live_streams` do painel). */
const MAX_CATEGORIES_TRIED = 8
/** Quantas linhas se rola (↓) em cada categoria antes de desistir dela. */
const MAX_ROWS_SCROLLED_PER_CATEGORY = 120

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
    console.log('=== Adicionar a lista Xtream real (estrutura só, feature 010) ===')
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

    console.log('=== EPG sincroniza sozinho, sem nenhuma configuração (SC-001) ===')
    await page.getByRole('button', { name: 'Configurações', exact: true }).click()
    await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })
    let linked = false
    try {
      await page.waitForFunction(
        () => /EPG vinculado/.test(document.querySelector('.sources-panel-epg')?.textContent ?? ''),
        undefined,
        { timeout: 120000 },
      )
      linked = true
    } catch {
      linked = false
    }
    assert(linked, 'a linha da lista chega a "EPG vinculado" com o XMLTV real do painel')
    if (!linked) {
      const state = (await page.locator('.sources-panel-epg').textContent().catch(() => null)) ?? '(sem estado)'
      console.error(`  estado exibido: ${state.replace(/https?:\/\/\S+/g, '<endereço>')}`)
    }

    console.log('=== "Agora" nos canais reais ===')
    await page.keyboard.press('Escape') // RETURN em Configurações → Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.getByRole('button', { name: 'TV ao vivo', exact: true }).click()
    await page.waitForSelector('.live-column-groups', { timeout: 10000 })

    // A lista é virtualizada (feature 009): só ~13 linhas ficam montadas, e o
    // XMLTV de um provedor real costuma ter programação para poucos canais
    // (o do painel de referência: 10 ids de canal na janela) — então o canal
    // com programa pode estar bem abaixo. Rola com ↓ até achar uma linha com
    // "Agora" (achado do diagnóstico de 2026-09-29: canais com programa nas
    // posições 19–23 e 69–73 de uma categoria).
    const countRows = () =>
      page.evaluate(() => {
        const all = [...document.querySelectorAll('.live-column-channels .channel-row')]
        return {
          rows: all.length,
          withNow: all.filter((row) => (row.querySelector('.channel-row-now')?.textContent ?? '') !== '').length,
        }
      })

    let withNow = 0
    let rows = 0
    let triedCategories = 0
    let scrolledRows = 0
    for (; triedCategories < MAX_CATEGORIES_TRIED && withNow === 0; triedCategories += 1) {
      await page.keyboard.press('ArrowRight') // entra na categoria em foco
      await page
        .waitForSelector('.live-column-channels .live-item-name', { timeout: 15000 })
        .catch(() => {})
      await page.waitForTimeout(2500) // leitura do EPG do aparelho + render
      scrolledRows = 0
      for (;;) {
        ;({ rows, withNow } = await countRows())
        if (withNow > 0 || scrolledRows >= MAX_ROWS_SCROLLED_PER_CATEGORY) break
        for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown')
        scrolledRows += 4
        await page.waitForTimeout(60)
      }
      if (withNow === 0) {
        await page.keyboard.press('ArrowLeft') // volta à trilha
        await page.keyboard.press('ArrowDown') // próxima categoria
      }
    }
    console.log(`  (categorias tentadas: ${triedCategories}; canais montados: ${rows}; com "Agora": ${withNow})`)
    assert(withNow > 0, 'pelo menos um canal real mostra o programa atual (id de EPG casando por igualdade exata)')

    if (withNow > 0) {
      const barsOk = await page.evaluate(() => {
        const withProgress = [...document.querySelectorAll('.live-column-channels .channel-row')].filter(
          (row) => (row.querySelector('.channel-row-now')?.textContent ?? '') !== '',
        )
        return withProgress.every((row) => {
          const style = row.querySelector('.channel-row-progress-fill')?.getAttribute('style') ?? ''
          const value = Number(/scaleX\(([\d.]+)\)/.exec(style)?.[1])
          return Number.isFinite(value) && value >= 0 && value <= 1
        })
      })
      assert(barsOk, 'toda linha com programa tem barra de progresso entre 0 e 1')
    }
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
