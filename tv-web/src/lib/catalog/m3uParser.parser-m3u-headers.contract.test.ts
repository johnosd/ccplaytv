/**
 * Contrato da feature 044 (parser M3U: headers) — TRAVADO por
 * `contract-tests.lock`. O executor só pode fazê-los passar, nunca editá-los.
 */
import { describe, expect, it } from 'vitest'
import { parseM3uText } from './m3uParser'

function m3u(...lines: string[]): string {
  return ['#EXTM3U', ...lines].join('\n')
}

describe('parser M3U — headers (feature 044)', () => {
  it('US1/AC1+AC3+AC4: separa URL e headers no primeiro `|`; `&` dentro do Referer fica; chave desconhecida some', async () => {
    const { entries } = await parseM3uText(
      m3u(
        '#EXTINF:-1,A',
        'http://x.test/a.ts|User-Agent=Foo Bar&Referer=http://r.test/p?x=1&y=2&Cookie=abc',
        '#EXTINF:-1,B',
        'http://x.test/b.ts|user-agent=Foo%20Baz',
        '#EXTINF:-1,C',
        'http://x.test/c.ts|User-Agent=A|Referer=http://b.test/',
      ),
    )

    expect(entries.map((entry) => entry.url)).toEqual(['http://x.test/a.ts', 'http://x.test/b.ts', 'http://x.test/c.ts'])
    expect(entries[0].headers).toEqual({ userAgent: 'Foo Bar', referer: 'http://r.test/p?x=1&y=2' })
    expect(entries[1].headers).toEqual({ userAgent: 'Foo Baz' })
    expect(entries[2].headers).toEqual({ userAgent: 'A', referer: 'http://b.test/' })
  })

  it('US2/AC1-AC4 + FR-003/FR-004/FR-005: diretriz vale só para a entrada seguinte, o `|` prevalece, DRM é ignorado', async () => {
    const { entries } = await parseM3uText(
      m3u(
        '#EXTINF:-1,Com diretriz',
        '#EXTVLCOPT:http-user-agent=UA-DIRETRIZ',
        '#EXTVLCOPT:http-referrer=http://dir.test/',
        '#KODIPROP:inputstream.adaptive.license_key=SEGREDO-DRM',
        'http://x.test/1.ts',
        '#EXTINF:-1,Sem diretriz',
        'http://x.test/2.ts',
        '#EXTVLCOPT:http-user-agent=UA-ANTES-DO-EXTINF',
        '#EXTINF:-1,Pipe prevalece',
        'http://x.test/3.ts|User-Agent=UA-PIPE',
        '#EXTVLCOPT:http-user-agent=UA-ORFA-NO-FIM',
      ),
    )

    expect(entries).toHaveLength(3)
    expect(entries[0].headers).toEqual({ userAgent: 'UA-DIRETRIZ', referer: 'http://dir.test/' })
    expect(entries[1].headers).toBeUndefined()
    expect(entries[2].headers).toEqual({ userAgent: 'UA-PIPE' })
    expect(JSON.stringify(entries)).not.toContain('SEGREDO-DRM')
    expect(JSON.stringify(entries)).not.toContain('UA-ORFA-NO-FIM')
  })

  it('FR-006/FR-011: `|` comum no caminho fica; sufixo vazio ou só de header ignorado é limpo; sem `|` nada muda', async () => {
    const { entries } = await parseM3uText(
      m3u(
        '#EXTINF:-1,Pipe no caminho',
        'http://x.test/a|b.ts',
        '#EXTINF:-1,Pipe vazio',
        'http://x.test/c.ts|',
        '#EXTINF:-1,So cookie',
        'http://x.test/d.ts|Cookie=abc',
        '#EXTINF:-1,Normal',
        'http://x.test/e.ts',
      ),
    )

    expect(entries.map((entry) => entry.url)).toEqual([
      'http://x.test/a|b.ts',
      'http://x.test/c.ts',
      'http://x.test/d.ts',
      'http://x.test/e.ts',
    ])
    expect(entries.map((entry) => entry.headers)).toEqual([undefined, undefined, undefined, undefined])
  })
})
