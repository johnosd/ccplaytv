import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { checkKit, findSecrets, inspectPng } from './kit.mjs'
import { kitReader } from './release-gate.mjs'

const kitDir = new URL('../../../release/samsung/kit/', import.meta.url)
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const statusOf = (results, id) => results.find((r) => r.id === id)?.status

function png(colorType, extraChunk) {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'ascii')
  ihdr.writeUInt32BE(400, 8)
  ihdr.writeUInt32BE(400, 12)
  ihdr[16] = 8
  ihdr[17] = colorType
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]
  if (extraChunk) {
    const chunk = Buffer.alloc(12 + 1)
    chunk.writeUInt32BE(1, 0)
    chunk.write(extraChunk, 4, 'ascii')
    parts.push(chunk)
  }
  return Buffer.concat(parts)
}

it('findSecrets acusa URL Xtream, chave hex de 32, Bearer e chave privada, e não acusa os textos reais da listagem', () => {
  expect(findSecrets('http://h.example/live/u/p/1.ts')).toContain('xtream-credential-url')
  expect(findSecrets(`tmdb ${'0123456789abcdef'.repeat(2)}`)).toContain('hex32-key')
  expect(findSecrets('Authorization: Bearer abcdefghijklmnop')).toContain('bearer-token')
  expect(findSecrets('-----BEGIN RSA PRIVATE KEY-----')).toContain('private-key-block')
  expect(findSecrets(`sha ${'a'.repeat(64)}`)).toEqual([]) // hash do manifest não é chave
  for (const lang of ['pt', 'en', 'es']) {
    expect(findSecrets(readFileSync(new URL(`listing/${lang}.md`, kitDir), 'utf8')), lang).toEqual([])
  }
})

it('PNG RGB com tRNS conta como alfa; sem tRNS, não', () => {
  expect(inspectPng(png(2, 'tRNS'))?.hasAlpha).toBe(true)
  expect(inspectPng(png(2))?.hasAlpha).toBe(false)
})

it('.p12 no manifest bloqueia segredos; caminho fora do kit bloqueia o item sem ler o arquivo', () => {
  const root = mkdtempSync(join(tmpdir(), 'kit078-'))
  const kit = join(root, 'kit')
  mkdirSync(kit)
  const outside = Buffer.from('fora do kit')
  writeFileSync(join(root, 'fora.md'), outside)
  const cert = Buffer.from('binario')
  writeFileSync(join(kit, 'autor.p12'), cert)
  const results = checkKit({
    readFile: kitReader(kit),
    manifest: { kitVersion: '0.2.1', items: [
      { id: 'SAM-KIT-UIDESC', owner: 'produto', status: 'Pass', artifacts: [{ path: '../fora.md', sha256: sha(outside) }] },
      { id: 'SAM-KIT-ICONBG', owner: 'produto', status: 'Pending', artifacts: [{ path: 'autor.p12', sha256: sha(cert) }] },
    ] },
  })
  expect(statusOf(results, 'SAM-KIT-UIDESC')).toBe('Blocked')
  expect(statusOf(results, 'INT-KIT-SECRETS')).toBe('Blocked')
  expect(results.find((r) => r.id === 'INT-KIT-SECRETS').paths).toEqual(['autor.p12'])
})

it('o kit real: listagem, VOC, artes e UI Description passam (conferidos de verdade), sem segredo, acesso de teste pendente com dono; o comercial bloqueia o acesso de teste sem validade', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', kitDir), 'utf8'))
  const readFile = kitReader(fileURLToPath(kitDir))
  const base = checkKit({ manifest, readFile, variant: 'commercial', today: '2026-10-16' })
  for (const id of ['SAM-KIT-LISTING', 'SAM-KIT-VOC', 'INT-KIT-SECRETS', 'SAM-KIT-LOGO', 'SAM-KIT-ICONBG', 'SAM-KIT-SHOTS', 'SAM-KIT-UIDESC']) {
    expect(statusOf(base, id), id).toBe('Pass')
  }
  for (const id of ['SAM-KIT-TESTACCESS']) {
    const result = base.find((r) => r.id === id)
    expect(result.status, id).toBe('Pending')
    expect(result.owner, id).toBeTruthy()
  }
  const withAccess = { ...manifest, items: manifest.items.map((item) => (item.id === 'SAM-KIT-TESTACCESS' ? { ...item, status: 'Pass' } : item)) }
  // O demo-access real já declara o teste local do revisor, mas ainda não tem a validade da lista de teste.
  for (const variant of ['commercial', 'base']) {
    const result = checkKit({ manifest: withAccess, readFile, variant }).find((r) => r.id === 'SAM-KIT-TESTACCESS')
    expect(result.status, variant).toBe('Blocked')
    expect(result.detail, variant).toMatch(/validUntil/)
  }
})

it('comercial (R-015/R-004): acesso de teste só passa com o teste local do revisor declarado e a validade em dia', () => {
  const kit = mkdtempSync(join(tmpdir(), 'kit078-access-'))
  const check = (text, today = '2026-10-17') => {
    const buffer = Buffer.from(text)
    writeFileSync(join(kit, 'demo-access.md'), buffer)
    const manifest = { kitVersion: '0.2.1', items: [{ id: 'SAM-KIT-TESTACCESS', owner: 'release', status: 'Pass', artifacts: [{ path: 'demo-access.md', sha256: sha(buffer) }] }] }
    return checkKit({ manifest, readFile: kitReader(kit), variant: 'commercial', today }).find((r) => r.id === 'SAM-KIT-TESTACCESS')
  }
  expect(check('validUntil: 2026-12-31').detail).toMatch(/reviewerAccess/)
  expect(check('reviewerAccess: local-trial-7d\nvalidUntil: 2026-12-31').status).toBe('Pass')
  expect(check('reviewerAccess: local-trial-7d\nvalidUntil: 2026-10-01').detail).toMatch(/vencido/)
})
