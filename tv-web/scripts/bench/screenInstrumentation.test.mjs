import { it, expect } from 'vitest'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { instrument } from './screenInstrumentation.mjs'
import { CLOCK } from './screenFixtures.mjs'

it('observa leituras mistas sem exportar chave, credenciais, URLs ou mensagens', async () => {
  const server = createServer((_req, res) => res.end('<!doctype html><html><body></body></html>'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await instrument(page, CLOCK)
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const result = await page.evaluate(async () => {
      const db = await new Promise(resolve => {
        const request = indexedDB.open('synthetic-private', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('categoryBlocks', { keyPath: 'id' })
        request.onsuccess = () => resolve(request.result)
      })
      const write = db.transaction('categoryBlocks', 'readwrite')
      for (const [id, kind, sourceId] of [[1, 'movie', 'screen-065-a'], [2, 'series', 'screen-065-b']]) write.objectStore('categoryBlocks').put({
        id, kind, sourceId, key: 'synthetic-secret', url: 'https://synthetic.invalid/?password=synthetic-secret', items: [{ name: 'private-title' }],
      })
      await new Promise(resolve => { write.oncomplete = resolve })
      const tx = db.transaction('categoryBlocks')
      tx.objectStore('categoryBlocks').getAll()
      await new Promise(resolve => { tx.oncomplete = resolve })
      db.close()
      return window.__screenMetrics.reads
    })
    expect(Object.values(result)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'movie', source: 'a', records: 1, items: 1 }),
      expect.objectContaining({ kind: 'series', source: 'b', records: 1, items: 1 }),
    ]))
    for (const forbidden of ['synthetic-secret', 'private-title', 'https://', 'password', 'url']) expect(JSON.stringify(result)).not.toContain(forbidden)
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}, 30000)
