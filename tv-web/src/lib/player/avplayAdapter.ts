import {
  NO_REQUEST_HEADERS,
  type PlayerAdapter,
  type PlayerAdapterCallbacks,
  type PlayerError,
  type PlayerRegion,
  type PlayerState,
  type RequestHeaderName,
  type RequestHeaders,
  type RequestHeadersReport,
} from './PlayerService'
import type { EngineCapabilities } from './capabilities'
import type { MediaTrack, StreamInfo } from './tracks'
import type { AspectMode, QualityOption } from './viewChoice'

/**
 * AVPlay (ADR-001 §2): prepareAsync prepara; play reproduz. O plano atrás do
 * DOM exige transparência e setDisplayRect em 1920×1080. Sem webapis, usa HTML.
 * Gate físico VOD: spec 011, quickstart.md, cenários F–I.
 */

interface AvplayListener {
  onbufferingstart?: () => void
  onbufferingcomplete?: () => void
  /** Empurra a posição periodicamente (~1s) enquanto reproduz. */
  oncurrentplaytime?: (currentTimeMs: number) => void
  onstreamcompleted?: () => void
  onerror?: (error: unknown) => void
  /** Legenda embutida: o app recebe cada linha no instante de exibi-la (feature 029). */
  onsubtitlechange?: (duration: string, text: string, type?: string, attributes?: unknown) => void
}

/** Item de `getTotalTrackInfo()`/`getCurrentStreamInfo()`; `extra_info` é uma string JSON. */
interface AvplayTrackInfo {
  index: number
  type: string
  extra_info: string
}

interface AvplayApi {
  open: (url: string) => void
  close: () => void
  prepareAsync: (onSuccess: () => void, onError: (error: unknown) => void) => void
  play: () => void
  /** Também usado para RETOMAR de pausa — o AVPlay não tem um método de resume separado. */
  pause: () => void
  stop: () => void
  /** Requer destino positivo e menor que a duração (referência Samsung). */
  seekTo: (positionMs: number, onSuccess: () => void, onError: (error: unknown) => void) => void
  /** Restringe outras chamadas à API enquanto a operação está em voo (R0-1). */
  jumpForward: (ms: number, onSuccess: () => void, onError: (error: unknown) => void) => void
  jumpBackward: (ms: number, onSuccess: () => void, onError: (error: unknown) => void) => void
  getCurrentTime: () => number
  getDuration: () => number
  setListener: (listener: AvplayListener) => void
  setDisplayRect: (x: number, y: number, width: number, height: number) => void
  setDisplayMethod?: (method: string) => void
  // Feature 029 — opcionais: a referência os documenta, mas a superfície não
  // foi verificada na TV ainda (R-001 do plano). Qualquer falha vira `null`/`false`.
  getTotalTrackInfo?: () => AvplayTrackInfo[]
  getCurrentStreamInfo?: () => AvplayTrackInfo[]
  setSelectTrack?: (trackType: 'AUDIO' | 'TEXT' | 'VIDEO', trackIndex: number) => void
  setSilentSubtitle?: (silent: boolean) => void
  getStreamingProperty?: (name: string) => string
  /**
   * Feature 058 (`logic/headers.md` §1): só no estado IDLE — depois de `open`,
   * antes de `prepareAsync`. Lança quando o firmware não conhece a propriedade.
   */
  setStreamingProperty?: (name: string, value: string) => void
}

interface WebapisGlobal {
  avplay?: AvplayApi
}

function getAvplay(): AvplayApi | undefined {
  return (window as unknown as { webapis?: WebapisGlobal }).webapis?.avplay
}

export function hasAvplay(): boolean {
  return getAvplay() !== undefined
}

/** Capacidades do motor; a sessão restringe pela mídia (D-001/D-002). Live não permite busca/pausa. */
const AVPLAY_CAPABILITIES: EngineCapabilities = {
  canPause: true,
  canSeek: true,
  reportsPosition: true,
  reportsDuration: true,
}

/**
 * Só o código atravessa: erro cru pode conter URL/credenciais (constitution).
 * Sem mensagem: o adaptador não conhece a mídia; quem apresenta traduz o erro.
 */
function toPlayerError(raw: unknown): PlayerError {
  let code: string | null = null
  if (typeof raw === 'string') {
    code = raw
  } else if (raw && typeof raw === 'object' && 'name' in raw) {
    const name = (raw as { name?: unknown }).name
    if (typeof name === 'string') code = name
  }
  return { code }
}

