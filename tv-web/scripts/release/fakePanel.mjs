// Feature 078: painel Xtream FICTÍCIO usado pelas capturas da loja (`store-screenshots.mjs`) e da UI Description
// (`ui-description-shots.mjs`). Canais, guia, filmes e séries de nomes inventados; capas, logos e fundos desenhados em
// SVG (gradiente abstrato) — nenhuma marca, pôster ou logo de terceiros, nenhuma lista real.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const PALETTES = [
  ['#ff7a3d', '#7a1f5c'], ['#2bb3a3', '#14325c'], ['#f2c14e', '#b8432f'], ['#6a5acd', '#1b1f3b'],
  ['#e85d75', '#2d1e4a'], ['#3fa7d6', '#0f2b46'], ['#8bc34a', '#1e4d2b'], ['#ff9f1c', '#3d1f0f'],
  ['#c77dff', '#240046'], ['#00b4d8', '#03045e'], ['#ef476f', '#3a0ca3'], ['#ffd166', '#06464f'],
]
const hash = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const palette = (text) => PALETTES[hash(text) % PALETTES.length]
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Capa abstrata (sem título: o card e o detalhe já escrevem o nome). */
function posterSvg(title) {
  const [a, b] = palette(title)
  const h = hash(title)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="l" cx="0.7" cy="0.25" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="400" height="600" fill="url(#g)"/><rect width="400" height="600" fill="url(#l)"/>
<circle cx="${120 + (h % 160)}" cy="${170 + ((h >> 3) % 90)}" r="${90 + (h % 50)}" fill="#000" fill-opacity="0.18"/>
<circle cx="${80 + ((h >> 5) % 240)}" cy="${380 + ((h >> 7) % 120)}" r="${60 + ((h >> 2) % 40)}" fill="#fff" fill-opacity="0.10"/>
</svg>`
}

function wideSvg(title, sub) {
  const [a, b] = palette(title + sub)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#g)"/>
<circle cx="${700 + (hash(title) % 300)}" cy="${200 + (hash(sub) % 200)}" r="${260 + (hash(sub) % 120)}" fill="#fff" fill-opacity="0.10"/>
<circle cx="${300 + (hash(sub) % 300)}" cy="${500 + (hash(title) % 120)}" r="${180 + (hash(title) % 80)}" fill="#000" fill-opacity="0.18"/>
</svg>`
}

