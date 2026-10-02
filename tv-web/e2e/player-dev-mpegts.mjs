// Roteiro E2E da feature 047 (reprodução de MPEG-TS no navegador do dev).
//
// Prova, num Chromium de verdade e com o app rodando em `npm run dev`, que um
// canal ao vivo `.ts` (formato que o `<video>` recusa) CHEGA a tocar pelo
// fallback de demux, que trocar de canal e fechar não deixam conexão
// residual, que a página não recarrega no meio (R-004) e que o console não
// recebe a URL do stream (R-003).
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173).
//
// Dados: só fictícios. Um servidor HTTP local (porta 0) serve uma lista M3U e
// `fixtures/canal-teste.mpegts` (30 s, H.264 + AAC, gerado com ffmpeg) em ritmo de
// "ao vivo", contando as conexões abertas. Nunca uma fonte real.
//
// Honestidade (FR-011, D-008): isto prova o caminho de DEV no Chromium — NÃO
// prova AVPlay, codec nem desempenho da TV. Se o navegador do Playwright não
// decodificar H.264/AAC, o cenário imprime `PULADO` com o motivo e sai com
// sucesso rotulado; nunca finge ter provado a reprodução.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_TS = path.join(__dirname, 'fixtures', 'canal-teste.mpegts')
const APP_URL = 'http://localhost:5173'
const H264_AAC = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"'
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

/** Servidor local: lista M3U + stream `.ts` em ritmo de ao vivo, contando respostas abertas. */
function startServer() {
  const ts = readFileSync(FIXTURE_TS)
  const active = new Set()
  // Canal 5 (T027): conexões que o teste derruba sob comando, e quantas vezes o app o pediu.
  const live5 = new Set()
  const stats = {
    hits5: 0,
    dropLive5() {
      for (const res of [...live5]) res.destroy()
    },
  }
  // A biblioteca de demux só começa a tocar depois de um buffer inicial
  // (~384 KB no padrão dela): a rajada de partida precisa cobri-lo, como um
  // painel real faz, senão o teste mede o ritmo do servidor falso e não o app.
  const BURST = 188 * 2300 // ~420 KB de partida
  const CHUNK = 188 * 200 // ~37 KB por segundo depois
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const { pathname } = new URL(req.url ?? '/', 'http://x')
      if (pathname === '/lista.m3u') {
        const base = `http://127.0.0.1:${server.address().port}`
        const body = [1, 2, 3, 4, 5]
          .map((n) => `#EXTINF:-1 group-title="Canais Teste 047",Canal ${n}\n${base}/live/u/p/${n}.ts`)
          .join('\n')
        res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
        res.end(`#EXTM3U\n${body}\n`)
        return
      }
      if (pathname === '/live/u/p/4.ts') {
        // Canal 4 (T026): diz ser MPEG-TS, mas os bytes não são — o `<video>` recusa e a demux também.
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Access-Control-Allow-Origin': '*' })
        active.add(res)
        res.on('close', () => active.delete(res))
        res.end(Buffer.from('isto nao e um stream mpeg-ts '.repeat(4000)))
        return
      }
      if (/^\/live\/u\/p\/\d+\.ts$/.test(pathname)) {
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Access-Control-Allow-Origin': '*' })
        active.add(res)
        res.on('close', () => active.delete(res))
        if (pathname === '/live/u/p/5.ts') {
          stats.hits5 += 1
          live5.add(res)
          res.on('close', () => live5.delete(res))
        }
        let offset = Math.min(BURST, ts.length)
        res.write(ts.subarray(0, offset))
        const timer = setInterval(() => {
          if (res.destroyed || res.writableEnded) {
            clearInterval(timer)
            return
          }
          if (offset >= ts.length) {
            clearInterval(timer)
            res.end()
            return
          }
          res.write(ts.subarray(offset, Math.min(offset + CHUNK, ts.length)))
          offset += CHUNK
        }, 1000)
        res.on('close', () => clearInterval(timer))
        return
      }
      res.writeHead(404)
      res.end()
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, active, stats }))
  })
}

async function launchWithH264() {
  const attempts = [{ headless: true }, { headless: true, channel: 'chrome' }]
  for (const options of attempts) {
    let browser
    try {
      browser = await chromium.launch(options)
    } catch {
      continue
    }
    const probe = await browser.newPage()
    await probe.goto('about:blank')
    const supported = await probe.evaluate(
      (type) => typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type),
      H264_AAC,
    )
    await probe.close()
    if (supported) return browser
    await browser.close()
  }
  return null
}

async function waitFor(predicate, timeoutMs, stepMs = 100) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
  return false
}

/** O `<video>` ATUAL está realmente tocando: dados suficientes e o relógio andando. */
const isReallyPlaying = (page) =>
  page.evaluate(() => {
    const v = document.querySelector('video.player-video')
    return Boolean(v) && v.readyState >= 3 && v.currentTime > 0.5 && !v.paused
  })

