// Feature 065: somente fontes fictícias; relógio, ordem e identidades fixos.
export const FIXTURE_VERSION = 1
export const CLOCK = Date.UTC(2026, 9, 7, 15)
export const SOURCE_IDS = ['screen-065-a', 'screen-065-b', 'screen-065-c']

export function fixtureSpec(overrides = {}) {
  return { version: FIXTURE_VERSION, clock: CLOCK, movies: 43000, series: 10000,
    movieCategories: 104, seriesCategories: 30, eligible: 1, images: true,
    tmdb: false, lists: 1, episodes: 0, favorites: 1000, history: 5000, ...overrides }
}

export function screenMatrix() {
  const primary = [false, true].flatMap(tmdb => [0.2, 1].map(eligible => ({
    id: `screens-${tmdb ? 'tmdb' : 'local'}-${eligible * 100}-images`, kind: 'screens',
    fixture: fixtureSpec({ tmdb, eligible }),
  })))
  return [...primary,
    ...[false, true].map(tmdb => ({ id: `screens-${tmdb ? 'tmdb' : 'local'}-100-no-images`, kind: 'screens', fixture: fixtureSpec({ tmdb, images: false }) })),
    ...[false, true].map(tmdb => ({ id: `cycles-${tmdb ? 'tmdb' : 'local'}`, kind: 'cycles', fixture: fixtureSpec({ tmdb, lists: 3, favorites: 100, history: 500 }) })),
    { id: 'category-30000', kind: 'category', fixture: fixtureSpec({ movies: 30000, movieCategories: 1, series: 30, seriesCategories: 1, favorites: 0, history: 0 }) },
    { id: 'episodes-100000', kind: 'episodes', fixture: fixtureSpec({ movies: 30, movieCategories: 1, series: 1000, episodes: 100, favorites: 0, history: 0 }) },
  ]
}

function hash32(text) {
  let hash = 0x811c9dc5
  for (let n = 0; n < text.length; n++) hash = Math.imul(hash ^ text.charCodeAt(n), 0x01000193)
  return hash >>> 0
}

export function fixtureRows(spec) {
  if (spec.version !== FIXTURE_VERSION || ![0.2, 1].includes(spec.eligible) || spec.lists < 1 || spec.lists > 3) throw new Error('fixture inválida')
  const rows = { sources: [], categories: [], categoryBlocks: [], channels: [], userStates: [], integrations: [] }
  for (let list = 0; list < spec.lists; list++) {
    const sourceId = SOURCE_IDS[list]
    rows.sources.push({ id: sourceId, displayName: `Sintético ${String.fromCharCode(65 + list)}`, type: 'provider_credentials',
      connectionState: 'synced', providerImportMode: 'xtream_api', providerMigratedAt: spec.clock,
      lastSuccessfulSyncAt: spec.clock, epgIdsCapturedAt: spec.clock, epgDisabled: true,
      activeGeneration: 1, createdAt: spec.clock, updatedAt: spec.clock })
    for (const [kind, total, count, offset] of [['movie', spec.movies, spec.movieCategories, 1], ['series', spec.series, spec.seriesCategories, 201]]) {
      for (let c = 0; c < count; c++) {
        const categoryId = list * 1000 + offset + c
        const start = Math.floor(c * total / count), end = Math.floor((c + 1) * total / count)
        const taken = new Set()
        const items = Array.from({ length: end - start }, (_, position) => {
          const n = start + position, providerStreamId = String(n + 1)
          let slot = hash32(`${kind === 'series' ? 's' : 'p'}:${providerStreamId}`)
          let id = -(categoryId * 4294967296 + slot)
          while (taken.has(id)) { slot = (slot + 1) >>> 0; id = -(categoryId * 4294967296 + slot) }
          taken.add(id)
          const name = `${kind === 'movie' ? 'Filme' : 'Série'} ${n} (${2026 - n % 15})`
          return { id, name, originalName: name, providerStreamId,
            ...(kind === 'series' ? { seriesId: providerStreamId } : {}),
            year: 2026 - n % 15, addedAt: spec.clock - n * 1000, streamExtension: 'mp4',
            providerRating: spec.eligible === 1 || n % 5 === 0 ? 6 + n % 39 / 10 : 5,
            ...(spec.images ? { iconUrl: `/fixtures/poster.svg?art=${n % 128}`, providerBackdropUrl: `/fixtures/backdrop.svg?art=${n % 128}` } : {}) }
        })
        rows.categories.push({ id: categoryId, sourceId, generation: 1, kind, name: `Categoria ${kind} ${c}`,
          order: c, fetchMode: 'eager', itemsFetchedAt: spec.clock, itemsCount: items.length, declaredCount: items.length })
        rows.categoryBlocks.push({ categoryId, sourceId, generation: 1, kind, groupOrder: c, items })
      }
    }
    for (let n = 0; n < Math.min(spec.movies, Math.max(spec.history, spec.favorites)); n++) {
      rows.userStates.push({ stableId: `${sourceId}|movie|id:${n + 1}`, sourceId,
        isFavorite: n < spec.favorites, ...(n < spec.favorites ? { favoritedAt: spec.clock - n * 1000 } : {}),
        ...(n < spec.history ? { lastWatched: spec.clock - n * 1000, progressSeconds: 60 + n % 500, completedAt: n % 4 === 0 ? spec.clock : undefined } : {}),
        createdAt: spec.clock, updatedAt: spec.clock })
    }
    for (let s = 0; s < spec.series; s++) for (let e = 0; e < spec.episodes; e++) {
      const providerStreamId = `${s + 1}-${e + 1}`
      rows.channels.push({ sourceId, generation: 1, kind: 'episode', groupOrder: 0,
        name: `Episódio ${e + 1}`, originalName: `Episódio ${e + 1}`, providerStreamId,
        seriesId: String(s + 1), seasonNumber: Math.floor(e / 10) + 1, episodeNumber: e % 10 + 1 })
      if (e % 2 === 0) rows.userStates.push({ stableId: `${sourceId}|episode|id:${providerStreamId}|s${Math.floor(e / 10) + 1}|e${e % 10 + 1}`,
        sourceId, isFavorite: false, completedAt: spec.clock, createdAt: spec.clock, updatedAt: spec.clock })
    }
  }
  // Chave declaradamente sintética, usada apenas pelo interceptador local, nunca por rede real.
  if (spec.tmdb) rows.integrations.push({ id: 'tmdb', key: '0123456789abcdef0123456789abcdef', format: 'v3', state: 'connected', lastTestedAt: spec.clock })
  return rows
}
