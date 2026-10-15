import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMUX_MARKERS, findDemuxInBuild } from './check-no-demux-in-build.mjs'

const dirs = []
function fakeBuild(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'build-047-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('check-no-demux-in-build (feature 047, R-005)', () => {
  it('passa numa pasta de build limpa', () => {
    const dir = fakeBuild({
      'index.html': '<!doctype html><script src="assets/index.js"></script>',
      'assets/index.js': 'console.log("app"); const type = "video/mp2t"',
    })
    expect(findDemuxInBuild(dir)).toEqual([])
  })

  it('acusa o arquivo (e só o nome) que contém a biblioteca, em qualquer subpasta', () => {
    const dir = fakeBuild({
      'assets/index.js': 'console.log("app")',
      'assets/chunk/mpegts-chunk.js': `class ${DEMUX_MARKERS[0]} {} // restante minificado`,
    })
    const hits = findDemuxInBuild(dir)
    expect(hits).toEqual([{ file: 'assets/chunk/mpegts-chunk.js', markers: [DEMUX_MARKERS[0]] }])
  })

  it('ignora arquivos binários (fontes, imagens) mesmo que os bytes casem por acaso', () => {
    const dir = fakeBuild({ 'assets/fonte.woff2': DEMUX_MARKERS.join(' ') })
    expect(findDemuxInBuild(dir)).toEqual([])
  })
})
