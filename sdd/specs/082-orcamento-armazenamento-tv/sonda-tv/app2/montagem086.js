/* Sonda da feature 086 — por que a abertura de tela espera, e o que de fato a livra da espera.

   A medição do app real (validacao-tv-2026-10-20.md) mostrou a 1ª abertura da Home em 2 058 ms com `addedMoviesMs`
   1 986 ms: a leitura é pequena (dezenas de linhas de candidatos) e mesmo assim esperou ~2 s, porque concorre com a
   atualização da lista. Na carga, o custo está em `readMs` (6 046 ms) e `encodeMs` (1 262 ms), com `commitMs` ≈ 0 —
   isto é, ler o preparo e comprimir, não gravar.

   Isso abre duas causas com correções DIFERENTES, e nenhuma delas o PC distingue:
     (a) fila do IndexedDB — a leitura da tela espera atrás das transações da carga. Correção: outro banco, ou outro
         meio (localStorage), ou transações curtas.
     (b) thread principal ocupada — a compressão/desserialização bloqueia o JS. Correção: Worker. Banco separado
         NÃO resolve.
   Daí a matriz: cada condição de leitura é medida sob cargas que isolam (a) de (b).

   Só números saem daqui. As amostras, quando existem, são as sanitizadas servidas pelo coletor.
   Nada aqui altera classes, CSS ou funções usadas pelos testes anteriores (comparabilidade com a 082/083/084). */
