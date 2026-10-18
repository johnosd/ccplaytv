/* Sonda 2 — ordem dos testes. Fase 1: ambiente → rede, depois memória JS. Se a TV fechar o app no teste de memória,
   ao abrir de novo a fase 2 roda o teste de buffers. Tudo o que é gravado é apagado no próprio teste. */
(function () {
  'use strict'
  var P = window.P, T = window.T
  var KEY = 'sonda2.phase'
  function phase() { try { return localStorage.getItem(KEY) } catch (e) { return null } }
  function setPhase(value) { try { localStorage.setItem(KEY, value) } catch (e) { /* sem estado */ } }

  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 10009) { try { tizen.application.getCurrentApplication().exit() } catch (e) { /* fora da TV */ } }
  })

  async function phaseOne() {
    P.report.phase = 1
    var steps = [['ambiente', '1/8 Ambiente'], ['cpu', '2/8 CPU'], ['compressao', '3/8 Compressão e pedaços'], ['worker', '4/8 Worker e travamento da tela'],
      ['idb', '5/8 IndexedDB (inclui espera de 70 s)'], ['render', '6/8 Renderização'], ['rede', '7/8 Rede local']]
    for (var i = 0; i < steps.length; i += 1) await P.run(steps[i][0], steps[i][1], T[steps[i][0]])
    setPhase('heap-started')
    await P.run('memoriaHeap', '8/8 Memória JS', T.memoriaHeap)
    setPhase('heap-done')
    phaseTwo()
  }
  async function phaseTwo() {
    P.report.phase = 2
    await P.run('memoriaBuffers', '8/8 Memória (buffers)', T.memoriaBuffers)
    setPhase('done')
    await P.send('fim')
    P.status('Concluído. Avise no PC — o app de teste pode ser desinstalado.')
  }

  // Rodada parcial: `window.PROBE_ONLY = ['guia']` (gerado pelo instalar-sonda.ps1 -Only) roda só esses testes.
  async function only(names) {
    P.report.phase = 'parcial'
    for (var i = 0; i < names.length; i += 1) await P.run(names[i], 'Teste ' + names[i], T[names[i]])
    await P.send('fim')
    P.status('Concluído. Avise no PC — o app de teste pode ser desinstalado.')
  }

  var current = phase()
  if (Array.isArray(window.PROBE_ONLY) && window.PROBE_ONLY.length) only(window.PROBE_ONLY)
  else if (current === 'heap-started') { P.report.heapCrashed = true; P.log('A TV fechou o app no teste de memória JS (registrado). Seguindo com buffers.'); phaseTwo() }
  else if (current === 'heap-done') phaseTwo()
  else if (current === 'done') P.status('Teste já concluído. Pode desinstalar este app de teste.')
  else phaseOne()
})()