function logoSvg(name) {
  const [a, b] = palette(name)
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect x="8" y="8" width="240" height="240" rx="56" fill="url(#g)"/>
<text x="128" y="156" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="88" fill="#fff">${esc(initials)}</text>
</svg>`
}

const LIVE = [
  ['Notícias', ['Aurora News', 'Rede Meridiano', 'Jornal 24h', 'Vale Notícias']],
  ['Esportes', ['Arena 360', 'Placar Total', 'Pista Max', 'Quadra TV']],
  ['Documentários', ['Terra Selvagem', 'Crônica Doc', 'Oceano Azul']],
  ['Infantil', ['Turminha Kids', 'Mundo Colorido']],
  ['Música', ['Palco Hits', 'Vinil TV']],
]
const PROGRAMS = {
  Notícias: ['Jornal da Manhã', 'Edição do Meio-Dia', 'Mercado em Foco', 'Giro pelo Brasil', 'Jornal da Noite', 'Entrevista da Semana'],
  Esportes: ['Futebol: Rodada do Fim de Semana', 'Resenha Esportiva', 'Basquete ao Vivo', 'Gols da Rodada', 'Vôlei: Final', 'Bate-bola'],
  Documentários: ['Rios do Cerrado', 'A Vida nos Recifes', 'Montanhas do Sul', 'Grandes Migrações', 'Cidades Perdidas', 'Floresta à Noite'],
  Infantil: ['Desenhos da Manhã', 'Aventuras no Quintal', 'Hora da História', 'Pequenos Cientistas', 'Musical Kids', 'Boa Noite'],
  Música: ['Top da Semana', 'Acústico', 'Clássicos dos Anos 80', 'Ao Vivo no Palco', 'Lançamentos', 'Playlist da Madrugada'],
}
export const MOVIES = [
  ['Lançamentos', ['O Último Farol', 'Cidade de Vidro', 'Maré Alta', 'Operação Âmbar', 'Céu de Outono', 'O Relojoeiro', 'Vento Sul', 'Linha Vermelha']],
  ['Ação e Aventura', ['Rota de Fuga', 'Sombras do Norte', 'A Grande Travessia', 'Fora de Rota', 'Código Cobalto', 'Missão Horizonte', 'Ponto Cego', 'Fogo Cruzado']],
  ['Comédia', ['Doce Caos', 'Casamento Trocado', 'Férias em Família', 'O Vizinho Perfeito', 'Tudo por um Bolo', 'Plano B', 'Quase Famosos', 'Mudança de Planos']],
  ['Drama', ['Jardim de Inverno', 'A Ilha Esquecida', 'Cartas para Ana', 'O Peso do Silêncio', 'Entre Margens', 'Depois da Chuva', 'O Pianista do Porto', 'Raízes']],
]
export const SERIES = [
  ['Séries em Alta', ['Distrito Zero', 'Casa dos Ventos', 'Os Cartógrafos', 'Fronteira', 'Turno da Noite', 'Laços de Família', 'Expresso 22', 'Alto Mar']],
  ['Suspense', ['Arquivo Morto', 'Ninguém Sai', 'A Testemunha', 'Sinal Fraco', 'Dupla Face', 'O Caso Moreira']],
]
const SERIES_PLOT = {
  'Distrito Zero': 'Num bairro isolado por uma tempestade que não termina, uma engenheira e um ex-detetive descobrem que os apagões seguem um padrão — e que alguém da vizinhança sabe por quê.',
}
const plotOf = (name) => SERIES_PLOT[name] ?? `${name}: série original criada para esta demonstração.`
const EPISODES = [
  ['O Primeiro Apagão', 'A luz cai no bairro inteiro, menos numa casa.'],
  ['Linhas Cruzadas', 'Uma ligação antiga reaparece na central telefônica.'],
  ['A Casa 14', 'A vizinha que nunca sai de casa tem visita.'],
  ['Frequência', 'O rádio da oficina capta uma voz conhecida.'],
  ['Vozes no Rádio', 'O padrão dos apagões ganha um horário.'],
  ['Sem Saída', 'A ponte fecha e ninguém deixa o bairro.'],
  ['O Padrão', 'Os mapas mostram o que ninguém quis ver.'],
  ['Olho da Tempestade', 'A última noite de chuva revela quem sabia de tudo.'],
]

function buildCatalog() {
  const liveCats = LIVE.map(([name], i) => ({ category_id: String(100 + i), category_name: name, parent_id: 0 }))
  const channels = []
  LIVE.forEach(([cat, names], ci) => names.forEach((name) => {
    const id = channels.length + 1
    channels.push({ num: id, name, stream_type: 'live', stream_id: id, stream_icon: `/img/logo/${id}.svg`, epg_channel_id: `ch${id}`, category_id: String(100 + ci), tv_archive: 0, cat })
  }))
  const now = Math.floor(Date.now() / 1000)
  const vodCats = MOVIES.map(([name], i) => ({ category_id: String(200 + i), category_name: name, parent_id: 0 }))
  const movies = []
  MOVIES.forEach(([, names], ci) => names.forEach((name, k) => {
    const id = 1000 + movies.length
    movies.push({ num: movies.length + 1, name, stream_type: 'movie', stream_id: id, stream_icon: `/img/poster/m${id}.svg`, category_id: String(200 + ci), container_extension: 'mp4', year: String(2019 + ((hash(name) % 7))), rating: (6.4 + (hash(name) % 30) / 10).toFixed(1), added: String(now - k * 3600 - ci * 86400) })
  }))
  const seriesCats = SERIES.map(([name], i) => ({ category_id: String(300 + i), category_name: name, parent_id: 0 }))
  const series = []
  SERIES.forEach(([, names], ci) => names.forEach((name) => {
    const id = 3000 + series.length
    series.push({ num: series.length + 1, name, series_id: id, cover: `/img/poster/s${id}.svg`, category_id: String(300 + ci), year: String(2020 + (hash(name) % 6)), releaseDate: `${2020 + (hash(name) % 6)}-03-14`, rating: (7.0 + (hash(name) % 25) / 10).toFixed(1), genre: ci === 0 ? 'Drama, Mistério' : 'Suspense, Crime', backdrop_path: [`/img/wide/s${id}.svg`], last_modified: String(now) })
  }))
  return { liveCats, channels, vodCats, movies, seriesCats, series }
}

function xmltv(channels) {
  const half = 30 * 60_000
  const start = Math.floor(Date.now() / half) * half - 4 * half
  const fmt = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="ccplaytv-store">']
  for (const ch of channels) out.push(`<channel id="ch${ch.stream_id}"><display-name>${esc(ch.name)}</display-name></channel>`)
  for (const ch of channels) {
    const titles = PROGRAMS[ch.cat]
    for (let i = 0; i < 12; i += 1) {
      const s = start + i * 2 * half
      const title = titles[(i + ch.stream_id) % titles.length]
      out.push(`<programme start="${fmt(s)}" stop="${fmt(s + 2 * half)}" channel="ch${ch.stream_id}"><title lang="pt">${esc(title)}</title><desc lang="pt">${esc(`${title} — programação de ${ch.name}.`)}</desc></programme>`)
    }
  }
  out.push('</tv>')
  return out.join('\n')
}

function seriesInfo(serie) {
  const episodes = {}
  for (const season of [1, 2]) {
    episodes[String(season)] = EPISODES.slice(0, season === 1 ? 8 : 6).map(([title, plot], i) => ({
      id: String(serie.series_id * 100 + season * 10 + i), episode_num: i + 1, season, title, container_extension: 'mp4',
      info: { plot, duration_secs: String(2400 + (i % 4) * 300), movie_image: `/img/wide/e${serie.series_id}-${season}-${i}.svg` },
    }))
  }
  return {
    info: { name: serie.name, cover: serie.cover, plot: plotOf(serie.name), genre: serie.genre, rating: serie.rating, releaseDate: serie.releaseDate, backdrop_path: serie.backdrop_path, cast: 'Elenco fictício', director: 'Direção fictícia' },
    seasons: [1, 2].map((n) => ({ season_number: n, name: `Temporada ${n}`, episode_count: n === 1 ? 8 : 6 })),
    episodes,
  }
}

/**
 * Sobe o painel numa porta livre de 127.0.0.1. `videoFile` (opcional): um WebM servido em qualquer `/movie/…`,
 * `/series/…` ou `/live/…` — sem ele, essas rotas dão 404 (o player mostra o erro, como num stream fora do ar).
 */
export function startPanel({ videoFile } = {}) {
  const cat = buildCatalog()
  const byId = new Map([...cat.movies.map((m) => [`m${m.stream_id}`, [m.name, m.year]]), ...cat.series.map((s) => [`s${s.series_id}`, [s.name, s.year]])])
  const video = videoFile ? readFileSync(videoFile) : null
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      res.setHeader('Access-Control-Allow-Origin', '*')
      const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body) }
      const json = (body) => send('application/json', JSON.stringify(body))
      let m
      if (video && /^\/(movie|series|live)\//.test(url.pathname)) return send('video/webm', video)
      if ((m = /^\/img\/logo\/(\d+)\.svg$/.exec(url.pathname))) {
        const ch = cat.channels.find((c) => c.stream_id === Number(m[1]))
        return send('image/svg+xml', logoSvg(ch?.name ?? '?'))
      }
      if ((m = /^\/img\/poster\/([ms]\d+)\.svg$/.exec(url.pathname))) {
        const [name, year] = byId.get(m[1]) ?? ['?', '']
        return send('image/svg+xml', posterSvg(name, year))
      }
      if ((m = /^\/img\/wide\/(.+)\.svg$/.exec(url.pathname))) return send('image/svg+xml', wideSvg(m[1], 'wide'))
      if (url.pathname === '/xmltv.php') return send('application/xml', xmltv(cat.channels))
      if (url.pathname !== '/player_api.php') { res.writeHead(404); return res.end() }
      const abs = (item, keys) => {
        const copy = { ...item }
        for (const k of keys) {
          if (typeof copy[k] === 'string' && copy[k].startsWith('/')) copy[k] = `http://${req.headers.host}${copy[k]}`
          if (Array.isArray(copy[k])) copy[k] = copy[k].map((v) => `http://${req.headers.host}${v}`)
        }
        return copy
      }
      switch (url.searchParams.get('action')) {
        case 'get_live_categories': return json(cat.liveCats)
        case 'get_live_streams': return json(cat.channels.filter((c) => !url.searchParams.get('category_id') || c.category_id === url.searchParams.get('category_id')).map(({ cat: _c, ...c }) => abs(c, ['stream_icon'])))
        case 'get_vod_categories': return json(cat.vodCats)
        case 'get_vod_streams': return json(cat.movies.filter((v) => !url.searchParams.get('category_id') || v.category_id === url.searchParams.get('category_id')).map((v) => abs(v, ['stream_icon'])))
        case 'get_vod_info': {
          const movie = cat.movies.find((v) => String(v.stream_id) === url.searchParams.get('vod_id'))
          return json({ info: { plot: `${movie?.name ?? ''}: uma história original criada para esta demonstração.`, duration_secs: '6300', genre: 'Drama' }, movie_data: { stream_id: movie?.stream_id, name: movie?.name } })
        }
        case 'get_series_categories': return json(cat.seriesCats)
        case 'get_series': return json(cat.series.filter((s) => !url.searchParams.get('category_id') || s.category_id === url.searchParams.get('category_id')).map((s) => abs(s, ['cover', 'backdrop_path'])))
        case 'get_series_info': {
          const serie = cat.series.find((s) => String(s.series_id) === url.searchParams.get('series_id'))
          if (!serie) return json({})
          const info = seriesInfo(serie)
          info.info = abs(info.info, ['cover', 'backdrop_path'])
          for (const list of Object.values(info.episodes)) for (const ep of list) ep.info = abs(ep.info, ['movie_image'])
          return json(info)
        }
        case null: {
          const nowMs = Date.now()
          return json({
            user_info: { username: 'demo', auth: 1, status: 'Active', exp_date: '0', max_connections: '1', active_cons: '0', allowed_output_formats: ['ts'] },
            server_info: { url: '127.0.0.1', port: String(server.address().port), server_protocol: 'http', timezone: 'America/Sao_Paulo', timestamp_now: Math.floor(nowMs / 1000) },
          })
        }
        default: return json([])
      }
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/** Espera as imagens visíveis carregarem e as fileiras saírem do esqueleto (cards vazios). */
export async function waitPainted(page) {
  await page.waitForFunction(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }
    const imgs = [...document.images].filter(visible)
    const skeleton = [...document.querySelectorAll('.vod-row .content-card')].filter(visible).some((card) => !card.querySelector('img') && !card.textContent?.trim())
    return imgs.every((img) => img.complete && img.naturalWidth > 0) && !skeleton
  }, null, { timeout: 20000 }).catch(() => console.log('  · aviso: ainda havia imagem ou card carregando'))
  await page.waitForTimeout(500)
}
