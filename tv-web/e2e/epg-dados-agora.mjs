// Roteiro E2E da feature 030 (EPG — dados e "Agora") — gate da constitution
// ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre o que só um Chromium real prova (jsdom não faz CSS nem tem Worker
// nem `DecompressionStream` de verdade): importação de uma lista M3U com
// `url-tvg` → sincronização do EPG num Worker, com o XMLTV **comprimido em
// gzip** (detectado pelo conteúdo, sem extensão nem cabeçalho de
// compressão) → "Agora" + barra na linha de canal, "Agora"/"A seguir" +
// sinopse no preview, programa na banda do player e na lista de zapping →
// tela "EPG da lista" (endereço inválido, resposta que não é XMLTV, endereço
// válido, deslocamento sem baixar de novo, desativar/ativar) → nenhuma
// requisição de EPG ao mover o foco, nenhum endereço em console/tela.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios, montados neste próprio script — os horários do XMLTV
// são relativos a "agora" (o "programa atual" precisa ser o atual quando o
// roteiro roda), então não podem ser um arquivo estático. Para o roteiro
// contra a lista e o EPG reais do `.env`, ver `epg-dados-agora-real.mjs`.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'

const APP_URL = 'http://localhost:5173'
const MINUTE = 60_000

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** Exatamente um elemento com foco visível depois de cada passo (constitution: "Foco Visível"). */
async function assertOneFocus(page, step) {
  const count = await page.locator('.tv-focus').count()
  assert(count === 1, `foco (${step}): exatamente um .tv-focus na tela (achou ${count})`)
}

/**
 * Foco visível numa tela de foco DOM real (`useTvKeyNav`, como a de edição de
 * lista — a tela de EPG, feature 030, R-011): o elemento focado é um
 * botão/campo de dentro da tela e tem a receita de foco (contorno) aplicada.
 */
async function assertDomFocusVisible(page, step) {
  const info = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || !el.closest('.epg-settings')) return null
    const style = getComputedStyle(el)
    return { tag: el.tagName, outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) }
  })
  assert(
    info !== null && /^(BUTTON|INPUT)$/.test(info.tag) && info.outlineStyle !== 'none' && info.outlineWidth > 0,
    `foco (${step}): há um controle da tela focado, com o contorno de foco visível`,
  )
}

/** `YYYYMMDDHHmmss +0000` — formato de horário do XMLTV, sempre UTC. */
function xmltvTime(ms) {
  const d = new Date(ms)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`
}

function programme(channel, start, stop, title, desc) {
  return `<programme start="${xmltvTime(start)}" stop="${xmltvTime(stop)}" channel="${channel}"><title lang="pt">${title}</title>${desc ? `<desc lang="pt">${desc}</desc>` : ''}</programme>`
}

function buildGuide(now) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv generator-info-name="e2e">',
    '<channel id="canal.a"><display-name>Canal A</display-name></channel>',
    '<channel id="canal.b"><display-name>Canal B</display-name></channel>',
    programme('canal.a', now - 30 * MINUTE, now + 30 * MINUTE, 'Jornal da Noite', 'Resumo do dia para o E2E.'),
    programme('canal.a', now + 30 * MINUTE, now + 90 * MINUTE, 'Filme da Noite'),
    programme('canal.b', now - 10 * MINUTE, now + 50 * MINUTE, 'Esporte ao Vivo'),
    '</tv>',
  ].join('\n')
}

function buildManualGuide(now) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv>',
    programme('canal.a', now - 30 * MINUTE, now + 30 * MINUTE, 'Programa do Endereço Manual'),
    '</tv>',
  ].join('\n')
}

function buildM3u(base) {
  return [
    `#EXTM3U url-tvg="${base}/guia.xml.gz"`,
    '#EXTINF:-1 tvg-id="canal.a" group-title="Canais | Notícias",Canal A',
    `${base}/live/a.ts`,
    '#EXTINF:-1 tvg-id="canal.b" group-title="Canais | Notícias",Canal B',
    `${base}/live/b.ts`,
    '#EXTINF:-1 group-title="Canais | Notícias",Canal Sem Guia',
    `${base}/live/c.ts`,
  ].join('\n')
}

