// Roteiro E2E da feature 058 (headers da lista no AVPlay + catch-up Xtream) —
// gate da constitution ("Testes E2E antes da TV física"). Cenários A e B do
// `sdd/specs/058-headers-avplay-catchup/quickstart.md`.
//
// Cenário A (lista M3U com header): no navegador o `<video>` NUNCA envia
// User-Agent/Referer de mídia, e isso é verdade — então o canal que exige header
// cai no erro `PLAY-05`, sem mostrar o valor do header em lugar nenhum. Que o
// header chega ao servidor só a TV prova (T003).
//
// Cenário B (painel Xtream falso com arquivo): selo na prévia, marca no Guia,
// OK num programa passado toca o arquivo (selo "Arquivo", duração do EPG),
// RETURN volta ao Guia no programa, canal sem arquivo explica, "Do início",
// "Ao vivo", e as duas variantes de URL falhando → `PLAY-06`.
//
// Pré-requisito: `npm run dev` rodando (http://localhost:5173). Dados só fictícios
// (`e2e/lib/servidorHeadersArquivo.mjs`). Capturas em `test-results/headers-catchup/`.
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { cadastrarListaM3u, cadastrarListaXtream } from './lib/entrada.mjs'
import { iniciarServidor, REFERER_DECLARADO, SENHA, USER_AGENT_EXIGIDO, USUARIO } from './lib/servidorHeadersArquivo.mjs'

const APP_URL = 'http://localhost:5173'
const SHOTS = 'test-results/headers-catchup'

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/**
 * Texto visível + todos os atributos — onde um segredo nunca pode aparecer (FR-006/FR-020).
 * Inclui o `<video>` do adaptador de DESENVOLVIMENTO: ele remove o `src` no `loadstart`
 * (bug url-do-stream-no-src-do-video-de-dev), e na TV o AVPlay não põe nada no DOM.
 */
async function everythingRendered(page) {
  return page.evaluate(() => {
    const attrs = Array.from(document.querySelectorAll('*'))
      .flatMap((el) => Array.from(el.attributes).map((a) => a.value))
    return `${document.body.innerText} ${attrs.join(' ')}`
  })
}

async function eventually(page, predicate, arg, timeout = 15000) {
  try {
    await page.waitForFunction(predicate, arg, { timeout })
    return true
  } catch {
    return false
  }
}

async function pressMediaKey(page, key) {
  await page.evaluate((k) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }))
  }, key)
}

async function openLive(page) {
  await page.waitForSelector('.home-content', { timeout: 10000 })
  await page.getByRole('button', { name: 'TV ao vivo', exact: true }).click()
  await page.waitForSelector('.live-column-groups', { state: 'attached', timeout: 10000 })
}

const focusedChannel = (page) => page.evaluate(() => document.querySelector('.live-channel-row.tv-focus .live-item-name')?.textContent ?? null)
const focusedBlock = (page) => page.evaluate(() => document.querySelector('.epg-guide-block.tv-focus')?.textContent ?? '')
const errorCode = (page) => page.evaluate(() => document.querySelector('[data-testid="player-error-code"]')?.textContent ?? null)
const focusedChromeLabel = (page) => page.evaluate(() => document.querySelector('.player-chrome-button.tv-focus')?.getAttribute('aria-label') ?? null)

/** Da lista de canais (foco no 1º): ↑ lupa → ícone de Guia → OK. */
async function openGuideFromList(page) {
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.live-guide-button.tv-focus', { timeout: 4000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('.epg-guide-grid', { timeout: 8000 })
}

/** Abre a linha do chrome do Live (OK na faixa abre o zapping; → revela a linha) e anda até `label`. */
async function focusLiveControl(page, label) {
  for (let i = 0; i < 8; i += 1) {
    if ((await focusedChromeLabel(page)) === label) return true
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(80)
  }
  return (await focusedChromeLabel(page)) === label
}

