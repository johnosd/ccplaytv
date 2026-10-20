// Empacota os leitores reais do app (entrada.ts) em ../app2/appReal.js para a sonda. Usa o rolldown do tv-web.
// Uso (da raiz): node sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/memoria/empacotar.mjs
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tvWeb = resolve(here, '..', '..', '..', '..', '..', 'tv-web')
const require = createRequire(resolve(tvWeb, 'package.json'))
const { build } = await import(pathToFileURL(require.resolve('rolldown')).href)

// entrada.ts → appReal.js (thread principal); cargaWorker.ts → cargaWorker.js (Worker da carga por seção).
for (const [input, file] of [['entrada.ts', 'appReal.js'], ['cargaWorker.ts', 'cargaWorker.js']]) {
  await build({
    input: resolve(here, input),
    platform: 'browser',
    cwd: tvWeb,
    tsconfig: resolve(tvWeb, 'tsconfig.app.json'),
    transform: { target: 'chrome108', define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' } },
    output: { file: resolve(here, '..', 'app2', file), format: 'iife', minify: false },
  })
  console.log(`${file} gerado`)
}
