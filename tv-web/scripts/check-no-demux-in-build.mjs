// Feature 047 (US3, FR-007): o build de produção/Tizen NÃO pode conter a
// biblioteca de demux (`mpegts.js`, só dev). O `import()` fica atrás de
// `import.meta.env.DEV` e o bundler deveria eliminá-lo — este script não
// confia nisso: varre a saída e falha o `npm run build` se achar a lib (R-005).
//
//   node scripts/check-no-demux-in-build.mjs [pasta]      (padrão: dist)
//
// Imprime só NOMES de arquivo e de marcador — nunca trechos do conteúdo.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Nomes internos da biblioteca que sobrevivem à minificação (medido em
 * `mpegts.js@1.8.2`) e não existem no bundle do app.
 */
export const DEMUX_MARKERS = [
  'FetchStreamLoader',
  'MSEController',
  'TSDemuxer',
  'enableStashBuffer',
  'liveBufferLatencyChasing',
]

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.map', '.json'])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}

/** @returns {Array<{ file: string, markers: string[] }>} arquivos (relativos a `dir`) que contêm a lib. */
export function findDemuxInBuild(dir) {
  const hits = []
  for (const file of walk(dir)) {
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue
    const text = readFileSync(file, 'latin1')
    const markers = DEMUX_MARKERS.filter((marker) => text.includes(marker))
    if (markers.length > 0) hits.push({ file: path.relative(dir, file).replace(/\\/g, '/'), markers })
  }
  return hits
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const dir = path.resolve(process.argv[2] ?? path.join(root, 'dist'))
  if (!existsSync(dir)) {
    console.error(`check-no-demux-in-build: pasta não encontrada (${path.basename(dir)}) — rode o build antes.`)
    process.exit(2)
  }
  const hits = findDemuxInBuild(dir)
  if (hits.length > 0) {
    console.error('check-no-demux-in-build: a biblioteca de demux (só dev) foi parar no build:')
    for (const hit of hits) console.error(`  - ${hit.file} (${hit.markers.join(', ')})`)
    console.error('O import() de mpegts.js deve ficar dentro de `import.meta.env.DEV` (src/lib/player/devDemux.ts).')
    process.exit(1)
  }
  console.log('check-no-demux-in-build: ok — nenhum marcador da biblioteca de demux no build.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