async function cenarioA(browser, servidor) {
  console.log('=== Cenário A: lista M3U com header (US1) ===')
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const consoleLines = []
  page.on('console', (msg) => consoleLines.push(msg.text()))
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error'))
  try {
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await cadastrarListaM3u(page, { nome: 'Lista com header E2E', url: `${servidor.base}/lista.m3u` })
    await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.topbar', { timeout: 8000 })

    await openLive(page)
    await page.keyboard.press('Enter') // entra em "Canais | Teste"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert((await focusedChannel(page)) === 'Canal Header', 'o foco abre em "Canal Header"')

    await page.keyboard.press('Enter') // toca o Canal Header
    const play05 = await eventually(page, () => document.querySelector('[data-testid="player-error-code"]')?.textContent === 'PLAY-05', undefined, 20000)
    assert(play05, 'o canal que exige header cai em PLAY-05 (o <video> não envia headers)')
    assert(
      (await page.locator('.player-message-copy').innerText().catch(() => '')).includes('Esta lista exige um header que esta TV não envia.'),
      'a mensagem explica o header que a TV não envia',
    )
    await shot(page, 'a-play05')
    let rendered = await everythingRendered(page)
    assert(!rendered.includes(USER_AGENT_EXIGIDO) && !rendered.includes(REFERER_DECLARADO), 'nenhum valor de header na tela de erro (texto e atributos)')

    // "Info técnica" (1ª ação do PLAY-05): também sem o valor.
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    rendered = await everythingRendered(page)
    assert(!rendered.includes(USER_AGENT_EXIGIDO) && !rendered.includes(REFERER_DECLARADO), 'nenhum valor de header na Info técnica')
    await shot(page, 'a-info-tecnica')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.player-overlay', { state: 'detached', timeout: 6000 })

    await page.keyboard.press('ArrowDown')
    assert((await focusedChannel(page)) === 'Canal Livre', 'o foco desce para "Canal Livre"')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2500)
    assert((await errorCode(page)) !== 'PLAY-05', 'canal sem header não cai em PLAY-05')
    assert(servidor.registro.some((r) => r.rota === '/video/livre.ts'), 'o canal sem header chegou a pedir o vídeo')
    await page.keyboard.press('Escape')

    assert(!consoleLines.some((line) => line.includes(USER_AGENT_EXIGIDO) || line.includes(REFERER_DECLARADO)), 'nenhum valor de header no console')
  } finally {
    await context.close()
  }
}

