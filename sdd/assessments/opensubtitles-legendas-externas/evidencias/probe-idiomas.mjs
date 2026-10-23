import { readFile, writeFile } from 'node:fs/promises'
const line = (await readFile(new URL('../../../../.env', import.meta.url), 'utf8'))
  .match(/^\s*(?:export\s+)?OPEN_SUBTITLES_API_KEY\s*=\s*(.*?)\s*$/m)?.[1] ?? ''
const key = /^(['"]).*\1$/.test(line) ? line.slice(1, -1) : line.replace(/\s+#.*$/, '').trim()
const result = { recordedAt: new Date().toISOString(), scope: 'PC HTTP only; no downloads', tests: [] }
for (const language of ['en', 'es']) {
  for (const kind of ['movie', 'episode']) {
    const params = new URLSearchParams(kind === 'movie'
      ? { imdb_id: '133093', languages: language }
      : { episode_number: '1', languages: language, parent_tmdb_id: '1396', season_number: '1' })
    params.sort()
    try {
      const response = await fetch('https://api.opensubtitles.com/api/v1/subtitles?' + params, {
        headers: { 'Api-Key': key, 'User-Agent': 'CCPlayTV v0.1 assessment', Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      })
      const data = await response.json().catch(() => null)
      result.tests.push({ kind, language, httpStatus: response.status,
        totalCount: data?.total_count,
        returnedRows: Array.isArray(data?.data) ? data.data.length : undefined })
    } catch (error) {
      result.tests.push({ kind, language, outcome: 'network-error', errorName: error?.name,
        causeCode: error?.cause?.code })
    }
  }
}
await writeFile(new URL('./api-idiomas-pc.json', import.meta.url), JSON.stringify(result, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(result, null, 2))