const hits = { guia: 0, manual: 0, naoXmltv: 0 }

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    const base = `http://127.0.0.1:${server.address().port}`

    if (url.pathname === '/lista.m3u') {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(buildM3u(base))
      return
    }
    if (url.pathname === '/guia.xml.gz') {
      hits.guia += 1
      // Gzip "de arquivo": corpo comprimido, SEM Content-Encoding — o app
      // precisa reconhecer pelo conteúdo (FR-002).
      res.writeHead(200, { 'Content-Type': 'application/gzip' })
      res.end(gzipSync(Buffer.from(buildGuide(Date.now()))))
      return
    }
    if (url.pathname === '/manual.xml') {
      hits.manual += 1
      res.writeHead(200, { 'Content-Type': 'application/xml' })
      res.end(buildManualGuide(Date.now()))
      return
    }
    if (url.pathname === '/nao-xmltv') {
      hits.naoXmltv += 1
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body>Página de erro do painel</body></html>')
      return
    }
    res.writeHead(404)
    res.end('não encontrado')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/** Mesmo binário fixo dos demais scripts quando existe; senão, resolução normal do Playwright. */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

const SOURCE_NAME = 'Fonte E2E EPG'

async function addSource(page, m3uUrl) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(SOURCE_NAME)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.topbar', { timeout: 8000 })
}

async function openFromTopbar(page, name) {
  await page.getByRole('button', { name, exact: true }).click()
}

async function openSettingsFromHome(page) {
  await page.waitForSelector('.home-content', { timeout: 8000 })
  await openFromTopbar(page, 'Configurações')
  await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })
}

async function openLive(page) {
  await page.waitForSelector('.home-content', { timeout: 8000 })
  await openFromTopbar(page, 'TV ao vivo')
  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
}

/** Espera até `predicate` (avaliado no navegador) ser verdadeiro, ou devolve `false` no prazo. */
async function eventually(page, predicate, arg, timeout = 12000) {
  try {
    await page.waitForFunction(predicate, arg, { timeout })
    return true
  } catch {
    return false
  }
}

/** Texto do slot "Agora" da linha do canal `name` (ou `null` se a linha não existe). */
function rowNowText(page, name) {
  return page.evaluate((channelName) => {
    const nameEl = [...document.querySelectorAll('.live-item-name')].find((el) => el.textContent === channelName)
    const row = nameEl?.closest('.channel-row')
    return row ? (row.querySelector('.channel-row-now')?.textContent ?? '') : null
  }, name)
}

/** `style` da barra de progresso da linha do canal `name`, ou `null` se a linha não desenha barra. */
function rowProgressStyle(page, name) {
  return page.evaluate((channelName) => {
    const nameEl = [...document.querySelectorAll('.live-item-name')].find((el) => el.textContent === channelName)
    const fill = nameEl?.closest('.channel-row')?.querySelector('.channel-row-progress-fill')
    return fill ? fill.getAttribute('style') : null
  }, name)
}

async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    document.querySelector('.player-video')?.dispatchEvent(new Event(eventType))
  }, type)
}

