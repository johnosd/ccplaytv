import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { readWgt, sha256 } from './wgt.mjs'

/** Zip mínimo (CRC zerado — o leitor não confere). `deflate: true` usa o método 8. */
export function makeZip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data, deflate } of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const body = deflate ? deflateRawSync(data) : data
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, body)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + body.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, eocd])
}

it('lê entradas stored e deflated com conteúdo e hash corretos', () => {
  const config = Buffer.from('<widget version="0.3.0"></widget>')
  const script = Buffer.from('console.log("x")\n'.repeat(50))
  const entries = readWgt(makeZip([
    { name: 'config.xml', data: config },
    { name: 'assets/index.js', data: script, deflate: true },
  ]))
  expect([...entries.keys()]).toEqual(['config.xml', 'assets/index.js'])
  expect(entries.get('assets/index.js').equals(script)).toBe(true)
  expect(sha256(entries.get('config.xml'))).toBe(createHash('sha256').update(config).digest('hex'))
})

it('buffer que não é zip vira invalid_wgt sem ecoar o conteúdo', () => {
  const garbage = Buffer.from('password=s3cr3tValue '.repeat(10))
  expect(() => readWgt(garbage)).toThrow('invalid_wgt')
  try { readWgt(garbage) } catch (error) { expect(String(error.message)).not.toContain('s3cr3t') }
})
