/**
 * Contrato da feature 090 — leitura de um arquivo de legenda externa (`logic/legenda-externa.md` §1).
 * Pela interface pública: `parseSubtitleFile` e `SubtitleFileError`.
 */
import { describe, expect, it } from 'vitest'
import { parseSubtitleFile, SubtitleFileError } from './subtitleFile'

describe('parseSubtitleFile (feature 090)', () => {
  // FR-011 + edge case "arquivo inválido": SRT e WebVTT viram falas em texto puro; marcação some; arquivo sem falas é recusado.
  it('lê SRT (BOM, CRLF, tags, bloco inválido) e WebVTT (NOTE, id, entidades) em texto puro; arquivo sem falas lança SubtitleFileError', () => {
    const srt =
      '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Olá,</i> {\\an8}ação!\r\nSegunda linha\r\n\r\n' +
      '2\r\n00:00:05,000 --> 00:00:04,000\r\nTempo invertido\r\n\r\n' +
      '3\r\n00:01:02,250 --> 00:01:04,000\r\n<script>alert(1)</script>Fim\r\n'
    expect(parseSubtitleFile(srt)).toEqual([
      { startMs: 1000, endMs: 3500, text: 'Olá, ação!\nSegunda linha' },
      { startMs: 62250, endMs: 64000, text: 'alert(1)Fim' },
    ])

    const vtt =
      'WEBVTT\n\nNOTE um comentário\n\n00:00.500 --> 00:02.000 align:start\nUm &amp; dois\n\n' +
      'intro\n00:00:03.000 --> 00:00:04.000\nTrês\n'
    expect(parseSubtitleFile(vtt)).toEqual([
      { startMs: 500, endMs: 2000, text: 'Um & dois' },
      { startMs: 3000, endMs: 4000, text: 'Três' },
    ])

    expect(() => parseSubtitleFile('')).toThrow(SubtitleFileError)
    expect(() => parseSubtitleFile('isto não é uma legenda')).toThrow(SubtitleFileError)
  })
})
