import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { makeZip } from './testZip.mjs'
import { readWgt, sha256 } from './wgt.mjs'

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
