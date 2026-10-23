import { readFile, writeFile } from 'node:fs/promises'

const keyLine = (await readFile(new URL('../../../../.env', import.meta.url), 'utf8'))
  .match(/^\s*(?:export\s+)?OPEN_SUBTITLES_API_KEY\s*=\s*(.*?)\s*$/m)?.[1] ?? ''
const key = /^(['"]).*\1$/.test(keyLine)
  ? keyLine.slice(1, -1)
  : keyLine.replace(/\s+#.*$/, '').trim()
const evidence = {
  recordedAt: new Date().toISOString(),
  scope: 'PC Node HTTP; not browser, emulator, or physical TV',
  keyConfigured: Boolean(key),
  maxDownloadsRequested: process.argv.includes('--download-one') ? 1 : 0,
  tests: [],
}
const headers = { 'Api-Key': key, 'User-Agent': 'CCPlayTV v0.1 assessment', Accept: 'application/json' }

async function api(label, endpoint, options = {}) {
  const started = performance.now()
  try {
    const response = await fetch('https://api.opensubtitles.com/api/v1' + endpoint, {
      ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(20000),
    })
    const data = await response.json().catch(() => null)
    evidence.tests.push({
      label, httpStatus: response.status, elapsedMs: Math.round(performance.now() - started),
      totalCount: Number.isFinite(data?.total_count) ? data.total_count : undefined,
      returnedRows: Array.isArray(data?.data) ? data.data.length : undefined,
      remaining: Number.isFinite(data?.remaining) ? data.remaining : undefined,
      rateLimitRemaining: response.headers.get('ratelimit-remaining'),
      corsOrigin: response.headers.get('access-control-allow-origin'),
      corsHeaders: response.headers.get('access-control-allow-headers'),
    })
    return { response, data }
  } catch (error) {
    evidence.tests.push({ label, outcome: 'network-error', errorName: error?.name,
      causeCode: error?.cause?.code, elapsedMs: Math.round(performance.now() - started) })
    return null
  }
}

if (key) {
  const movie = await api('search-movie-pt-br', '/subtitles?imdb_id=133093&languages=pt-br')
  if (movie?.response.ok) {
    evidence.tests.push({ label: 'search-schema', languageCodes: [...new Set(movie.data.data.map(row => row?.attributes?.language))], fileIdTypes: [...new Set(movie.data.data.map(row => typeof row?.attributes?.files?.[0]?.file_id))] })
    await api('search-episode-pt-br', '/subtitles?episode_number=1&languages=pt-br&parent_tmdb_id=1396&season_number=1')
    await api('cors-preflight-origin-null', '/subtitles', {
      method: 'OPTIONS',
      headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'api-key,x-user-agent' },
    })
    if (process.argv.includes('--download-one')) {
      const candidate = movie.data?.data?.find(row => row?.attributes?.language === 'pt-br'
        && Number.isFinite(row?.attributes?.files?.[0]?.file_id))
      const fileId = candidate?.attributes?.files?.[0]?.file_id
      if (fileId) {
        const download = await api('request-one-download', '/download', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }),
        })
        if (download?.response.ok && typeof download.data?.link === 'string') {
          const target = new URL(download.data.link)
          if (target.protocol === 'https:' && /(^|\.)opensubtitles\.(com|org)$/.test(target.hostname)) {
            try {
              const response = await fetch(target, {
                headers: { 'User-Agent': 'CCPlayTV v0.1 assessment' },
                signal: AbortSignal.timeout(20000),
              })
              const text = await response.text()
              evidence.tests.push({ label: 'fetch-one-subtitle-file', httpStatus: response.status,
                bytes: Buffer.byteLength(text), hasSubtitleTimestamps: /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text),
                subtitleContentSaved: false })
            } catch (error) {
              evidence.tests.push({ label: 'fetch-one-subtitle-file', outcome: 'network-error',
                errorName: error?.name, causeCode: error?.cause?.code })
            }
          } else evidence.tests.push({ label: 'fetch-one-subtitle-file', outcome: 'unexpected-host-not-fetched' })
        }
      } else evidence.tests.push({ label: 'request-one-download', outcome: 'no-candidate' })
    }
  }
}
const safeJson = JSON.stringify(evidence, null, 2)
await writeFile(new URL('./api-schema-pc.json', import.meta.url), safeJson + '\n', 'utf8')
console.log(safeJson)
