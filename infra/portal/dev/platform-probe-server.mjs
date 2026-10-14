// Coletor local opt-in de resultados públicos; não recebe DUID/segredos.
import http from 'node:http'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
const host = process.env.PROBE_HOST ?? '127.0.0.1'
const expectedAddress = process.env.PROBE_DEVICE_ADDRESS ?? '127.0.0.1'
const output = resolve('sdd/specs/069-portal-tv-licenca-anual/evidencias/platform-probe-observations.jsonl')
const booleanKeys = ['observedWallRollback']
const numberKeys = ['signatureBytes', 'wallNow', 'monotonicNow']
const resultKeys = ['duid', 'duidStability', 'es256', 'es256Tamper', 'aesGcm', 'aesAadTamper', 'persistence']
const keys = ['schemaVersion', 'protocol', 'previousWallNow', ...booleanKeys, ...numberKeys, ...resultKeys]
// 070/T003: `mac` é opcional (só o resultado passed/failed/unavailable; o MAC em si nunca vem no relatório).
const optionalResultKeys = ['mac']
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.socket.remoteAddress !== expectedAddress && req.socket.remoteAddress !== '::ffff:' + expectedAddress) { console.log('Sonda recusada: dispositivo'); res.writeHead(403).end(); return }
  if (req.url !== '/platform-probe') { res.writeHead(404).end(); return }
  // A TV instalada roda em `file://`: o Tizen 9 não envia `Origin` (outros enviam `null`). O endereço acima já restringe à TV.
  const origin = req.headers.origin
  if (origin !== undefined && !['null', 'file://', 'http://127.0.0.1:5173'].includes(origin)) { console.log('Sonda recusada: origem'); res.writeHead(403).end(); return }
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { console.log('Preflight da sonda recebido'); res.writeHead(204).end(); return }
  if (req.method !== 'POST') { res.writeHead(405).end(); return }
  let body = ''
  try {
    for await (const chunk of req) { body += chunk.toString(); if (body.length > 4096) throw Error('limit') }
    const data = JSON.parse(body)
    const present = Object.keys(data)
    if (keys.some(key => !present.includes(key)) || present.some(key => !keys.includes(key) && !optionalResultKeys.includes(key))
      || data.schemaVersion !== 1) throw Error('schema')
    if (optionalResultKeys.some(key => key in data && !['passed', 'failed', 'unavailable'].includes(data[key]))) throw Error('result')
    if (!['file:', 'http:', 'https:', 'other'].includes(data.protocol)) throw Error('protocol')
    if (resultKeys.some(key => !['passed', 'failed', 'unavailable', 'first_run'].includes(data[key]))) throw Error('result')
    if (booleanKeys.some(key => typeof data[key] !== 'boolean')) throw Error('boolean')
    if (numberKeys.some(key => !Number.isFinite(data[key]))) throw Error('number')
    if (data.previousWallNow !== null && !Number.isFinite(data.previousWallNow)) throw Error('previous')
    appendFileSync(output, JSON.stringify({ receivedAt: new Date().toISOString(), ...data }) + '\n')
    console.log('Relatório sanitizado recebido; protocolo=' + data.protocol)
    res.writeHead(204).end()
  } catch { console.log('Sonda recusada: schema'); res.writeHead(400).end() }
})
server.listen(Number(process.env.PROBE_PORT ?? 8769), host, () => console.log('Coletor de sonda local pronto.'))
