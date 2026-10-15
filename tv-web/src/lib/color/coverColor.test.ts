import { describe, expect, it } from 'vitest'
import { isSafeCoverUrl } from './coverColor'
import { panelHostsOf } from '../../features/vod/usePanelHosts'

// Feature 059, FR-024 (decisão de 2026-10-05): só capas que não podem carregar credencial.

describe('isSafeCoverUrl', () => {
  const hosts = ['painel.tv', '10.0.0.5']

  it('aceita http(s) público sem query, sem usuário/senha e fora dos painéis', () => {
    expect(isSafeCoverUrl('https://image.tmdb.org/t/p/w500/abc.jpg', hosts)).toBe(true)
    expect(isSafeCoverUrl('http://cdn.provedor.com/capas/duna.png', hosts)).toBe(true)
  })

  it('recusa o que pode carregar credencial ou não é http(s)', () => {
    expect(isSafeCoverUrl('http://cdn.provedor.com/capa.png?token=x', hosts)).toBe(false)
    expect(isSafeCoverUrl('http://user:pass@cdn.provedor.com/capa.png', hosts)).toBe(false)
    expect(isSafeCoverUrl('http://painel.tv:8080/images/capa.png', hosts)).toBe(false)
    expect(isSafeCoverUrl('http://PAINEL.TV/capa.png', hosts)).toBe(false)
    expect(isSafeCoverUrl('http://10.0.0.5/capa.png', hosts)).toBe(false)
    expect(isSafeCoverUrl('data:image/png;base64,AAAA', hosts)).toBe(false)
    expect(isSafeCoverUrl('não é url', hosts)).toBe(false)
  })
})

describe('panelHostsOf', () => {
  it('extrai só o host do DNS (com ou sem esquema) e da URL M3U, sem repetir', () => {
    expect(
      panelHostsOf([
        { providerDns: 'painel.tv:8080' },
        { providerDns: 'http://Painel.tv' },
        { m3uUrl: 'http://lista.tv/get.php?username=u&password=p' },
        {},
      ]),
    ).toEqual(['painel.tv', 'lista.tv'])
  })
})
