import { describe, expect, it } from 'vitest'
import {
  AD_UNAVAILABLE_MESSAGE,
  buildInfoRows,
  buildTracksPanel,
  DELAY_EARLIER_MESSAGE,
  DELAY_NEEDS_TEXT_MESSAGE,
  formatBitrate,
  initialTracksFocusKey,
  moveTracksFocus,
  NO_TECHNICAL_DATA_MESSAGE,
  reconcileTracksFocus,
} from './playerPanels'
import { DEFAULT_TRACK_CHOICE, type MediaTrack } from '../lib/player/tracks'

const A_PT: MediaTrack = { id: 'a0', kind: 'audio', language: 'por', active: true }
const A_EN: MediaTrack = { id: 'a1', kind: 'audio', language: 'eng', active: false }
const T_PT: MediaTrack = { id: 't0', kind: 'text', language: 'por', active: false }

describe('buildTracksPanel (logic §3)', () => {
  it('ordem vertical: áudio → áudio-descrição → legendas → sincronização, com chaves estáveis', () => {
    const model = buildTracksPanel([A_PT, A_EN, T_PT], DEFAULT_TRACK_CHOICE)
    expect(model.rows.map((r) => r.key)).toEqual([
      'audio:a0',
      'audio:a1',
      'ad',
      'text:off',
      'text:t0',
      'delay:-1000',
      'delay:-500',
      'delay:0',
      'delay:500',
      'delay:1000',
    ])
  })

  it('sem legenda ativa, "Desativadas" está marcada; ativa uma faixa, ela é a marcada', () => {
    const off = buildTracksPanel([A_PT, T_PT], DEFAULT_TRACK_CHOICE)
    expect(off.textRows.map((r) => [r.label, r.checked])).toEqual([
      ['Desativadas', true],
      ['Português', false],
    ])
    const on = buildTracksPanel([A_PT, { ...T_PT, active: true }], DEFAULT_TRACK_CHOICE)
    expect(on.textRows.map((r) => [r.label, r.checked])).toEqual([
      ['Desativadas', false],
      ['Português', true],
    ])
  })

  it('sem faixa de texto: só "Desativadas", a nota "Nenhuma legenda…" e nenhuma linha de sincronização', () => {
    const model = buildTracksPanel([A_PT], DEFAULT_TRACK_CHOICE)
    expect(model.textRows.map((r) => r.label)).toEqual(['Desativadas'])
    expect(model.noTextNote).toBe('Nenhuma legenda neste conteúdo')
    expect(model.delayRows).toEqual([])
    expect(model.rows.some((r) => r.group === 'delay')).toBe(false)
  })

  it('sem faixa de áudio: nota própria, e o painel continua tendo linhas focáveis', () => {
    const model = buildTracksPanel([T_PT], DEFAULT_TRACK_CHOICE)
    expect(model.noAudioNote).toBe('Nenhuma faixa de áudio informada')
    expect(model.audioRows).toEqual([])
    expect(model.rows.length).toBeGreaterThan(0)
  })

  it('áudio-descrição: soft disabled com explicação sem faixa marcada; real com ela — e a AD sai da lista de áudio', () => {
    const none = buildTracksPanel([A_PT, A_EN], DEFAULT_TRACK_CHOICE)
    expect(none.adRow).toMatchObject({
      disabled: true,
      label: 'Áudio-descrição — indisponível',
      disabledMessage: AD_UNAVAILABLE_MESSAGE,
    })

    const withAd = buildTracksPanel(
      [A_PT, { id: 'a9', kind: 'audio', language: 'por', audioDescription: true, active: false }],
      DEFAULT_TRACK_CHOICE,
    )
    expect(withAd.adRow).toMatchObject({ disabled: false, label: 'Áudio-descrição', trackId: 'a9', checked: false })
    expect(withAd.audioRows.map((r) => r.key)).toEqual(['audio:a0'])
  })

  it('sincronização: legenda desativada deixa tudo soft disabled com a explicação de ativar', () => {
    const model = buildTracksPanel([A_PT, T_PT], DEFAULT_TRACK_CHOICE)
    expect(model.delayRows.every((r) => r.disabled)).toBe(true)
    expect(model.delayRows.every((r) => r.disabledMessage === DELAY_NEEDS_TEXT_MESSAGE)).toBe(true)
  })

  it('sincronização com legenda ativa: só atrasar é real; adiantar fica soft disabled com rótulo e mensagem próprios', () => {
    const model = buildTracksPanel([A_PT, { ...T_PT, active: true }], { ...DEFAULT_TRACK_CHOICE, subtitleDelayMs: 500 })
    const byMs = new Map(model.delayRows.map((r) => [r.delayMs, r]))
    expect(byMs.get(-1000)).toMatchObject({ disabled: true, label: '-1000 ms — indisponível', disabledMessage: DELAY_EARLIER_MESSAGE })
    expect(byMs.get(-500)).toMatchObject({ disabled: true, label: '-500 ms — indisponível' })
    expect(byMs.get(0)).toMatchObject({ disabled: false, label: 'Sem atraso', checked: false })
    expect(byMs.get(500)).toMatchObject({ disabled: false, label: '+500 ms', checked: true })
    expect(byMs.get(1000)).toMatchObject({ disabled: false, label: '+1000 ms', checked: false })
  })

  it('rótulos repetidos de áudio ganham o sufixo de faixa dentro do painel', () => {
    const model = buildTracksPanel(
      [
        { id: 'a0', kind: 'audio', language: 'por', active: true },
        { id: 'a1', kind: 'audio', language: 'por', active: false },
      ],
      DEFAULT_TRACK_CHOICE,
    )
    expect(model.audioRows.map((r) => r.label)).toEqual(['Português • Faixa 1', 'Português • Faixa 2'])
  })
})