(function () {
  'use strict'
  var P = window.P, T = window.T

  // Grade da carga, calibrada pela seção de filmes da TV: 43 549 itens em 34 categorias ≈ 1 281 por categoria.
  // `PROBE_086_ESCALA` < 1 encurta a grade — serve só ao ensaio no PC (que não aprova nada); na TV fica em 1.
  var ESCALA = typeof window.PROBE_086_ESCALA === 'number' && window.PROBE_086_ESCALA > 0 ? window.PROBE_086_ESCALA : 1
  var CATEGORIAS = Math.max(2, Math.round(34 * ESCALA))
  var ITENS_POR_CATEGORIA = Math.max(64, Math.round(1281 * ESCALA))
  var CHUNK = 320            // itens por pedaço comprimido, como o app grava
  var DB_A = 'sonda-086-catalogo'   // o banco "do catálogo": é nele que a carga trabalha
  var DB_B = 'sonda-086-tela'       // o banco "da tela": só o documento da montagem
  var LS_KEY = 'sonda086.doc'
  var DOC_ITENS = 100       // fileiras da tela: ~7 × 12 itens projetados
  var LEITURA_INTERVALO_MS = 40

  // ---- dados --------------------------------------------------------------------------------------------------
  // Item com a forma do que o app guarda (nomes de campo do nosso projeto; valores sintéticos ou de amostra).
  function itemSintetico(i) {
    return { id: 100000 + i, name: 'T' + i + ' ' + P.randomText(18), kind: 'movie', categoryId: 1, categoryPosition: i,
      year: 1990 + (i % 36), providerRating: Math.round((5 + (i % 50) / 10) * 10) / 10, addedAt: 1700000000000 + i * 1000,
      icon_url: 'x/' + P.randomText(40), streamId: 900000 + i, containerExtension: 'mp4', groupOrder: 1 }
  }
  function fabricar(amostra, quantos) {
    var out = []
    for (var i = 0; i < quantos; i += 1) {
      if (amostra && amostra.length) {
        var copia = P.lean(amostra[i % amostra.length])
        copia.categoryPosition = i
        out.push(copia)
      } else out.push(itemSintetico(i))
    }
    return out
  }
  async function amostraMovie() {
    try { var s = await P.sample('movie'); return Array.isArray(s) ? s : (s && s.items) || null } catch (e) { return null }
  }

  // ---- medidor de quadros que acompanha trabalho de duração variável ------------------------------------------
  function medirQuadros() {
    var gaps = [], last = performance.now(), vivo = true
    function tick(t) { gaps.push(t - last); last = t; if (vivo) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    return function parar() {
      vivo = false
      var total = gaps.reduce(function (a, b) { return a + b }, 0)
      return { frames: gaps.length, fps: total > 0 ? Math.round(gaps.length / (total / 1000)) : null,
        maxGapMs: Math.round(Math.max.apply(null, gaps.concat([0]))), longFrames: gaps.filter(function (g) { return g > 50 }).length }
    }
  }

  // ---- leitura do documento da tela, nas três formas ----------------------------------------------------------
  // Mede do pedido até o dado em mãos (não até o commit): é a latência que a tela sente.
  function lerIdb(db, store, key) {
    return new Promise(function (resolve, reject) {
      var t0 = performance.now()
      var r = db.transaction(store, 'readonly').objectStore(store).get(key)
      r.onsuccess = function () { resolve({ ms: performance.now() - t0, ok: r.result !== undefined }) }
      r.onerror = function () { reject(r.error) }
    })
  }
  // Uma transação com N `get` — a forma "uma leitura por fileira" que a tela usa hoje.
  function lerIdbVarias(db, store, keys) {
    return new Promise(function (resolve, reject) {
      var t0 = performance.now(), t = db.transaction(store, 'readonly'), s = t.objectStore(store)
      var faltam = keys.length, ok = 0
      keys.forEach(function (k) {
        var r = s.get(k)
        r.onsuccess = function () {
          if (r.result !== undefined) ok += 1
          faltam -= 1
          if (faltam === 0) resolve({ ms: performance.now() - t0, ok: ok === keys.length })
        }
        r.onerror = function () { reject(r.error) }
      })
    })
  }
  function lerLocalStorage() {
    var t0 = performance.now()
    var texto = null
    try { texto = localStorage.getItem(LS_KEY) } catch (e) { return { ms: performance.now() - t0, ok: false, erro: 'acesso' } }
    if (texto === null) return { ms: performance.now() - t0, ok: false }
    var doc = JSON.parse(texto)
    return { ms: performance.now() - t0, ok: !!(doc && doc.rows) }
  }

  function resumo(latencias) {
    if (!latencias.length) return null
    var s = latencias.slice().sort(function (a, b) { return a - b })
    var arred = function (v) { return Math.round(v * 10) / 10 }
    return { n: s.length, medianaMs: arred(s[Math.floor(s.length / 2)]), p95Ms: arred(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]),
      maxMs: arred(s[s.length - 1]), minMs: arred(s[0]) }
  }

  // ---- as cargas ----------------------------------------------------------------------------------------------
  // 'real'   = o que o sectionLoader faz hoje: ler o preparo do MESMO banco, comprimir, gravar os pedaços.
  // 'soIdb'  = ler e gravar, sem comprimir (isola a fila do IndexedDB).
  // 'soCpu'  = comprimir o que já está em memória, sem tocar o banco (isola a thread principal).
  // 'fatiada'= igual à 'real', cedendo a vez entre pedaços e entre categorias (transações curtas).
  async function carga(dbA, modo, emMemoria) {
    var t0 = performance.now()
    var categoriasFeitas = 0, bytesGravados = 0
    for (var c = 0; c < CATEGORIAS; c += 1) {
      var itens
      if (modo === 'soCpu') itens = emMemoria
      else itens = await lerStaging(dbA, c)
      if (!itens) itens = emMemoria
      var pedacos = P.chunked(itens, CHUNK)
      for (var p = 0; p < pedacos.length; p += 1) {
        var texto = JSON.stringify(pedacos[p])
        var bytes
        if (modo === 'soIdb') bytes = new TextEncoder().encode(texto)
        else bytes = await P.gzipText(texto, 'deflate-raw')
        bytesGravados += bytes.byteLength
        if (modo !== 'soCpu') {
          await gravarPedaco(dbA, c, p, bytes)
          if (modo === 'fatiada') await P.sleep(0)
        }
      }
      if (modo === 'fatiada') await P.sleep(0)
      categoriasFeitas += 1
    }
    return { modo: modo, tookMs: Math.round(performance.now() - t0), categorias: categoriasFeitas, bytesGravados: bytesGravados }
  }
  function lerStaging(dbA, c) {
    return P.tx(dbA, 'staging', 'readonly', function (store) { return store.get('cat-' + c) })
  }
  function gravarPedaco(dbA, c, p, bytes) {
    return P.tx(dbA, 'blocks', 'readwrite', function (store) { store.put({ bytes: bytes }, 'cat-' + c + '-' + p) })
  }

  /** Roda uma carga e, em paralelo, lê o documento da tela a cada ~40 ms. Devolve a distribuição das latências. */
  async function sob(dbA, modo, emMemoria, ler) {
    var latencias = [], falhas = 0, rodando = true
    var quadros = medirQuadros()
    var leitor = (async function () {
      while (rodando) {
        try {
          var r = await ler()
          if (r.ok) latencias.push(r.ms); else falhas += 1
        } catch (e) { falhas += 1 }
        await P.sleep(LEITURA_INTERVALO_MS)
      }
    })()
    var info = await carga(dbA, modo, emMemoria)
    rodando = false
    await leitor
    info.leitura = resumo(latencias)
    info.leiturasFalhas = falhas
    info.quadros = quadros()
    return info
  }

  // ---- teste 1: de onde vem a espera da abertura --------------------------------------------------------------
  async function montagemContencao() {
    var out = { grade: { categorias: CATEGORIAS, itensPorCategoria: ITENS_POR_CATEGORIA, chunk: CHUNK, docItens: DOC_ITENS } }
    P.report.results.montagemContencao = out
    await P.deleteDb(DB_A); await P.deleteDb(DB_B)
    var dbA = await P.openDb(DB_A, ['staging', 'blocks', 'doc'])
    var dbB = await P.openDb(DB_B, ['doc'])

    var amostra = await amostraMovie()
    out.amostraReal = !!amostra
    var itens = fabricar(amostra, ITENS_POR_CATEGORIA)

    // Preparo: o staging da carga (no banco do catálogo) e o documento da tela (nos três meios).
    P.status('086 contenção: preparando o staging')
    for (var c = 0; c < CATEGORIAS; c += 1) await gravarStaging(dbA, c, itens)
    var doc = { generation: 1, rows: P.chunked(itens.slice(0, DOC_ITENS), 12) }
    var docTexto = JSON.stringify(doc)
    out.docBytes = new Blob([docTexto]).size
    await P.tx(dbA, 'doc', 'readwrite', function (store) { store.put(doc, 'home') })
    await P.tx(dbB, 'doc', 'readwrite', function (store) { store.put(doc, 'home') })
    // As 6 leituras de hoje: uma linha por fileira, no banco do catálogo.
    var chaves = []
    for (var f = 0; f < 6; f += 1) {
      chaves.push('row-' + f)
      await gravarLinha(dbA, 'row-' + f, doc.rows[f % doc.rows.length])
    }
    try { localStorage.setItem(LS_KEY, docTexto) } catch (e) { out.localStorageErro = 'escrita' }

    var mesmoBanco = function () { return lerIdb(dbA, 'doc', 'home') }
    var outroBanco = function () { return lerIdb(dbB, 'doc', 'home') }
    var seisLinhas = function () { return lerIdbVarias(dbA, 'doc', chaves) }
    var localS = function () { return Promise.resolve(lerLocalStorage()) }

    // Repouso: o piso de cada meio, sem carga nenhuma.
    out.repouso = {}
    var meios = [['mesmoBanco', mesmoBanco], ['outroBanco', outroBanco], ['seisLinhas', seisLinhas], ['localStorage', localS]]
    for (var m = 0; m < meios.length; m += 1) {
      var lat = []
      for (var r = 0; r < 20; r += 1) {
        var res = await meios[m][1]()
        if (res.ok) lat.push(res.ms)
      }
      out.repouso[meios[m][0]] = resumo(lat)
      P.log('repouso ' + meios[m][0] + ': ' + (out.repouso[meios[m][0]] || {}).medianaMs + ' ms')
    }

    // Sob carga. Cada condição roda a carga inteira do zero, para que todas vejam o mesmo trabalho.
    var condicoes = [
      ['realMesmoBanco', 'real', mesmoBanco], ['realOutroBanco', 'real', outroBanco],
      ['realLocalStorage', 'real', localS], ['realSeisLinhas', 'real', seisLinhas],
      ['soIdbMesmoBanco', 'soIdb', mesmoBanco], ['soIdbOutroBanco', 'soIdb', outroBanco],
      ['soCpuMesmoBanco', 'soCpu', mesmoBanco], ['soCpuOutroBanco', 'soCpu', outroBanco],
      ['fatiadaMesmoBanco', 'fatiada', mesmoBanco]
    ]
    out.carga = {}
    for (var i = 0; i < condicoes.length; i += 1) {
      var nome = condicoes[i][0]
      P.status('086 contenção: ' + (i + 1) + '/' + condicoes.length + ' ' + nome)
      await limparBlocos(dbA)
      var info = await sob(dbA, condicoes[i][1], itens, condicoes[i][2])
      out.carga[nome] = info
      P.log(nome + ': mediana ' + (info.leitura || {}).medianaMs + ' / p95 ' + (info.leitura || {}).p95Ms +
        ' / max ' + (info.leitura || {}).maxMs + ' ms | carga ' + info.tookMs + ' ms | ' + info.quadros.fps + ' fps')
      await P.send('montagemContencao-' + nome)
    }
    dbA.close(); dbB.close()
    await P.deleteDb(DB_A); await P.deleteDb(DB_B)
    try { localStorage.removeItem(LS_KEY) } catch (e) { /* nada */ }
    return out
  }
  function gravarStaging(dbA, c, itens) {
    return P.tx(dbA, 'staging', 'readwrite', function (store) { store.put(itens, 'cat-' + c) })
  }
  function gravarLinha(dbA, chave, linha) {
    return P.tx(dbA, 'doc', 'readwrite', function (store) { store.put(linha, chave) })
  }
  function limparBlocos(dbA) {
    return P.tx(dbA, 'blocks', 'readwrite', function (store) { store.clear() })
  }

  // ---- teste 2: o documento da tela — custo de gravar, ler e reconstituir -------------------------------------
  // Pergunta: vale comprimir o documento? E quanto custa reconstituí-lo na TV?
  async function montagemDocumento() {
    var out = {}
    P.report.results.montagemDocumento = out
    await P.deleteDb(DB_B)
    var db = await P.openDb(DB_B, ['doc'])
    var amostra = await amostraMovie()
    out.amostraReal = !!amostra
    var itens = fabricar(amostra, DOC_ITENS)
    var doc = { generation: 1, rows: P.chunked(itens, 12) }
    var texto = JSON.stringify(doc)
    out.bytesCru = new Blob([texto]).size

    var t0 = P.now()
    var comprimido = await P.gzipText(texto, 'deflate-raw')
    out.comprimirMs = P.ms(t0)
    out.bytesComprimido = comprimido.byteLength

    // Cru: objeto estruturado direto no store (o navegador clona; sem JSON.parse do nosso lado).
    var escritasCru = [], leiturasCru = []
    for (var i = 0; i < 10; i += 1) {
      var a = P.now(); await gravarDoc(db, 'cru', doc); escritasCru.push(P.ms(a))
      var b = P.now(); var lido = await lerDoc(db, 'cru'); leiturasCru.push(P.ms(b))
      out.cruOk = !!(lido && lido.rows && lido.rows.length)
    }
    out.cru = { gravarMs: P.median(escritasCru), lerMs: P.median(leiturasCru) }

    // Comprimido: bytes no store, descomprimir e JSON.parse na leitura.
    var escritasGz = [], leiturasGz = []
    for (var j = 0; j < 10; j += 1) {
      var c = P.now(); await gravarDoc(db, 'gz', { bytes: comprimido }); escritasGz.push(P.ms(c))
      var d = P.now()
      var reg = await lerDoc(db, 'gz')
      var doc2 = JSON.parse(await P.gunzipText(reg.bytes, 'deflate-raw'))
      leiturasGz.push(P.ms(d))
      out.gzOk = !!(doc2 && doc2.rows && doc2.rows.length)
    }
    out.comprimido = { gravarMs: P.median(escritasGz), lerMs: P.median(leiturasGz) }

    // Texto cru no store: o meio do caminho — sem gzip, com parse.
    var leiturasTexto = []
    for (var k = 0; k < 10; k += 1) {
      await gravarDoc(db, 'txt', texto)
      var e = P.now()
      JSON.parse(await lerDoc(db, 'txt'))
      leiturasTexto.push(P.ms(e))
    }
    out.texto = { lerMs: P.median(leiturasTexto) }

    P.log('doc: cru ' + out.bytesCru + 'B ler ' + out.cru.lerMs + ' ms | gz ' + out.bytesComprimido + 'B ler ' +
      out.comprimido.lerMs + ' ms | texto ler ' + out.texto.lerMs + ' ms')
    db.close(); await P.deleteDb(DB_B)
    return out
  }
  function gravarDoc(db, chave, valor) {
    return P.tx(db, 'doc', 'readwrite', function (store) { store.put(valor, chave) })
  }
  function lerDoc(db, chave) {
    return P.tx(db, 'doc', 'readonly', function (store) { return store.get(chave) })
  }

  // ---- teste 3: descomprimir um bloco — o custo do preenchimento em segundo plano -----------------------------
  // O preenchimento de candidatos (T029) descomprime um bloco inteiro por rodada. Com 390 categorias, é o catálogo
  // todo. Mede o custo por bloco e o efeito na cadência de quadros.
  async function montagemBackfill() {
    var out = {}
    P.report.results.montagemBackfill = out
    var amostra = await amostraMovie()
    out.amostraReal = !!amostra
    var itens = fabricar(amostra, ITENS_POR_CATEGORIA)
    var pedacos = P.chunked(itens, CHUNK)
    var comprimidos = []
    for (var p = 0; p < pedacos.length; p += 1) comprimidos.push(await P.gzipText(JSON.stringify(pedacos[p]), 'deflate-raw'))
    out.pedacos = comprimidos.length
    out.bytes = comprimidos.reduce(function (a, b) { return a + b.byteLength }, 0)

    var quadros = medirQuadros()
    var porBloco = []
    for (var r = 0; r < 5; r += 1) {
      var t0 = P.now(), itensLidos = 0
      for (var i = 0; i < comprimidos.length; i += 1) {
        itensLidos += JSON.parse(await P.gunzipText(comprimidos[i], 'deflate-raw')).length
      }
      porBloco.push(P.ms(t0))
      out.itensPorBloco = itensLidos
    }
    out.descomprimirBlocoMs = P.median(porBloco)
    out.quadros = quadros()
    // 390 categorias é a grade real desta TV.
    out.projecao390CategoriasMs = Math.round(out.descomprimirBlocoMs * 390)
    P.log('backfill: bloco ' + out.descomprimirBlocoMs + ' ms (' + out.itensPorBloco + ' itens) → 390 cat ≈ ' +
      Math.round(out.projecao390CategoriasMs / 1000) + ' s | ' + out.quadros.fps + ' fps')
    return out
  }

  T.montagemContencao = montagemContencao
  T.montagemDocumento = montagemDocumento
  T.montagemBackfill = montagemBackfill
})()
