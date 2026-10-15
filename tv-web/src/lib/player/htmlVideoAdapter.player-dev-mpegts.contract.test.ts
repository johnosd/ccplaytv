// Contrato da feature 047 (player-dev-mpegts) — TRAVADO por contract-tests.lock.
// Só o `sdd-plan` altera este arquivo; o `sdd-execute` apenas faz passar.
//
// O demux real (biblioteca + MediaSource) não roda em jsdom: o adaptador recebe
// um `startDemux` falso pela opção pública `createHtmlVideoAdapter(cb, { startDemux })`.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
import type { PlayerAdapterCallbacks } from './PlayerService'
import { FULLSCREEN_REGION } from './PlayerService'
import type { DemuxCallbacks, DemuxHandle, DemuxStarter } from './devDemux'

const TS_URL = 'http://painel-secreto.test/live/usuario/senha-secreta/42.ts'

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  HTMLMediaElement.prototype.load = vi.fn()
})

afterEach(() => {
  document.body.innerHTML = ''
})

function fakeCallbacks() {
  return {
    onStateChange: vi.fn(),
    onError: vi.fn(),
    onProgress: vi.fn(),
    onCompleted: vi.fn(),
  } satisfies PlayerAdapterCallbacks
}

/** Demux falso: a promessa de `start` só resolve quando o teste manda (simula o import dinâmico demorando). */
function fakeDemux() {
  const destroy = vi.fn()
  let resolveAttach: (handle: DemuxHandle) => void = () => {}
  let demuxCallbacks: DemuxCallbacks = { onFailure: () => {} }
  const start = vi.fn<DemuxStarter>((_video, _url, callbacks) => {
    demuxCallbacks = callbacks
    return new Promise<DemuxHandle>((resolve) => {
      resolveAttach = resolve
    })
  })
  return {
    start,
    destroy,
    attach: () => resolveAttach({ destroy }),
    fail: () => demuxCallbacks.onFailure(),
  }
}

function currentVideo(): HTMLVideoElement {
  const el = document.querySelector('video.player-video')
  if (!el) throw new Error('elemento <video> não encontrado — open() não montou nada')
  return el as HTMLVideoElement
}

/** O `<video>` recusou o formato: `video.error.code === 4` (MEDIA_ERR_SRC_NOT_SUPPORTED) e o evento `error`. */
function nativeRefusal(video: HTMLVideoElement, code = 4): void {
  Object.defineProperty(video, 'error', { configurable: true, value: { code } })
  video.dispatchEvent(new Event('error'))
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('htmlVideoAdapter — fallback de demux (contrato 047)', () => {
  // US2/AC1, FR-003: o erro nativo de .ts não vira falha — o demux assume o MESMO elemento.
  it('em .ts recusado pelo <video>, inicia o demux sobre o mesmo elemento e ainda não reporta erro', () => {
    const callbacks = fakeCallbacks()
    const demux = fakeDemux()
    const adapter = createHtmlVideoAdapter(callbacks, { startDemux: demux.start })

    adapter.open(TS_URL, FULLSCREEN_REGION)
    const video = currentVideo()
    nativeRefusal(video)

    expect(demux.start).toHaveBeenCalledTimes(1)
    expect(demux.start).toHaveBeenCalledWith(video, TS_URL, expect.any(Object))
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  // FR-006 + Constitution "Segredos Fora dos Clientes e dos Logs": uma falha só, sem URL nem credencial.
  it('quando o demux falha, reporta uma única falha genérica (code null) sem URL nem credencial', () => {
    const callbacks = fakeCallbacks()
    const demux = fakeDemux()
    const adapter = createHtmlVideoAdapter(callbacks, { startDemux: demux.start })

    adapter.open(TS_URL, FULLSCREEN_REGION)
    const video = currentVideo()
    nativeRefusal(video)
    demux.fail()
    // O elemento pode disparar `error` de novo ao ser solto: não vira segundo erro nem novo demux.
    nativeRefusal(video)

    expect(callbacks.onError).toHaveBeenCalledTimes(1)
    const [reported] = callbacks.onError.mock.calls[0]
    expect(reported).toEqual({ code: null })
    expect(JSON.stringify(callbacks.onError.mock.calls)).not.toMatch(/painel-secreto|senha-secreta|usuario/)
    expect(demux.start).toHaveBeenCalledTimes(1)
  })

  // FR-005 / SC-003: fechar (ou trocar de canal) nunca deixa o stream aberto — nem quando o demux ainda estava anexando.
  it('close() destrói o demux, inclusive o que termina de anexar depois do close, sem callbacks tardios', async () => {
    // (a) close() com o demux já anexado.
    const attached = fakeDemux()
    const callbacksA = fakeCallbacks()
    const adapterA = createHtmlVideoAdapter(callbacksA, { startDemux: attached.start })
    adapterA.open(TS_URL, FULLSCREEN_REGION)
    nativeRefusal(currentVideo())
    attached.attach()
    await flush()
    adapterA.close()
    expect(attached.destroy).toHaveBeenCalledTimes(1)

    // (b) close() enquanto o import/anexo ainda está pendente: ao terminar, é destruído na hora.
    const pending = fakeDemux()
    const callbacksB = fakeCallbacks()
    const adapterB = createHtmlVideoAdapter(callbacksB, { startDemux: pending.start })
    adapterB.open(TS_URL, FULLSCREEN_REGION)
    nativeRefusal(currentVideo())
    adapterB.close()
    expect(pending.destroy).not.toHaveBeenCalled()
    pending.attach()
    await flush()
    expect(pending.destroy).toHaveBeenCalledTimes(1)

    // Falha tardia do demux já fechado não chega à sessão.
    pending.fail()
    expect(callbacksB.onError).not.toHaveBeenCalled()
    expect(callbacksB.onStateChange).not.toHaveBeenCalled()
  })
})
