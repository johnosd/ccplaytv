// Gera .amostras/vodraw.json: a resposta de `get_vod_streams` no formato do painel Xtream, reconstruída a partir da
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