async function run() {
  const server = await startServer()
  const base = `http://127.0.0.1:${server.address().port}`
  const m3uUrl = `${base}/lista.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const consoleLines = []
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => consoleLines.push(msg.text()))

  try {
    await addSource(page, m3uUrl)
    // As URLs de "stream" da fixture não são servidas — sem interceptar, o
    // <video> dispara o próprio `error` em corrida com os eventos sintéticos.
    // Só as do servidor fictício: `**/live/**` também casaria os módulos do
    // Vite (`/src/features/live/*`) e travaria o `reload` mais abaixo.
    await page.route(`${base}/live/**`, () => {})

    console.log('=== US1/US2: a importação sincroniza o EPG sozinha (gzip por conteúdo, num Worker) ===')
    await openSettingsFromHome(page)
    const linked = await eventually(
      page,
      () => /EPG vinculado · atualizado em/.test(document.querySelector('.sources-panel-epg')?.textContent ?? ''),
      undefined,
      20000,
    )
    assert(linked, 'Configurações mostra "EPG vinculado · atualizado em …" na linha da lista, sem nenhuma configuração feita')
    assert(hits.guia === 1, `a importação disparou exatamente uma sincronização de EPG (${hits.guia})`)
    await assertOneFocus(page, 'Configurações › Fontes IPTV')

    console.log('=== US1: "Agora" + barra na linha de canal ===')
    await page.keyboard.press('Escape') // RETURN em Configurações → Início
    await openLive(page)
    await page.keyboard.press('ArrowRight') // entra em "Canais | Notícias"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      await eventually(page, () => {
        const el = [...document.querySelectorAll('.live-item-name')].find((n) => n.textContent === 'Canal A')
        return el?.closest('.channel-row')?.querySelector('.channel-row-now')?.textContent === 'Jornal da Noite'
      }),
      '"Canal A" mostra o programa atual "Jornal da Noite"',
    )
    assert((await rowNowText(page, 'Canal B')) === 'Esporte ao Vivo', '"Canal B" mostra "Esporte ao Vivo"')
    assert((await rowNowText(page, 'Canal Sem Guia')) === '', '"Canal Sem Guia" (sem tvg-id) fica com o slot vazio — nada inventado')

    const progress = Number(/scaleX\(([\d.]+)\)/.exec((await rowProgressStyle(page, 'Canal A')) ?? '')?.[1])
    assert(progress > 0.4 && progress < 0.6, `a barra reflete o tempo real decorrido (~0,5; veio ${progress})`)
    assert((await rowProgressStyle(page, 'Canal Sem Guia')) === null, 'canal sem programa não desenha barra')
    await assertOneFocus(page, 'lista de canais com "Agora"')

    console.log('=== US3: preview com "Agora", sinopse e "A seguir"; nenhuma rede ao mover o foco (FR-029) ===')
    const hitsBeforeFocus = { ...hits }
    const previewText = () => page.locator('.live-preview-panel').innerText()
    let text = await previewText()
    assert(
      /Agora/.test(text) && text.includes('Jornal da Noite') && text.includes('Resumo do dia para o E2E.'),
      'preview de "Canal A": "Agora" com título e sinopse',
    )
    assert(/A seguir/.test(text) && text.includes('Filme da Noite'), 'preview de "Canal A": "A seguir" com o próximo programa')
    assert(/\d{2}:\d{2} – \d{2}:\d{2}/.test(text), 'os horários aparecem como "HH:MM – HH:MM"')

    await page.keyboard.press('ArrowDown') // Canal B
    await page.waitForTimeout(150)
    text = await previewText()
    assert(text.includes('Esporte ao Vivo') && !/A seguir/.test(text), 'preview de "Canal B": só o "Agora" (não há próximo na janela)')
    await page.keyboard.press('ArrowDown') // Canal Sem Guia
    await page.waitForTimeout(150)
    text = await previewText()
    assert(!/Agora/.test(text) && !/A seguir/.test(text), 'preview de canal sem EPG: nenhum "Agora"/"A seguir" solto')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    assert(
      hits.guia === hitsBeforeFocus.guia && hits.manual === hitsBeforeFocus.manual,
      'mover o foco entre canais não disparou nenhuma requisição de EPG',
    )
    await assertOneFocus(page, 'preview')

    console.log('=== US4: programa na banda do player Live e na lista de zapping ===')
    await page.keyboard.press('Enter') // toca "Canal A"
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    assert(
      await eventually(page, () => document.querySelector('.player-chrome-now-title')?.textContent === 'Jornal da Noite'),
      'a banda de "Canal A" mostra o programa atual',
    )
    assert((await page.locator('.player-chrome-band .player-chrome-now-progress-fill').count()) === 1, 'a banda desenha a barra de progresso')
    assert((await page.locator('.player-chrome-band button').count()) === 0, 'a banda continua sem nenhum <button>')

    await page.keyboard.press('ArrowDown') // troca para "Canal B"
    await page.waitForSelector('.player-chrome-name:has-text("Canal B")', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    assert(
      await eventually(page, () => document.querySelector('.player-chrome-now-title')?.textContent === 'Esporte ao Vivo'),
      'trocar de canal atualiza a banda para o programa do canal novo',
    )
    await page.keyboard.press('ArrowDown') // "Canal Sem Guia"
    await page.waitForSelector('.player-chrome-name:has-text("Canal Sem Guia")', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    assert((await page.locator('.player-chrome-now').count()) === 0, 'canal sem EPG: a banda fica como era, sem espaço de programa')

    await page.keyboard.press('Enter') // OK sem ação de controle → abre o zapping
    await page.waitForSelector('.player-zap-columns .live-item-name', { timeout: 8000 })
    assert(
      await eventually(page, () => {
        const el = [...document.querySelectorAll('.player-zap-columns .live-item-name')].find((n) => n.textContent === 'Canal A')
        return el?.closest('.channel-row')?.querySelector('.channel-row-now')?.textContent === 'Jornal da Noite'
      }),
      'a lista de zapping por cima do vídeo também mostra o "Agora"',
    )
    await page.keyboard.press('Escape') // fecha o zapping
    await page.keyboard.press('Escape') // fecha o player
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })

    console.log('=== US2: abrir a lista com o EPG em dia não sincroniza de novo (FR-009) ===')
    const hitsBeforeReload = hits.guia
    await page.goto(APP_URL)
    await page.waitForSelector('.source-card-wrap', { timeout: 10000 })
    await page.locator('.source-card-wrap', { hasText: SOURCE_NAME }).locator('.source-card').click()
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.waitForTimeout(800)
    assert(hits.guia === hitsBeforeReload, 'reabrir a lista com o EPG de minutos atrás não baixa o XMLTV de novo')

    console.log('=== US2: tela "EPG da lista" ===')
    await openFromTopbar(page, 'Configurações')
    await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })
    await page.getByRole('button', { name: 'EPG', exact: true }).click()
    await page.waitForSelector('.epg-settings', { timeout: 8000 })
    assert(
      (await page.locator('.epg-settings-state').textContent())?.startsWith('EPG vinculado'),
      'a tela abre com o estado "EPG vinculado"',
    )
    assert(
      (await page.locator('.epg-settings-note').first().textContent()) === 'Endereço declarado pela própria lista',
      'a origem é descrita ("declarado pela própria lista"), sem mostrar endereço',
    )

    // Endereço inválido (FR-018): recusa antes de baixar, sem ecoar, foco de volta ao campo.
    const hitsBeforeInvalid = { ...hits }
    await page.getByLabel('Endereço XMLTV (opcional)').fill('abc?token=segredo-e2e')
    await page.getByRole('button', { name: 'Salvar endereço' }).click()
    await page.waitForSelector('text=/Endereço inválido/', { timeout: 4000 })
    assert(
      await page.evaluate(() => document.activeElement === document.querySelector('.text-field-input')),
      'endereço inválido: o foco volta ao campo',
    )
    assert(
      !(await page.locator('body').innerText()).includes('segredo-e2e'),
      'endereço inválido: a mensagem não ecoa o que foi digitado',
    )
    assert(hits.manual === hitsBeforeInvalid.manual && hits.naoXmltv === hitsBeforeInvalid.naoXmltv, 'endereço inválido não baixou nada')

    // Resposta que não é XMLTV: falha declarada, EPG-02, sem tocar no que já havia.
    await page.getByLabel('Endereço XMLTV (opcional)').fill(`${base}/nao-xmltv`)
    await page.getByRole('button', { name: 'Salvar endereço' }).click()
    await page.waitForSelector('.epg-settings-code', { timeout: 15000 })
    assert((await page.locator('.epg-settings-code').textContent()) === 'EPG-02', 'a falha traz o código EPG-02')
    assert(
      (await page.locator('.epg-settings-error').textContent())?.includes('formato XMLTV'),
      'a falha diz o que aconteceu (a resposta não é XMLTV)',
    )
    assert((await page.getByRole('button', { name: 'Tentar novamente' }).count()) === 1, '"Tentar novamente" é a ação primária do erro')
    await assertDomFocusVisible(page, 'tela de EPG em erro')

    // Endereço válido: vale o manual; nunca aparece o endereço, só o host.
    await page.getByLabel('Endereço XMLTV (opcional)').fill(`${base}/manual.xml`)
    await page.getByRole('button', { name: 'Salvar endereço' }).click()
    assert(
      await eventually(page, () => /EPG vinculado/.test(document.querySelector('.epg-settings-state')?.textContent ?? ''), undefined, 15000),
      'endereço válido: volta a "EPG vinculado"',
    )
    assert(hits.manual >= 1, 'o endereço manual foi baixado')
    assert(
      (await page.locator('.epg-settings-note').first().textContent()) === 'Endereço informado por você (127.0.0.1)',
      'a origem mostra só o host do endereço manual',
    )
    assert(!(await page.locator('body').innerText()).includes('manual.xml'), 'o endereço manual nunca aparece na tela')

    // Deslocamento (FR-020): grava sem baixar de novo.
    const hitsBeforeOffset = { ...hits }
    await page.getByRole('button', { name: '+ 1 h' }).click()
    await page.waitForSelector('.epg-settings-offset-value:has-text("+1 h")', { timeout: 4000 })
    await page.waitForTimeout(400)
    assert(
      hits.manual === hitsBeforeOffset.manual && hits.guia === hitsBeforeOffset.guia,
      'mudar o deslocamento não baixou nada',
    )

    // Volta: o foco cai no botão "EPG" da mesma lista (FR-022).
    await page.keyboard.press('Escape')
    await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })
    assert(
      ((await page.getByRole('button', { name: 'EPG', exact: true }).getAttribute('class')) ?? '').includes('tv-focus'),
      'RETURN da tela de EPG devolve o foco ao botão "EPG" da lista',
    )
    await assertOneFocus(page, 'Configurações, de volta da tela de EPG')

    // Desativar (FR-021): confirma, apaga, e ativar volta a sincronizar.
    await page.getByRole('button', { name: 'EPG', exact: true }).click()
    await page.waitForSelector('.epg-settings', { timeout: 8000 })
    await page.getByRole('button', { name: 'Desativar EPG' }).click()
    await page.waitForSelector('[role="dialog"]', { timeout: 4000 })
    await page.getByRole('button', { name: 'Desativar', exact: true }).click()
    await page.waitForSelector('.epg-settings-state:has-text("EPG desativado")', { timeout: 8000 })
    assert((await page.getByRole('button', { name: 'Ativar EPG' }).count()) === 1, 'desativado: a ação "Ativar EPG" é o que resta focável')
    await assertDomFocusVisible(page, 'tela de EPG desativado')

    const hitsBeforeEnable = hits.manual
    await page.getByRole('button', { name: 'Ativar EPG' }).click()
    assert(
      await eventually(page, () => /EPG vinculado/.test(document.querySelector('.epg-settings-state')?.textContent ?? ''), undefined, 15000),
      'ativar de novo sincroniza e volta a "EPG vinculado"',
    )
    assert(hits.manual > hitsBeforeEnable, 'ativar baixou o endereço manual outra vez')

    console.log('=== Segredos: nenhum endereço de EPG em console (FR-013) ===')
    const leaked = consoleLines.filter((line) => line.includes('guia.xml.gz') || line.includes('manual.xml') || line.includes('nao-xmltv'))
    assert(leaked.length === 0, `nenhuma linha de console cita um endereço de EPG (${leaked.length})`)
  } catch (error) {
    failures += 1
    console.error('  ✗ EXCEÇÃO:', error?.message ?? error)
    await page.screenshot({ path: 'epg-dados-agora-falha.png' }).catch(() => {})
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
