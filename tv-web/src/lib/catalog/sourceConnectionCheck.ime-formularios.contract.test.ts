import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkSourceConnection } from './sourceConnectionCheck'

const PANEL = { type: 'provider_credentials', dns: 'http://painel.exemplo.test:8080', username: 'joao', password: 'segredo' } as const
const M3U_OK = '#EXTM3U\n#EXTINF:-1 group-title="Canais",Canal Um\nhttp://painel.exemplo.test/live/1.ts\n'

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('checkSourceConnection — contrato da feature 045', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // US1/AC1-AC4, FR-002, FR-003 — cada falha com o código da tabela da 042; endereço inválido nunca vai à rede
  it('distingue endereço inválido (sem rede), offline, falha de conexão, credencial recusada e resposta incompatível', async () => {
    // Endereço inválido: Xtream e M3U, e fetch nunca é chamado.
    const never = stubFetch(() => Promise.reject(new Error('rede não deveria ser consultada')))
    expect(await checkSourceConnection({ ...PANEL, dns: 'http://' })).toEqual({ status: 'failed', code: 'SRC-001' })
    expect(await checkSourceConnection({ type: 'm3u_url', url: 'isto não é uma url' })).toEqual({ status: 'failed', code: 'SRC-001' })
    expect(never).not.toHaveBeenCalled()

    // Offline: NET-01 na hora, também sem rede.
    expect(await checkSourceConnection(PANEL, { isOnline: () => false })).toEqual({ status: 'failed', code: 'NET-01' })
    expect(never).not.toHaveBeenCalled()

    // Servidor que não responde.
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await checkSourceConnection(PANEL)).toEqual({ status: 'failed', code: 'NET-02' })
    expect(await checkSourceConnection({ type: 'm3u_url', url: 'http://lista.exemplo.test/lista.m3u' })).toEqual({
      status: 'failed',
      code: 'NET-02',
    })

    // Servidor que recusa usuário/senha.
    stubFetch(() => Promise.resolve(new Response('', { status: 401 })))
    expect(await checkSourceConnection(PANEL)).toEqual({ status: 'failed', code: 'SRC-401' })

    // Nem o protocolo Xtream nem o M3U de fallback servem.
    stubFetch((url) =>
      Promise.resolve(url.includes('get.php') ? new Response('<html>nada aqui</html>') : new Response('', { status: 404 })),
    )
    expect(await checkSourceConnection(PANEL)).toEqual({ status: 'failed', code: 'SRC-422' })
  })

  // US1/AC5, FR-004 — o fallback "Modo limitado" não é erro; a leitura é só do começo (não baixa a lista inteira)
  it('painel sem protocolo Xtream cujo M3U serve confirma como "limited" e abandona o download depois da primeira entrada', async () => {
    let pulls = 0
    let cancelled = false
    const encoder = new TextEncoder()
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(encoder.encode(pulls === 1 ? M3U_OK : '#EXTINF:-1,Outro\nhttp://painel.exemplo.test/live/n.ts\n'))
      },
      cancel() {
        cancelled = true
      },
    })
    stubFetch((url) => Promise.resolve(url.includes('get.php') ? new Response(endless) : new Response('', { status: 404 })))

    const result = await checkSourceConnection(PANEL)

    expect(result).toEqual({ status: 'confirmed', route: 'limited' })
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThanOrEqual(3)
  })
})
