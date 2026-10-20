/* Sonda de memória dos leitores reais (assessment orcamento-memoria-app-tv, 2026-10-19). Usa window.APPREAL (appReal.js,
   gerado por ../memoria/empacotar.mjs a partir do código do app) e só devolve números.
   Critério (decision.md): o cenário passa se, com a estrutura viva, a sonda ainda aloca 2,2 milhões de objetos sintéticos
   (metade dos 4,4 milhões em que a TV fechou a sonda 2) sem cair. Se a TV fechar o app, ao abrir de novo o teste registra
   a queda e segue no próximo cenário. */
(function () {
  'use strict'
  var P = window.P, T = window.T, MiB = P.MiB
  var KEY = 'sonda.memoria084'
  var BATCH = 200000
  var HEADROOM_BATCHES = 11 // 2,2 milhões
  var MIN_SYSTEM_FREE = 80 * MiB
  var DATASETS = {
    real: { db: 'sonda-mem-real', counts: { channel: 2355, movie: 43510, series: 9768 }, per: { channel: 200, movie: 1243, series: 500 } },
    cem: { db: 'sonda-mem-100k', counts: { channel: 4300, movie: 78700, series: 17000 }, per: { channel: 200, movie: 1243, series: 500 } }
  }
  var SCENARIOS = [['real', 'buscaGlobal'], ['real', 'todosNome'], ['real', 'todosFonte'], ['cem', 'buscaGlobal'], ['cem', 'todosNome'], ['cem', 'todosFonte']]

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) } catch (e) { return null } }
  function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) { /* sem estado */ } }
  function systemFree() { try { return tizen.systeminfo.getAvailableMemory() } catch (e) { return null } }
  function mb(bytes) { return bytes === null || bytes === undefined ? null : Math.round(bytes / MiB) }

  async function samples() {
    var out = {}
    var names = ['channel', 'movie', 'series']
    for (var i = 0; i < names.length; i += 1) { var s = await P.sample(names[i]); out[names[i]] = Array.isArray(s) ? s : s.items }
    return out
  }

  function build(name, database, kind) {
    var A = window.APPREAL
    if (name === 'buscaGlobal') return A.globalSearch(database)
    if (name === 'todosNome') return A.allByName(database, kind)
    return A.allSourceToEnd(database, kind)
  }

  async function scenario(state, index, database) {
    var ds = SCENARIOS[index][0], name = SCENARIOS[index][1]
    var out = { dataset: ds, cenario: name }
    await P.sleep(3000)
    out.livreAntesMB = mb(systemFree())
    // Só no ensaio do PC: heap exato pelo DevTools (window.__heap é injetado pelo Playwright; na TV não existe).
    var heapBefore = window.__heap ? await window.__heap() : null
    var t0 = P.now()
    var struct = await build(name, database, 'movie')
    out.montarMs = P.ms(t0)
    await P.sleep(1500)
    if (heapBefore !== null) out.heapPcMB = Math.round((await window.__heap() - heapBefore) / MiB * 10) / 10
    out.livreDepoisMB = mb(systemFree())
    out.custoSistemaMB = out.livreAntesMB !== null && out.livreDepoisMB !== null ? out.livreAntesMB - out.livreDepoisMB : null
    var t1 = P.now()
    var counted = window.APPREAL.countObjects(struct)
    out.objetos = counted.objects; out.strings = counted.strings; out.contarMs = P.ms(t1)
    P.log(ds + '/' + name + ': ' + out.montarMs + ' ms, ' + out.objetos + ' obj + ' + out.strings + ' str, sistema -' + out.custoSistemaMB + ' MB')
    // Folga: com a estrutura viva, aloca lotes sintéticos (mesmo formato da sonda 2) até 2,2 milhões.
    state.pending = { index: index, phase: 'folga', step: 0, partial: out }
    save(state)
    out.folga = []
    var keep = []
    var heapFolga = window.__heap ? await window.__heap() : null
    for (var step = 1; step <= HEADROOM_BATCHES; step += 1) {
      var batch = []
      for (var i = 0; i < BATCH; i += 1) batch.push({ id: i, name: 'item ' + i + ' ' + step, year: 2000 + (i % 25), extra: null })
      keep.push(batch)
      var free = systemFree()
      out.folga.push({ objetos: step * BATCH, livreMB: mb(free) })
      state.pending.step = step; save(state)
      P.status('Memória ' + ds + '/' + name + ': folga ' + (step * BATCH).toLocaleString() + ' objetos, livre ' + mb(free) + ' MB')
      if (free !== null && free < MIN_SYSTEM_FREE) { out.parouSistemaBaixo = true; break }
      await P.sleep(50)
    }
    out.folgaObjetos = keep.length * BATCH
    if (heapFolga !== null) out.heapPcFolgaMB = Math.round((await window.__heap() - heapFolga) / MiB * 10) / 10
    out.passou = !out.parouSistemaBaixo && keep.length === HEADROOM_BATCHES
    keep = null; struct = null
    P.log('  folga: ' + out.folgaObjetos + ' objetos' + (out.passou ? ' — passou' : ' — parou (sistema baixo)'))
    return out
  }

  async function memoriaLeitores() {
    if (!window.APPREAL) throw new Error('appReal.js ausente')
    var state = load() || { next: 0, results: [] }
    var report = { cenarios: state.results }
    P.report.results.memoriaLeitores = report
    if (state.pending) {
      // A TV fechou o app no meio do cenário pendente.
      var crashed = state.pending.partial || { dataset: SCENARIOS[state.pending.index][0], cenario: SCENARIOS[state.pending.index][1] }
      crashed.caiu = true; crashed.caiuNaFase = state.pending.phase; crashed.caiuNoLote = state.pending.step
      crashed.folgaObjetos = Math.max(0, (state.pending.step - 1) * BATCH)
      state.results.push(crashed)
      state.next = state.pending.index + 1
      state.pending = null
      save(state)
      P.log('A TV fechou o app em ' + crashed.dataset + '/' + crashed.cenario + ' (lote ' + crashed.caiuNoLote + '). Seguindo.')
      await P.send('memoriaLeitores-queda')
    }
    if (state.next >= SCENARIOS.length) return report
    var data = await samples()
    var current = null, database = null
    for (var index = state.next; index < SCENARIOS.length; index += 1) {
      var ds = SCENARIOS[index][0]
      if (current !== ds) {
        if (database) await window.APPREAL.dropDatabase(database)
        database = null
        state.pending = { index: index, phase: 'semear', step: 0 }; save(state)
        await P.deleteDb(DATASETS[ds].db)
        var t0 = P.now()
        database = await window.APPREAL.seed(DATASETS[ds].db, data, DATASETS[ds].counts, DATASETS[ds].per, function (text) { P.status('Semeando ' + ds + ': ' + text) })
        report['semear_' + ds + 'Ms'] = P.ms(t0)
        current = ds
      }
      var result = await scenario(state, index, database)
      state.results.push(result)
      state.next = index + 1
      state.pending = null
      save(state)
      await P.send('memoriaLeitores-' + index)
    }
    if (database) await window.APPREAL.dropDatabase(database)
    return report
  }

  // Ordenação por nome: Collator do app (pt-BR, base) e o padrão da busca, contra chave pré-calculada (normalizeForSearch).
  async function ordenacaoChave() {
    var A = window.APPREAL
    var movies = await P.sample('movie')
    movies = Array.isArray(movies) ? movies : movies.items
    var base = movies.map(function (item) { return item.name })
    var big = []
    for (var i = 0; i < 100000; i += 1) { var copy = Math.floor(i / base.length); big.push(copy ? base[i % base.length] + ' ' + copy : base[i % base.length]) }
    var defaultCollator = new Intl.Collator()
    function measure(names) {
      var runs = { collatorPtBase: [], collatorPadrao: [], chaveMontar: [], chaveOrdenar: [] }
      var keyed = null
      for (var r = 0; r < 3; r += 1) {
        var t = P.now(); names.slice().sort(A.collatorPtBase.compare); runs.collatorPtBase.push(P.ms(t))
        t = P.now(); names.slice().sort(defaultCollator.compare); runs.collatorPadrao.push(P.ms(t))
        t = P.now(); var keys = names.map(function (name, index) { return { k: A.normalizeForSearch(name), i: index } }); runs.chaveMontar.push(P.ms(t))
        t = P.now(); keys.sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i }); runs.chaveOrdenar.push(P.ms(t))
        keyed = keys
      }
      // Pares vizinhos que o Collator do app poria na ordem inversa (diferença real de ordem, não empate).
      var inversions = 0
      for (var j = 1; j < keyed.length; j += 1) if (A.collatorPtBase.compare(names[keyed[j - 1].i], names[keyed[j].i]) > 0) inversions += 1
      return { nomes: names.length, collatorPtBaseMs: P.median(runs.collatorPtBase), collatorPadraoMs: P.median(runs.collatorPadrao),
        chaveMontarMs: P.median(runs.chaveMontar), chaveOrdenarMs: P.median(runs.chaveOrdenar), paresInvertidosVsApp: inversions }
    }
    var out = { onze: measure(base), cem: measure(big) }
    P.log('Ordenação 11k: app ' + out.onze.collatorPtBaseMs + ' ms | chave ' + out.onze.chaveMontarMs + '+' + out.onze.chaveOrdenarMs + ' ms | invertidos ' + out.onze.paresInvertidosVsApp)
    P.log('Ordenação 100k: app ' + out.cem.collatorPtBaseMs + ' ms | chave ' + out.cem.chaveMontarMs + '+' + out.cem.chaveOrdenarMs + ' ms | invertidos ' + out.cem.paresInvertidosVsApp)
    return out
  }

  // Quadros enquanto o índice real é montado (assessment ajustes-cpu-tv): uma montagem, e remontagem contínua a cada
  // ~1 s (a pré-carga invalida o índice por lote com a tela aberta). Critério: go se algum quadro > 100 ms ou > 5
  // quadros > 50 ms numa montagem, ou travamento contínuo na remontagem.
  async function quadrosIndice() {
    var A = window.APPREAL
    var data = await samples()
    var ds = DATASETS.real
    await P.deleteDb('sonda-quadros')
    var database = await A.seed('sonda-quadros', data, ds.counts, ds.per, function (text) { P.status('Semeando: ' + text) })
    var out = { rodadas: [] }
    for (var round = 1; round <= 2; round += 1) {
      var r = { rodada: round }
      await P.sleep(1500)
      r.parado = await P.frames(3000)
      var builds = {}
      function once(name, fn) {
        return function () { var t = P.now(); return fn().then(function () { builds[name] = P.ms(t) }) }
      }
      r.buscaGlobal = await P.frames(4000, once('buscaGlobal', function () { return A.globalSearch(database) }))
      r.buscaGlobal.montarMs = builds.buscaGlobal
      await P.sleep(1000)
      r.todosNome = await P.frames(4500, once('todosNome', function () { return A.allByName(database, 'movie') }))
      r.todosNome.montarMs = builds.todosNome
      await P.sleep(1000)
      // Feature 084: as quatro ordenações de "Todos" (caminho em fatias) e a 1ª tecla da busca global (termo de 2 letras).
      r.ordenacoes = {}
      var options = ['az', 'year', 'added', 'rating']
      for (var o = 0; o < options.length; o += 1) {
        var opt = options[o]
        r.ordenacoes[opt] = await P.frames(4500, once('ord_' + opt, (function (name) { return function () { return A.allByName(database, 'movie', name) } })(opt)))
        r.ordenacoes[opt].montarMs = builds['ord_' + opt]
        await P.sleep(800)
      }
      var globalIndex = await A.globalSearch(database)
      await P.sleep(800)
      r.primeiraTecla = await P.frames(1500, function () { var t = P.now(); var hits = A.searchGlobal(globalIndex, 'ma'); builds.tecla = P.ms(t); builds.acertos = hits.movies.length })
      r.primeiraTecla.tecla2Ms = builds.tecla
      r.primeiraTecla.acertosFilmes = builds.acertos
      await P.sleep(800)
      // Remontagem limitada (FR-006): uma nova montagem a cada 10 s, por 12 s (o app só remonta o índice nessa cadência).
      var count = 0, stop = false
      r.remontagem = await P.frames(12000, function () {
        var start = P.now()
        function next() {
          if (stop || P.now() - start > 11500) return
          var t = P.now(); count += 1
          A.globalSearch(database).then(function () { var wait = Math.max(0, 10000 - (P.now() - t)); setTimeout(next, wait) })
        }
        next()
      })
      stop = true
      r.remontagem.montagens = count
      P.log('Quadros r' + round + ': parado ' + r.parado.fps + ' fps | busca pior ' + r.buscaGlobal.maxGapMs + ' ms >50:' + r.buscaGlobal.longFrames +
        ' | todos pior ' + r.todosNome.maxGapMs + ' >50:' + r.todosNome.longFrames + ' | ord ano/add/nota pior ' + r.ordenacoes.year.maxGapMs + '/' + r.ordenacoes.added.maxGapMs + '/' + r.ordenacoes.rating.maxGapMs + ' | 1a tecla ' + r.primeiraTecla.tecla2Ms + ' ms | remontar pior ' + r.remontagem.maxGapMs + ' >50:' + r.remontagem.longFrames + ' fps ' + r.remontagem.fps)
      out.rodadas.push(r)
      await P.sleep(2500)
    }
    await A.dropDatabase(database)
    return out
  }

  // Carga da seção de filmes no Worker com o código real (assessment leitura-rede-fluxo-tv): divide o tempo em download,
  // leitura em fluxo, interpretação e gravação, e compara pedaços juntados (256 KB) e leitura inteira.
  async function cargaSecao() {
    var url = P.base + '/amostra/vodraw.json'
    var worker = new Worker('cargaWorker.js')
    function call(name) {
      return new Promise(function (resolve) {
        worker.onmessage = function (event) { resolve(event.data.ok ? event.data.result : { error: event.data.error }) }
        worker.postMessage({ op: 'variante', name: name, url: url })
      })
    }
    var names = ['download', 'fluxoPuro', 'fluxoInterpretar', 'juntadoInterpretar', 'inteiroInterpretar', 'secaoAtual', 'secaoJuntada']
    var out = { rodadas: [] }
    for (var round = 1; round <= 2; round += 1) {
      var r = { rodada: round }
      for (var i = 0; i < names.length; i += 1) {
        P.status('Carga da seção r' + round + ': ' + names[i])
        r[names[i]] = await call(names[i])
        await P.sleep(500)
      }
      P.log('Carga r' + round + ': download ' + r.download.ms + ' | fluxo ' + r.fluxoPuro.ms + ' (' + r.fluxoPuro.chunks + ' ped.) | interpretar ' + r.fluxoInterpretar.ms +
        ' / juntado ' + r.juntadoInterpretar.ms + ' / inteiro ' + r.inteiroInterpretar.ms + ' | seção ' + r.secaoAtual.ms + ' / juntada ' + r.secaoJuntada.ms)
      out.rodadas.push(r)
    }
    worker.terminate()
    return out
  }

  // Divisão do tempo da carga real por seção (assessment gravacao-carga-secao-tv): carga real + mesma sequência por etapas.
  async function etapasSecao() {
    var url = P.base + '/amostra/vodraw.json'
    var worker = new Worker('cargaWorker.js')
    function call(name) {
      return new Promise(function (resolve) {
        worker.onmessage = function (event) { resolve(event.data.ok ? event.data.result : { error: event.data.error }) }
        worker.postMessage({ op: 'variante', name: name, url: url })
      })
    }
    var out = { rodadas: [] }
    for (var round = 1; round <= 2; round += 1) {
      P.status('Etapas da seção r' + round)
      var r = { rodada: round, secaoAtual: await call('secaoAtual') }
      await P.sleep(500)
      r.etapas = await call('secaoEtapas')
      var e = r.etapas
      P.log('Etapas r' + round + ': real ' + r.secaoAtual.ms + ' | etapas ' + e.ms + ' = ler ' + e.lerInterpretar + ' + desc ' + e.descarregarPreparo + ' + lerPrep ' + e.lerPreparo +
        ' + comprimir ' + e.prepararComprimir + ' + orç ' + e.orcamento + ' + trans ' + e.transacao + ' + limpar ' + e.limparPreparo)
      out.rodadas.push(r)
      await P.sleep(500)
    }
    worker.terminate()
    return out
  }

  T.etapasSecao = etapasSecao
  T.memoriaLeitores = memoriaLeitores
  T.ordenacaoChave = ordenacaoChave
  T.quadrosIndice = quadrosIndice
  T.cargaSecao = cargaSecao

  // Diagnóstico (feature 084): os quadros longos da 2ª rodada são pausa de GC (heap cai no quadro) ou trabalho nosso?
  // Roda a montagem da busca global 4 vezes seguidas e, a cada quadro > 50 ms, registra a variação do heap JS.
  async function diagnosticoGc() {
    var A = window.APPREAL
    var data = await samples()
    var ds = DATASETS.real
    await P.deleteDb('sonda-gc')
    var database = await A.seed('sonda-gc', data, ds.counts, ds.per, function (text) { P.status('Semeando: ' + text) })
    var out = { rodadas: [], memoria: !!(performance && performance.memory) }
    for (var round = 1; round <= 4; round += 1) {
      await P.sleep(1500)
      var longs = [], last = P.now(), lastHeap = performance.memory ? performance.memory.usedJSHeapSize : 0, run = true, frames = 0
      function tick() {
        var now = P.now(), heap = performance.memory ? performance.memory.usedJSHeapSize : 0
        if (now - last > 50) longs.push({ gap: Math.round(now - last), heapDeltaMB: Math.round((heap - lastHeap) / 1048576 * 10) / 10 })
        last = now; lastHeap = heap; frames += 1
        if (run) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      var t = P.now()
      var held = await A.globalSearch(database)
      var montarMs = P.ms(t)
      await P.sleep(300)
      run = false
      out.rodadas.push({ rodada: round, montarMs: montarMs, quadros: frames, longos: longs, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0 })
      P.log('GC r' + round + ': montar ' + montarMs + ' ms | longos ' + JSON.stringify(longs) + ' | heap ' + out.rodadas[round - 1].heapMB + ' MB')
      held = null
    }
    await A.dropDatabase(database)
    return out
  }

  T.diagnosticoGc = diagnosticoGc
})()
