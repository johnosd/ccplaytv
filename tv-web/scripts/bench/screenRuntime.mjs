import { build } from 'vite'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const hash = value => createHash('sha256').update(value).digest('hex')

async function filesBelow(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesBelow(file))
    else files.push(file)
  }
  return files.sort()
}

export async function fingerprints() {
  const inputs = (await filesBelow(path.join(root, 'src'))).filter(f => /\.(tsx?|css|svg|png|jpe?g|webp|woff2?|json|mjs)$/.test(f) && !/\.test\.|[\\/]bench[\\/]/.test(f))
  inputs.push(...await filesBelow(path.join(root, 'public')))
  inputs.push(...['package.json', 'package-lock.json', 'vite.config.ts', 'index.html'].map(f => path.join(root, f)))
  const entries = await Promise.all(inputs.map(async file => ({ path: path.relative(root, file).replaceAll('\\', '/'), sha256: hash(await readFile(file)) })))
  const harnessFiles = [...await filesBelow(path.join(root, 'scripts/bench')), ...await filesBelow(path.join(root, 'src/bench')),
    ...await filesBelow(path.join(root, 'e2e/fixtures/screen-perf'))].filter(f => /screen|screen-perf/.test(f))
  const harness = await Promise.all(harnessFiles.map(async file => ({ path: path.relative(root, file).replaceAll('\\', '/'), sha256: hash(await readFile(file)) })))
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    app: hash(JSON.stringify(entries)), inputs: entries, harness: hash(JSON.stringify(harness)), harnessInputs: harness }
}

export async function createRuntime() {
  const temporaryParent = path.resolve(os.tmpdir())
  const work = await mkdtemp(path.join(temporaryParent, 'ccplay-screen-065-'))
  const normal = path.join(work, 'normal'), control = path.join(work, 'control')
  let server
  async function close() {
    if (server) await new Promise(resolve => server.close(resolve))
    // Só remover a pasta efêmera criada por esta invocação, dentro do Temp resolvido.
    if (path.dirname(path.resolve(work)) !== temporaryParent || !path.basename(work).startsWith('ccplay-screen-065-')) throw new Error('limpeza fora do diretório do benchmark')
    await rm(work, { recursive: true, force: true })
  }
  try {
    const options = { root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn',
      build: { outDir: normal, emptyOutDir: true } }
    await build(options)
    const normalFiles = await filesBelow(normal)
    if (normalFiles.some(file => /demux|mpegts|screenControl|screen-perf/.test(file))) throw new Error('build normal contém módulo de bancada/demux')
    for (const file of normalFiles.filter(f => f.endsWith('.js'))) {
      if ((await readFile(file, 'utf8')).includes('__screenControl')) throw new Error('adapter entrou no grafo normal')
    }
    const main = (await readFile(path.join(root, 'src/main.tsx'), 'utf8')).replaceAll("'./", `'${root.replaceAll('\\', '/')}/src/`)
    const entry = '\0screen-perf-entry.tsx'
    const source = `import { installScreenControl } from '${root.replaceAll('\\', '/')}/src/bench/screenControl.ts'\n${main}\ninstallScreenControl(queryClient)\n`
    await build({ ...options, plugins: [{ name: 'screen-perf-entry', resolveId: id => id === entry ? entry : undefined,
      load: id => id === entry ? source : undefined }],
    build: { outDir: control, emptyOutDir: true, rollupOptions: { input: { screen: entry } } } })
    const controlFiles = await filesBelow(control)
    const css = controlFiles.filter(f => f.endsWith('.css')).map(f => `<link rel="stylesheet" href="./${path.relative(control, f).replaceAll('\\', '/')}">`).join('')
    await writeFile(path.join(control, 'index.html'), `<!doctype html><html lang="pt"><head><meta charset="UTF-8">${css}</head><body><div id="root"></div><script type="module" src="./assets/screen.js"></script></body></html>`)
    const sizes = async directory => Promise.all((await filesBelow(directory)).map(async file => ({
      path: path.relative(directory, file).replaceAll('\\', '/'), bytes: (await readFile(file)).length,
    })))
    const builds = { normal: await sizes(normal), control: await sizes(control) }
    server = createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://127.0.0.1').pathname
        const directory = pathname.startsWith('/control/') ? control : pathname.startsWith('/fixtures/') ? path.join(root, 'e2e/fixtures/screen-perf') : normal
        const relative = pathname.replace(/^\/(?:app|control|fixtures)\//, '') || 'index.html'
        const file = path.resolve(directory, `.${path.sep}${relative}`)
        if (!file.startsWith(path.resolve(directory) + path.sep)) { res.writeHead(403).end(); return }
        const data = await readFile(file)
        const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[path.extname(file)]
        res.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'public,max-age=3600' }).end(data)
      } catch { res.writeHead(404).end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    return { origin: `http://127.0.0.1:${server.address().port}`, builds, close }
  } catch (error) { await close(); throw error }
}

export async function seed(page, rows) {
  const started = performance.now()
  await page.evaluate(async rows => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('ccplaytv')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('não abriu banco sintético'))
    })
    const stores = Object.keys(rows)
    const tx = db.transaction(stores, 'readwrite')
    for (const store of stores) for (const row of rows[store]) tx.objectStore(store).put(row)
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(new Error('não gravou fixture')); tx.onabort = tx.onerror })
    db.close()
  }, rows)
  return { seedRpcMs: performance.now() - started, categories: rows.categories.length,
    items: rows.categoryBlocks.reduce((n, b) => n + b.items.length, 0), episodes: rows.channels.length, states: rows.userStates.length }
}

export async function routes(page, origin, fixture) {
  const calls = []
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    if (url.hostname === 'image.tmdb.org') {
      const file = fixture.images ? 'poster.svg' : null
      if (file) return route.fulfill({ contentType: 'image/svg+xml', body: await readFile(path.join(root, 'e2e/fixtures/screen-perf', file)) })
      return route.abort()
    }
    if (fixture.tmdb && url.hostname === 'api.themoviedb.org') {
      const pageNumber = Number(url.searchParams.get('page') ?? 1)
      const kind = url.pathname.includes('/tv') ? 'series' : 'movie'
      const family = url.pathname.includes('authentication') ? 'authentication'
        : url.pathname.includes('/trending/') ? 'trending'
          : url.pathname.includes('/discover/') ? 'discovery'
            : url.pathname.includes('/search/') ? 'search'
              : url.pathname.includes('recommendations') ? 'recommendations' : 'details'
      calls.push({ family, kind, page: pageNumber })
      await new Promise(resolve => setTimeout(resolve, 100))
      const results = Array.from({ length: 20 }, (_, n) => {
        const index = (pageNumber - 1) * 20 + n
        return { id: index + 1, title: `Filme ${index}`, name: `Série ${index}`, original_title: `Filme ${index}`, original_name: `Série ${index}`,
          release_date: `${2026 - index % 15}-01-01`, first_air_date: `${2026 - index % 15}-01-01`, vote_average: 8, vote_count: 900,
          popularity: 1000 - index, poster_path: fixture.images ? '/poster.svg' : null, backdrop_path: fixture.images ? '/backdrop.svg' : null }
      })
      return route.fulfill({ json: { success: true, results, total_pages: 8 } })
    }
    return route.abort()
  })
  return calls
}