async function run() {
  const browser = await launchWithH264()
  if (!browser) {
    console.log(
      'PULADO: nenhum navegador disponível decodifica H.264/AAC (Chromium do Playwright nem Chrome instalado). ' +
        'A reprodução de MPEG-TS no dev NÃO foi provada por este cenário (D-008).',
    )
    return
  }

  const { server, active, stats } = await startServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/lista.m3u`
  const streamHost = `127.0.0.1:${server.address().port}`
  const page = await (await browser.newContext()).newPage()
  const consoleLines = []
  page.on('console', (message) => consoleLines.push(message.text()))
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error'))

  try {
    console.log('=== Adicionar lista M3U fictícia com canais .ts ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaM3u(page, { nome: 'Fonte E2E TS 047', url: m3uUrl })
    await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.locator('.source-card-wrap', { hasText: 'Fonte E2E TS 047' }).waitFor({ timeout: 8000 })
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowRight') // Início → TV ao vivo
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })

    console.log('=== US2: o canal .ts toca no dev (fallback de demux) ===')
    await page.keyboard.press('ArrowRight') // entra na categoria
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await page.evaluate(() => {
      window.__e2e047 = 'sem-reload'
    })
    const startedAt = Date.now()
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    const playing = await waitFor(() => isReallyPlaying(page), START_BUDGET_MS)
    const startMs = Date.now() - startedAt
    assert(playing, `o canal .ts chegou a tocar de verdade em ${startMs} ms (limite ${START_BUDGET_MS} ms)`)
    assert((await page.locator('text=/PLAY-04/').count()) === 0, 'sem tela de erro PLAY-04')
    assert(active.size <= 1, `no máximo uma conexão aberta com o stream (${active.size})`)

    console.log(`=== US2: ${SWITCHES} trocas de canal sem conexão residual ===`)
    let worstResidual = 0
    let allSwitchesPlayed = true
    for (let i = 0; i < SWITCHES; i += 1) {
      await page.keyboard.press('Enter') // abre a lista de zapping por cima do vídeo
      await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
      await page.keyboard.press(i % 2 === 0 ? 'ArrowDown' : 'ArrowUp')
      await page.keyboard.press('Enter') // troca de canal
      await page.waitForSelector('.player-zap-columns', { state: 'detached', timeout: START_BUDGET_MS })
      if (!(await waitFor(() => isReallyPlaying(page), START_BUDGET_MS))) allSwitchesPlayed = false
      // A sessão anterior precisa ter sido encerrada: sobra no máximo a nova.
      await waitFor(() => active.size <= 1, 3000)
      worstResidual = Math.max(worstResidual, active.size)
    }
    assert(allSwitchesPlayed, `as ${SWITCHES} trocas terminaram com o novo canal tocando`)
    assert(worstResidual <= 1, `no máximo uma conexão aberta depois de cada troca (pior caso: ${worstResidual})`)
    assert((await page.locator('video.player-video').count()) === 1, 'um único <video> vivo depois das trocas')

    console.log('=== US2: RETURN fecha sem nada residual ===')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(await waitFor(() => active.size === 0, 5000), 'nenhuma conexão aberta com o stream depois de fechar')
    assert((await page.locator('video').count()) === 0, 'nenhum <video> (nem som) restante depois de fechar')

    console.log('=== T026 (US2/AC4): canal que o navegador não decodifica cai no mesmo PLAY-04 ===')
    // Depois do RETURN o foco volta ao Canal 1; o Canal 4 é três linhas abaixo.
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    const errorShown = await page
      .waitForSelector('[data-testid="player-error-code"]', { timeout: START_BUDGET_MS })
      .then(() => true)
      .catch(() => false)
    assert(errorShown, 'o canal não decodificável chega à tela de erro (não fica carregando para sempre)')
    if (errorShown) {
      assert(
        (await page.locator('[data-testid="player-error-code"]').textContent())?.trim() === 'PLAY-04',
        'o código mostrado é o mesmo PLAY-04 de hoje',
      )
      assert(
        (await page.locator('.player-actions .player-action', { hasText: 'Tentar de novo' }).count()) === 1,
        'a ação "Tentar de novo" está na tela de erro',
      )
      assert((await page.locator('.player-actions .player-action.tv-focus').count()) === 1, 'exatamente uma ação com foco na tela de erro')
    }
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(await waitFor(() => active.size === 0, 5000), 'nenhuma conexão aberta depois de fechar o canal com erro')

    console.log('=== T027 (US2/AC5): stream que cai no meio é reconectado pela feature 042 ===')
    await page.keyboard.press('ArrowDown') // Canal 4 → Canal 5
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    const playedFirst = await waitFor(() => isReallyPlaying(page), START_BUDGET_MS)
    assert(playedFirst, 'o canal 5 chegou a tocar antes da queda')
    const hitsBeforeDrop = stats.hits5
    stats.dropLive5() // o servidor derruba o socket no meio do stream
    const reconnected = await waitFor(() => stats.hits5 > hitsBeforeDrop, 20000)
    assert(reconnected, 'depois da queda o app pediu o stream de novo (reconexão da 042)')
    const playedAgain = reconnected && (await waitFor(() => isReallyPlaying(page), 20000))
    assert(playedAgain, 'depois de reconectar o canal volta a tocar')
    assert((await page.locator('[data-testid="player-error-code"]').count()) === 0, 'sem tela de erro depois de reconectar')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(await waitFor(() => active.size === 0, 5000), 'nenhuma conexão aberta depois de fechar o canal reconectado')

    console.log('=== Sem reload e sem vazar a URL ===')
    assert((await page.evaluate(() => window.__e2e047)) === 'sem-reload', 'a página não recarregou durante a reprodução (R-004)')
    const leaked = consoleLines.filter((line) => line.includes(streamHost) || line.includes('/live/u/p'))
    assert(leaked.length === 0, `o console não recebeu a URL do stream (${leaked.length} linha(s) com ela)`)
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error?.name ?? 'Error', String(error?.message ?? '').split('\n')[0])
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
