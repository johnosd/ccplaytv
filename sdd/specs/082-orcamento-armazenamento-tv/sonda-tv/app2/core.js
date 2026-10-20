/* Sonda 2 da feature 082 — núcleo: tela, relatório ao PC, utilitários. App separado do CCPlayTV, dados sintéticos ou
   amostras sanitizadas servidas pelo coletor (sem host do provedor, sem credencial). */
window.P = (function () {
  'use strict'
  var MiB = 1024 * 1024
  var base = window.PROBE_BASE_URL || null           // http://<pc>:<porta>
  var statusEl = document.getElementById('status')
  var logEl = document.getElementById('log')
  var report = { schema: 'sonda-tv-082/2', startedAt: new Date().toISOString(), results: {} }

  function status(text) { statusEl.textContent = text }
  function log(text) {
    logEl.textContent += text + '\n'
    var lines = logEl.textContent.split('\n')
    if (lines.length > 30) logEl.textContent = lines.slice(lines.length - 30).join('\n')
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function now() { return performance.now() }
  function ms(t0) { return Math.round((performance.now() - t0) * 10) / 10 }
  function median(values) { var s = values.slice().sort(function (a, b) { return a - b }); return s.length ? s[Math.floor(s.length / 2)] : null }
  function errInfo(error) {
    if (!error) return null
    var info = { name: error.name || null, message: String(error.message || error).slice(0, 200) }
    if (error.inner) info.inner = errInfo(error.inner)
    return info
  }
  async function estimate() {
    try { var e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota } } catch (error) { return { error: errInfo(error) } }
  }
  function memory() {
    var m = performance.memory
    return m ? { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit } : null
  }
  async function send(label) {
    report.label = label
    report.sentAt = new Date().toISOString()
    if (!base) return
    for (var attempt = 0; attempt < 3; attempt += 1) {
      try {
        var r = await fetch(base + '/storage-probe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
        if (r.ok) return
      } catch (error) { /* tenta de novo */ }
      await sleep(1500)
    }
    log('(falhou enviar ao PC: ' + label + ')')
  }
  async function sample(name) {
    if (!base) throw new Error('sem coletor')
    var r = await fetch(base + '/amostra/' + name + '.json')
    if (!r.ok) throw new Error('amostra ' + name + ': ' + r.status)
    return r.json()
  }
  // Mede quadros: devolve fps médio e maior intervalo entre quadros durante `durationMs`, enquanto `work` roda.
  function frames(durationMs, work) {
    return new Promise(function (resolve) {
      var gaps = []; var last = performance.now(); var start = last; var running = true
      function tick(t) { gaps.push(t - last); last = t; if (running && t - start < durationMs) requestAnimationFrame(tick); else finish() }
      function finish() {
        running = false
        var total = gaps.reduce(function (a, b) { return a + b }, 0)
        resolve({ frames: gaps.length, fps: Math.round(gaps.length / (total / 1000)), maxGapMs: Math.round(Math.max.apply(null, gaps.concat([0]))),
          longFrames: gaps.filter(function (g) { return g > 50 }).length })
      }
      requestAnimationFrame(tick)
      if (work) Promise.resolve().then(work)
    })
  }
  function randomText(bytes) {
    var raw = new Uint8Array(Math.ceil(bytes * 3 / 4))
    for (var off = 0; off < raw.length; off += 65536) crypto.getRandomValues(raw.subarray(off, Math.min(off + 65536, raw.length)))
    var out = ''
    for (var i = 0; i < raw.length; i += 32768) out += btoa(String.fromCharCode.apply(null, raw.subarray(i, i + 32768)))
    return out.slice(0, bytes)
  }
  async function gzipText(text, format) {
    var s = new Blob([text]).stream().pipeThrough(new CompressionStream(format || 'gzip'))
    return new Uint8Array(await new Response(s).arrayBuffer())
  }
  async function gunzipText(bytes, format) {
    var s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format || 'gzip'))
    return new Response(s).text()
  }
  function lean(item) {
    var out = {}
    for (var key in item) {
      if (key === 'group' || key === 'providerCategoryId') continue
      if (key === 'originalName' && item.originalName === item.name) continue
      if (item[key] !== undefined) out[key] = item[key]
    }
    return out
  }
  function chunked(items, size) { var out = []; for (var i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out }

  // IndexedDB cru
  function openDb(name, stores) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(name, 1)
      req.onupgradeneeded = function () { (stores || ['s']).forEach(function (s) { req.result.createObjectStore(s, s === 'rows' ? { autoIncrement: true } : undefined) }) }
      req.onsuccess = function () { resolve(req.result) }
      req.onerror = function () { reject(req.error) }
    })
  }
  function tx(db, store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(store, mode); var out
      out = fn(t.objectStore(store))
      t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out) }
      t.onabort = function () { reject(t.error || new Error('abort')) }
      t.onerror = function () { reject(t.error || new Error('error')) }
    })
  }
  function req(r) { return new Promise(function (resolve, reject) { r.onsuccess = function () { resolve(r.result) }; r.onerror = function () { reject(r.error) } }) }
  function deleteDb(name) { return new Promise(function (resolve) { var r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = function () { resolve() } }) }

  async function run(name, label, fn) {
    status(label)
    var t0 = now()
    try { report.results[name] = await fn() } catch (error) { report.results[name] = { error: errInfo(error) }; log(label + ' — falhou: ' + (error && error.name)) }
    if (report.results[name] && typeof report.results[name] === 'object') report.results[name].tookMs = ms(t0)
    await send(name)
  }

  return { MiB: MiB, base: base, report: report, status: status, log: log, sleep: sleep, now: now, ms: ms, median: median,
    errInfo: errInfo, estimate: estimate, memory: memory, send: send, sample: sample, frames: frames, randomText: randomText,
    gzipText: gzipText, gunzipText: gunzipText, lean: lean, chunked: chunked, openDb: openDb, tx: tx, req: req, deleteDb: deleteDb, run: run }
})()
