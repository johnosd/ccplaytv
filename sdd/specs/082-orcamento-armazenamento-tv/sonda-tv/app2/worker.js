/* Worker da sonda 2: capacidades e compressão fora da thread principal. */
'use strict'
async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
self.onmessage = async (event) => {
  const message = event.data
  try {
    if (message.op === 'caps') {
      self.postMessage({ indexedDB: typeof indexedDB !== 'undefined', compressionStream: typeof CompressionStream !== 'undefined',
        tizen: typeof tizen !== 'undefined', fetch: typeof fetch === 'function', offscreenCanvas: typeof OffscreenCanvas !== 'undefined' })
    } else if (message.op === 'echo') self.postMessage({ ok: true, n: Array.isArray(message.data) ? message.data.length : 0 })
    else if (message.op === 'echoBuffer') self.postMessage({ buffer: message.buffer }, [message.buffer])
    else if (message.op === 'compress') { const bytes = await gzip(message.text); self.postMessage({ bytes: bytes.length }) }
    else if (message.op === 'epgPipeline') {
      // Caminho proposto na 082: o Worker do guia agrupa por canal, comprime e grava no próprio IndexedDB.
      const t0 = performance.now()
      const programs = JSON.parse(message.text); const map = new Map()
      for (const p of programs) { const list = map.get(p.channelKey) ?? []; list.push({ s: p.start, e: p.end, t: p.title, d: p.description }); map.set(p.channelKey, list) }
      const t1 = performance.now(); const packed = []
      for (const [key, list] of map) packed.push([key, await gzip(JSON.stringify(list))])
      const t2 = performance.now()
      const db = await new Promise((resolve, reject) => { const q = indexedDB.open('sonda2-epg-worker', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error) })
      await new Promise((resolve, reject) => { const tx = db.transaction('s', 'readwrite'); for (const [key, bytes] of packed) tx.objectStore('s').put(bytes, key); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error) })
      const t3 = performance.now(); db.close()
      self.postMessage({ parseGroupMs: Math.round(t1 - t0), gzipMs: Math.round(t2 - t1), writeMs: Math.round(t3 - t2), totalMs: Math.round(t3 - t0), channels: map.size, bytes: packed.reduce((t, p) => t + p[1].length, 0) })
    }
    else if (message.op === 'compressTimed') {
      const t0 = performance.now(); const items = JSON.parse(message.text); const t1 = performance.now()
      const bytes = await gzip(JSON.stringify(items)); const t2 = performance.now()
      self.postMessage({ parseMs: Math.round(t1 - t0), stringifyAndGzipMs: Math.round(t2 - t1), bytes: bytes.length })
    }
  } catch (error) { self.postMessage({ error: { name: error.name, message: String(error.message).slice(0, 200) } }) }
}
