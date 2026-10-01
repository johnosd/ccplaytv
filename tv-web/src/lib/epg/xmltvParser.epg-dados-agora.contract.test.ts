/**
 * Contrato da feature 030 (EPG — dados e "Agora") — travado em
 * `sdd/specs/030-epg-dados-agora/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { parseXmltv } from './xmltvParser'
import type { EpgProgramInput } from './types'

/** Corta o texto em pedaços de tamanho fixo — cai no meio de tag, atributo e entidade. */
async function* chunked(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size)
}

async function collect(gen: AsyncIterable<EpgProgramInput>): Promise<EpgProgramInput[]> {
  const out: EpgProgramInput[] = []
  for await (const item of gen) out.push(item)
  return out
}

const XMLTV = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="teste">
  <channel id="globo.br"><display-name>Globo</display-name></channel>
  <channel id="espn.br"><display-name>ESPN</display-name></channel>
  <programme start="20260929100000 -0300" stop="20260929113000 -0300" channel="globo.br">
    <title lang="pt">Tom &amp; Jerry</title>
    <desc lang="pt">Gato &lt;e&gt; rato.</desc>
  </programme>
  <programme start="20260929143000" stop="20260929150000" channel="espn.br">
    <title>SportsCenter</title>
  </programme>
  <programme start="20260929150000 +0000" stop="20260929160000 +0000" channel="espn.br">
    <title></title>
  </programme>
  <programme start="20261005100000 +0000" stop="20261005110000 +0000" channel="espn.br">
    <title>Fora da janela</title>
  </programme>
</tv>`

describe('parseXmltv — contrato da feature 030', () => {
  // FR-003 (leitura incremental), FR-004 (janela), FR-014 (fuso; sem fuso = UTC), FR-030 (sem título não entra), edge "entidades"
  it('lê em pedaços partidos, resolve fuso, filtra pela janela e descarta programa sem título', async () => {
    const window = { from: Date.UTC(2026, 8, 28, 12, 0, 0), to: Date.UTC(2026, 8, 30, 12, 0, 0) }

    const programs = await collect(parseXmltv(chunked(XMLTV, 7), window))

    expect(programs).toEqual([
      {
        channelKey: 'globo.br',
        start: Date.UTC(2026, 8, 29, 13, 0, 0),
        end: Date.UTC(2026, 8, 29, 14, 30, 0),
        title: 'Tom & Jerry',
        description: 'Gato <e> rato.',
      },
      {
        channelKey: 'espn.br',
        start: Date.UTC(2026, 8, 29, 14, 30, 0),
        end: Date.UTC(2026, 8, 29, 15, 0, 0),
        title: 'SportsCenter',
      },
    ])
  })
})
