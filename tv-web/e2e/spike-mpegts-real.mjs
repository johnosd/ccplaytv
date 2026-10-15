// SPIKE da feature 047 (US1) — decide se vale demultiplexar MPEG-TS no
// navegador do dev: os canais REAIS da lista do `.env` chegam a decodificar
// vídeo E áudio no Chromium quando um demux em JavaScript os alimenta?
//
// **Fora do `npm run test:e2e` de propósito** (rede, painel de terceiros,
// credencial local). Não depende do dev server nem do código do app: serve uma
// página mínima com a biblioteca instalada em `node_modules/mpegts.js`.
//
//   node e2e/spike-mpegts-real.mjs
//
// **Segredos** (constitution; ADR-008/ADR-010): o `.env` é lido em tempo de
// execução e NUNCA impresso. A saída só tem contagens, categorias, ms e
// booleanos — sem endereço, usuário, senha, URL nem nome de canal.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { classifySample, summarize } from '../scripts/spikeSummary.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')
const LIB_PATH = path.resolve(__dirname, '..', 'node_modules', 'mpegts.js', 'dist', 'mpegts.js')
const SAMPLE_SIZE = 10
const PER_CHANNEL_MS = 15000
const H264_AAC = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"'

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

const PAGE = `<!doctype html><meta charset="utf-8"><video id="v" muted playsinline></video>
<script src="/mpegts.js"></script>
<script>
try { mpegts.LoggingControl.applyConfig({ enableAll: false, enableDebug: false, enableVerbose: false, enableInfo: false, enableWarn: false, enableError: false }) } catch {}
window.tryPlay = (url, ms) => new Promise((resolve) => {
  const v = document.getElementById('v')
  v.muted = true
  let done = false
  let errKind = null
  let player = null
  const snapshot = (timedOut) => {
    const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null
    return {
      played: v.currentTime > 1 && (q ? q.totalVideoFrames > 0 : v.videoWidth > 0),
      videoBytes: v.webkitVideoDecodedByteCount || 0,
      audioBytes: v.webkitAudioDecodedByteCount || 0,
      errKind, timedOut, startedMs: Math.round(performance.now() - t0),
    }
  }
  const finish = (timedOut) => {
    if (done) return
    done = true
    clearInterval(poll)
    const result = snapshot(timedOut)
    try { player.destroy() } catch {}
    v.removeAttribute('src'); try { v.load() } catch {}
    resolve(result)
  }
  const t0 = performance.now()
  try {
    player = mpegts.createPlayer({ type: 'mpegts', isLive: true, url }, { enableWorker: false })
    player.on(mpegts.Events.ERROR, (type) => { errKind = String(type); finish(false) })
    player.attachMediaElement(v)
    player.load()
    Promise.resolve(player.play()).catch(() => {})
  } catch { errKind = 'OtherError'; finish(false); return }
  const poll = setInterval(() => {
    const s = snapshot(false)
    if (s.played && s.audioBytes > 0) finish(false)
    else if (performance.now() - t0 > ms) finish(true)
  }, 250)
})
</script>`

function startPageServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/mpegts.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' })
        res.end(readFileSync(LIB_PATH))
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(PAGE)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function launch() {
  // 1ª opção: o Chromium do Playwright (o do E2E). Mede se decodifica H.264/AAC.
  const attempts = [
    { label: 'chromium do playwright', options: { headless: true } },
    { label: 'chrome instalado', options: { headless: true, channel: 'chrome' } },
  ]
  const probes = []
  for (const attempt of attempts) {
    let browser
    try {
      browser = await chromium.launch(attempt.options)
    } catch {
      probes.push({ label: attempt.label, disponivel: false, h264Aac: false })
      continue
    }
    const page = await browser.newPage()
    await page.goto('about:blank')
    const h264Aac = await page.evaluate((type) => typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type), H264_AAC)
    await page.close()
    probes.push({ label: attempt.label, disponivel: true, h264Aac })
    if (h264Aac) return { browser, label: attempt.label, probes }
    await browser.close()
  }
  return { browser: null, label: null, probes }
}

async function run() {
  const env = readEnv()
  const dns = env?.CCPLAY_PROBE_DNS
  const user = env?.CCPLAY_PROBE_USER
  const pass = env?.CCPLAY_PROBE_PASS
  if (!dns || !user || !pass) {
    console.log('PULADO: `.env` da raiz sem CCPLAY_PROBE_DNS/USER/PASS — nada a medir.')
    return
  }
  if (!existsSync(LIB_PATH)) {
    console.log('PULADO: mpegts.js não instalada (rode `npm install` em tv-web/).')
    return
  }

  console.log('=== Navegador do E2E: decodifica H.264/AAC? ===')
  const { browser, label, probes } = await launch()
  for (const p of probes) console.log(`  ${p.label}: disponível=${p.disponivel} h264+aac=${p.h264Aac}`)
  if (!browser) {
    console.log('INCONCLUSIVO: nenhum navegador disponível decodifica H.264/AAC — a amostra de canais não pode ser medida aqui.')
    process.exitCode = 2
    return
  }
  console.log(`  usando: ${label}`)

  // Lista de canais ao vivo da conta (a resposta nunca é impressa).
  const base = dns.replace(/\/+$/, '')
  const u = encodeURIComponent(user)
  const p = encodeURIComponent(pass)
  let streams
  try {
    streams = await (await fetch(`${base}/player_api.php?username=${u}&password=${p}&action=get_live_streams`)).json()
  } catch {
    console.log('FALHA: não consegui ler a lista de canais do painel (rede ou credencial).')
    process.exitCode = 1
    await browser.close()
    return
  }
  const ids = streams.map((s) => s.stream_id).filter((id) => id !== undefined)
  // Amostra espalhada pela lista (passo fixo), determinística entre execuções.
  const step = Math.max(1, Math.floor(ids.length / SAMPLE_SIZE))
  const sample = Array.from({ length: Math.min(SAMPLE_SIZE, ids.length) }, (_, i) => ids[i * step])
  console.log(`=== Amostra: ${sample.length} de ${ids.length} canais ao vivo ===`)

  const server = await startPageServer()
  const origin = `http://127.0.0.1:${server.address().port}`
  const page = await browser.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error'))
  await page.goto(origin)

  const categories = []
  const startTimes = []
  for (const id of sample) {
    const url = `${base}/live/${u}/${p}/${id}.ts`
    const result = await page.evaluate(([target, ms]) => window.tryPlay(target, ms), [url, PER_CHANNEL_MS])
    const category = classifySample(result)
    categories.push(category)
    if (category === 'ok') startTimes.push(result.startedMs)
    console.log(`  canal ${categories.length}/${sample.length}: ${category}${category === 'ok' ? ` (${result.startedMs} ms)` : ''}`)
  }

  const summary = summarize(categories)
  console.log('=== Resultado do spike ===')
  for (const line of summary.lines) console.log(line)
  if (startTimes.length > 0) {
    const sorted = [...startTimes].sort((a, b) => a - b)
    console.log(`  tempo até tocar (canais ok): mediana ${sorted[Math.floor(sorted.length / 2)]} ms, máx ${sorted[sorted.length - 1]} ms`)
  }
  console.log(`DECISÃO SUGERIDA: ${summary.verdict.toUpperCase()}`)

  await browser.close()
  server.close()
}

run().catch((error) => {
  // Só o nome: a mensagem de uma falha de rede pode embutir a URL com credencial.
  console.error('Erro inesperado:', error?.name ?? 'Error')
  process.exit(1)
})
