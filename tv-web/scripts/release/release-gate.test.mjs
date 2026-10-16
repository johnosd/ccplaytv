// Feature 078 (US7, T035): o CLI como processo sobre um repositório temporário. Segunda execução
// com outro pacote marca o relatório como obsoleto; nenhuma saída leva conteúdo de artefato.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { makeZip } from './testZip.mjs'

const CLI = fileURLToPath(new URL('./release-gate.mjs', import.meta.url))
const SECRET = 's3cr3tValue078'
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const config = (version) => `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://yourdomain/CCPlayTv" version="${version}" viewmodes="maximized">
   <name>CCPlayTV</name>
   <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"></feature>
   <tizen:application id="8tZqMtwANL.CCPlayTv" package="8tZqMtwANL" required_version="8.0"></tizen:application>
   <tizen:profile name="tv-samsung"></tizen:profile>
</widget>`

function write(root, path, content) {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), content)
}

/** Repositório git mínimo com projeto Tizen, release/samsung e um kit cujo texto tem um segredo. */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'gate078-'))
  roots.push(root)
  write(root, 'CCPlayTv/config.xml', config('0.3.0'))
  write(root, 'CCPlayTv/tizen_web_project.yaml', 'build_type: Release\nfiles:\n- index.html\n')
  write(root, 'release/samsung/distribution.json', JSON.stringify({ tizenId: '8tZqMtwANL.CCPlayTv', variant: 'base', countries: ['BR'] }))
  const listing = Buffer.from(`# CCPlayTV\n\nDemo: username=demo&password=${SECRET}\n`)
  write(root, 'release/samsung/kit/listing/pt.md', listing)
  write(root, 'release/samsung/kit/manifest.json', JSON.stringify({
    kitVersion: '0.3.0', storeTitle: 'CCPlayTV',
    items: [{ id: 'SAM-KIT-LISTING', owner: 'produto', status: 'Pass', artifacts: [{ path: 'listing/pt.md', sha256: sha(listing) }] }],
  }))
  const git = (...args) => execFileSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@example.invalid', '-c', 'core.autocrlf=false', ...args], { cwd: root, stdio: 'ignore' })
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'fixture')
  return root
}

function makeWgt(root, name, version) {
  const path = join(root, 'out', name)
  write(root, `out/${name}`, makeZip([
    { name: 'config.xml', data: Buffer.from(config(version)) },
    { name: 'author-signature.xml', data: Buffer.from('<Signature/>') },
    { name: 'signature1.xml', data: Buffer.from('<Signature/>') },
    { name: 'index.html', data: Buffer.from('<html></html>'), deflate: true },
  ]))
  return path
}

function runCli(root, wgt) {
  const result = spawnSync(process.execPath, [CLI, '--variant', 'base', '--root', root, '--wgt', wgt], { encoding: 'utf8' })
  const base = join(root, 'release', 'samsung', 'reports', '0.3.0-base')
  return { ...result, json: readFileSync(`${base}.json`, 'utf8'), md: readFileSync(`${base}.md`, 'utf8') }
}

it('grava o relatório; outro pacote na segunda execução marca obsolescência; segredo do kit nunca sai', () => {
  const root = makeRepo()
  // `out/` não é commitado: fica fora do git para não sujar a árvore (o .wgt real fica em .buildResult, ignorado).
  writeFileSync(join(root, '.git', 'info', 'exclude'), 'out/\n')

  const first = runCli(root, makeWgt(root, 'a.wgt', '0.3.0'))
  expect(first.status).toBe(2) // Blocked: kit, evidências e registros pendentes
  const firstReport = JSON.parse(first.json)
  expect(firstReport.stale).toEqual({ stale: false, reasons: [] })
  expect(firstReport.results.find((r) => r.id === 'INT-CAND-TREE').status).toBe('Pass')
  expect(firstReport.results.find((r) => r.id === 'INT-KIT-SECRETS').status).toBe('Blocked')
  expect(firstReport.kit.manifestSha256).toMatch(/^[0-9a-f]{64}$/)

  // Mesmo config.xml do disco, mas pacote com outro conteúdo (outra entrada) → outro hash.
  const otherWgt = join(root, 'out', 'b.wgt')
  writeFileSync(otherWgt, makeZip([
    { name: 'config.xml', data: Buffer.from(config('0.3.0')) },
    { name: 'author-signature.xml', data: Buffer.from('<Signature/>') },
    { name: 'signature1.xml', data: Buffer.from('<Signature/>') },
    { name: 'index.html', data: Buffer.from('<html>v2</html>'), deflate: true },
  ]))
  const second = runCli(root, otherWgt)
  const secondReport = JSON.parse(second.json)
  expect(secondReport.stale.stale).toBe(true)
  expect(secondReport.stale.reasons).toContain('wgtSha256')
  expect(second.md).toMatch(/obsoleto \(.*wgtSha256/)

  for (const output of [first.stdout, first.stderr, first.json, first.md, second.stdout, second.stderr, second.json, second.md]) {
    expect(output).not.toContain(SECRET)
  }
})

it('kit alterado e config.xml do disco diferente do pacote entram nas razões', () => {
  const root = makeRepo()
  writeFileSync(join(root, '.git', 'info', 'exclude'), 'out/\n')
  const wgt = makeWgt(root, 'a.wgt', '0.3.0')
  runCli(root, wgt)

  const manifestPath = join(root, 'release', 'samsung', 'kit', 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, kitVersion: '0.3.1' }))
  writeFileSync(join(root, 'CCPlayTv', 'config.xml'), config('0.3.1'))
  const { stale } = JSON.parse(runCli(root, wgt).json)
  expect(stale.reasons).toEqual(expect.arrayContaining(['kit', 'config.xml do disco difere do pacote']))
})
