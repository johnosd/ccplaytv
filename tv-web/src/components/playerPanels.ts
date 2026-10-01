import {
  SUBTITLE_DELAYS_MS,
  trackLabels,
  type MediaTrack,
  type StreamInfo,
  type TrackChoice,
} from '../lib/player/tracks'

/**
 * Modelo dos painéis "Áudio e legendas" e "Info do stream" (feature 029,
 * `logic/faixas-e-legendas.md` §3 e §6) — puro, sem React nem motor. Quem
 * decide foco e desenha são o `PlayerLayer` e os componentes de painel.
 */

export type TracksRowGroup = 'audio' | 'ad' | 'text' | 'delay'

export interface TracksRow {
  /** Estável entre relidas: `audio:<id>`, `ad`, `text:off`, `text:<id>`, `delay:<ms>`. */
  key: string
  group: TracksRowGroup
  /** Texto visível e nome acessível. */
  label: string
  /** `aria-checked` (radio) / `aria-pressed` (áudio-descrição). */
  checked: boolean
  /** Soft disabled: focável, `aria-disabled`, e SELECT explica em vez de agir. */
  disabled: boolean
  /** Toast do SELECT quando `disabled`. */
  disabledMessage?: string
  /** Só em linhas reais de faixa: id do motor a selecionar. */
  trackId?: string
  /** Só em `delay`: o atraso em ms. */
  delayMs?: number
}

export interface TracksPanelModel {
  audioRows: TracksRow[]
  adRow: TracksRow
  textRows: TracksRow[]
  /** Vazio quando não há nenhuma faixa de texto (a sincronização some). */
  delayRows: TracksRow[]
  noAudioNote: string | null
  noTextNote: string | null
  /** Todas as linhas focáveis, na ordem vertical do painel. */
  rows: TracksRow[]
}

export const NO_AUDIO_NOTE = 'Nenhuma faixa de áudio informada'
export const NO_TEXT_NOTE = 'Nenhuma legenda neste conteúdo'
export const AD_UNAVAILABLE_MESSAGE = 'Este conteúdo não oferece áudio-descrição.'
export const DELAY_NEEDS_TEXT_MESSAGE = 'Ative uma legenda para ajustar a sincronização.'
export const DELAY_EARLIER_MESSAGE = 'Adiantar a legenda não é possível para legendas embutidas.'

function delayLabel(ms: number): string {
  if (ms === 0) return 'Sem atraso'
  return `${ms > 0 ? '+' : ''}${ms} ms`
}

/** Constrói o modelo do painel de faixas a partir do que o motor informou e da escolha atual. */
export function buildTracksPanel(tracks: MediaTrack[], choice: TrackChoice): TracksPanelModel {
  const labels = trackLabels(tracks)
  const labelOf = new Map(tracks.map((track, i) => [track, labels[i]]))

  const audioRows: TracksRow[] = tracks
    .filter((t) => t.kind === 'audio' && !t.audioDescription)
    .map((t) => ({
      key: `audio:${t.id}`,
      group: 'audio',
      label: labelOf.get(t) ?? '',
      checked: t.active,
      disabled: false,
      trackId: t.id,
    }))

  const descriptionTrack = tracks.find((t) => t.kind === 'audio' && t.audioDescription)
  const adRow: TracksRow = descriptionTrack
    ? {
        key: 'ad',
        group: 'ad',
        label: 'Áudio-descrição',
        checked: descriptionTrack.active,
        disabled: false,
        trackId: descriptionTrack.id,
      }
    : {
        key: 'ad',
        group: 'ad',
        label: 'Áudio-descrição — indisponível',
        checked: false,
        disabled: true,
        disabledMessage: AD_UNAVAILABLE_MESSAGE,
      }

  const textTracks = tracks.filter((t) => t.kind === 'text')
  const anyTextActive = textTracks.some((t) => t.active)
  const textRows: TracksRow[] = [
    { key: 'text:off', group: 'text', label: 'Desativadas', checked: !anyTextActive, disabled: false },
    ...textTracks.map<TracksRow>((t) => ({
      key: `text:${t.id}`,
      group: 'text',
      label: labelOf.get(t) ?? '',
      checked: t.active,
      disabled: false,
      trackId: t.id,
    })),
  ]

  const delayRows: TracksRow[] =
    textTracks.length === 0
      ? []
      : SUBTITLE_DELAYS_MS.map<TracksRow>((ms) => {
          const earlier = ms < 0
          // Sem legenda ativa nenhum atraso faz sentido (FR-020); adiantar é
          // impossível para legenda embutida (D-006) — a primeira razão vence.
          const disabled = !anyTextActive || earlier
          return {
            key: `delay:${ms}`,
            group: 'delay',
            label: earlier ? `${delayLabel(ms)} — indisponível` : delayLabel(ms),
            checked: choice.subtitleDelayMs === ms,
            disabled,
            disabledMessage: !anyTextActive ? DELAY_NEEDS_TEXT_MESSAGE : earlier ? DELAY_EARLIER_MESSAGE : undefined,
            delayMs: ms,
          }
        })

  return {
    audioRows,
    adRow,
    textRows,
    delayRows,
    noAudioNote: audioRows.length === 0 ? NO_AUDIO_NOTE : null,
    noTextNote: textTracks.length === 0 ? NO_TEXT_NOTE : null,
    rows: [...audioRows, adRow, ...textRows, ...delayRows],
  }
}

