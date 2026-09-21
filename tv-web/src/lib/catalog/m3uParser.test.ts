import { describe, expect, it } from 'vitest'
import {
  EmptyPlaylistError,
  HlsManifestDetectedError,
  InvalidPlaylistError,
  linesFromText,
  parseM3uLines,
  parseM3uText,
  type ParseTally,
} from './m3uParser'

describe('m3uParser', () => {
  it('recusa conteúdo que não começa com #EXTM3U', async () => {
    await expect(parseM3uText('<html>erro do provedor</html>')).rejects.toBeInstanceOf(
      InvalidPlaylistError,
    )
  })

  it('recusa um manifesto HLS de verdade em vez de importar segmentos como canais', async () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:10',
      '#EXTINF:10.0,',
      'segment0.ts',
      '#EXT-X-ENDLIST',
    ].join('\n')

    await expect(parseM3uText(manifest)).rejects.toBeInstanceOf(HlsManifestDetectedError)
  })

  it('NÃO reprova catálogo por causa da tag de branding #EXT-X-SESSION-DATA', async () => {
    // Característica real de painéis Xtream/XUI: a tag de versão aparece
    // logo após #EXTM3U, mas o arquivo é um catálogo comum. Tratar todo
    // "#EXT-X-*" como HLS reprovava catálogos inteiros — falso positivo já
    // corrigido no backend e portado junto.
    const catalog = [
      '#EXTM3U',
      '#EXT-X-SESSION-DATA:DATA-ID="com.xui.1_5_5r2"',
      '#EXTINF:-1 group-title="Canais | Variedades",Canal Exemplo',
      'http://exemplo.test/live/canal-exemplo.ts',
    ].join('\n')

    const result = await parseM3uText(catalog)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].group).toBe('Canais | Variedades')
  })

  it('conta como inválida a entrada com #EXTINF e sem URL', async () => {
    const m3u = [
      '#EXTM3U',
      '#EXTINF:-1 group-title="Canais",Sem URL',
      '#EXTINF:-1 group-title="Canais",Com URL',
      'http://exemplo.test/live/ok.ts',
    ].join('\n')

    const result = await parseM3uText(m3u)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].name).toBe('Com URL')
    expect(result.invalidCount).toBe(1)
  })

  it('extrai o nome corretamente quando um atributo contém vírgula entre aspas', async () => {
    // Cortar na primeira vírgula bruta quebraria este caso.
    const m3u = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-name="Ação, Aventura" group-title="Filmes, Lançamentos",Nome Do Item',
      'http://exemplo.test/vod/item.mp4',
    ].join('\n')

    const result = await parseM3uText(m3u)

    expect(result.entries[0].name).toBe('Nome Do Item')
    expect(result.entries[0].group).toBe('Filmes, Lançamentos')
    expect(result.entries[0].attributes['tvg-name']).toBe('Ação, Aventura')
  })

  it('ignora BOM no início do arquivo', async () => {
    const m3u = ['﻿#EXTM3U', '#EXTINF:-1,Canal', 'http://exemplo.test/live/a.ts'].join('\n')

    const result = await parseM3uText(m3u)

    expect(result.entries).toHaveLength(1)
  })

  it('recusa lista sintaticamente válida mas sem nenhuma entrada', async () => {
    await expect(parseM3uText('#EXTM3U\n')).rejects.toBeInstanceOf(EmptyPlaylistError)
  })

  it('emite entradas em fluxo, sem exigir o texto inteiro de uma vez (D-002)', async () => {
    async function* chunks(): AsyncGenerator<string> {
      yield '#EXTM3U'
      yield '#EXTINF:-1 group-title="Canais",Primeiro'
      yield 'http://exemplo.test/live/1.ts'
      yield '#EXTINF:-1 group-title="Canais",Segundo'
      yield 'http://exemplo.test/live/2.ts'
    }

    const tally: ParseTally = { invalidCount: 0 }
    const names: string[] = []
    for await (const entry of parseM3uLines(chunks(), tally)) names.push(entry.name)

    expect(names).toEqual(['Primeiro', 'Segundo'])
  })

  it('aborta assim que encontra a tag de manifesto, sem percorrer o resto', async () => {
    let linesConsumed = 0
    async function* lines(): AsyncGenerator<string> {
      const all = ['#EXTM3U', '#EXT-X-TARGETDURATION:10', '#EXTINF:-1,Nunca lido', 'http://x/y.ts']
      for (const line of all) {
        linesConsumed += 1
        yield line
      }
    }

    await expect(async () => {
      for await (const _entry of parseM3uLines(lines())) {
        // consome
      }
    }).rejects.toBeInstanceOf(HlsManifestDetectedError)

    expect(linesConsumed).toBe(2)
  })

  it('linesFromText trata CRLF e LF', async () => {
    const collected: string[] = []
    for await (const line of linesFromText('a\r\nb\nc')) collected.push(line)
    expect(collected).toEqual(['a', 'b', 'c'])
  })
})
