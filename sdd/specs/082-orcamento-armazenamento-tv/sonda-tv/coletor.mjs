// Coletor local das sondas da feature 082. Aceita só o IP da TV.
//  POST /storage-probe  → grava o relatório (schemas das sondas 1 e 2) em ../evidencias/*.jsonl
//  GET  /ping, /bin/<MB>, /amostra/<nome>.json, /amostra-gz/<nome>  → insumos da sonda 2 (amostras sanitizadas de
//       .amostras/, geradas por medir-lista-real.mjs: sem host do provedor, sem credencial, sem URL de stream).
// Uso: node coletor.mjs <ip-da-tv> [porta]
import http from 'node:http'
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const tvIp = process.argv[2]
const port = Number(process.argv[3] ?? 8770)
if (!tvIp) { console.error('uso: node coletor.mjs <ip-da-tv> [porta]'); process.exit(2) }
const here = dirname(fileURLToPath(import.meta.url))
const evidence = resolve(here, '..', 'evidencias')
mkdirSync(evidence, { recursive: true })
const outputs = { 'sonda-cota-082/1': resolve(evidence, 'sonda-cota-tv.jsonl'), 'sonda-tv-082/2': resolve(evidence, 'sonda-tv2.jsonl') }
const binCache = new Map()

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const remote = req.socket.remoteAddress
  if (remote !== tvIp && remote !== '::ffff:' + tvIp) { res.writeHead(403).end(); return }
  // App instalado roda em file://: o Tizen 9 não manda Origin (ou manda "null").
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  const path = (req.url ?? '').split('?')[0]
  if (req.method === 'GET') {
    if (path === '/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return }
    const bin = /^\/bin\/(\d{1,3})$/.exec(path)
    if (bin) {
      const size = Math.min(Number(bin[1]), 64)
      if (!binCache.has(size)) binCache.set(size, randomBytes(size * 1024 * 1024))
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(binCache.get(size)); return
    }
    const sample = /^\/amostra(-gz)?\/([a-z]+)(\.json)?$/.exec(path)
    if (sample) {
      const file = resolve(here, '.amostras', `${sample[2]}.json`)
      if (!existsSync(file)) { res.writeHead(404).end(); return }
      const body = readFileSync(file)
      // -gz: gzip "cru" (sem Content-Encoding) para o cliente descomprimir com DecompressionStream.
      res.writeHead(200, { 'Content-Type': sample[1] ? 'application/octet-stream' : 'application/json' }).end(sample[1] ? gzipSync(body) : body); return
    }
    res.writeHead(404).end(); return
  }
  if (path !== '/storage-probe' || req.method !== 'POST') { res.writeHead(404).end(); return }
  let body = ''
  try {
    for await (const chunk of req) { body += chunk.toString(); if (body.length > 1024 * 1024) throw Error('limite') }
    const data = JSON.parse(body)
    const output = outputs[data.schema]
    if (!output) throw Error('schema')
    appendFileSync(output, JSON.stringify({ receivedAt: new Date().toISOString(), ...data }) + '\n')
    console.log(`[${new Date().toLocaleTimeString()}] recebido: ${data.label} (fase ${data.phase})`)
    res.writeHead(204).end()
  } catch (error) { console.log('recusado:', error.message); res.writeHead(400).end() }
})
server.listen(port, '0.0.0.0', () => console.log(`Coletor das sondas pronto na porta ${port}`))
