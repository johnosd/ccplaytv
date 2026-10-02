import { describe, expect, it } from 'vitest'
import { readDirectiveHeaders } from './m3uHeaders'
import { M3U_DIRECTIVES_SAMPLE } from './m3uHeaders.fixtures'
import { linesFromText, parseM3uLines, parseM3uText, type ParseTally } from './m3uParser'

describe('readDirectiveHeaders (feature 044, logic §2)', () => {
  it('lê http-user-agent e http-referrer/http-referer do #EXTVLCOPT', () => {
    expect(readDirectiveHeaders('#EXTVLCOPT:http-user-agent=Foo')).toEqual({ supported: true, headers: { userAgent: 'Foo' } })
    expect(readDirectiveHeaders('#EXTVLCOPT:http-referrer=http://r.test/')).toEqual({ supported: true, headers: { referer: 'http://r.test/' } })
    expect(readDirectiveHeaders('#EXTVLCOPT:http-referer=http://r.test/')?.headers).toEqual({ referer: 'http://r.test/' })
  })

  it('lê stream_headers do #KODIPROP; licença DRM e outras chaves são "não suportadas" e o valor não sai', () => {
    expect(readDirectiveHeaders('#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Foo&Referer=http://r.test/')?.headers).toEqual({
      userAgent: 'Foo',
      referer: 'http://r.test/',
    })
    const drm = readDirectiveHeaders('#KODIPROP:inputstream.adaptive.license_key=SEGREDO')
    expect(drm).toEqual({ supported: false })
    expect(readDirectiveHeaders('#EXTVLCOPT:network-caching=1000')).toEqual({ supported: false })
  })

  it('qualquer outra linha devolve null', () => {
    expect(readDirectiveHeaders('#EXTINF:-1,Canal')).toBeNull()
    expect(readDirectiveHeaders('http://x.test/a.ts')).toBeNull()
  })
})

describe('parseM3uLines — diretivas (feature 044, logic §3)', () => {
  it('não confunde #EXTVLCOPT/#KODIPROP com manifesto HLS', async () => {
    await expect(parseM3uText(M3U_DIRECTIVES_SAMPLE)).resolves.toBeDefined()
  })

  it('amostra no formato real: cada entrada recebe só as suas diretivas e o DRM é só contado', async () => {
    const tally: ParseTally = { invalidCount: 0 }
    const entries = []
    for await (const entry of parseM3uLines(linesFromText(M3U_DIRECTIVES_SAMPLE), tally)) entries.push(entry)

    expect(entries.map((entry) => entry.headers)).toEqual([
      { userAgent: 'Exemplo VLC/3.0', referer: 'http://portal.exemplo.test/' },
      undefined,
      { userAgent: 'Exemplo Kodi', referer: 'http://portal.exemplo.test/' },
    ])
    expect(tally.unsupportedDirectives).toBe(2)
    expect(tally.invalidCount).toBe(0)
    expect(JSON.stringify([entries, tally])).not.toContain('chave-falsa')
  })

  it('#EXTINF sem URL seguido de outro #EXTINF: a diretiva da entrada inválida não vaza e conta como inválida', async () => {
    const tally: ParseTally = { invalidCount: 0 }
    const entries = []
    const text = [
      '#EXTM3U',
      '#EXTINF:-1,Sem URL',
      '#EXTVLCOPT:http-user-agent=UA-DA-INVALIDA',
      '#EXTINF:-1,Com URL',
      'http://x.test/1.ts',
    ].join('\n')
    for await (const entry of parseM3uLines(linesFromText(text), tally)) entries.push(entry)

    expect(entries).toHaveLength(1)
    expect(entries[0].headers).toBeUndefined()
    expect(tally.invalidCount).toBe(1)
  })

  it('diretiva órfã no fim do arquivo não conta como entrada inválida', async () => {
    const tally: ParseTally = { invalidCount: 0 }
    const text = ['#EXTM3U', '#EXTINF:-1,A', 'http://x.test/1.ts', '#EXTVLCOPT:http-user-agent=ORFA'].join('\n')
    for await (const entry of parseM3uLines(linesFromText(text), tally)) void entry
    expect(tally.invalidCount).toBe(0)
  })
})
