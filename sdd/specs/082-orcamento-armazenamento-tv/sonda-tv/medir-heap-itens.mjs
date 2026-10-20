// Mede quanto de heap V8 ocupa um item de catálogo descomprimido (feature 082, pendência B-02: teto do cache de pedaços).
// Usa a amostra sanitizada de filmes (.amostras/movie.json, gerada por medir-lista-real.mjs). Só imprime números.
// Uso (da raiz): node --expose-gc sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/medir-heap-itens.mjs
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (typeof gc !== 'function') { console.error('rode com node --expose-gc'); process.exit(2) }
const here = dirname(fileURLToPath(import.meta.url))
const text = readFileSync(resolve(here, '.amostras', 'movie.json'), 'utf8')
const lean = (item) => { const out = {}; for (const key in item) { if (key === 'group' || key === 'providerCategoryId') continue; if (key === 'originalName' && item.originalName === item.name) continue; if (item[key] !== undefined) out[key] = item[key] } return out }
const leanText = JSON.stringify(JSON.parse(text).map(lean))

const keep = []
function measure(label, build) {
  const runs = []
  for (let r = 0; r < 5; r += 1) {
    keep.length = 0
    gc(); gc(); const before = process.memoryUsage().heapUsed
    keep.push(build())
    gc(); gc(); const after = process.memoryUsage().heapUsed
    runs.push({ bytes: after - before, count: keep[0].length })
  }
  keep.length = 0
  runs.sort((a, b) => a.bytes - b.bytes)
  const mid = runs[2]
  console.log(`${label}: ${mid.count} itens, ${(mid.bytes / 1024 / 1024).toFixed(2)} MiB de heap → ${Math.round(mid.bytes / mid.count)} B/item`)
  return Math.round(mid.bytes / mid.count)
}
const full = measure('itens como hoje (CatalogRecord do bloco)', () => JSON.parse(text))
const decoded = measure('itens decodificados do formato enxuto', () => JSON.parse(leanText).map((item) => ({ ...item, originalName: item.originalName ?? item.name, group: 'Categoria', providerCategoryId: '10' })))
const budgetMiB = 32
console.log(`Para ${budgetMiB} MiB de cache: ~${Math.floor(budgetMiB * 1024 * 1024 / Math.max(full, decoded))} itens (pior caso).`)