/** Foco inicial: a faixa de áudio ativa; sem ela, a primeira linha. */
export function initialTracksFocusKey(model: TracksPanelModel): string {
  const active = model.audioRows.find((r) => r.checked)
  return (active ?? model.rows[0]).key
}

/** ↑/↓ sem volta nas pontas. Chave desconhecida cai na primeira linha. */
export function moveTracksFocus(model: TracksPanelModel, currentKey: string, direction: 'up' | 'down'): string {
  const index = model.rows.findIndex((r) => r.key === currentKey)
  if (index === -1) return model.rows[0].key
  const next = Math.max(0, Math.min(model.rows.length - 1, index + (direction === 'down' ? 1 : -1)))
  return model.rows[next].key
}

/** Depois de uma releitura: mantém o foco pela chave; se a linha sumiu, vai à primeira (por id, não índice). */
export function reconcileTracksFocus(model: TracksPanelModel, currentKey: string): string {
  return model.rows.some((r) => r.key === currentKey) ? currentKey : model.rows[0].key
}

export interface InfoRow {
  key: string
  label: string
  value: string
}

export interface InfoPanelModel {
  /** Linhas técnicas presentes + "Conexão" (sempre a última). */
  rows: InfoRow[]
  /** Nenhum dado técnico informado: mostra a frase no lugar das linhas técnicas. */
  noTechnicalData: boolean
}

export const NO_TECHNICAL_DATA_MESSAGE = 'O aparelho não informou dados técnicos deste stream.'

function decimalComma(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',')
}

/** ≥ 1000 kbps → `4,0 Mbps`; abaixo → `850 kbps`. */
export function formatBitrate(kbps: number): string {
  return kbps >= 1000 ? `${decimalComma(kbps / 1000, 1)} Mbps` : `${Math.round(kbps)} kbps`
}

/** Só as linhas que o motor informou, na ordem de logic §6. `activeAudioLabel` vem de `trackLabels`. */
export function buildInfoRows(
  info: StreamInfo | null,
  activeAudioLabel: string | undefined,
  online: boolean,
): InfoPanelModel {
  const rows: InfoRow[] = []
  if (info) {
    if (info.width !== undefined && info.height !== undefined) {
      rows.push({ key: 'resolution', label: 'Resolução', value: `${info.width} × ${info.height}` })
    }
    if (info.videoCodec) rows.push({ key: 'codec', label: 'Codec de vídeo', value: info.videoCodec })
    if (info.fps !== undefined) {
      rows.push({ key: 'fps', label: 'Quadros por segundo', value: String(Math.round(info.fps * 100) / 100).replace('.', ',') })
    }
    if (info.bitrateKbps !== undefined) {
      rows.push({ key: 'bitrate', label: 'Taxa de bits', value: formatBitrate(info.bitrateKbps) })
    }
    if (info.bufferMs !== undefined) {
      rows.push({ key: 'buffer', label: 'Buffer', value: `${decimalComma(info.bufferMs / 1000, 1)} s` })
    }
    if (info.protocol) rows.push({ key: 'protocol', label: 'Protocolo', value: info.protocol })
  }
  if (activeAudioLabel) rows.push({ key: 'audio', label: 'Áudio', value: activeAudioLabel })
  const noTechnicalData = rows.length === 0
  rows.push({ key: 'connection', label: 'Conexão', value: online ? 'Online' : 'Offline' })
  return { rows, noTechnicalData }
}