/** Duração relida a cada tick: pode surgir tarde/mudar. Zero ou falha = desconhecida. */
function safeDuration(avplay: AvplayApi): number | undefined {
  try {
    const duration = avplay.getDuration()
    return duration > 0 ? duration : undefined
  } catch {
    return undefined
  }
}

/** `extra_info` malformado vira `{}`: a faixa continua listada, só sem os campos (logic §1.2). */
function parseExtraInfo(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** O motor entrega números como string (`"1920"`); só valores finitos e positivos contam. */
function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function isType(info: AvplayTrackInfo, type: string): boolean {
  return typeof info.type === 'string' && info.type.toUpperCase() === type
}

function readTracks(avplay: AvplayApi): MediaTrack[] | null {
  if (!avplay.getTotalTrackInfo) return null
  const total = avplay.getTotalTrackInfo()
  if (!Array.isArray(total)) return null
  const activeAudio = new Set<number>()
  for (const info of avplay.getCurrentStreamInfo?.() ?? []) {
    if (isType(info, 'AUDIO')) activeAudio.add(info.index)
  }
  const tracks: MediaTrack[] = []
  for (const info of total) {
    const extra = parseExtraInfo(info.extra_info)
    if (isType(info, 'AUDIO')) {
      tracks.push({
        id: String(info.index),
        kind: 'audio',
        language: textOf(extra.language),
        codec: textOf(extra.fourCC),
        channels: positiveNumber(extra.channels),
        active: activeAudio.has(info.index),
      })
    } else if (isType(info, 'TEXT')) {
      // O AVPlay não diz qual legenda está ativa: `active` fica `false` e a
      // sessão sobrescreve pela própria seleção.
      tracks.push({ id: String(info.index), kind: 'text', language: textOf(extra.track_lang), active: false })
    }
  }
  return tracks
}

function readStreamInfo(avplay: AvplayApi): StreamInfo | null {
  const info: StreamInfo = {}
  const video = (avplay.getCurrentStreamInfo?.() ?? []).find((i) => isType(i, 'VIDEO'))
  const extra = video ? parseExtraInfo(video.extra_info) : {}
  const width = positiveNumber(extra.Width)
  const height = positiveNumber(extra.Height)
  if (width !== undefined && height !== undefined) {
    info.width = width
    info.height = height
  }
  const codec = textOf(extra.fourCC)
  if (codec) info.videoCodec = codec
  // Taxa de bits em kbps: a banda atual (streaming adaptativo) quando o
  // motor informa; senão o `Bit_rate` do vídeo. Ambos chegam em bits/s.
  let bandwidth: number | undefined
  try {
    bandwidth = positiveNumber(avplay.getStreamingProperty?.('CURRENT_BANDWIDTH'))
  } catch {
    bandwidth = undefined
  }
  const bitsPerSecond = bandwidth ?? positiveNumber(extra.Bit_rate)
  if (bitsPerSecond !== undefined) info.bitrateKbps = Math.round(bitsPerSecond / 1000)
  return info
}

/**
 * Aspecto no AVPlay (feature 041, R0-1) — mapeamento PROVADO na QN50Q60DAGXZD
 * (2026-10-01, visto pelo usuário): `setDisplayMethod` + `setDisplayRect`.
 * `setVideoRoi` é recusado pelo aparelho (`NotSupportedError`), então o Zoom é
 * um retângulo 10% maior que a região, centrado — corta as bordas.
 * Original = retângulo do tamanho do vídeo (limitado à região), centrado.
 */
/** Uma opção por entrada `VIDEO`; sem largura/altura válidas a entrada fica de fora (nunca inventa resolução). */
function readQualities(avplay: AvplayApi): QualityOption[] | null {
  if (!avplay.getTotalTrackInfo) return null
  const total = avplay.getTotalTrackInfo()
  if (!Array.isArray(total)) return null
  const options: QualityOption[] = []
  for (const info of total) {
    if (!isType(info, 'VIDEO')) continue
    const extra = parseExtraInfo(info.extra_info)
    const height = positiveNumber(extra.Height)
    if (height === undefined) continue
    const bits = positiveNumber(extra.Bit_rate)
    options.push({
      id: String(info.index),
      height,
      width: positiveNumber(extra.Width),
      bitrateKbps: bits === undefined ? undefined : Math.round(bits / 1000),
    })
  }
  return options
}

/**
 * Propriedade do AVPlay para cada header da lista (feature 058, `logic/headers.md`
 * §1). `USER_AGENT` é documentada pela Samsung; `Referer` só ganha uma quando a
 * T003 provar na TV que alguma chega ao servidor — sem prova, fica recusado.
 */
const PROPERTY_OF: Record<RequestHeaderName, string | undefined> = {
  'User-Agent': 'USER_AGENT',
  Referer: undefined,
}

/**
 * Aplica os headers declarados — só no estado IDLE (depois de `open`, antes de
 * `prepareAsync`). Devolve só NOMES: o valor é segredo em potencial (ADR-010) e o
 * erro do motor nunca é repassado (pode citar o valor).
 */
function applyHeaders(avplay: AvplayApi, headers: RequestHeaders | undefined): RequestHeadersReport {
  const report: { applied: RequestHeaderName[]; refused: RequestHeaderName[] } = { applied: [], refused: [] }
  const declared: [RequestHeaderName, string | undefined][] = [
    ['User-Agent', headers?.userAgent],
    ['Referer', headers?.referer],
  ]
  for (const [name, value] of declared) {
    if (value === undefined) continue
    const property = PROPERTY_OF[name]
    if (!property || typeof avplay.setStreamingProperty !== 'function') {
      report.refused.push(name)
      continue
    }
    try {
      avplay.setStreamingProperty(property, value)
      report.applied.push(name)
    } catch {
      report.refused.push(name)
    }
  }
  return report
}

const ASPECT_MODES_AVPLAY: AspectMode[] = ['fit', 'fill', 'original', 'zoom']
const ZOOM_FACTOR = 1.1

function applyAspect(avplay: AvplayApi, region: PlayerRegion, mode: AspectMode): void {
  if (typeof avplay.setDisplayMethod !== 'function') throw new Error('setDisplayMethod ausente')
  let rect = { x: region.x, y: region.y, width: region.width, height: region.height }
  let method = 'PLAYER_DISPLAY_MODE_LETTER_BOX'
  if (mode === 'fill') {
    method = 'PLAYER_DISPLAY_MODE_FULL_SCREEN'
  } else if (mode === 'original') {
    const info = readStreamInfo(avplay)
    if (info?.width === undefined || info.height === undefined) throw new Error('tamanho do vídeo desconhecido')
    const width = Math.min(info.width, region.width)
    const height = Math.min(info.height, region.height)
    rect = {
      x: region.x + Math.round((region.width - width) / 2),
      y: region.y + Math.round((region.height - height) / 2),
      width,
      height,
    }
  } else if (mode === 'zoom') {
    const width = Math.round(region.width * ZOOM_FACTOR)
    const height = Math.round(region.height * ZOOM_FACTOR)
    rect = {
      x: region.x - Math.round((width - region.width) / 2),
      y: region.y - Math.round((height - region.height) / 2),
      width,
      height,
    }
  }
  avplay.setDisplayRect(rect.x, rect.y, rect.width, rect.height)
  avplay.setDisplayMethod(method)
}

export function createAvplayAdapter(callbacks: PlayerAdapterCallbacks): PlayerAdapter {
  let opened = false
  let state: PlayerState = 'idle'
  let lastPlayTime: number | undefined

  function reportState(next: PlayerState) {
    if (!opened || state === 'error' || state === 'completed' || state === 'closed') return
    if (next === 'buffering') lastPlayTime = undefined
    if (state === next) return
    state = next
    callbacks.onStateChange(next)
  }

  function reportError(error: unknown) {
    if (!opened || state === 'error' || state === 'completed' || state === 'closed') return
    state = 'error'
    callbacks.onError(toPlayerError(error))
  }
  let displayRegion: PlayerRegion = { x: 0, y: 0, width: 1920, height: 1080 }
  /** Índice VIDEO forçado por `selectQuality`; `null` = adaptativo (Auto). */
  let forcedVideoIndex: number | null = null
  /** Feature 058: o que a última `open` aplicou/recusou — só nomes. */
  let lastHeadersReport: RequestHeadersReport = NO_REQUEST_HEADERS

  return {
    name: 'avplay',
    // O vídeo sai num plano de hardware atrás da camada web — ver o cabeçalho
    // deste arquivo. A camada de reprodução usa isso para liberar a área.
    rendersOnHardwarePlane: true,
    capabilities: AVPLAY_CAPABILITIES,

    open(url: string, region: PlayerRegion, startAtMs?: number, headers?: RequestHeaders): void {
      const avplay = getAvplay()
      if (!avplay) {
        lastHeadersReport = NO_REQUEST_HEADERS
        callbacks.onError({ code: null, message: 'Player da TV indisponível.' })
        return
      }

      avplay.open(url)
      opened = true
      state = 'preparing'
      lastPlayTime = undefined
      displayRegion = region
      // Feature 058: headers da lista no estado IDLE. Uma abertura sem headers
      // não toca em propriedade nenhuma — nada vaza de um item para o outro.
      lastHeadersReport = applyHeaders(avplay, headers)

      avplay.setListener({
        onbufferingstart: () => reportState('buffering'),
        onbufferingcomplete: () => reportState('playing'),
        oncurrentplaytime: (currentTimeMs: number) => {
          if (!opened || state === 'error' || state === 'completed' || state === 'closed') return
          if (!Number.isFinite(currentTimeMs) || currentTimeMs < 0) return
          // Alguns streams não avisam bufferingcomplete. Dois tempos crescentes
          // confirmam reprodução real; tempo parado e pausa não liberam o aviso.
          if (state === 'buffering' && lastPlayTime !== undefined && currentTimeMs > lastPlayTime) {
            reportState('playing')
          }
          lastPlayTime = currentTimeMs
          callbacks.onProgress?.({
            positionMs: currentTimeMs,
            durationMs: safeDuration(avplay),
          })
        },
        // Fim de mídia é um FATO, não um veredito — quem decide se é
        // conclusão normal (filme) ou falha de fornecimento (canal ao vivo)
        // é a sessão, pela capacidade resolvida da mídia (D-008).
        onstreamcompleted: () => {
          if (!opened || state === 'error' || state === 'completed' || state === 'closed') return
          state = 'completed'
          callbacks.onCompleted?.()
        },
        onerror: reportError,
        // Só o texto e a duração atravessam; `type`/`attributes` (estilo do
        // stream) são ignorados de propósito — o estilo é o do DS (D-004).
        onsubtitlechange: (duration: string, text: string) => {
          callbacks.onSubtitle?.({ text: typeof text === 'string' ? text : '', durationMs: Number(duration) || 0 })
        },
      })

      // Legenda começa desativada (D-005): sem isto, uma legenda marcada como
      // padrão no stream apareceria sem a pessoa ter pedido.
      try {
        avplay.setSilentSubtitle?.(true)
      } catch {
        /* estado sem suporte a legenda — nada a silenciar */
      }

      avplay.setDisplayRect(region.x, region.y, region.width, region.height)

      avplay.prepareAsync(
        () => {
          if (!opened || state === 'error' || state === 'completed' || state === 'closed') return
          // Não sobrescreve um bufferingcomplete anterior ao sucesso do prepare.
          // Preparado espera buffering completo ou tempo real crescente.
          if (state === 'preparing') reportState('buffering')
          if (startAtMs !== undefined && startAtMs > 0) {
            // Busca ANTES do play(): evita o filme aparecer do início por um
            // instante antes de saltar pra retomada (logic/reproducao-vod.md
            // §5). Toca de qualquer forma no sucesso OU na falha da busca —
            // uma retomada recusada não é motivo pra não reproduzir.
            avplay.seekTo(
              startAtMs,
              () => avplay.play(),
              () => avplay.play(),
            )
          } else {
            avplay.play()
          }
        },
        reportError,
      )
    },

    requestHeadersReport(): RequestHeadersReport {
      return lastHeadersReport
    },

    pause(): void {
      const avplay = getAvplay()
      if (!avplay) return
      try {
        avplay.pause()
        reportState('paused')
      } catch (error) {
        reportError(error)
      }
    },

    resume(): void {
      const avplay = getAvplay()
      if (!avplay) return
      try {
        // Não há resume() na API: play() também retoma de PAUSED.
        avplay.play()
        reportState('playing')
      } catch (error) {
        reportError(error)
      }
    },

    seekTo(positionMs: number, onSettled: () => void): void {
      const avplay = getAvplay()
      if (!avplay) {
        onSettled()
        return
      }
      try {
        avplay.seekTo(positionMs, onSettled, onSettled)
      } catch {
        // Libera a porta mesmo numa falha síncrona — nunca deixa a próxima
        // busca travada (contrato §5). Sem mensagem de erro pro usuário: uma
        // busca recusada perto do limite não é uma falha de reprodução.
        onSettled()
      }
    },

    jumpBy(deltaMs: number, onSettled: () => void): void {
      const avplay = getAvplay()
      if (!avplay) {
        onSettled()
        return
      }
      try {
        if (deltaMs >= 0) {
          avplay.jumpForward(deltaMs, onSettled, onSettled)
        } else {
          avplay.jumpBackward(-deltaMs, onSettled, onSettled)
        }
      } catch {
        onSettled()
      }
    },

    getTracks(): MediaTrack[] | null {
      const avplay = getAvplay()
      if (!avplay) return null
      try {
        return readTracks(avplay)
      } catch {
        return null
      }
    },

    selectAudioTrack(id: string): boolean {
      const avplay = getAvplay()
      if (!avplay?.setSelectTrack) return false
      try {
        avplay.setSelectTrack('AUDIO', Number(id))
        return true
      } catch {
        return false
      }
    },

    selectTextTrack(id: string | null): boolean {
      const avplay = getAvplay()
      if (!avplay) return false
      try {
        if (id === null) {
          if (!avplay.setSilentSubtitle) return false
          avplay.setSilentSubtitle(true)
          return true
        }
        if (!avplay.setSelectTrack) return false
        avplay.setSelectTrack('TEXT', Number(id))
        avplay.setSilentSubtitle?.(false)
        return true
      } catch {
        return false
      }
    },

    getStreamInfo(): StreamInfo | null {
      const avplay = getAvplay()
      if (!avplay) return null
      try {
        return readStreamInfo(avplay)
      } catch {
        return null
      }
    },

    // Feature 041: aspecto provado na TV (ver `applyAspect`). Os quatro modos.
    getAspectModes(): AspectMode[] {
      return [...ASPECT_MODES_AVPLAY]
    },

    setAspectMode(mode: AspectMode): boolean {
      const avplay = getAvplay()
      if (!avplay || !opened) return false
      try {
        applyAspect(avplay, displayRegion, mode)
        return true
      } catch {
        // Erro do motor nunca repassado (pode embutir a URL).
        return false
      }
    },

    // Qualidade (feature 041, R0-2). PROVADO na TV: `getTotalTrackInfo()` devolve
    // a entrada VIDEO de um stream de qualidade única (o botão mostra "só uma
    // disponível"). NÃO provado (nenhum stream multi-variante disponível):
    // `setSelectTrack('VIDEO', i)` trocando de fato a resolução. Falha segura —
    // se a TV recusar, `false` e a sessão segue na variante anterior (FR-007).
    getQualities(): QualityOption[] | null {
      const avplay = getAvplay()
      if (!avplay) return null
      try {
        return readQualities(avplay)
      } catch {
        return null
      }
    },

    selectQuality(id: string | null): boolean {
      const avplay = getAvplay()
      if (!avplay || !opened) return false
      try {
        if (id === null) {
          // Voltar ao adaptativo exigiria reabrir o stream (R-002, não provado):
          // sem variante forçada já é Auto (nada a fazer); com uma forçada,
          // recusa honestamente em vez de fingir.
          return forcedVideoIndex === null
        }
        if (!avplay.setSelectTrack) return false
        avplay.setSelectTrack('VIDEO', Number(id))
        forcedVideoIndex = Number(id)
        return true
      } catch {
        return false
      }
    },

    close(): void {
      const avplay = getAvplay()
      if (!avplay || !opened) return
      opened = false
      state = 'closed'
      lastPlayTime = undefined
      // `stop` antes de `close`: fechar sem parar deixa áudio tocando em
      // alguns firmwares. Cada um em seu try para uma falha não impedir a
      // outra — sair sem áudio residual é o que importa aqui.
      try {
        avplay.stop()
      } catch {
        /* estado já terminal no motor */
      }
      try {
        avplay.close()
      } catch {
        /* idem */
      }
    },
  }
}
