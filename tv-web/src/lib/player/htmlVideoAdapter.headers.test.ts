// @vitest-environment jsdom
/** Feature 058 (T013, `logic/headers.md` §2): o `<video>` não envia headers — tudo declarado é recusado. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
import { FULLSCREEN_REGION, type PlayerAdapterCallbacks } from './PlayerService'

function callbacks(): PlayerAdapterCallbacks {
  return { onStateChange: vi.fn(), onError: vi.fn(), onProgress: vi.fn(), onCompleted: vi.fn() }
}

describe('htmlVideoAdapter — headers (feature 058)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('declara todo header como recusado e zera na abertura seguinte sem headers', () => {
    const adapter = createHtmlVideoAdapter(callbacks(), { startDemux: null })
    expect(adapter.requestHeadersReport?.()).toEqual({ applied: [], refused: [] })
    adapter.open('http://x.invalid/1.mp4', FULLSCREEN_REGION, undefined, { userAgent: 'UA', referer: 'http://r.invalid/' })
    expect(adapter.requestHeadersReport?.()).toEqual({ applied: [], refused: ['User-Agent', 'Referer'] })
    adapter.close()
    adapter.open('http://x.invalid/2.mp4', FULLSCREEN_REGION)
    expect(adapter.requestHeadersReport?.()).toEqual({ applied: [], refused: [] })
    adapter.close()
  })
})
