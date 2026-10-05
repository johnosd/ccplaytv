// Servidor de teste da feature 058 (headers da lista no AVPlay + catch-up Xtream).
//
// Serve as duas metades da feature, só com dados FICTÍCIOS:
//   (a) `/lista.m3u` — lista M3U com `Canal Header` e `Filme Header` (exigem
//       `User-Agent: CCPlayTeste/1.0`, 403 sem ele) e `Canal Livre` (sem header);
//   (b) painel Xtream falso (`player_api.php`, `xmltv.php`, `/live/…`, `/movie/…`,
//       `/timeshift/…`, `/streaming/timeshift.php`) com `Canal Arquivo` (3 dias de
//       arquivo), `Canal Sem Arquivo` e um filme `.ts` (gate de busca T014);
//   (c) `GET /_registro` — os headers `user-agent`/`referer` e a rota (SEM query)
//       de cada pedido de vídeo. Existe só aqui, para provar na TV (T003) o que o
//       motor enviou; o app nunca registra nada disso.
//
// Uso no E2E: `import { iniciarServidor } from './lib/servidorHeadersArquivo.mjs'`.
// Uso na TV: `node e2e/lib/servidorHeadersArquivo.mjs --lan [--sem-range] [--php]`
// (escuta em 0.0.0.0 e imprime só os endereços host:porta).
import { createServer } from 'node:http'
import { readFileSync, statSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const VIDEO = join(AQUI, '..', 'fixtures', 'canal-teste.mpegts')

export const USER_AGENT_EXIGIDO = 'CCPlayTeste/1.0'
export const REFERER_DECLARADO = 'http://ccplay.invalid/'
export const USUARIO = 'teste'
export const SENHA = 'teste'
export const FUSO_DO_PAINEL = 'America/Sao_Paulo'

const MINUTO = 60_000
const MEIA_HORA = 30 * MINUTO

/** `YYYYMMDDHHmmss +0000` — formato de horário do XMLTV, sempre UTC. */
function xmltvTime(ms) {
  const d = new Date(ms)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`
}

/** `AAAA-MM-DD HH:mm:ss` no relógio de parede do painel (como `server_info.time_now` dos painéis reais). */
function relogioDoPainel(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO_DO_PAINEL,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ms)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

/** Programas de −6 h a +2 h, de 30 em 30 min, alinhados à meia hora, para os dois canais do painel. */
export function montarGuia(agora) {
  const inicio = Math.floor(agora / MEIA_HORA) * MEIA_HORA - 12 * MEIA_HORA
  const linhas = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv generator-info-name="e2e-058">',
    '<channel id="canal.arquivo"><display-name>Canal Arquivo</display-name></channel>',
    '<channel id="canal.semarquivo"><display-name>Canal Sem Arquivo</display-name></channel>',
  ]
  for (let i = 0; i < 16; i += 1) {
    const start = inicio + i * MEIA_HORA
    const stop = start + MEIA_HORA
    for (const [canal, nome] of [
      ['canal.arquivo', 'Programa Arquivo'],
      ['canal.semarquivo', 'Programa Sem Arquivo'],
    ]) {
      linhas.push(
        `<programme start="${xmltvTime(start)}" stop="${xmltvTime(stop)}" channel="${canal}"><title lang="pt">${nome} ${i + 1}</title></programme>`,
      )
    }
  }
  linhas.push('</tv>')
  return linhas.join('\n')
}

function montarLista(base) {
  const headers = `|User-Agent=${USER_AGENT_EXIGIDO}&Referer=${REFERER_DECLARADO}`
  return [
    '#EXTM3U',
    '#EXTINF:-1 group-title="Canais | Teste",Canal Header',
    `${base}/video/header.ts${headers}`,
    '#EXTINF:-1 group-title="Canais | Teste",Canal Livre',
    `${base}/video/livre.ts`,
    // Pendência A1 do Analyze: o SC-001 cobre filme também, não só canal.
    '#EXTINF:-1 group-title="Filmes | Teste",Filme Header (2024)',
    `${base}/video/filme-header.ts${headers}`,
  ].join('\n')
}

const CATEGORIA_LIVE = [{ category_id: '1', category_name: 'Canais Arquivo', parent_id: 0 }]
const CATEGORIA_VOD = [{ category_id: '2', category_name: 'Filmes Teste', parent_id: 0 }]
const CANAIS = [
  { num: 1, name: 'Canal Arquivo', stream_type: 'live', stream_id: 7, epg_channel_id: 'canal.arquivo', category_id: '1', tv_archive: 1, tv_archive_duration: 3 },
  { num: 2, name: 'Canal Sem Arquivo', stream_type: 'live', stream_id: 8, epg_channel_id: 'canal.semarquivo', category_id: '1', tv_archive: 0, tv_archive_duration: 0 },
]
const FILMES = [
  { num: 1, name: 'Filme Busca (2024)', stream_type: 'movie', stream_id: 90, category_id: '2', container_extension: 'ts', rating: '7.0' },
]

/**
 * Sobe o servidor. `range`: responde `Range` com 206 (senão ignora e manda 200 inteiro, como um TS progressivo sem
 * suporte). `phpResponde`: a variante legada `/streaming/timeshift.php` serve o vídeo (senão 404). `restResponde`: a
 * variante REST `/timeshift/…` serve o vídeo (senão 404 — usado para provar o erro PLAY-06).
 */
export function iniciarServidor({ host = '127.0.0.1', port = 0, range = true, phpResponde = false, restResponde = true } = {}) {
  const registro = []
  /** Pedidos que não são vídeo, contados (o E2E espera a sincronização do EPG por aqui). */
  const contagem = { xmltv: 0 }
  const tamanho = statSync(VIDEO).size
  const video = readFileSync(VIDEO)
  const opcoes = { range, phpResponde, restResponde }

  function servirVideo(req, res) {
    registro.push({
      rota: new URL(req.url, 'http://x').pathname,
      userAgent: req.headers['user-agent'] ?? null,
      referer: req.headers.referer ?? null,
      range: req.headers.range ?? null,
    })
    const pedido = req.headers.range
    const casou = opcoes.range && typeof pedido === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(pedido) : null
    if (casou) {
      const inicio = casou[1] === '' ? Math.max(0, tamanho - Number(casou[2])) : Number(casou[1])
      const fim = casou[1] !== '' && casou[2] !== '' ? Math.min(Number(casou[2]), tamanho - 1) : tamanho - 1
      if (inicio >= tamanho || inicio > fim) {
        res.writeHead(416, { 'Content-Range': `bytes */${tamanho}` })
        res.end()
        return
      }
      res.writeHead(206, {
        'Content-Type': 'video/mp2t',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${inicio}-${fim}/${tamanho}`,
        'Content-Length': fim - inicio + 1,
      })
      res.end(video.subarray(inicio, fim + 1))
      return
    }
    const cabecalhos = { 'Content-Type': 'video/mp2t', 'Content-Length': tamanho }
    if (opcoes.range) cabecalhos['Accept-Ranges'] = 'bytes'
    res.writeHead(200, cabecalhos)
    res.end(video)
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const base = `http://${req.headers.host}`
    res.setHeader('Access-Control-Allow-Origin', '*')
    const json = (body) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    if (url.pathname === '/_registro') return json(registro)
    if (url.pathname === '/lista.m3u') {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(montarLista(base))
      return
    }
    if (url.pathname === '/video/header.ts' || url.pathname === '/video/filme-header.ts') {
      if (req.headers['user-agent'] !== USER_AGENT_EXIGIDO) {
        registro.push({ rota: url.pathname, userAgent: req.headers['user-agent'] ?? null, referer: req.headers.referer ?? null, recusado: true })
        res.writeHead(403)
        res.end()
        return
      }
      return servirVideo(req, res)
    }
    if (url.pathname === '/video/livre.ts') return servirVideo(req, res)

    if (url.pathname === '/player_api.php') {
      if (url.searchParams.get('username') !== USUARIO || url.searchParams.get('password') !== SENHA) {
        return json({ user_info: { auth: 0 } })
      }
      const action = url.searchParams.get('action')
      if (action === 'get_live_categories') return json(CATEGORIA_LIVE)
      if (action === 'get_live_streams') return json(CANAIS)
      if (action === 'get_vod_categories') return json(CATEGORIA_VOD)
      if (action === 'get_vod_streams') return json(FILMES)
      if (action) return json([])
      const agora = Date.now()
      return json({
        user_info: { username: USUARIO, auth: 1, status: 'Active', exp_date: '0', max_connections: '1', active_cons: '0', allowed_output_formats: ['ts'] },
        server_info: {
          url: req.headers.host?.split(':')[0] ?? '127.0.0.1',
          port: String(server.address().port),
          server_protocol: 'http',
          timezone: FUSO_DO_PAINEL,
          timestamp_now: Math.floor(agora / 1000),
          time_now: relogioDoPainel(agora),
        },
      })
    }
    if (url.pathname === '/xmltv.php') {
      contagem.xmltv += 1
      res.writeHead(200, { 'Content-Type': 'application/xml' })
      res.end(montarGuia(Date.now()))
      return
    }
    if (/^\/live\/[^/]+\/[^/]+\/\d+\.(ts|m3u8)$/.test(url.pathname)) return servirVideo(req, res)
    if (/^\/movie\/[^/]+\/[^/]+\/\d+\.\w+$/.test(url.pathname)) return servirVideo(req, res)
    const arquivoNegado = () => {
      registro.push({ rota: url.pathname, userAgent: req.headers['user-agent'] ?? null, referer: req.headers.referer ?? null, status: 404 })
      res.writeHead(404)
      res.end()
    }
    if (/^\/timeshift\/[^/]+\/[^/]+\/\d+\/\d{4}-\d{2}-\d{2}:\d{2}-\d{2}\/\d+\.\w+$/.test(url.pathname)) {
      if (opcoes.restResponde) return servirVideo(req, res)
      return arquivoNegado()
    }
    if (url.pathname === '/streaming/timeshift.php') {
      if (opcoes.phpResponde) return servirVideo(req, res)
      return arquivoNegado()
    }
    res.writeHead(404)
    res.end()
  })

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const porta = server.address().port
      resolve({
        server,
        porta,
        base: `http://127.0.0.1:${porta}`,
        registro,
        contagem,
        /** Muda o comportamento sem reiniciar (o E2E prova o PLAY-06 assim). */
        configurar(novas) {
          Object.assign(opcoes, novas)
        },
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}

function enderecosDaLan() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lan = process.argv.includes('--lan')
  const portaArg = process.argv.find((arg) => arg.startsWith('--porta='))
  const { porta } = await iniciarServidor({
    host: lan ? '0.0.0.0' : '127.0.0.1',
    port: portaArg ? Number(portaArg.slice('--porta='.length)) : 0,
    range: !process.argv.includes('--sem-range'),
    phpResponde: process.argv.includes('--php'),
  })
  for (const host of lan ? enderecosDaLan() : ['127.0.0.1']) console.log(`${host}:${porta}`)
}
