// Contrato da feature 078 (prontidão para publicação Samsung TV). Travado em
// sdd/specs/078-prontidao-publicacao-samsung/contract-tests.lock — o sdd-execute
// só pode fazê-lo passar. Regras em sdd/specs/078-prontidao-publicacao-samsung/logic/gate.md.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CHECKLIST } from './checklist.mjs'
import { compareWithPrevious, describeCandidate } from './candidate.mjs'
import { checkInventory, checkPackage } from './packageChecks.mjs'
import { checkPrivileges } from './privileges.mjs'
import { checkKit } from './kit.mjs'
import { decideLaunch } from './decision.mjs'

const statusOf = (results, id) => results.find((r) => r.id === id)?.status
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

function config({ version = '0.3.0', required = '8.0', name = 'CCPlayTV' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://yourdomain/CCPlayTv" version="${version}" viewmodes="maximized">
   <name>${name}</name>
   <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"></feature>
   <tizen:application id="8tZqMtwANL.CCPlayTv" package="8tZqMtwANL" required_version="${required}"></tizen:application>
   <tizen:privilege name="http://tizen.org/privilege/internet"></tizen:privilege>
   <tizen:profile name="tv-samsung"></tizen:profile>
</widget>`
}

// JPEG mínimo: SOI + segmentos COM de enchimento + SOF0 + EOI (o inspetor só lê marcadores).
function jpeg(width, height, padBytes = 0) {
  const parts = [Buffer.from([0xff, 0xd8])]
  for (let left = padBytes; left > 0; left -= 60000) {
    const n = Math.min(left, 60000)
    const seg = Buffer.alloc(4 + n)
    seg.writeUInt16BE(0xfffe, 0)
    seg.writeUInt16BE(n + 2, 2)
    parts.push(seg)
  }
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  parts.push(sof, Buffer.from([0xff, 0xd9]))
  return Buffer.concat(parts)
}

// PNG mínimo: assinatura + IHDR (CRC não é conferido). colorType 6 = RGBA, 2 = RGB.
function png(width, height, colorType) {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'ascii')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr[16] = 8
  ihdr[17] = colorType
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr])
}

describe('078 — gate de prontidão para o Seller Office', () => {
  // US1 · FR-001 · SC-009
  it('candidato registra revisão/versão/hash, árvore suja bloqueia e mudança de hash torna o anterior obsoleto', () => {
    const input = { variant: 'base', revision: 'a'.repeat(40), dirtyPaths: [], buildMode: 'production', version: '0.3.0', wgtSha256: 'b'.repeat(64) }
    const clean = describeCandidate(input)
    expect(clean.candidate).toMatchObject({ variant: 'base', revision: input.revision, version: '0.3.0', wgtSha256: input.wgtSha256 })
    expect(statusOf(clean.results, 'INT-CAND-TREE')).toBe('Pass')
    expect(statusOf(clean.results, 'INT-CAND-HASH')).toBe('Pass')

    const dirty = describeCandidate({ ...input, dirtyPaths: ['tv-web/src/App.tsx'] })
    expect(statusOf(dirty.results, 'INT-CAND-TREE')).toBe('Blocked')

    expect(compareWithPrevious(clean.candidate, clean.candidate).stale).toBe(false)
    expect(compareWithPrevious(clean.candidate, { ...clean.candidate, wgtSha256: 'c'.repeat(64) }).stale).toBe(true)
    expect(compareWithPrevious(clean.candidate, { ...clean.candidate, revision: 'd'.repeat(40) }).stale).toBe(true)
  })

  // US2 · FR-003 · FR-003a · FR-003b · FR-004 · FR-010a
  it('pacote: arquivos de assinatura, faixa de versão, required_version contra o piso, título, debug e inventário nos dois sentidos', () => {
    const files = ['config.xml', 'author-signature.xml', 'signature1.xml', 'index.html']
    const ok = checkPackage({ configXml: config({ version: '0.10.0' }), packageFiles: files, runtimeFloor: '8.0', lastPublishedVersion: '0.9.0', buildType: 'Release', storeTitle: 'CCPlayTV' })
    for (const id of ['SAM-PKG-FILES', 'SAM-CFG-VERSION', 'SAM-CFG-APIVERSION', 'SAM-CFG-TITLE', 'SAM-CFG-SCREENSIZE', 'SAM-CFG-PACKAGEID', 'INT-PKG-RELEASE']) {
      expect(statusOf(ok, id), id).toBe('Pass')
    }
    expect(statusOf(ok, 'SAM-PKG-MULTIARCH')).toBe('Not Applicable')

    const bad = checkPackage({ configXml: config({ version: '256.0.0', required: '2.3', name: 'CCPlayTv' }), packageFiles: files.filter((f) => f !== 'signature1.xml'), runtimeFloor: '8.0', buildType: 'Debug', storeTitle: 'CCPlayTV' })
    for (const id of ['SAM-PKG-FILES', 'SAM-CFG-VERSION', 'SAM-CFG-APIVERSION', 'SAM-CFG-TITLE', 'INT-PKG-RELEASE']) {
      expect(statusOf(bad, id), id).toBe('Blocked')
    }
    const notHigher = checkPackage({ configXml: config({ version: '0.3.0' }), packageFiles: files, runtimeFloor: '8.0', lastPublishedVersion: '0.3.0', buildType: 'Release', storeTitle: 'CCPlayTV' })
    expect(statusOf(notHigher, 'SAM-CFG-VERSION')).toBe('Blocked')

    const same = { 'index.html': 'h1', 'assets/a.js': 'h2' }
    expect(statusOf(checkInventory({ declared: ['index.html', 'assets/a.js'], emitted: same, packaged: same }), 'INT-PKG-INVENTORY')).toBe('Pass')
    const drift = checkInventory({
      declared: ['index.html', 'assets/a.js', 'assets/old.js'],
      emitted: { 'index.html': 'h1', 'assets/a.js': 'h2', 'assets/new.js': 'h3' },
      packaged: { 'index.html': 'h1', 'assets/a.js': 'hX', 'assets/new.js': 'h3' },
    })
    const result = drift.find((r) => r.id === 'INT-PKG-INVENTORY')
    expect(result.status).toBe('Blocked')
    expect(result.paths).toEqual(expect.arrayContaining(['assets/old.js', 'assets/new.js', 'assets/a.js']))
  })

  // FR-005 — nível, autorização partner, regras nominais do checklist e herança base/comercial
  it('privilégios: productinfo sem Checkout só passa com confirmação registrada; descontinuado, fora do ledger, partner sem autorização e uso só comercial bloqueiam', () => {
    const P = (n) => `http://developer.samsung.com/privilege/${n}`
    const internet = 'http://tizen.org/privilege/internet'
    const ledger = {
      [internet]: { level: 'public', usedBy: { base: ['rede'], commercial: ['rede'] } },
      [P('productinfo')]: { level: 'public', usedBy: { base: ['platformProbe'], commercial: ['portal'] }, confirmation: null },
      [P('partnerthing')]: { level: 'partner', usedBy: { base: ['x'], commercial: ['x'] }, authorization: null },
      [P('network.public')]: { level: 'public', usedBy: { commercial: ['portal'] } },
    }
    const features = { checkout: false, inAppAds: false }
    const declared = [internet, P('productinfo'), P('keymanager'), 'http://tizen.org/privilege/unlisted', P('partnerthing'), P('network.public')]
    const base = checkPrivileges({ declared, ledger, features, variant: 'base' })
    expect(statusOf(base, `SAM-PRV:${internet}`)).toBe('Pass')
    expect(statusOf(base, `SAM-PRV:${P('productinfo')}`)).toBe('Blocked')
    expect(statusOf(base, `SAM-PRV:${P('keymanager')}`)).toBe('Blocked')
    expect(statusOf(base, 'SAM-PRV:http://tizen.org/privilege/unlisted')).toBe('Blocked')
    expect(statusOf(base, `SAM-PRV:${P('partnerthing')}`)).toBe('Blocked')
    expect(statusOf(base, `SAM-PRV:${P('network.public')}`)).toBe('Blocked')
    expect(statusOf(base, 'SAM-PRV')).toBe('Blocked')

    const confirmed = { ...ledger, [P('productinfo')]: { ...ledger[P('productinfo')], confirmation: { source: 'https://developer.samsung.com/x', date: '2026-10-16' } } }
    const fixed = checkPrivileges({ declared: [internet, P('productinfo')], ledger: confirmed, features, variant: 'base' })
    expect(statusOf(fixed, `SAM-PRV:${P('productinfo')}`)).toBe('Pass')
    expect(statusOf(fixed, 'SAM-PRV')).toBe('Pass')
  })

  // US4 · FR-008 · FR-010 · FR-016
  it('kit: hash, quatro JPEG 1280×720/1920×1080 < 500 kB, logo com alfa, Not Applicable justificado e segredo bloqueado sem ser ecoado', () => {
    const files = new Map()
    const add = (path, buf) => { files.set(path, buf); return { path, sha256: sha(buf) } }
    const shots = [1, 2, 3].map((i) => add(`shots/${i}.jpg`, jpeg(1920, 1080)))
    shots.push(add('shots/4.jpg', jpeg(1280, 720)))
    const logo = add('logo.png', png(400, 400, 6))
    const secretText = 'Lista demo: http://painel.example/get.php?username=demo&password=s3cr3tValue'
    const listing = add('listing/pt.md', Buffer.from(secretText))
    const manifest = (items) => ({ kitVersion: '0.3.0', items })
    const readFile = (path) => files.get(path)

    const good = checkKit({ readFile, manifest: manifest([
      { id: 'SAM-KIT-SHOTS', owner: 'produto', status: 'Pass', artifacts: shots },
      { id: 'SAM-KIT-LOGO', owner: 'produto', status: 'Pass', artifacts: [logo] },
      { id: 'SAM-KIT-ICONBG', owner: 'produto', status: 'Not Applicable', naReason: 'motivo registrado' },
    ]) })
    expect(statusOf(good, 'SAM-KIT-SHOTS')).toBe('Pass')
    expect(statusOf(good, 'SAM-KIT-LOGO')).toBe('Pass')
    expect(statusOf(good, 'SAM-KIT-ICONBG')).toBe('Not Applicable')
    expect(statusOf(good, 'INT-KIT-SECRETS')).toBe('Pass')

    const tooBig = add('shots/big.jpg', jpeg(1920, 1080, 520000))
    const oddSize = add('shots/odd.jpg', jpeg(1280, 721))
    const badHash = { ...shots[0], sha256: 'f'.repeat(64) }
    const variants = [shots.slice(0, 3), [...shots.slice(0, 3), tooBig], [...shots.slice(0, 3), oddSize], [badHash, ...shots.slice(1)]]
    for (const artifacts of variants) {
      const r = checkKit({ readFile, manifest: manifest([{ id: 'SAM-KIT-SHOTS', owner: 'produto', status: 'Pass', artifacts }]) })
      expect(statusOf(r, 'SAM-KIT-SHOTS')).toBe('Blocked')
    }

    const bad = checkKit({ readFile, manifest: manifest([
      { id: 'SAM-KIT-LOGO', owner: 'produto', status: 'Pass', artifacts: [add('logo-rgb.png', png(400, 400, 2))] },
      { id: 'SAM-KIT-ICONBG', owner: 'produto', status: 'Not Applicable' },
      { id: 'SAM-KIT-LISTING', owner: 'produto', status: 'Pass', artifacts: [listing] },
    ]) })
    expect(statusOf(bad, 'SAM-KIT-LOGO')).toBe('Blocked')
    expect(statusOf(bad, 'SAM-KIT-ICONBG')).toBe('Blocked')
    expect(statusOf(bad, 'INT-KIT-SECRETS')).toBe('Blocked')
    expect(JSON.stringify(bad)).not.toContain('s3cr3tValue')
  })

  // FR-006 · FR-014 · FR-014a · SC-001 · SC-003 · SC-008 · US3 · US6
  it('decisão: item ausente é pendência, Waived só em critério interno dispensável e só alvo com evidência de TV entra no conjunto aprovado', () => {
    const allPass = CHECKLIST.map((item) => ({ id: item.id, status: item.id === 'SAM-PKG-MULTIARCH' ? 'Not Applicable' : 'Pass', detail: 'ok', owner: 'release' }))
    const tv = { country: 'BR', model: 'QN50Q60DAGXZD', firmware: 'T-fw', environment: 'tv', evidence: 'release/samsung/evidence/tv.json', date: '2026-10-16', state: 'allowed' }
    const emulatorOnly = { ...tv, model: 'EMULADOR', environment: 'emulator' }
    const noEvidence = { ...tv, model: 'QN55OUTRO', evidence: '' }
    const matrix = [tv, emulatorOnly, noEvidence]

    const ready = decideLaunch({ results: allPass, matrix })
    expect(ready.decision).toBe('Ready for submission')
    expect(ready.approvedTargets).toEqual([tv])

    const missing = decideLaunch({ results: allPass.filter((r) => r.id !== 'SAM-KIT-VOC'), matrix })
    expect(missing.decision).toBe('Blocked')
    expect(missing.blockers).toContain('SAM-KIT-VOC')

    const waive = (id) => allPass.map((r) => (r.id === id ? { ...r, status: 'Waived', owner: 'release', justification: 'motivo registrado' } : r))
    expect(decideLaunch({ results: waive('INT-EVD-EMULATOR'), matrix }).decision).toBe('Ready for submission')
    expect(decideLaunch({ results: waive('SAM-KIT-SHOTS'), matrix }).blockers).toContain('SAM-KIT-SHOTS')
    expect(decideLaunch({ results: waive('INT-EVD-TV'), matrix }).decision).toBe('Blocked')

    const pendingTv = allPass.map((r) => (r.id === 'INT-EVD-TV' ? { ...r, status: 'Pending' } : r))
    expect(decideLaunch({ results: pendingTv, matrix }).decision).toBe('Blocked')
    expect(decideLaunch({ results: allPass, matrix: [emulatorOnly, noEvidence] }).decision).toBe('Blocked')
  })
})
