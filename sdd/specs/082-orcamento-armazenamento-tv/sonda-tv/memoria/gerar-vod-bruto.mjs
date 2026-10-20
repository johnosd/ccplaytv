// Gera .amostras/vodraw.json (filmes), seriesraw.json (séries) e liveraw.json (canais; feature 085): a resposta de `get_vod_streams` no formato do painel Xtream, reconstruída a partir da
// amostra sanitizada de filmes (.amostras/movie.json) e replicada até o tamanho da lista real (43 510 filmes em 35
// categorias, ~16,5 MB). Sem host, credencial ou URL de stream. Uso (da raiz):
//   node sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/memoria/gerar-vod-bruto.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const amostras = resolve(here, '..', '.amostras')
const parsed = JSON.parse(readFileSync(resolve(amostras, 'movie.json'), 'utf8'))
const sample = Array.isArray(parsed) ? parsed : parsed.items
const TOTAL = 43_510
const CATEGORIES = 35

const out = []
for (let n = 0; n < TOTAL; n += 1) {
  const base = sample[n % sample.length]
  const copy = Math.floor(n / sample.length)
  out.push({
    num: n + 1,
    name: copy ? `${base.name} ${copy}` : base.name,
    stream_type: 'movie',
    stream_id: 100000 + n,
    stream_icon: base.iconUrl ?? '',
    rating: base.providerRating === undefined ? '' : String(base.providerRating),
    rating_5based: base.providerRating === undefined ? 0 : Math.round(base.providerRating * 5) / 10,
    added: base.addedAt ? String(Math.floor(base.addedAt / 1000)) : '',
    is_adult: 0,
    category_id: String(1000 + (n % CATEGORIES)),
    container_extension: base.streamExtension ?? 'mp4',
    custom_sid: null,
    direct_source: '',
    ...(base.year ? { year: String(base.year) } : {}),
  })
}
const text = JSON.stringify(out)
writeFileSync(resolve(amostras, 'vodraw.json'), text)
console.log(`vodraw.json: ${out.length} filmes, ${(Buffer.byteLength(text) / 1024 / 1024).toFixed(2)} MB, ${CATEGORIES} categorias`)

// Séries e canais, nos tamanhos de `evidencias/medicao-lista-real-pc-2026-10-18.json`: séries 9 768 em 28 categorias,
// canais 2 355 em 42. Mesmos ids de categoria (1000 + n) que o `cargaWorker.ts` declara.
function lerAmostra(nome) {
  const lido = JSON.parse(readFileSync(resolve(amostras, `${nome}.json`), 'utf8'))
  return Array.isArray(lido) ? lido : lido.items
}
function replicar(amostra, total, categorias, montar) {
  return Array.from({ length: total }, (_, n) => {
    const base = amostra[n % amostra.length]
    const copia = Math.floor(n / amostra.length)
    return montar(base, n, copia ? `${base.name} ${copia}` : base.name, String(1000 + (n % categorias)))
  })
}
const series = replicar(lerAmostra('series'), 9_768, 28, (base, n, name, category) => ({
  num: n + 1,
  name,
  series_id: 500000 + n,
  cover: base.iconUrl ?? '',
  rating: base.providerRating === undefined ? '' : String(base.providerRating),
  genre: Array.isArray(base.providerGenres) ? base.providerGenres.join(', ') : '',
  backdrop_path: base.providerBackdropUrl ? [base.providerBackdropUrl] : [],
  ...(base.year ? { year: String(base.year) } : {}),
  category_id: category,
}))
const seriesText = JSON.stringify(series)
writeFileSync(resolve(amostras, 'seriesraw.json'), seriesText)
console.log(`seriesraw.json: ${series.length} séries, ${(Buffer.byteLength(seriesText) / 1024 / 1024).toFixed(2)} MB, 28 categorias`)
const canais = replicar(lerAmostra('channel'), 2_355, 42, (base, n, name, category) => ({
  num: n + 1,
  name,
  stream_type: 'live',
  stream_id: 900000 + n,
  stream_icon: base.iconUrl ?? '',
  category_id: category,
}))
const canaisText = JSON.stringify(canais)
writeFileSync(resolve(amostras, 'liveraw.json'), canaisText)
console.log(`liveraw.json: ${canais.length} canais, ${(Buffer.byteLength(canaisText) / 1024 / 1024).toFixed(2)} MB, 42 categorias`)