describe('foco do painel de faixas (logic §3)', () => {
  const model = buildTracksPanel([A_PT, A_EN, T_PT], DEFAULT_TRACK_CHOICE)

  it('foco inicial: a faixa de áudio ativa; sem áudio ativo, a primeira linha', () => {
    expect(initialTracksFocusKey(model)).toBe('audio:a0')
    const noneActive = buildTracksPanel([{ ...A_PT, active: false }, A_EN], DEFAULT_TRACK_CHOICE)
    expect(initialTracksFocusKey(noneActive)).toBe('audio:a0')
    const onlyText = buildTracksPanel([T_PT], DEFAULT_TRACK_CHOICE)
    expect(initialTracksFocusKey(onlyText)).toBe('ad')
  })

  it('↑/↓ movem uma linha e não dão a volta nas pontas', () => {
    expect(moveTracksFocus(model, 'audio:a0', 'down')).toBe('audio:a1')
    expect(moveTracksFocus(model, 'audio:a1', 'up')).toBe('audio:a0')
    expect(moveTracksFocus(model, 'audio:a0', 'up')).toBe('audio:a0')
    const last = model.rows[model.rows.length - 1].key
    expect(moveTracksFocus(model, last, 'down')).toBe(last)
  })

  it('chave desconhecida cai na primeira linha; reconciliar mantém a chave que ainda existe', () => {
    expect(moveTracksFocus(model, 'audio:sumiu', 'down')).toBe('audio:a0')
    expect(reconcileTracksFocus(model, 'text:t0')).toBe('text:t0')
    expect(reconcileTracksFocus(model, 'text:sumiu')).toBe('audio:a0')
  })
})

describe('buildInfoRows (logic §6)', () => {
  it('só as linhas presentes, na ordem do doc, com "Conexão" sempre por último', () => {
    const { rows, noTechnicalData } = buildInfoRows(
      { width: 1920, height: 1080, videoCodec: 'H264', fps: 59.94, bitrateKbps: 4000, bufferMs: 12400, protocol: 'HLS' },
      'Português • AC3',
      true,
    )
    expect(noTechnicalData).toBe(false)
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Resolução', '1920 × 1080'],
      ['Codec de vídeo', 'H264'],
      ['Quadros por segundo', '59,94'],
      ['Taxa de bits', '4,0 Mbps'],
      ['Buffer', '12,4 s'],
      ['Protocolo', 'HLS'],
      ['Áudio', 'Português • AC3'],
      ['Conexão', 'Online'],
    ])
  })

  it('campo ausente não vira linha, e resolução exige largura E altura', () => {
    const { rows } = buildInfoRows({ width: 1920, videoCodec: 'H264' }, undefined, false)
    expect(rows.map((r) => r.label)).toEqual(['Codec de vídeo', 'Conexão'])
    expect(rows.at(-1)?.value).toBe('Offline')
  })

  it('sem nenhum dado técnico (info nula ou vazia): só Conexão e o aviso de "não informou"', () => {
    for (const info of [null, {}]) {
      const model = buildInfoRows(info, undefined, true)
      expect(model.noTechnicalData).toBe(true)
      expect(model.rows.map((r) => r.label)).toEqual(['Conexão'])
    }
    expect(NO_TECHNICAL_DATA_MESSAGE).toBe('O aparelho não informou dados técnicos deste stream.')
  })

  it('a faixa de áudio ativa conta como dado informado', () => {
    const model = buildInfoRows({}, 'Inglês', true)
    expect(model.noTechnicalData).toBe(false)
    expect(model.rows.map((r) => r.label)).toEqual(['Áudio', 'Conexão'])
  })

  it('formatBitrate: kbps abaixo de 1000, Mbps com uma casa e vírgula acima', () => {
    expect(formatBitrate(850)).toBe('850 kbps')
    expect(formatBitrate(999.6)).toBe('1000 kbps')
    expect(formatBitrate(1000)).toBe('1,0 Mbps')
    expect(formatBitrate(4250)).toBe('4,3 Mbps')
    expect(formatBitrate(18600)).toBe('18,6 Mbps')
  })
})
