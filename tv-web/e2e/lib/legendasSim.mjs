// Simulação do serviço de legendas e do AVPlay para os E2E da feature 090 (`legendas-externas.mjs` e a parte de legendas
// de `legibilidade-tv.mjs`). Nada de rede real nem de chave real: o serviço é um `context.route`, o AVPlay é um objeto.

export const SRT = {
  'os:1': '1\n00:00:01,000 --> 00:00:03,000\nFala em português\n',
  'os:2': '1\n00:00:01,000 --> 00:00:03,000\nLine in English\n',
  'sd:11-22': '1\n00:00:01,000 --> 00:00:03,000\nFala do SubDL\n',
}

const hit = (id, provider, language, release, extra = {}) => ({ id, provider, language, release, hearingImpaired: false, ...extra })

/**
 * Responde `/device/subtitles/search|download` do portal simulado. `sim.mode`: 'ok' | 'offline' | 'subdlDown'.
 * Devolve `true` se a rota era de legendas (e já foi respondida).
 */
export async function answerSubtitleRoute(route, sim, cors) {
  const request = route.request()
  const pathname = new URL(request.url()).pathname
  if (pathname.endsWith('/device/subtitles/search')) {
    const body = request.postDataJSON()
    sim.calls.push({ kind: 'search', body })
    if (sim.mode === 'offline') {
      await route.abort()
      return true
    }
    const wanted = body.providers ?? ['opensubtitles', 'subdl']
    const results = []
    if (wanted.includes('opensubtitles')) {
      results.push(hit(body.language === 'en' ? 'os:2' : 'os:1', 'opensubtitles', body.language, 'Filme.Exemplo.Com.Um.Nome.De.Versao.Bem.Comprido.720p.WEB', { downloads: 12034 }))
    }
    if (wanted.includes('subdl') && sim.mode !== 'subdlDown') results.push(hit('sd:11-22', 'subdl', body.language, 'Filme.Exemplo.SubDL', { hearingImpaired: true }))
    const unavailable = sim.mode === 'subdlDown' && wanted.includes('subdl') ? ['subdl'] : []
    await route.fulfill({ json: { results, unavailable }, headers: cors })
    return true
  }
  if (pathname.endsWith('/device/subtitles/download')) {
    const body = request.postDataJSON()
    sim.calls.push({ kind: 'download', body })
    await route.fulfill({ json: { text: SRT[body.id] ?? '' }, headers: cors })
    return true
  }
  return false
}

/** AVPlay mínimo que chega a `playing` e deixa o roteiro mandar o tempo da mídia (`window.__avplay.tick(ms)`). */
export function installFakeAvplay() {
  const state = { calls: [], listener: null, tick: (ms) => state.listener?.oncurrentplaytime?.(ms) }
  window.__avplay = state
  window.webapis = {
    productinfo: { getDuid: () => 'fake-legendas-duid' },
    avplay: {
      open() { state.calls.push('open') },
      close() { state.calls.push('close') },
      stop() {},
      setListener(listener) { state.listener = listener },
      setDisplayRect() {},
      setSilentSubtitle() {},
      prepareAsync(onSuccess) { setTimeout(onSuccess, 0) },
      play() {
        state.calls.push('play')
        setTimeout(() => state.listener?.onbufferingcomplete?.(), 0)
      },
      pause() {},
      seekTo(_ms, onOk) { onOk() },
      jumpForward(_ms, onOk) { onOk() },
      jumpBackward(_ms, onOk) { onOk() },
      getCurrentTime() { return 0 },
      getDuration() { return 600000 },
      getTotalTrackInfo() { return [{ index: 0, type: 'VIDEO', extra_info: '{"fourCC":"H264","Width":"1920","Height":"1080","Bit_rate":"4000000"}' }] },
      getCurrentStreamInfo() { return [] },
      setSelectTrack() {},
      getStreamingProperty() { return '' },
    },
  }
}
