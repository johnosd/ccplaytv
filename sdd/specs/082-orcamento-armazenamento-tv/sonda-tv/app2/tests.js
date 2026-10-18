/* Sonda 2 — os testes. Cada um devolve só números, nomes de API e nomes de erro. */
window.T = (function () {
  'use strict'
  var P = window.P, MiB = P.MiB

  // ---------- 1. Ambiente ----------
  async function ambiente() {
    var css = {}
    ;['container-type: inline-size', 'selector(:has(a))', 'backdrop-filter: blur(4px)', 'content-visibility: auto', 'aspect-ratio: 1',
      'gap: 1px', 'inset: 0', 'scrollbar-gutter: stable', 'overscroll-behavior: contain', 'will-change: transform'].forEach(function (q) {
      try { css[q] = q.indexOf('selector(') === 0 ? CSS.supports(q) : CSS.supports.apply(CSS, q.split(/:\s(.+)/).slice(0, 2)) } catch (e) { css[q] = 'erro' }
    })
    var media = {}
    var video = document.createElement('video')
    ;['video/mp4; codecs="avc1.640028"', 'video/mp4; codecs="hev1.1.6.L120.90"', 'video/webm; codecs="vp9"', 'video/mp4; codecs="av01.0.08M.08"',
      'audio/mp4; codecs="mp4a.40.2"', 'audio/mp4; codecs="ec-3"', 'application/vnd.apple.mpegurl', 'video/mp2t'].forEach(function (t) {
      media[t] = { canPlayType: video.canPlayType(t), mse: typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported ? MediaSource.isTypeSupported(t) : null }
    })
    var apis = {}
    var checks = { structuredClone: 'structuredClone', OffscreenCanvas: 'OffscreenCanvas', createImageBitmap: 'createImageBitmap',
      ResizeObserver: 'ResizeObserver', IntersectionObserver: 'IntersectionObserver', requestIdleCallback: 'requestIdleCallback',
      BroadcastChannel: 'BroadcastChannel', WebAssembly: 'WebAssembly', SharedArrayBuffer: 'SharedArrayBuffer',
      CompressionStream: 'CompressionStream', DecompressionStream: 'DecompressionStream', TextDecoderStream: 'TextDecoderStream',
      AbortSignalTimeout: 'AbortSignal', PerformanceObserver: 'PerformanceObserver', queueMicrotask: 'queueMicrotask' }
    Object.keys(checks).forEach(function (k) { apis[k] = typeof window[checks[k]] !== 'undefined' })
    apis.AbortSignalTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    apis.schedulerYield = typeof window.scheduler !== 'undefined' && typeof window.scheduler.yield === 'function'
    apis.schedulerPostTask = typeof window.scheduler !== 'undefined' && typeof window.scheduler.postTask === 'function'
    apis.isInputPending = !!(navigator.scheduling && navigator.scheduling.isInputPending)
    apis.IntlSegmenter = typeof Intl.Segmenter !== 'undefined'
    apis.longTaskObserver = (function () { try { return PerformanceObserver.supportedEntryTypes.indexOf('longtask') >= 0 } catch (e) { return false } })()
    apis.wasmSimd = (function () { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])) } catch (e) { return false } })()
    var tizenInfo = {}
    try { if (typeof tizen !== 'undefined' && tizen.systeminfo) { tizenInfo.totalMemory = tizen.systeminfo.getTotalMemory(); tizenInfo.availableMemory = tizen.systeminfo.getAvailableMemory() } } catch (e) { tizenInfo.memoryError = P.errInfo(e) }
    try { if (typeof tizen !== 'undefined' && tizen.systeminfo) tizenInfo.cpu = await new Promise(function (ok, fail) { tizen.systeminfo.getPropertyValue('CPU', function (v) { ok({ load: v.load }) }, fail) }) } catch (e) { tizenInfo.cpuError = P.errInfo(e) }
    var out = { userAgent: navigator.userAgent, screen: { w: screen.width, h: screen.height, availW: screen.availWidth, availH: screen.availHeight },
      inner: { w: innerWidth, h: innerHeight }, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory || null,
      memory: P.memory(), estimate: await P.estimate(), apis: apis, css: css, media: media, tizen: tizenInfo,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language }
    P.log('Núcleos ' + out.cores + ' | heap limite ' + (out.memory ? Math.round(out.memory.limit / MiB) + ' MiB' : '?') + ' | RAM Tizen ' +
      (tizenInfo.totalMemory ? Math.round(tizenInfo.totalMemory / MiB) + ' MiB, livre ' + Math.round(tizenInfo.availableMemory / MiB) : '?') + ' | tela ' + out.inner.w + 'x' + out.inner.h + ' dpr ' + out.dpr)
    return out
  }

  // ---------- 2. CPU (dados reais de filmes) ----------
  async function cpu() {
    var movies = await P.sample('movie')
    var out = { items: movies.length }
    var t0 = P.now(); var text = JSON.stringify(movies); out.stringifyMs = P.ms(t0); out.jsonChars = text.length
    t0 = P.now(); JSON.parse(text); out.parseMs = P.ms(t0); out.parseMBps = +((text.length / MiB) / (out.parseMs / 1000)).toFixed(1)
    if (typeof structuredClone === 'function') { t0 = P.now(); structuredClone(movies); out.structuredCloneMs = P.ms(t0) }
    var names = movies.map(function (m) { return m.name })
    t0 = P.now(); names.slice().sort(); out.sortPlainMs = P.ms(t0)
    t0 = P.now(); names.slice().sort(function (a, b) { return a.localeCompare(b, 'pt') }); out.sortLocaleCompareMs = P.ms(t0)
    var collator = new Intl.Collator('pt', { sensitivity: 'base', numeric: true })
    t0 = P.now(); names.slice().sort(collator.compare); out.sortCollatorMs = P.ms(t0)
    t0 = P.now(); var folded = names.map(function (n) { return n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }); out.foldAccentsMs = P.ms(t0)
    var queries = ['a', 'ma', 'mat', 'matrix', 'amor', 'zz', 'o', 'de']
    var times = queries.map(function (q) { var t = P.now(); folded.filter(function (n) { return n.indexOf(q) >= 0 }); return P.now() - t })
    out.searchIncludesMedianMs = +P.median(times).toFixed(2)
    t0 = P.now(); for (var i = 0; i < 5; i += 1) movies.map(function (m) { return { id: m.id, name: m.name, year: m.year } }).filter(function (m) { return m.year > 2000 }); out.mapFilter5xMs = P.ms(t0)
    var bigLoop = P.now(); var acc = 0; for (var j = 0; j < 2e7; j += 1) acc = (acc + j * 31) | 0; out.intLoop20MMs = P.ms(bigLoop); out._acc = acc & 1
    P.log('CPU (' + out.items + ' filmes, ' + (out.jsonChars / MiB).toFixed(1) + ' MB): parse ' + out.parseMs + ' ms (' + out.parseMBps + ' MB/s) | ordenar collator ' + out.sortCollatorMs + ' ms | busca ' + out.searchIncludesMedianMs + ' ms')
    return out
  }

  // ---------- 3. Compressão e pedaços (dados reais) ----------
  async function compressao() {
    var out = {}
    var kinds = ['movie', 'series', 'channel']
    for (var k = 0; k < kinds.length; k += 1) {
      var items = await P.sample(kinds[k])
      var leanItems = items.map(P.lean)
      var full = JSON.stringify(items), leanText = JSON.stringify(leanItems)
      var r = { items: items.length, fullChars: full.length, leanChars: leanText.length, formats: {}, chunks: {} }
      for (var f = 0; f < 2; f += 1) {
        var format = f ? 'deflate-raw' : 'gzip'
        var t0 = P.now(); var packed = await P.gzipText(leanText, format); var cMs = P.ms(t0)
        t0 = P.now(); var back = await P.gunzipText(packed, format); var dMs = P.ms(t0)
        t0 = P.now(); JSON.parse(back); var pMs = P.ms(t0)
        r.formats[format] = { bytes: packed.length, ratio: +(full.length / packed.length).toFixed(1), compressMs: cMs, decompressMs: dMs, parseMs: pMs }
      }
      var sizes = [250, 500, 1000, 2000]
      for (var s = 0; s < sizes.length; s += 1) {
        var parts = P.chunked(leanItems, sizes[s])
        var packedParts = []; var t1 = P.now()
        for (var p = 0; p < parts.length; p += 1) packedParts.push(await P.gzipText(JSON.stringify(parts[p])))
        var compressAll = P.ms(t1)
        var firsts = []
        for (var rep = 0; rep < 5; rep += 1) { var t2 = P.now(); JSON.parse(await P.gunzipText(packedParts[0])); firsts.push(P.now() - t2) }
        var t3 = P.now(); for (var q = 0; q < packedParts.length; q += 1) JSON.parse(await P.gunzipText(packedParts[q])); var allMs = P.ms(t3)
        r.chunks[sizes[s]] = { parts: parts.length, bytes: packedParts.reduce(function (t, b) { return t + b.length }, 0), compressAllMs: compressAll,
          firstChunkMedianMs: +P.median(firsts).toFixed(1), readAllMs: allMs }
      }
      out[kinds[k]] = r
      P.log(kinds[k] + ' (' + r.items + '): gzip ' + r.formats.gzip.ratio + 'x em ' + r.formats.gzip.compressMs + ' ms | 1º pedaço de 500: ' + r.chunks[500].firstChunkMedianMs + ' ms | tudo ' + r.chunks[500].readAllMs + ' ms')
    }
    return out
  }

  // ---------- 4. Worker ----------
  function workerCall(worker, message, transfer) {
    return new Promise(function (resolve, reject) {
      worker.onmessage = function (e) { resolve(e.data) }
      worker.onerror = function (e) { reject(new Error(e.message || 'erro no worker')) }
      worker.postMessage(message, transfer || [])
    })
  }
  async function worker() {
    var out = {}
    var t0 = P.now(); var w = new Worker('worker.js'); var caps = await workerCall(w, { op: 'caps' }); out.spawnAndFirstReplyMs = P.ms(t0); out.caps = caps
    var movies = await P.sample('movie'); var leanText = JSON.stringify(movies.map(P.lean))
    t0 = P.now(); await workerCall(w, { op: 'echo', data: movies }); out.postCloneRoundTripMs = P.ms(t0)
    var buffer = new TextEncoder().encode(leanText).buffer; var bytes = buffer.byteLength
    t0 = P.now(); var back = await workerCall(w, { op: 'echoBuffer', buffer: buffer }, [buffer]); out.postTransferRoundTripMs = P.ms(t0); out.transferBytes = bytes; void back
    // Travamento da tela: comprimir no Worker x na thread principal, medindo os quadros ao mesmo tempo.
    out.framesIdle = await P.frames(1500)
    out.framesWhileWorkerCompress = await P.frames(4000, function () { return workerCall(w, { op: 'compress', text: leanText }) })
    out.framesWhileMainCompress = await P.frames(4000, function () { return P.gzipText(leanText).then(function (b) { return JSON.parse(leanText) && b }) })
    out.framesWhileMainParse = await P.frames(3000, function () { for (var i = 0; i < 3; i += 1) JSON.parse(leanText) })
    t0 = P.now(); var r = await workerCall(w, { op: 'compressTimed', text: leanText }); out.workerCompress = r; out.workerCompressRoundTripMs = P.ms(t0)
    w.terminate()
    if ((navigator.hardwareConcurrency || 1) > 1) {
      var half = Math.floor(leanText.length / 2); var w1 = new Worker('worker.js'), w2 = new Worker('worker.js')
      await Promise.all([workerCall(w1, { op: 'caps' }), workerCall(w2, { op: 'caps' })])
      t0 = P.now(); await Promise.all([workerCall(w1, { op: 'compress', text: leanText.slice(0, half) }), workerCall(w2, { op: 'compress', text: leanText.slice(half) })]); out.twoWorkersCompressMs = P.ms(t0)
      w1.terminate(); w2.terminate()
    }
    P.log('Worker: abre ' + out.spawnAndFirstReplyMs + ' ms | IDB no worker ' + caps.indexedDB + ' | gzip no worker ' + caps.compressionStream + ' | quadros: parado ' + out.framesIdle.fps + ' fps, worker comprimindo ' + out.framesWhileWorkerCompress.fps + ' fps (pior ' + out.framesWhileWorkerCompress.maxGapMs + ' ms), principal comprimindo pior ' + out.framesWhileMainCompress.maxGapMs + ' ms')
    return out
  }

  // ---------- 5. IndexedDB: formatos, leitura, muitos registros, apagar ----------
  async function idb() {
    var out = {}
    var movies = await P.sample('movie'); var leanItems = movies.map(P.lean)
    var leanText = JSON.stringify(leanItems)
    var gz = await P.gzipText(leanText)
    var parts = P.chunked(leanItems, 500); var gzParts = []
    for (var i = 0; i < parts.length; i += 1) gzParts.push(await P.gzipText(JSON.stringify(parts[i])))
    var variants = {
      objetosAtuais: function (s) { s.put(movies, 'x') },
      objetosEnxutos: function (s) { s.put(leanItems, 'x') },
      gzipUmRegistro: function (s) { s.put(gz, 'x') },
      gzipPedacos500: function (s) { gzParts.forEach(function (b, n) { s.put(b, 'p' + n) }) },
    }
    var names = Object.keys(variants)
    for (var v = 0; v < names.length; v += 1) {
      var name = names[v]; await P.deleteDb('sonda2-fmt'); var db = await P.openDb('sonda2-fmt')
      var before = await P.estimate(); var t0 = P.now(); await P.tx(db, 's', 'readwrite', variants[name]); var writeMs = P.ms(t0)
      await P.sleep(2500); var after = await P.estimate()
      var reads = []
      for (var r = 0; r < 5; r += 1) {
        var t1 = P.now()
        if (name === 'gzipPedacos500') { var first = await P.req(db.transaction('s').objectStore('s').get('p0')); JSON.parse(await P.gunzipText(first)) }
        else { var value = await P.req(db.transaction('s').objectStore('s').get('x')); if (name === 'gzipUmRegistro') JSON.parse(await P.gunzipText(value)) }
        reads.push(P.now() - t1)
      }
      var all = null
      if (name === 'gzipPedacos500') { var t2 = P.now(); for (var n = 0; n < gzParts.length; n += 1) JSON.parse(await P.gunzipText(await P.req(db.transaction('s').objectStore('s').get('p' + n)))); all = P.ms(t2) }
      out[name] = { usageDelta: after.usage - before.usage, writeMs: writeMs, readMedianMs: +P.median(reads).toFixed(1), readAllMs: all }
      db.close()
      P.log('IDB ' + name + ': ocupa ' + ((after.usage - before.usage) / MiB).toFixed(2) + ' MB | gravar ' + writeMs + ' ms | ler ' + out[name].readMedianMs + ' ms' + (all ? ' (tudo ' + all + ' ms)' : ''))
    }
    await P.deleteDb('sonda2-fmt')
    // Muitos registros pequenos (como linhas de guia) e índice.
    var epg = await P.sample('epg')
    var rows = []; while (rows.length < 20000) rows = rows.concat(epg); rows = rows.slice(0, 20000)
    await P.deleteDb('sonda2-rows')
    var rdb = await new Promise(function (resolve, reject) {
      var q = indexedDB.open('sonda2-rows', 1)
      q.onupgradeneeded = function () { var s = q.result.createObjectStore('rows', { autoIncrement: true }); s.createIndex('ch', ['channelKey', 'start']) }
      q.onsuccess = function () { resolve(q.result) }; q.onerror = function () { reject(q.error) }
    })
    var b0 = await P.estimate(); var t3 = P.now()
    await P.tx(rdb, 'rows', 'readwrite', function (s) { rows.forEach(function (row) { s.add(row) }) })
    out.rows20k = { bulkAddMs: P.ms(t3) }
    await P.sleep(2500); out.rows20k.usageDelta = (await P.estimate()).usage - b0.usage
    var t4 = P.now(); await P.req(rdb.transaction('rows').objectStore('rows').getAll()); out.rows20k.getAllMs = P.ms(t4)
    var t5 = P.now(); await P.req(rdb.transaction('rows').objectStore('rows').count()); out.rows20k.countMs = P.ms(t5)
    var key = rows[0].channelKey
    var t6 = P.now(); await P.req(rdb.transaction('rows').objectStore('rows').index('ch').getAll(IDBKeyRange.bound([key, 0], [key, Infinity]))); out.rows20k.indexRangeMs = P.ms(t6)
    // Apagar registros (não o banco): o uso cai na hora?
    var beforeClear = await P.estimate()
    await P.tx(rdb, 'rows', 'readwrite', function (s) { s.clear() })
    out.rows20k.clearUsage = { before: beforeClear.usage, now: (await P.estimate()).usage }
    await P.sleep(10000); out.rows20k.clearUsage.after10s = (await P.estimate()).usage
    await P.sleep(60000); out.rows20k.clearUsage.after70s = (await P.estimate()).usage
    rdb.close(); await P.deleteDb('sonda2-rows')
    P.log('20 mil linhas: gravar ' + out.rows20k.bulkAddMs + ' ms, ocupa ' + (out.rows20k.usageDelta / MiB).toFixed(2) + ' MB, ler tudo ' + out.rows20k.getAllMs + ' ms | depois de clear(): ' + (out.rows20k.clearUsage.now / MiB).toFixed(1) + ' -> 70 s ' + (out.rows20k.clearUsage.after70s / MiB).toFixed(1) + ' MB')
    return out
  }

  // ---------- 6. Renderização ----------
  async function render() {
    var stage = document.getElementById('stage'); stage.innerHTML = ''; stage.style.display = 'block'
    var out = {}
    // Capas sintéticas 300x450 (JPEG) — custo de decodificar.
    var canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 450; var ctx = canvas.getContext('2d')
    var blobs = []
    for (var i = 0; i < 24; i += 1) {
      var grad = ctx.createLinearGradient(0, 0, 300, 450); grad.addColorStop(0, 'hsl(' + (i * 15) + ',70%,40%)'); grad.addColorStop(1, '#111')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 300, 450); for (var n = 0; n < 200; n += 1) { ctx.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.3 + ')'; ctx.fillRect(Math.random() * 300, Math.random() * 450, 8, 8) }
      blobs.push(await new Promise(function (r) { canvas.toBlob(r, 'image/jpeg', 0.85) }))
    }
    var urls = blobs.map(function (b) { return URL.createObjectURL(b) })
    var decodes = []
    for (var d = 0; d < urls.length; d += 1) { var img = new Image(); img.src = urls[d]; var t0 = P.now(); try { await img.decode(); decodes.push(P.now() - t0) } catch (e) { /* ignora */ } }
    out.imageDecodeMedianMs = +P.median(decodes).toFixed(1)
    if (typeof createImageBitmap === 'function') { var bms = []; for (var b = 0; b < 8; b += 1) { var t1 = P.now(); (await createImageBitmap(blobs[b])).close(); bms.push(P.now() - t1) } out.createImageBitmapMedianMs = +P.median(bms).toFixed(1) }
    // Grade de cards como a vitrine (posters 7 por linha).
    var t2 = P.now(); var grid = document.createElement('div'); grid.className = 'grid'
    for (var c = 0; c < 140; c += 1) { var card = document.createElement('div'); card.className = 'card'; var im = document.createElement('img'); im.src = urls[c % urls.length]; var label = document.createElement('div'); label.className = 'label'; label.textContent = 'Título de teste ' + c; card.appendChild(im); card.appendChild(label); grid.appendChild(card) }
    stage.appendChild(grid); void grid.offsetHeight; out.build140CardsMs = P.ms(t2)
    await P.sleep(800)
    var cards = grid.children
    function focusLoop(cls, duration) { var idx = 0; var timer = setInterval(function () { cards[idx % cards.length].classList.remove(cls); idx += 1; cards[idx % cards.length].classList.add(cls) }, 140); return P.sleep(duration).then(function () { clearInterval(timer); for (var x = 0; x < cards.length; x += 1) cards[x].classList.remove(cls) }) }
    out.idle = await P.frames(1500)
    out.focusTransformOnly = await P.frames(3000, function () { return focusLoop('f-scale', 3000) })
    out.focusScaleShadowGlow = await P.frames(3000, function () { return focusLoop('f-full', 3000) })
    stage.classList.add('blurred'); out.focusWithBackdropBlur = await P.frames(3000, function () { return focusLoop('f-full', 3000) }); stage.classList.remove('blurred')
    // Rolagem da grade por transform (como a lista virtual).
    out.scrollTransform = await P.frames(3000, function () { var y = 0; var timer = setInterval(function () { y = (y + 40) % 1200; grid.style.transform = 'translateY(' + (-y) + 'px)' }, 16); return P.sleep(3000).then(function () { clearInterval(timer); grid.style.transform = '' }) })
    out.scrollTop = await P.frames(3000, function () { stage.style.overflow = 'hidden'; var y = 0; var timer = setInterval(function () { y = (y + 40) % 1200; stage.scrollTop = y }, 16); return P.sleep(3000).then(function () { clearInterval(timer); stage.scrollTop = 0 }) })
    // Trocar o conteúdo da grade inteira (como trocar de categoria).
    var t3 = P.now(); for (var r = 0; r < 140; r += 1) cards[r].lastChild.textContent = 'Outro título ' + r; void grid.offsetHeight; out.relabel140Ms = P.ms(t3)
    stage.innerHTML = ''; stage.style.display = 'none'; urls.forEach(function (u) { URL.revokeObjectURL(u) })
    P.log('Render: parado ' + out.idle.fps + ' fps | foco (só scale) ' + out.focusTransformOnly.fps + ' fps pior ' + out.focusTransformOnly.maxGapMs + ' ms | foco completo ' + out.focusScaleShadowGlow.fps + ' fps pior ' + out.focusScaleShadowGlow.maxGapMs + ' ms | com blur ' + out.focusWithBackdropBlur.fps + ' fps | rolar ' + out.scrollTransform.fps + ' fps | capa ' + out.imageDecodeMedianMs + ' ms')
    return out
  }

  // ---------- 7. Rede local (TV <-> PC) ----------
  async function rede() {
    var out = {}
    var pings = []
    for (var i = 0; i < 20; i += 1) { var t0 = P.now(); await fetch(P.base + '/ping', { cache: 'no-store' }); pings.push(P.now() - t0) }
    out.pingMedianMs = +P.median(pings).toFixed(1); out.pingMaxMs = Math.round(Math.max.apply(null, pings))
    var t1 = P.now(); var r = await fetch(P.base + '/bin/20', { cache: 'no-store' }); var buf = await r.arrayBuffer(); var secs = (P.now() - t1) / 1000
    out.download20MB = { bytes: buf.byteLength, seconds: +secs.toFixed(2), mbps: +((buf.byteLength * 8 / 1e6) / secs).toFixed(1) }
    // Ler em fluxo (como a importação em Worker) e descomprimir uma resposta gzip no cliente.
    var t2 = P.now(); var rs = await fetch(P.base + '/bin/20', { cache: 'no-store' }); var reader = rs.body.getReader(); var total = 0, chunks = 0
    for (;;) { var part = await reader.read(); if (part.done) break; total += part.value.length; chunks += 1 }
    out.streamRead20MB = { ms: P.ms(t2), chunks: chunks, avgChunkKB: Math.round(total / chunks / 1024) }
    var t3 = P.now(); var gz = await fetch(P.base + '/amostra-gz/movie', { cache: 'no-store' }); var text = await new Response(gz.body.pipeThrough(new DecompressionStream('gzip'))).text(); out.fetchGzipDecompressMs = P.ms(t3); out.fetchGzipChars = text.length
    P.log('Rede: ping ' + out.pingMedianMs + ' ms | download ' + out.download20MB.mbps + ' Mbit/s | fluxo em ' + out.streamRead20MB.chunks + ' pedaços de ~' + out.streamRead20MB.avgChunkKB + ' KB')
    return out
  }

  // ---------- 9. Guia: linhas (hoje) x comprimido por canal (082, pendência B-05) ----------
  async function guia() {
    var base = await P.sample('epg')
    // Amplia a amostra (60 canais) até o tamanho da janela real (~10 122 programas), com canais de chave distinta.
    var target = 10122; var programs = []; var round = 0
    while (programs.length < target) { for (var i = 0; i < base.length && programs.length < target; i += 1) { var p = base[i]; programs.push({ sourceId: p.sourceId, generation: 1, channelKey: p.channelKey + '#' + round, start: p.start, end: p.end, title: p.title, description: p.description }) } round += 1 }
    var out = { programs: programs.length }
    P.report.results.guia = out
    // Cada etapa manda o resultado ao terminar e não impede as outras (a 1ª rodada na TV abortou sem dizer onde).
    async function step(name, fn) {
      var t = P.now(); P.status('Guia: ' + name)
      try { await fn() } catch (error) { out[name + 'Error'] = P.errInfo(error); out[name + 'ErrorAfterMs'] = P.ms(t); P.log('Guia ' + name + ' falhou: ' + (error && error.name) + ' em ' + P.ms(t) + ' ms') }
      await P.send('guia-' + name)
    }
    var keys = []; var seen = {}; programs.forEach(function (p) { if (!seen[p.channelKey]) { seen[p.channelKey] = 1; keys.push(p.channelKey) } }); out.channels = keys.length
    await step('linhas', async function () {
    // (a) Hoje: uma linha por programa, com índice composto como o app. Lotes de 500 (o app grava em lotes).
    await P.deleteDb('sonda2-epg-rows')
    var rdb = await new Promise(function (resolve, reject) { var q = indexedDB.open('sonda2-epg-rows', 1); q.onupgradeneeded = function () { var s = q.result.createObjectStore('rows', { autoIncrement: true }); s.createIndex('k', ['sourceId', 'generation', 'channelKey', 'start']) }; q.onsuccess = function () { resolve(q.result) }; q.onerror = function () { reject(q.error) } })
    var b0 = await P.estimate(); var t0 = P.now(); out.rows = { batches: [] }
    for (var off = 0; off < programs.length; off += 500) {
      var batch = programs.slice(off, off + 500); var tb = P.now()
      await P.tx(rdb, 'rows', 'readwrite', function (s) { batch.forEach(function (row) { s.add(row) }) })
      out.rows.batches.push(Math.round(P.now() - tb)); P.status('Guia: linhas ' + (off + batch.length) + '/' + programs.length)
    }
    out.rows.writeMs = P.ms(t0)
    await P.sleep(2500); out.rows.usageDelta = (await P.estimate()).usage - b0.usage
    var t1 = P.now()
    for (var c = 0; c < 20; c += 1) await P.req(rdb.transaction('rows').objectStore('rows').index('k').getAll(IDBKeyRange.bound([programs[0].sourceId, 1, keys[c], 0], [programs[0].sourceId, 1, keys[c], Infinity])))
    out.rows.read20ChannelsMs = P.ms(t1)
    rdb.close(); await P.deleteDb('sonda2-epg-rows')
    })
    await step('principal', async function () {
    // (b) Novo, na thread principal: agrupar por canal, gzip, um registro por canal.
    function grouped() { var map = {}; programs.forEach(function (p) { (map[p.channelKey] = map[p.channelKey] || []).push({ s: p.start, e: p.end, t: p.title, d: p.description }) }); return map }
    await P.deleteDb('sonda2-epg-chunks')
    var cdb = await P.openDb('sonda2-epg-chunks')
    var b1 = await P.estimate(); var t2 = P.now(); var map = grouped(); var entries = Object.keys(map); var packed = []
    for (var e = 0; e < entries.length; e += 1) packed.push([entries[e], await P.gzipText(JSON.stringify(map[entries[e]]))])
    var encodeMs = P.ms(t2)
    var t3 = P.now(); await P.tx(cdb, 's', 'readwrite', function (s) { packed.forEach(function (pair) { s.put(pair[1], pair[0]) }) }); var putMs = P.ms(t3)
    out.chunksMain = { encodeMs: encodeMs, writeMs: putMs, totalMs: encodeMs + putMs, bytes: packed.reduce(function (t, p) { return t + p[1].length }, 0) }
    await P.sleep(2500); out.chunksMain.usageDelta = (await P.estimate()).usage - b1.usage
    var t4 = P.now()
    for (var r = 0; r < 20; r += 1) JSON.parse(await P.gunzipText(await P.req(cdb.transaction('s').objectStore('s').get(entries[r]))))
    out.chunksMain.read20ChannelsMs = P.ms(t4)
    cdb.close(); await P.deleteDb('sonda2-epg-chunks')
    })
    await step('worker', async function () {
    // (c) Novo, no Worker: parse + agrupar + gzip + gravar no IndexedDB do próprio Worker; mede os quadros da tela juntos.
    var w = new Worker('worker.js'); await workerCall(w, { op: 'caps' })
    var text = JSON.stringify(programs); var pipeline
    out.framesWhileWorkerEpg = await P.frames(8000, function () { pipeline = workerCall(w, { op: 'epgPipeline', text: text }); return pipeline })
    var tw = P.now(); out.chunksWorker = await pipeline; out.workerWaitAfterFramesMs = P.ms(tw)
    w.terminate(); await P.deleteDb('sonda2-epg-worker')
    })
    var rows = out.rows || {}, main = out.chunksMain || {}, wk = out.chunksWorker || {}
    P.log('Guia (' + out.programs + ' programas, ' + out.channels + ' canais): linhas ' + rows.writeMs + ' ms | por canal na tela ' + main.totalMs + ' ms | no Worker ' + wk.totalMs + ' ms | ler 20 canais: linhas ' + rows.read20ChannelsMs + ' ms, comprimido ' + main.read20ChannelsMs + ' ms')
    return out
  }

  // ---------- 8. Memória (por último; pode derrubar o app) ----------
  async function memoriaHeap() {
    var out = { steps: [] }; var keep = []
    P.report.results.memoriaHeap = out
    for (var step = 1; step <= 40; step += 1) {
      var batch = []; for (var i = 0; i < 200000; i += 1) batch.push({ id: i, name: 'item ' + i + ' ' + step, year: 2000 + (i % 25), extra: null })
      keep.push(batch)
      var m = P.memory(); out.steps.push({ objects: step * 200000, used: m && m.used, limit: m && m.limit })
      P.status('8a Memória JS: ' + (step * 200000).toLocaleString() + ' objetos, heap ' + (m ? Math.round(m.used / MiB) : '?') + ' MiB')
      await P.send('memoriaHeap-' + step)
      if (m && m.used > m.limit * 0.8) { out.stoppedAt80PercentOfLimit = true; break }
    }
    keep = null
    out.maxUsed = Math.max.apply(null, out.steps.map(function (s) { return s.used || 0 }))
    P.log('Heap JS: chegou a ' + Math.round(out.maxUsed / MiB) + ' MiB sem cair (limite informado ' + (P.memory() ? Math.round(P.memory().limit / MiB) : '?') + ' MiB)')
    return out
  }
  async function memoriaBuffers() {
    var out = { steps: [] }; var keep = []
    P.report.results.memoriaBuffers = out
    // Teto de 1 GiB e parada com < 200 MB livres no sistema: medir sem desestabilizar a TV.
    for (var step = 1; step <= 32; step += 1) {
      try { var b = new Uint8Array(32 * MiB); for (var i = 0; i < b.length; i += 4096) b[i] = 1; keep.push(b) } catch (error) { out.error = P.errInfo(error); break }
      var avail = null; try { avail = tizen.systeminfo.getAvailableMemory() } catch (e) { /* sem tizen */ }
      out.steps.push({ allocatedMiB: step * 32, systemAvailable: avail })
      if (avail !== null && avail < 200 * MiB) { out.stoppedLowSystemMemory = true; P.send('memoriaBuffers-' + step); break }
      P.status('8b Memória (buffers): ' + step * 32 + ' MiB alocados')
      await P.send('memoriaBuffers-' + step)
    }
    keep = null
    out.maxAllocatedMiB = out.steps.length * 32
    P.log('Buffers: alocou ' + out.maxAllocatedMiB + ' MiB' + (out.error ? ' (parou: ' + out.error.name + ')' : ' sem erro (teto do teste)'))
    return out
  }

  return { guia: guia, ambiente: ambiente, cpu: cpu, compressao: compressao, worker: worker, idb: idb, render: render, rede: rede, memoriaHeap: memoriaHeap, memoriaBuffers: memoriaBuffers }
})()
