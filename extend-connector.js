const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/lib/catalog/xtreamConnector.ts');
let content = fs.readFileSync(file, 'utf8');

const newCode = `
export async function fetchVodCategories(base: string, username: string, password: string): Promise<LiveCategory[]> {
  const raw = await fetchListDirect(playerApiUrl(base, username, password, { action: 'get_vod_categories' }))
  const categories: LiveCategory[] = []
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const record = item as Record<string, unknown>
    if (record.category_id === undefined || record.category_id === null) return
    categories.push({
      id: String(record.category_id),
      name: typeof record.category_name === 'string' ? record.category_name : '',
      order: index,
    })
  })
  return categories
}

export async function fetchVodStreams(base: string, username: string, password: string): Promise<unknown[]> {
  return fetchListDirect(playerApiUrl(base, username, password, { action: 'get_vod_streams' }))
}

export function buildVodUrl(base: string, username: string, password: string, streamId: string, extension: string): string {
  return \`\${base}/movie/\${encodeURIComponent(username)}/\${encodeURIComponent(password)}/\${streamId}.\${extension}\`
}

export function mapVodEntry(
  raw: Record<string, unknown>,
  categories: Map<string, LiveCategory>,
  buildUrl: (streamId: string, extension: string) => string | undefined,
): MappedChannel | undefined {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '') return undefined

  const streamId = raw.stream_id === undefined || raw.stream_id === null ? undefined : String(raw.stream_id)
  const categoryId = raw.category_id === undefined || raw.category_id === null ? undefined : String(raw.category_id)
  const category = categoryId ? categories.get(categoryId) : undefined
  const ext = typeof raw.container_extension === 'string' ? raw.container_extension : 'mp4'

  return {
    kind: 'movie',
    name,
    originalName: name,
    group: category?.name,
    groupOrder: category?.order ?? Number.MAX_SAFE_INTEGER,
    url: streamId ? buildUrl(streamId, ext) : undefined,
    providerStreamId: streamId,
    providerCategoryId: categoryId,
    streamExtension: ext,
  }
}

export async function acquireXtreamVod(
  base: string,
  username: string,
  password: string,
): Promise<MappedChannel[]> {
  const categoryList = await fetchVodCategories(base, username, password)
  const categories = new Map(categoryList.map((category) => [category.id, category]))
  const streams = await fetchVodStreams(base, username, password)

  const buildUrl = (streamId: string, ext: string): string => buildVodUrl(base, username, password, streamId, ext)

  const vods: MappedChannel[] = []
  for (const raw of streams) {
    if (typeof raw !== 'object' || raw === null) continue
    const mapped = mapVodEntry(raw as Record<string, unknown>, categories, buildUrl)
    if (mapped) vods.push(mapped)
  }
  return vods
}

export async function fetchSeriesCategories(base: string, username: string, password: string): Promise<LiveCategory[]> {
  const raw = await fetchListDirect(playerApiUrl(base, username, password, { action: 'get_series_categories' }))
  const categories: LiveCategory[] = []
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const record = item as Record<string, unknown>
    if (record.category_id === undefined || record.category_id === null) return
    categories.push({
      id: String(record.category_id),
      name: typeof record.category_name === 'string' ? record.category_name : '',
      order: index,
    })
  })
  return categories
}

export async function fetchSeries(base: string, username: string, password: string): Promise<unknown[]> {
  return fetchListDirect(playerApiUrl(base, username, password, { action: 'get_series' }))
}

export function mapSeriesEntry(
  raw: Record<string, unknown>,
  categories: Map<string, LiveCategory>
): MappedChannel | undefined {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '') return undefined

  const seriesId = raw.series_id === undefined || raw.series_id === null ? undefined : String(raw.series_id)
  if (!seriesId) return undefined

  const categoryId = raw.category_id === undefined || raw.category_id === null ? undefined : String(raw.category_id)
  const category = categoryId ? categories.get(categoryId) : undefined

  return {
    kind: 'series',
    name,
    originalName: name,
    group: category?.name,
    groupOrder: category?.order ?? Number.MAX_SAFE_INTEGER,
    providerCategoryId: categoryId,
    seriesId,
  }
}

export async function acquireXtreamSeries(
  base: string,
  username: string,
  password: string,
): Promise<MappedChannel[]> {
  const categoryList = await fetchSeriesCategories(base, username, password)
  const categories = new Map(categoryList.map((category) => [category.id, category]))
  const streams = await fetchSeries(base, username, password)

  const series: MappedChannel[] = []
  for (const raw of streams) {
    if (typeof raw !== 'object' || raw === null) continue
    const mapped = mapSeriesEntry(raw as Record<string, unknown>, categories)
    if (mapped) series.push(mapped)
  }
  return series
}

export interface XtreamEpisode extends MappedChannel {
  seasonNumber: number
  episodeNumber: number
  seriesId: string
}

export async function fetchSeriesInfo(
  base: string,
  username: string,
  password: string,
  seriesId: string
): Promise<XtreamEpisode[]> {
  const url = playerApiUrl(base, username, password, { action: 'get_series_info', series_id: seriesId })
  const payload = await fetchJsonDirect(url)
  if (typeof payload !== 'object' || payload === null) return []
  
  const record = payload as Record<string, unknown>
  const episodesObj = record.episodes
  if (typeof episodesObj !== 'object' || episodesObj === null) return []

  const episodes: XtreamEpisode[] = []
  for (const [seasonStr, epsArray] of Object.entries(episodesObj)) {
    if (!Array.isArray(epsArray)) continue
    
    for (const ep of epsArray) {
      if (typeof ep !== 'object' || ep === null) continue
      const rawEp = ep as Record<string, unknown>
      
      const epName = typeof rawEp.title === 'string' ? rawEp.title.trim() : \`S\${seasonStr} E\${rawEp.episode_num}\`
      const streamId = rawEp.id === undefined || rawEp.id === null ? undefined : String(rawEp.id)
      const ext = typeof rawEp.container_extension === 'string' ? rawEp.container_extension : 'mp4'
      const urlBuilt = streamId ? \`\${base}/series/\${encodeURIComponent(username)}/\${encodeURIComponent(password)}/\${streamId}.\${ext}\` : undefined

      const seasonNumber = parseInt(seasonStr, 10) || 1
      const episodeNumber = typeof rawEp.episode_num === 'number' ? rawEp.episode_num : 0

      episodes.push({
        kind: 'episode',
        name: epName,
        originalName: typeof rawEp.title === 'string' ? rawEp.title : '',
        groupOrder: Number.MAX_SAFE_INTEGER,
        providerStreamId: streamId,
        streamExtension: ext,
        url: urlBuilt,
        seriesId,
        seasonNumber,
        episodeNumber
      })
    }
  }
  return episodes
}
`;

fs.writeFileSync(file, content + '\n' + newCode);

