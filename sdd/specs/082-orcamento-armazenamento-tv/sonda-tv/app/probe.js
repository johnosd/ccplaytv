/*
 * Sonda descartável da feature 082 (app separado do CCPlayTV). Responde, na TV real:
 *  - a cota do armazenamento web é mesmo ~80 MB? sobe ao estourar (privilégio unlimitedstorage)? persiste ao relançar?
 *  - persist()/requestQuota mudam algo? OPFS/Cache Storage/Web SQL dividem a mesma cota?
 *  - quanto a compressão (gzip) economiza aqui e quanto custa de CPU?
 *  - a pasta privada de arquivos (wgt-private) fica fora da cota? é mais rápida ou mais lenta que o IndexedDB?
 * Só grava dados sintéticos. O relatório leva números e nomes de erro — nenhum dado do usuário, nenhuma credencial.
 * Fase 1 roda ao abrir; fase 2 roda ao abrir de novo (teste de "a concessão persiste?") e limpa tudo.
 */
(function () {
  'use strict'
  var MiB = 1024 * 1024
  var OVERFLOW_CAP_BYTES = 400 * MiB   // para de encher aqui mesmo se a TV conceder "ilimitado" (não lota o disco)
  var FILES_BYTES = 100 * MiB          // teste em massa da pasta wgt-private
  var STATE_KEY = 'sonda082.phase'
  var REPORT_URL = window.PROBE_REPORT_URL || null
  var statusEl = document.getElementById('status')
  var logEl = document.getElementById('log')
  var report = { schema: 'sonda-cota-082/1', startedAt: new Date().toISOString(), steps: {} }

  function status(text) { statusEl.textContent = text }
  function log(text) {
    logEl.textContent += text + '\n'
    var lines = logEl.textContent.split('\n')
    if (lines.length > 34) logEl.textContent = lines.slice(lines.length - 34).join('\n')
  }
  function mb(bytes) { return typeof bytes === 'number' ? (bytes / MiB).toFixed(2) + ' MiB' : String(bytes) }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms) }) }
  function errInfo(error) {
    if (!error) return null
    var info = { name: error.name || null, message: String(error.message || error).slice(0, 200) }
    if (error.inner) info.inner = errInfo(error.inner)
    return info
  }
  function median(values) { var s = values.slice().sort(function (a, b) { return a - b }); return s[Math.floor(s.length / 2)] }

  async function estimate() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return { available: false }
      var e = await navigator.storage.estimate()
      return { usage: e.usage, quota: e.quota, details: e.usageDetails || null }
    } catch (error) { return { error: errInfo(error) } }
  }

  async function send(label) {
    report.sentAt = new Date().toISOString()
    report.label = label
    if (!REPORT_URL) { log('(sem coletor configurado: só na tela)'); return }
    for (var attempt = 0; attempt < 3; attempt += 1) {
      try {
        var response = await fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
        if (response.ok) { log('Relatório enviado ao PC (' + label + ').'); return }
      } catch (error) { /* tenta de novo */ }
      await sleep(2000)
    }
    log('Falhou enviar ao PC — anote a tela.')
  }

  // ---------- dados sintéticos ----------
  function randomText(bytes) {
    var raw = new Uint8Array(Math.ceil(bytes * 3 / 4))
    for (var off = 0; off < raw.length; off += 65536) crypto.getRandomValues(raw.subarray(off, Math.min(off + 65536, raw.length)))
    var out = ''
    for (var i = 0; i < raw.length; i += 32768) out += btoa(String.fromCharCode.apply(null, raw.subarray(i, i + 32768)))
    return out.slice(0, bytes)
  }
  // Parecido com um bloco de catálogo (chaves repetidas, prefixos de URL comuns) — mede compressão realista.
  function catalogLike(count, seed) {
    var items = []
    for (var i = 0; i < count; i += 1) {
      var n = seed * 100000 + i
      items.push({ id: -(seed * 4294967296 + i), name: 'Filme de teste ' + n + ' (' + (1980 + (n % 45)) + ')',
        originalName: 'Filme de teste ' + n, group: 'Categoria ' + seed, providerCategoryId: String(seed),
        providerStreamId: String(n), streamExtension: n % 3 ? 'mp4' : 'mkv',
        iconUrl: 'https://image.fixture.test/t/p/w600_and_h900_bestv2/' + Math.random().toString(36).slice(2, 14) + '.jpg',
        year: 1980 + (n % 45), addedAt: 1600000000 + n, providerRating: (n % 100) / 10 })
    }
    return items
  }

  // ---------- IndexedDB cru ----------
  function openDb(name) {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(name, 1)
      request.onupgradeneeded = function () { request.result.createObjectStore('s') }
      request.onsuccess = function () { resolve(request.result) }
      request.onerror = function () { reject(request.error) }
    })
  }
  function put(db, key, value) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('s', 'readwrite')
      tx.objectStore('s').put(value, key)
      tx.oncomplete = function () { resolve() }
      tx.onabort = function () { reject(tx.error || new Error('abort')) }
      tx.onerror = function () { reject(tx.error || new Error('error')) }
    })
  }
  function get(db, key) {
    return new Promise(function (resolve, reject) {
      var request = db.transaction('s', 'readonly').objectStore('s').get(key)
      request.onsuccess = function () { resolve(request.result) }
      request.onerror = function () { reject(request.error) }
    })
  }
  function deleteDb(name) {
    return new Promise(function (resolve) {
      var request = indexedDB.deleteDatabase(name)
      request.onsuccess = request.onerror = request.onblocked = function () { resolve() }
    })
  }

  // ---------- gzip ----------
  async function gzip(text) {
    var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  async function gunzip(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return await new Response(stream).text()
  }

  // ---------- tizen.filesystem (wgt-private) ----------
  function fsAvailable() { return typeof tizen !== 'undefined' && tizen.filesystem && typeof tizen.filesystem.openFile === 'function' }
  function fsCall(fn) { return new Promise(function (resolve, reject) { try { fn(resolve, reject) } catch (error) { reject(error) } }) }
  async function fsEnsureDir(path) {
    try { if (tizen.filesystem.pathExists(path)) return } catch (error) { /* segue */ }
    await fsCall(function (ok, fail) { tizen.filesystem.createDirectory(path, true, ok, fail) })
  }
  async function fsRemoveDir(path) {
    try { if (!tizen.filesystem.pathExists(path)) return } catch (error) { return }
    await fsCall(function (ok, fail) { tizen.filesystem.deleteDirectory(path, true, ok, fail) })
  }

  // ======================= FASE 1 =======================
  async function stepInfo() {
    status('1/7 Informações do aparelho')
    var info = { userAgent: navigator.userAgent, protocol: location.protocol, estimate: await estimate(),
      apis: { storagePersist: !!(navigator.storage && navigator.storage.persist), webkitPersistentStorage: !!navigator.webkitPersistentStorage,
        webkitStorageInfo: !!window.webkitStorageInfo, opfs: !!(navigator.storage && navigator.storage.getDirectory),
        cacheStorage: typeof caches !== 'undefined', webSql: typeof window.openDatabase === 'function',
        compressionStream: typeof CompressionStream !== 'undefined', tizenFilesystem: fsAvailable() } }
    try { info.persistedBefore = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null } catch (error) { info.persistedBefore = errInfo(error) }
    try {
      if (typeof tizen !== 'undefined' && tizen.systeminfo) {
        info.deviceStorage = await fsCall(function (ok, fail) {
          tizen.systeminfo.getPropertyValue('STORAGE', function (value) {
            ok((value.units || []).map(function (unit) { return { type: unit.type, capacity: unit.capacity, availableCapacity: unit.availableCapacity, isRemovable: unit.isRemovable } }))
          }, fail)
        })
      }
    } catch (error) { info.deviceStorage = { error: errInfo(error) } }
    report.steps.info = info
    log('Cota informada: ' + mb(info.estimate.quota) + ' (' + info.estimate.quota + ' bytes); uso ' + mb(info.estimate.usage))
    if (Array.isArray(info.deviceStorage)) info.deviceStorage.forEach(function (unit) { log('Disco ' + unit.type + ': ' + mb(unit.capacity) + ' total, ' + mb(unit.availableCapacity) + ' livre') })
  }

  async function stepLevers() {
    status('2/7 persist() e requestQuota')
    var levers = {}
    try { levers.persist = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : 'indisponível' } catch (error) { levers.persist = errInfo(error) }
    levers.afterPersist = await estimate()
    if (navigator.webkitPersistentStorage && navigator.webkitPersistentStorage.requestQuota) {
      levers.requestQuota = await new Promise(function (resolve) {
        try {
          navigator.webkitPersistentStorage.requestQuota(500 * MiB, function (granted) { resolve({ granted: granted }) }, function (error) { resolve({ error: errInfo(error) }) })
          setTimeout(function () { resolve({ timeout: true }) }, 10000)
        } catch (error) { resolve({ error: errInfo(error) }) }
      })
      levers.queryPersistent = await new Promise(function (resolve) {
        try { navigator.webkitPersistentStorage.queryUsageAndQuota(function (usage, quota) { resolve({ usage: usage, quota: quota }) }, function (error) { resolve({ error: errInfo(error) }) }) } catch (error) { resolve({ error: errInfo(error) }) }
      })
    } else levers.requestQuota = 'indisponível'
    levers.afterRequestQuota = await estimate()
    report.steps.levers = levers
    log('persist(): ' + JSON.stringify(levers.persist) + ' | requestQuota: ' + JSON.stringify(levers.requestQuota) + ' | cota depois: ' + mb(levers.afterRequestQuota.quota))
  }

  async function stepCompression() {
    status('3/7 Compressão (gzip) no aparelho')
    var result = {}
    try {
      var items = catalogLike(20000, 7)
      var t0 = performance.now(); var json = JSON.stringify(items); result.stringifyMs = Math.round(performance.now() - t0)
      result.jsonChars = json.length
      t0 = performance.now(); var packed = await gzip(json); result.gzipMs = Math.round(performance.now() - t0)
      result.gzipBytes = packed.length
      t0 = performance.now(); var back = await gunzip(packed); result.gunzipMs = Math.round(performance.now() - t0)
      t0 = performance.now(); JSON.parse(back); result.parseMs = Math.round(performance.now() - t0)
      result.ratio = +(result.jsonChars / result.gzipBytes).toFixed(2)
      // Quanto cada forma ocupa de verdade na cota (delta do estimate, com folga para o log do LevelDB assentar).
      var db = await openDb('sonda082-compress')
      var base = await estimate(); await put(db, 'objetos', items); await sleep(3000); var afterObjects = await estimate()
      result.usageDeltaObjects = afterObjects.usage - base.usage
      await put(db, 'objetos', null); await put(db, 'gzip', packed); await sleep(3000); var afterGzip = await estimate()
      result.usageDeltaGzipAfterReplacing = afterGzip.usage - base.usage
      db.close(); await deleteDb('sonda082-compress')
    } catch (error) { result.error = errInfo(error) }
    report.steps.compression = result
    log('gzip: ' + result.jsonChars + ' chars -> ' + result.gzipBytes + ' bytes (' + result.ratio + 'x), ' + result.gzipMs + ' ms; volta ' + result.gunzipMs + ' ms + parse ' + result.parseMs + ' ms')
    log('Uso real: objetos +' + mb(result.usageDeltaObjects) + ' | gzip (depois de trocar) ' + mb(result.usageDeltaGzipAfterReplacing))
  }

  async function stepReadSpeed() {
    status('4/7 Leitura: IndexedDB x arquivo')
    var result = {}
    try {
      var items = catalogLike(12000, 9)
      var json = JSON.stringify(items)
      result.jsonChars = json.length
      var db = await openDb('sonda082-read'); await put(db, 'bloco', items)
      var idbTimes = []
      for (var i = 0; i < 5; i += 1) { var t0 = performance.now(); await get(db, 'bloco'); idbTimes.push(performance.now() - t0) }
      result.idbReadMedianMs = Math.round(median(idbTimes))
      db.close(); await deleteDb('sonda082-read')
      if (fsAvailable()) {
        await fsEnsureDir('wgt-private/sonda082')
        var t1 = performance.now()
        var handle = tizen.filesystem.openFile('wgt-private/sonda082/bloco.json', 'w'); handle.writeString(json); handle.close()
        result.fileWriteMs = Math.round(performance.now() - t1)
        var fileTimes = []
        for (var j = 0; j < 5; j += 1) {
          var t2 = performance.now()
          var reader = tizen.filesystem.openFile('wgt-private/sonda082/bloco.json', 'r'); var text = reader.readString(); reader.close(); JSON.parse(text)
          fileTimes.push(performance.now() - t2)
        }
        result.fileReadParseMedianMs = Math.round(median(fileTimes))
        await fsRemoveDir('wgt-private/sonda082')
      } else result.file = 'tizen.filesystem indisponível'
    } catch (error) { result.error = errInfo(error) }
    report.steps.readSpeed = result
    log('Ler bloco (' + mb(result.jsonChars) + '): IndexedDB ' + result.idbReadMedianMs + ' ms | arquivo+parse ' + result.fileReadParseMedianMs + ' ms')
  }

  async function writeBlock(db, key) { await put(db, key, { key: key, payload: randomText(MiB) }) }

  async function stepOverflow() {
    status('5/7 Enchendo o IndexedDB até falhar (dados aleatórios)')
    var start = await estimate()
    var result = { start: start, samples: [], written: 0 }
    var db = await openDb('sonda082-overflow')
    var key = 0
    async function tryWrite() { await writeBlock(db, 'b' + key); key += 1; result.written += MiB }
    while (result.written < OVERFLOW_CAP_BYTES) {
      try { await tryWrite() } catch (error) {
        result.firstError = errInfo(error)
        result.atFirstError = await estimate()
        log('Falhou em ' + mb(result.written) + ': ' + (error && error.name) + ' — cota ' + mb(result.atFirstError.quota) + ', uso ' + mb(result.atFirstError.usage))
        await sleep(2000)
        try { await tryWrite(); result.retryAfter2s = 'ok' } catch (retry) { result.retryAfter2s = errInfo(retry) }
        if (result.retryAfter2s !== 'ok') {
          status('5/7 Esperando 70 s (cache de cota) para tentar de novo')
          await sleep(70000)
          result.after70s = await estimate()
          try { await tryWrite(); result.retryAfter70s = 'ok' } catch (retry) { result.retryAfter70s = errInfo(retry) }
        }
        if (result.retryAfter2s === 'ok' || result.retryAfter70s === 'ok') {
          log('Depois da falha a gravação voltou a funcionar — a TV concedeu mais espaço. Continuando até o teto do teste.')
          result.grantedAfterError = true
          continue
        }
        result.grantedAfterError = false
        break
      }
      if (key % 8 === 0) { var sample = await estimate(); result.samples.push({ written: result.written, usage: sample.usage, quota: sample.quota }); status('5/7 Gravado ' + mb(result.written) + ' — cota ' + mb(sample.quota)) }
    }
    result.end = await estimate()
    result.reachedCap = result.written >= OVERFLOW_CAP_BYTES
    db.close()
    report.steps.overflow = result
    log('Total gravado: ' + mb(result.written) + (result.reachedCap ? ' (teto do teste, sem erro)' : '') + ' | cota final ' + mb(result.end.quota) + ', uso ' + mb(result.end.usage))
  }

  async function stepSameBucket() {
    status('6/7 Outras APIs com o IndexedDB cheio')
    var result = {}
    var blob = new Blob([randomText(MiB)])
    try { var root = await navigator.storage.getDirectory(); var fh = await root.getFileHandle('sonda082.bin', { create: true }); var w = await fh.createWritable(); await w.write(blob); await w.close(); result.opfs = 'ok' } catch (error) { result.opfs = errInfo(error) }
    try { var cache = await caches.open('sonda082'); await cache.put('https://sonda.fixture.test/1', new Response(blob)); result.cacheStorage = 'ok' } catch (error) { result.cacheStorage = errInfo(error) }
    try {
      if (typeof window.openDatabase === 'function') {
        result.webSql = await new Promise(function (resolve) {
          var sqlDb = window.openDatabase('sonda082', '1', 'sonda', 2 * MiB)
          sqlDb.transaction(function (tx) { tx.executeSql('CREATE TABLE IF NOT EXISTS t (v)'); tx.executeSql('INSERT INTO t VALUES (?)', [randomText(MiB)]) },
            function (error) { resolve({ name: 'SQLError', code: error.code, message: String(error.message).slice(0, 200) }) }, function () { resolve('ok') })
        })
      } else result.webSql = 'indisponível'
    } catch (error) { result.webSql = errInfo(error) }
    try { localStorage.setItem('sonda082.big', randomText(MiB)); result.localStorage1MiB = 'ok'; localStorage.removeItem('sonda082.big') } catch (error) { result.localStorage1MiB = errInfo(error) }
    result.after = await estimate()
    report.steps.sameBucket = result
    log('Cheio -> OPFS: ' + JSON.stringify(result.opfs) + ' | Cache: ' + JSON.stringify(result.cacheStorage) + ' | WebSQL: ' + JSON.stringify(result.webSql) + ' | localStorage: ' + JSON.stringify(result.localStorage1MiB))
  }

  async function stepFiles() {
    status('7/7 Pasta privada de arquivos (wgt-private)')
    var result = {}
    if (!fsAvailable()) { result.status = 'tizen.filesystem indisponível'; report.steps.files = result; log('wgt-private: indisponível'); return }
    try {
      await fsEnsureDir('wgt-private/sonda082')
      result.before = await estimate()
      var chunk = new TextEncoder().encode(randomText(4 * MiB))
      var t0 = performance.now(); var written = 0
      while (written < FILES_BYTES) {
        var handle = tizen.filesystem.openFile('wgt-private/sonda082/f' + (written / (4 * MiB)) + '.bin', 'w')
        handle.writeData(chunk); handle.close(); written += chunk.length
      }
      result.writtenBytes = written
      result.writeMBps = +((written / MiB) / ((performance.now() - t0) / 1000)).toFixed(1)
      await sleep(3000)
      result.after = await estimate()
      result.usageDelta = result.after.usage - result.before.usage
      var t1 = performance.now(); var reader = tizen.filesystem.openFile('wgt-private/sonda082/f0.bin', 'r'); reader.readData(); reader.close()
      result.read4MiBMs = Math.round(performance.now() - t1)
    } catch (error) { result.error = errInfo(error) }
    report.steps.files = result
    log('wgt-private: gravou ' + mb(result.writtenBytes) + ' a ' + result.writeMBps + ' MB/s; uso do navegador mudou ' + mb(result.usageDelta) + (result.error ? ' | erro ' + JSON.stringify(result.error) : ''))
  }

  // ======================= FASE 2 (ao abrir de novo) =======================
  async function phaseTwo() {
    report.phase = 2
    status('Fase 2: a concessão persiste depois de relançar?')
    var result = { atLaunch: await estimate() }
    try { var db = await openDb('sonda082-overflow'); try { await writeBlock(db, 'depois-de-relancar'); result.writeAfterRelaunch = 'ok' } catch (error) { result.writeAfterRelaunch = errInfo(error) } db.close() } catch (error) { result.openError = errInfo(error) }
    result.afterWrite = await estimate()
    log('Ao relançar: cota ' + mb(result.atLaunch.quota) + ', uso ' + mb(result.atLaunch.usage) + ' | gravar 1 MiB: ' + JSON.stringify(result.writeAfterRelaunch))
    status('Fase 2: limpando tudo o que a sonda gravou')
    await deleteDb('sonda082-overflow')
    try { var root = await navigator.storage.getDirectory(); await root.removeEntry('sonda082.bin') } catch (error) { /* não existia */ }
    try { await caches.delete('sonda082') } catch (error) { /* sem cache */ }
    try { if (fsAvailable()) await fsRemoveDir('wgt-private/sonda082') } catch (error) { result.fsCleanupError = errInfo(error) }
    result.afterCleanup = await estimate()
    status('Fase 2: esperando 70 s para ver se o uso cai (compactação)')
    await sleep(70000)
    result.afterCleanup70s = await estimate()
    report.steps.phase2 = result
    log('Depois de limpar: uso ' + mb(result.afterCleanup.usage) + ' -> 70 s depois ' + mb(result.afterCleanup70s.usage))
    try { localStorage.setItem(STATE_KEY, '2-done') } catch (error) { /* sem estado */ }
    await send('fase-2')
    status('Concluído. Pode avisar no PC — o app de teste pode ser desinstalado.')
  }

  async function phaseOne() {
    report.phase = 1
    var steps = [stepInfo, stepLevers, stepCompression, stepReadSpeed, stepOverflow, stepSameBucket, stepFiles]
    for (var i = 0; i < steps.length; i += 1) {
      try { await steps[i]() } catch (error) { report.steps['falha' + i] = errInfo(error); log('Etapa ' + (i + 1) + ' falhou: ' + (error && error.name)) }
      await send('fase-1-etapa-' + (i + 1))
    }
    try { localStorage.setItem(STATE_KEY, '1-done') } catch (error) { report.stateError = errInfo(error) }
    await send('fase-1')
    status('Fase 1 concluída. Feche o app (tecla Voltar/EXIT) e abra de novo para a fase 2.')
  }

  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 10009) { try { tizen.application.getCurrentApplication().exit() } catch (error) { /* fora da TV */ } }
  })

  var phase = null
  try { phase = localStorage.getItem(STATE_KEY) } catch (error) { phase = null }
  if (phase === '1-done') phaseTwo()
  else if (phase === '2-done') status('Teste já concluído. Pode desinstalar este app de teste.')
  else phaseOne()
})()
