// Roteiro E2E da feature 031 (EPG — Guia completo em tela cheia) — gate da
// constitution ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre o que só um Chromium real prova (CSS/layout, teclado de verdade,
// `<video>` com sessão viva): abrir o guia do preview da Live TV → foco no
// canal de origem, painel de detalhe, linha da hora atual, programa encerrado
// esmaecido, canal sem EPG → ←/→/↑/↓, abas Hoje/Amanhã, CH±, seletor de
// lista → OK num programa toca e RETURN cai no canal escolhido → guia aberto
// do player (sessão viva, troca de canal, fecha só ao tocar) → lista sem EPG
// leva ao painel de EPG → nenhuma requisição de EPG ao mover o foco.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios, montados neste próprio script (horários relativos a
// "agora"). Para o roteiro contra a lista real do `.env`, ver
// `epg-guia-completo-real.mjs`.
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
  const d = new Date(now)
  const tomorrow8 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0, 0, 0).getTime()
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv generator-info-name="e2e">',
    '<channel id="canal.a"><display-name>Canal A</display-name></channel>',
    '<channel id="canal.b"><display-name>Canal B</display-name></channel>',
    programme('canal.a', now - 120 * MINUTE, now - 30 * MINUTE, 'Programa Encerrado'),
    programme('canal.a', now - 30 * MINUTE, now + 30 * MINUTE, 'Jornal da Noite', 'Resumo do dia para o E2E.'),
    programme('canal.a', now + 30 * MINUTE, now + 90 * MINUTE, 'Filme da Noite'),
    programme('canal.a', tomorrow8, tomorrow8 + 60 * MINUTE, 'Programa de Amanhã'),
    programme('canal.b', now - 10 * MINUTE, now + 50 * MINUTE, 'Esporte ao Vivo'),
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

function buildM3uSemEpg(base) {
  return ['#EXTM3U', '#EXTINF:-1 group-title="Canais | Notícias",Canal Solto', `${base}/live/x.ts`].join('\n')
}

const hits = { guia: 0 }

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
    if (url.pathname === '/sem-epg.m3u') {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(buildM3uSemEpg(base))
      return
    }
    if (url.pathname === '/guia.xml.gz') {
      hits.guia += 1
      res.writeHead(200, { 'Content-Type': 'application/gzip' })
      res.end(gzipSync(Buffer.from(buildGuide(Date.now()))))
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

async function addSource(page, name, m3uUrl, { first }) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  if (first) await page.keyboard.press('Enter')
  else await page.locator('.add-card').click()
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(name)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.topbar', { timeout: 8000 })
}

async function openLive(page) {
  await page.waitForSelector('.home-content', { timeout: 8000 })
  await page.getByRole('button', { name: 'TV ao vivo', exact: true }).click()
  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
}

async function eventually(page, predicate, arg, timeout = 12000) {
  try {
    await page.waitForFunction(predicate, arg, { timeout })
    return true
  } catch {
    return false
  }
}

async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    document.querySelector('.player-video')?.dispatchEvent(new Event(eventType))
  }, type)
}

const focusedBlockText = (page) => page.locator('.epg-guide-block.tv-focus').first().innerText()
const detailChannel = (page) => page.locator('.epg-guide-detail-channel').textContent()
const activeTab = (page) => page.locator('.epg-guide-tab.is-active').textContent()

/** Da lista de canais (col 1, no canal já focado): preview → "Guia completo" → abre o guia. */
async function openGuideFromPreview(page) {
  await page.keyboard.press('ArrowRight') // canal → preview ("Assistir")
  await page.waitForSelector('.live-preview-action.tv-focus', { timeout: 4000 })
  await page.keyboard.press('ArrowDown') // Favoritar
  await page.keyboard.press('ArrowDown') // Guia completo
  await page.keyboard.press('Enter')
  await page.waitForSelector('.epg-guide', { timeout: 6000 })
  try {
    await page.waitForSelector('.epg-guide-grid', { timeout: 6000 })
  } catch (error) {
    const rects = await page.evaluate(() =>
      ['.epg-guide-screen', '.epg-guide', '.epg-guide-bar', '.epg-guide-detail', '.epg-guide-grid', '.epg-guide-body-wrap'].map((s) => {
        const el = document.querySelector(s)
        const r = el?.getBoundingClientRect()
        return `${s}: ${r ? `${Math.round(r.width)}x${Math.round(r.height)}` : 'ausente'} ${el ? getComputedStyle(el).display : ''}`
      }),
    )
    console.error(rects.join('\n'))
    throw error
  }
}