async function cenarioB(browser, servidor) {
  console.log('=== Cenário B: painel Xtream com arquivo (US2/US3) ===')
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const consoleLines = []
  page.on('console', (msg) => consoleLines.push(msg.text()))
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error'))
  try {
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await cadastrarListaXtream(page, { nome: 'Painel com arquivo E2E', servidor: servidor.base, usuario: USUARIO, senha: SENHA })
    await page.waitForSelector('text=/Concluída/', { timeout: 30000 })
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.topbar', { timeout: 8000 })
    // A importação sincroniza o EPG do painel sozinha (feature 030).
    const end = Date.now() + 20000
    while (servidor.contagem.xmltv === 0 && Date.now() < end) await page.waitForTimeout(200)
    assert(servidor.contagem.xmltv > 0, 'o EPG do painel foi sincronizado')
    await page.waitForTimeout(1000) // o Worker termina de gravar

    await openLive(page)
    await page.keyboard.press('Enter') // entra em "Canais Arquivo"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 10000 })
    assert((await focusedChannel(page)) === 'Canal Arquivo', 'o foco abre em "Canal Arquivo"')
    assert((await page.locator('.live-hero-archive').textContent().catch(() => null)) === 'Arquivo · 3 dias', 'a prévia mostra "Arquivo · 3 dias"')
    assert((await page.locator('.live-hero-archive button, button.live-hero-archive').count()) === 0, 'o selo não é focável')
    await shot(page, 'b-selo-previa')
    await page.keyboard.press('ArrowDown')
    assert((await focusedChannel(page)) === 'Canal Sem Arquivo', 'o foco desce para "Canal Sem Arquivo"')
    assert((await page.locator('.live-hero-archive').count()) === 0, 'canal sem arquivo: sem selo')
    await page.keyboard.press('ArrowUp')

    console.log('  --- Guia → programa passado → arquivo ---')
    await openGuideFromList(page)
    assert((await page.locator('.epg-guide-block.is-archive').count()) > 0, 'o Guia marca programas passados disponíveis no arquivo')
    const nowTitle = await focusedBlock(page)
    let keys = 0
    await page.keyboard.press('ArrowLeft')
    keys += 1
    const pastTitle = await focusedBlock(page)
    assert(pastTitle !== nowTitle && /Programa Arquivo/.test(pastTitle), `← foca o programa anterior (${pastTitle.trim()})`)
    assert(await page.locator('.epg-guide-block.tv-focus.is-archive').count(), 'o programa focado está marcado como arquivo')
    assert((await page.locator('.epg-guide-detail').innerText()).includes('Disponível no arquivo · OK para assistir'), 'o detalhe diz que está no arquivo')
    await shot(page, 'b-guia-arquivo')
    await page.keyboard.press('Enter')
    keys += 1
    const badge = await eventually(page, () => document.querySelector('.player-chrome-archive-badge')?.textContent === 'Arquivo', undefined, 15000)
    assert(badge, 'o player mostra o selo "Arquivo"')
    assert(keys <= 3, `do Guia ao programa tocando em ${keys} teclas (SC-004: ≤ 3)`)
    assert((await page.locator('.player-chrome-live-badge').count()) === 0, 'sem o selo "AO VIVO" no arquivo')
    assert(servidor.registro.some((r) => r.rota.startsWith('/timeshift/')), 'o vídeo veio da URL de arquivo (REST)')
    const total = await eventually(page, () => /30:00/.test(document.querySelector('.player-chrome-time')?.textContent ?? ''), undefined, 15000)
    assert(total, 'a barra usa a duração do programa no EPG (30:00)')
    await shot(page, 'b-arquivo-tocando')
    let rendered = await everythingRendered(page)
    assert(!rendered.includes('/timeshift/') && !rendered.includes('timeshift.php'), 'a URL de arquivo nunca aparece na tela')

    await page.keyboard.press('Escape')
    const backInGuide = await eventually(page, (title) => document.querySelector('.epg-guide-block.tv-focus')?.textContent === title, pastTitle, 8000)
    assert(backInGuide, 'RETURN volta ao Guia com o foco no programa que tocava')

    console.log('  --- canal sem arquivo ---')
    await page.keyboard.press('ArrowDown')
    for (let i = 0; i < 3 && !(await page.locator('.epg-guide-block.tv-focus.is-past').count()); i += 1) await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    const ended = await eventually(page, () => /Este programa já terminou\./.test(document.body.innerText), undefined, 4000)
    assert(ended, 'programa passado de canal sem arquivo: "Este programa já terminou."')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.epg-guide', { state: 'detached', timeout: 6000 })

    console.log('  --- ao vivo → "Do início" → "Ao vivo" ---')
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 6000 })
    for (let i = 0; i < 3 && (await focusedChannel(page)) !== 'Canal Arquivo'; i += 1) await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter') // toca o Canal Arquivo ao vivo
    await page.waitForSelector('.player-chrome-live-badge', { timeout: 10000 })
    await page.waitForTimeout(500)
    const onStartOver = await focusLiveControl(page, 'Do início')
    assert(onStartOver, '"Do início" está na linha do ao vivo, depois de "Guia"')
    await shot(page, 'b-do-inicio')
    const fetchesBefore = servidor.registro.filter((r) => r.rota.startsWith('/timeshift/')).length
    await page.keyboard.press('Enter')
    assert(
      await eventually(page, () => document.querySelector('.player-chrome-archive-badge')?.textContent === 'Arquivo', undefined, 15000),
      '"Do início" toca o programa atual como arquivo',
    )
    assert(servidor.registro.filter((r) => r.rota.startsWith('/timeshift/')).length > fetchesBefore, '"Do início" pediu a URL de arquivo')
    // Linha do arquivo: o foco abre em ▶⏸; dois passos à direita = "Ao vivo".
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    assert((await focusedChromeLabel(page)) === 'Ao vivo', 'dois passos de ▶⏸ chegam a "Ao vivo"')
    await page.keyboard.press('Enter')
    assert(await eventually(page, () => document.querySelector('.player-chrome-live-badge') !== null, undefined, 10000), '"Ao vivo" volta ao ao vivo (selo AO VIVO)')

    console.log('  --- arquivo que não responde → PLAY-06 ---')
    servidor.configurar({ restResponde: false, phpResponde: false })
    await page.waitForTimeout(300)
    assert(await focusLiveControl(page, 'Do início'), 'de volta à linha do ao vivo, "Do início"')
    await page.keyboard.press('Enter')
    const play06 = await eventually(page, () => document.querySelector('[data-testid="player-error-code"]')?.textContent === 'PLAY-06', undefined, 25000)
    assert(play06, 'as duas variantes falhando → PLAY-06')
    const actions = await page.locator('.player-action').allTextContents()
    assert(actions.join('|') === 'Ao vivo|Voltar', `ações "Ao vivo" e "Voltar" (${actions.join(', ')})`)
    assert(servidor.registro.some((r) => r.rota === '/streaming/timeshift.php'), 'a segunda tentativa usou a variante legada')
    await shot(page, 'b-play06')
    rendered = await everythingRendered(page)
    assert(!rendered.includes('/timeshift/') && !rendered.includes('timeshift.php'), 'a URL de arquivo não aparece no erro')
    await page.keyboard.press('Enter') // "Ao vivo"
    assert(await eventually(page, () => document.querySelector('.player-chrome-live-badge') !== null, undefined, 10000), '"Ao vivo" do erro volta ao ao vivo')
    servidor.configurar({ restResponde: true })

    console.log('  --- CH± no arquivo vai ao vizinho ---')
    assert(await focusLiveControl(page, 'Do início'), 'de novo "Do início"')
    await page.keyboard.press('Enter')
    await eventually(page, () => document.querySelector('.player-chrome-archive-badge') !== null, undefined, 15000)
    // A sessão ignora teclas de mídia enquanto prepara: espera o rótulo de estado sumir (tocando).
    await eventually(page, () => document.querySelector('.player-status') === null, undefined, 15000)
    await pressMediaKey(page, 'ChannelDown')
    assert(
      await eventually(page, () => /Canal Sem Arquivo/.test(document.querySelector('.player-chrome-name')?.textContent ?? ''), undefined, 10000),
      'CH− no arquivo vai ao ao vivo do "Canal Sem Arquivo"',
    )

    assert(!consoleLines.some((line) => line.includes('/timeshift/') || line.includes('timeshift.php')), 'nenhuma URL de arquivo no console')
  } finally {
    await context.close()
  }
}

async function run() {
  const servidor = await iniciarServidor()
  const browser = await launchBrowser()
  try {
    await cenarioA(browser, servidor)
    await cenarioB(browser, servidor)
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO:', error?.message ?? error)
  } finally {
    await browser.close()
    await servidor.close()
  }
  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTudo certo.')
}

await run()