/** Dispara CH+/CH− como a TV entrega (`event.key`). */
async function pressMediaKey(page, key) {
  await page.evaluate((k) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }))
  }, key)
}

async function run() {
  const server = await startServer()
  const base = `http://127.0.0.1:${server.address().port}`

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const consoleLines = []
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => consoleLines.push(msg.text()))

  try {
    await addSource(page, 'Fonte E2E Guia', `${base}/lista.m3u`, { first: true })
    // Só as URLs de "stream" do servidor fictício: `**/live/**` também casaria os módulos do Vite.
    await page.route(`${base}/live/**`, () => {})

    // A importação sincroniza o EPG sozinha (feature 030); espera antes de abrir o guia.
    const synced = await (async () => {
      const end = Date.now() + 20000
      while (Date.now() < end) {
        if (hits.guia >= 1) return true
        await page.waitForTimeout(200)
      }
      return false
    })()
    assert(synced, 'o EPG da lista foi sincronizado pela importação')
    await page.waitForTimeout(800) // o Worker termina de gravar

    console.log('=== US1: abrir o guia do preview, no 2º canal ===')
    await openLive(page)
    await page.keyboard.press('ArrowRight') // entra em "Canais | Notícias"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // "Canal B"
    await openGuideFromPreview(page)
    assert((await page.locator('text=/Em breve/').count()) === 0, '"Guia completo" abre o guia, sem aviso "Em breve"')
    assert((await page.locator('[role="dialog"]').count()) === 0, 'abrir o guia não abre o player')
    assert((await page.locator('.topbar').count()) === 0, 'o guia parado é tela cheia, sem topbar')
    assert((await focusedBlockText(page)).includes('Esporte ao Vivo'), 'o foco cai no programa atual do canal de origem ("Canal B")')
    assert((await detailChannel(page)) === 'Canal B', 'o painel de detalhe mostra o canal de origem')
    assert((await page.locator('.epg-guide-detail').innerText()).includes('Esporte ao Vivo'), 'o painel de detalhe mostra o programa focado')
    assert((await page.locator('.epg-guide-now-line').count()) === 1, 'há a linha da hora atual')
    assert((await page.locator('.epg-guide-block.is-now').count()) >= 1, 'o programa atual está marcado "Agora"')
    assert((await activeTab(page)) === 'Hoje', 'a aba ativa é "Hoje"')
    await assertOneFocus(page, 'guia aberto')

    // O guia é opaco (R-002): nada da Live TV aparece por trás.
    const opaque = await page.evaluate(() => {
      const el = document.querySelector('.epg-guide')
      const bg = el ? getComputedStyle(el).backgroundColor : ''
      return bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
    })
    assert(opaque, 'o fundo do guia é opaco')

    console.log('=== US1/US2: navegação por programa e canal; nenhuma rede ao mover o foco ===')
    const hitsBeforeFocus = hits.guia
    await page.keyboard.press('ArrowUp') // "Canal A", mesma coluna de tempo
    assert((await detailChannel(page)) === 'Canal A', '↑ vai para o canal de cima')
    assert((await focusedBlockText(page)).includes('Jornal da Noite'), '↑ preserva a coluna de tempo (programa em curso do "Canal A")')
    await page.keyboard.press('ArrowLeft') // programa anterior (encerrado)
    assert((await focusedBlockText(page)).includes('Programa Encerrado'), '← vai ao programa anterior')
    assert((await page.locator('.epg-guide-block.is-past.tv-focus').count()) === 1, 'programa encerrado está esmaecido e focável')
    await page.keyboard.press('Enter')
    await page.waitForSelector('text=Este programa já terminou.', { timeout: 4000 })
    assert((await page.locator('[role="dialog"]').count()) === 0, 'OK num programa encerrado só avisa, não toca')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // "Filme da Noite"
    assert((await focusedBlockText(page)).includes('Filme da Noite'), '→ avança até o programa seguinte')
    await page.keyboard.press('ArrowDown') // "Canal B"
    await page.keyboard.press('ArrowDown') // "Canal Sem Guia"
    assert((await detailChannel(page)) === 'Canal Sem Guia', '↓ chega ao canal sem EPG')
    assert((await focusedBlockText(page)).includes('Sem programação'), 'canal sem EPG mostra o bloco "Sem programação", focável')
    assert(hits.guia === hitsBeforeFocus, 'mover o foco no guia não disparou nenhuma requisição de EPG')
    await assertOneFocus(page, 'após navegar')

    console.log('=== US2: CH± pagina os canais ===')
    await pressMediaKey(page, 'ChannelUp')
    assert((await detailChannel(page)) === 'Canal A', 'CH+ salta para cima e satura na primeira linha')
    await pressMediaKey(page, 'ChannelDown')
    assert((await detailChannel(page)) === 'Canal Sem Guia', 'CH− salta para baixo e satura na última linha')

    console.log('=== US2: abas Hoje/Amanhã ===')
    await pressMediaKey(page, 'ChannelUp') // volta ao "Canal A", para as abas
    await page.keyboard.press('ArrowUp') // 1ª linha → barra (seletor)
    assert((await page.locator('.epg-guide-bar .tv-focus').count()) === 1, '↑ da primeira linha leva à barra')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // "Amanhã"
    assert((await page.locator('.epg-guide-tab.tv-focus').textContent()) === 'Amanhã', '→ na barra chega à aba "Amanhã"')
    await page.keyboard.press('Enter')
    assert((await activeTab(page)) === 'Amanhã', 'OK em "Amanhã": a aba fica ativa')
    assert((await focusedBlockText(page)).includes('Programa de Amanhã'), 'o foco vai ao primeiro programa de amanhã, visível na janela')
    await assertOneFocus(page, 'aba Amanhã')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowLeft') // "Hoje"
    await page.keyboard.press('Enter')
    assert((await activeTab(page)) === 'Hoje', '"Hoje" volta à aba ativa')
    assert((await focusedBlockText(page)).includes('Jornal da Noite'), '"Hoje" devolve o foco ao programa atual')

    console.log('=== US4: seletor de lista ===')
    await page.keyboard.press('ArrowUp') // → barra
    await page.keyboard.press('ArrowLeft') // seletor (a barra guardou a aba)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.epg-guide-selector-panel', { timeout: 4000 })
    const entries = await page.locator('.epg-guide-selector-entry').allInnerTexts()
    assert(entries[0] === '★ Favoritos' && entries[1] === 'Todos' && entries.length >= 3, `o seletor lista Favoritos, Todos e as categorias (${entries.join(' | ')})`)
    assert((await page.locator('.epg-guide-selector-entry.tv-focus').count()) === 1, 'o seletor tem foco visível único')
    await page.keyboard.press('Escape')
    assert((await page.locator('.epg-guide-selector-panel').count()) === 0 && (await page.locator('.epg-guide').count()) === 1, 'RETURN fecha só o seletor, o guia continua')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowUp') // categoria → Todos
    await page.keyboard.press('Enter')
    await page.waitForSelector('.epg-guide-coverage', { timeout: 6000 })
    assert(/Guia de \d+ de \d+ categorias/.test((await page.locator('.epg-guide-coverage').textContent()) ?? ''), '"Todos" mostra a cobertura "Guia de X de Y categorias"')

    console.log('=== US2: OK num programa toca; RETURN do player cai no canal escolhido ===')
    await page.keyboard.press('Enter') // OK no programa focado da lista escolhida
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    assert((await page.locator('.epg-guide').count()) === 0, 'parado: o guia fecha na hora, o player cobre tudo')
    await fireVideoEvent(page, 'playing')
    await page.keyboard.press('Escape') // RETURN na faixa fecha o player
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 6000 })
    assert(
      /Canal (A|B|Sem Guia)/.test((await page.locator('.live-channel-row.tv-focus').textContent()) ?? ''),
      'RETURN do player cai num canal da lista, com foco visível',
    )
    await assertOneFocus(page, 'de volta à Live TV')

    console.log('=== US3: guia a partir do player, sem parar o canal ===')
    // O RETURN acima devolveu o foco ao canal que tocou (1ª linha de "Todos" = "Canal A").
    assert(((await page.locator('.live-channel-row.tv-focus').textContent()) ?? '').includes('Canal A'), 'o foco está em "Canal A" antes de tocar')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    await page.keyboard.press('ArrowRight') // revela a linha do Live: foco em "Guia"
    await page.getByRole('button', { name: 'Guia', exact: true }).waitFor({ timeout: 4000 })
    assert((await page.getByRole('button', { name: 'Guia — em breve' }).count()) === 0, 'o "Guia" do player é real, não "em breve"')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.player-overlay .epg-guide', { timeout: 6000 })
    assert((await page.locator('.player-video').count()) === 1, 'a sessão de vídeo segue montada por trás do guia')
    assert((await focusedBlockText(page)).includes('Jornal da Noite') || (await detailChannel(page)) === 'Canal A', 'o guia abre no canal que está tocando')
    await assertOneFocus(page, 'guia sobre o player')

    await page.keyboard.press('Escape') // RETURN volta ao vídeo, sem reabrir a sessão
    await page.waitForSelector('.epg-guide', { state: 'detached', timeout: 4000 })
    assert((await page.locator('[role="dialog"]').count()) === 1 && (await page.locator('.player-video').count()) === 1, 'RETURN fecha só o guia; o player continua')

    await page.keyboard.press('ArrowRight') // revela a linha (ou anda um controle, se ela já estava aberta)
    const guiaButton = page.getByRole('button', { name: 'Guia', exact: true })
    await guiaButton.waitFor({ timeout: 4000 })
    for (let i = 0; i < 5 && !((await guiaButton.getAttribute('class')) ?? '').includes('tv-focus'); i += 1) {
      await page.keyboard.press('ArrowLeft')
    }
    await page.keyboard.press('Enter')
    try {
      await page.waitForSelector('.player-overlay .epg-guide-grid', { timeout: 6000 })
    } catch (error) {
      console.error(
        (
          await page.evaluate(() =>
            ['.player-overlay', '.player-zap-scrim', '.epg-guide', '.epg-guide-grid'].map((s) => {
              const el = document.querySelector(s)
              const r = el?.getBoundingClientRect()
              return `${s}: ${r ? `${Math.round(r.width)}x${Math.round(r.height)}` : 'ausente'} ${el ? getComputedStyle(el).position : ''}`
            }),
          )
        ).join('\n'),
      )
      throw error
    }
    await page.keyboard.press('ArrowDown') // "Canal B"
    await page.keyboard.press('Enter')
    await page.waitForTimeout(700) // a sessão troca (fecha a antiga, abre a nova)
    assert((await page.locator('.epg-guide').count()) === 1, 'o guia continua aberto até o canal escolhido estar tocando')
    await fireVideoEvent(page, 'playing')
    await page.waitForSelector('.epg-guide', { state: 'detached', timeout: 6000 })
    assert(true, 'o guia fecha quando o canal escolhido começa a tocar')
    await page.waitForSelector('.player-chrome-name:has-text("Canal B")', { timeout: 8000 })
    assert(true, 'a faixa do player mostra o canal escolhido no guia ("Canal B")')
    // A lista do guia virou a vizinhança de zapping (FR-020): ↓/CH± do player andam por ela.
    await page.keyboard.press('ArrowDown')
    await page.waitForSelector('.player-chrome-name:has-text("Canal Sem Guia")', { timeout: 8000 })
    assert(true, '↓ no player vai ao canal seguinte da lista do guia')
    await fireVideoEvent(page, 'playing')
    await pressMediaKey(page, 'ChannelUp')
    await page.waitForSelector('.player-chrome-name:has-text("Canal B")', { timeout: 8000 })
    assert(true, 'CH+ no player volta ao canal anterior da lista do guia')
    await page.keyboard.press('Escape') // fecha o player
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })

    console.log('=== US1: lista sem EPG → explicação e caminho para o painel de EPG ===')
    await addSource(page, 'Fonte E2E Sem EPG', `${base}/sem-epg.m3u`, { first: false })
    await page.route(`${base}/live/**`, () => {})
    await openLive(page)
    await page.keyboard.press('ArrowRight')
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await openGuideFromPreviewNoGrid(page)
    await page.waitForSelector('.epg-guide-state', { timeout: 6000 })
    assert((await page.locator('.epg-guide-grid').count()) === 0, 'sem EPG: nunca uma grade vazia')
    assert((await page.locator('.epg-guide-state-text').textContent())?.includes('não tem EPG configurado'), 'a explicação diz por que não há programação')
    await page.keyboard.press('ArrowDown') // seletor → "Configurar EPG"
    assert((await page.getByRole('button', { name: 'Configurar EPG' }).getAttribute('class'))?.includes('tv-focus'), '"Configurar EPG" é alcançável pelo controle remoto')
    await assertOneFocus(page, 'guia sem EPG')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.epg-settings', { timeout: 8000 })
    assert(true, '"Configurar EPG" leva ao painel de EPG da lista')

    const leaked = consoleLines.some((line) => line.includes('password') || line.includes('username='))
    assert(!leaked, 'nenhuma credencial em console')
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

/** Igual a `openGuideFromPreview`, mas sem esperar a grade (o estado "sem EPG" não a desenha). */
async function openGuideFromPreviewNoGrid(page) {
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.live-preview-action.tv-focus', { timeout: 4000 })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.epg-guide', { timeout: 6000 })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
