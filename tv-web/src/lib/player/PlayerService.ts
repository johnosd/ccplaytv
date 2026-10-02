/**
 * Abstração de reprodução (ADR-001 §2): as telas falam com este contrato e
 * nunca com `webapis.avplay` direto.
 *
 * Duas coisas que o contrato precisa esconder, e que são a razão dele existir:
 *
 * 1. **Estados.** O AVPlay tem a própria máquina (`NONE`/`IDLE`/`READY`/
 *    `PLAYING`/`PAUSED`) e `prepareAsync` sinaliza sucesso ANTES de o vídeo
 *    começar. Traduzir isso em cada tela espalharia conhecimento do motor pela
 *    UI. Aqui a máquina é própria e menor.
 * 2. **Onde o vídeo aparece.** O AVPlay desenha num plano de hardware ATRÁS da
 *    camada web — não é um nó do DOM, não respeita CSS. Por isso a região de
 *    exibição é declarada por coordenadas, e não "onde o elemento estiver".
 *    O adaptador `<video>` ignora a região; o de AVPlay a traduz.
 *
 * Feature 011 (assistir filme, com retomada) estendeu este contrato com
 * capacidades por sessão (motor ∩ mídia — ver `capabilities.ts`), pausa,
 * busca, progresso e o estado `completed`. Ver
 * `sdd/specs/011-assistir-filme-retomada/contracts/player-capabilities.md`.
 */

import {
  resolveCapabilities,
  type EngineCapabilities,
  type PlayableKind,
  type PlayerCapabilities,
  type PlayerProgress,
} from './capabilities'
import type { MediaTrack, StreamInfo, SubtitleCue } from './tracks'
import { ASPECT_MODES, type AspectMode, type QualityOption } from './viewChoice'

export type PlayerState =
  | 'idle'
  | 'preparing'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error'
  | 'closed'

/**
 * Região de exibição em coordenadas do palco 1920x1080 (ADR-007 §2) — não em
 * pixels de tela, que variam com a escala aplicada ao palco.
 */
export interface PlayerRegion {
  x: number
  y: number
  width: number
  height: number
}

export const FULLSCREEN_REGION: PlayerRegion = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
}

/**
 * Falha de reprodução já sanitizada. `code` é o que o motor reportou, quando
 * reporta algo; `message` é texto para o usuário, e fica **ausente** quando
 * quem falha é o motor sem saber mais do que "não tocou": o motor não sabe
 * se o item é canal, filme ou episódio, então quem apresenta o erro usa a
 * sua própria mensagem genérica (`PlayerLayer`, prop `genericErrorMessage`).
 *
 * Invariante: nem `code` nem `message` podem conter a URL do stream, o
 * endereço do provedor ou credenciais (constitution, "Segredos Fora dos
 * Clientes e dos Logs"). Os adaptadores são responsáveis por não repassar o
 * erro bruto do motor, que costuma embutir a URL.
 */
export interface PlayerError {
  code: string | null
  message?: string
}

export interface PlayerAdapter {
  /** Nome para diagnóstico. Nunca inclui dado sensível. */
  readonly name: string
  /**
   * `true` quando o motor pinta num plano de hardware ATRÁS da camada web
   * (AVPlay), `false` quando desenha num nó do DOM (`<video>`).
   *
   * É uma **capacidade**, não a identidade do motor: a UI precisa saber que
   * a área do vídeo tem de ficar transparente para o plano aparecer, mas
   * continua sem saber qual adaptador está ativo (D-007 do plano da 003).
   * Fundo opaco sobre esse plano produz áudio sem imagem — bug
   * `sdd/bugs/live-tv-toca-audio-sem-imagem`.
   */
  readonly rendersOnHardwarePlane: boolean
  /**
   * O que este MOTOR sabe fazer, sem considerar a mídia. A sessão resolve
   * isto contra `mediaCapabilities(kind)` — nunca é a palavra final sozinha
   * (contrato §1/§2; D-001/D-002 do plano).
   */
  readonly capabilities: EngineCapabilities

  /**
   * `startAtMs`, quando presente, DEVE ser aplicado antes de a reprodução
   * começar (a sessão só o passa depois de já ter resolvido `canSeek` —
   * contrato §4.1). É o que evita o filme aparecer do início por um instante
   * antes de saltar pra posição de retomada.
   */
  open(url: string, region: PlayerRegion, startAtMs?: number): void
  close(): void

  /** Só chamado quando a sessão resolveu `canPause`. */
  pause?(): void
  /** Só chamado quando a sessão resolveu `canPause`. */
  resume?(): void
  /**
   * Destino absoluto em ms, já grampeado aos limites conhecidos pela sessão.
   * Só chamado quando `canSeek`. `onSettled` DEVE rodar tanto no sucesso
   * quanto na falha — é o que libera a porta single-flight (contrato §5).
   */
  seekTo?(positionMs: number, onSettled: () => void): void
  /**
   * Deslocamento relativo em ms (negativo retrocede), já grampeado. Só
   * chamado quando `canSeek`. Mesma regra de `onSettled` de `seekTo`.
   */
  jumpBy?(deltaMs: number, onSettled: () => void): void

  /**
   * Feature 029 (`logic/faixas-e-legendas.md` §1). Todos opcionais: motor
   * sem o método = capacidade ausente (botão soft disabled, FR-002).
   * `null` = o motor tem a API mas não conseguiu informar agora.
   */
  getTracks?(): MediaTrack[] | null
  /** `true` se o motor aceitou a troca. Nunca reinicia a mídia (FR-006). */
  selectAudioTrack?(id: string): boolean
  /** `null` desativa a legenda. `true` se o motor aceitou. */
  selectTextTrack?(id: string | null): boolean
  getStreamInfo?(): StreamInfo | null

  /**
   * Feature 041 (`logic/aspecto-qualidade.md` §1/§2). Mesma regra da 029:
   * método ausente = capacidade ausente (controle "— indisponível").
   * Modos que este motor de fato aplica — fixos por motor, provados no spike
   * da TV (R-001); lista vazia = nenhum.
   */
  getAspectModes?(): AspectMode[]
  /** `true` se o motor aceitou. Nunca reinicia a mídia nem mexe na posição. */
  setAspectMode?(mode: AspectMode): boolean
  /** Variantes que o stream anuncia agora, ou `null` (não conseguiu informar). */
  getQualities?(): QualityOption[] | null
  /** `null` = Auto (adaptativo). `true` se o motor aceitou (R-002: pode reabrir por dentro). */
  selectQuality?(id: string | null): boolean
}

export interface PlayerAdapterCallbacks {
  onStateChange(state: PlayerState): void
  onError(error: PlayerError): void
  /** Posição/duração empurradas pelo motor (R0-3). */
  onProgress?(progress: PlayerProgress): void
  /**
   * A mídia chegou ao fim por conta própria. A SESSÃO decide se isso é
   * conclusão normal (filme) ou falha de fornecimento (canal ao vivo,
   * D-008) — o adaptador só relata o fato.
   */
  onCompleted?(): void
  /** Feature 029: linha de legenda embutida entregue pelo motor (texto vazio = apagar). */
  onSubtitle?(cue: SubtitleCue): void
}

export type PlayerAdapterFactory = (callbacks: PlayerAdapterCallbacks) => PlayerAdapter

export interface PlayerSession {
  readonly state: PlayerState
  readonly error: PlayerError | null
  /** Ver `PlayerAdapter.rendersOnHardwarePlane`. */
  readonly rendersOnHardwarePlane: boolean
  /** Capacidades já resolvidas (motor ∩ mídia) — nunca a identidade do motor. */
  readonly capabilities: PlayerCapabilities
  /** Último progresso informado pelo motor, ou `null` antes do primeiro. */
  readonly progress: PlayerProgress | null
  /** O motor sabe listar/trocar faixas (feature 029). Falso = botão "— indisponível". */
  readonly supportsTracks: boolean
  /** O motor sabe informar dados técnicos do stream (feature 029). */
  readonly supportsStreamInfo: boolean

  /** Faixas atuais, ou `null` (motor sem a API, sessão fechada, ou falha agora). */
  getTracks(): MediaTrack[] | null
  /** `true` se o motor aceitou. Não reinicia a mídia nem mexe na posição. */
  selectAudioTrack(id: string): boolean
  /** `null` desativa a legenda. `true` se o motor aceitou. */
  selectTextTrack(id: string | null): boolean
  getStreamInfo(): StreamInfo | null
  /** `null` = apagar a linha exibida. Devolve a função que cancela a assinatura. */
  subscribeSubtitles(listener: (cue: SubtitleCue | null) => void): () => void

  /** Feature 041: modos que o motor aplica (ordem de `ASPECT_MODES`); `[]` = nenhum. */
  readonly aspectModes: readonly AspectMode[]
  /** Último modo que o motor aceitou nesta sessão, ou `null`. */
  readonly currentAspect: AspectMode | null
  /** `false`: sessão fechada, modo fora de `aspectModes` ou o motor recusou. Nunca pausa nem salta. */
  setAspectMode(mode: AspectMode): boolean
  /** O motor sabe listar e trocar variantes. Falso = "Qualidade — indisponível". */
  readonly supportsQuality: boolean
  /** Variantes que o stream anuncia (cru do motor), ou `null`. */
  getQualities(): QualityOption[] | null
  /** Id da variante aceita pelo motor; `null` = Auto. */
  readonly selectedQualityId: string | null
  /** `null` = Auto. `true` só se o motor aceitou (e só então `selectedQualityId` muda). */
  selectQuality(id: string | null): boolean

  /** Sem efeito se `!capabilities.canPause`. */
  togglePause(): void
  /** Sem efeito se `!capabilities.canSeek`. Destino é grampeado aos limites conhecidos. */
  seekTo(positionMs: number): void
  /** Sem efeito se `!capabilities.canSeek`. Ver a porta single-flight, §3 da lógica. */
  jumpBy(deltaMs: number): void

  close(): void
}

export interface PlayerServiceOptions {
  /** Injetável para teste; na aplicação vem de `resolveAdapterFactory()`. */
  createAdapter?: PlayerAdapterFactory
  /** Posição inicial em ms, aplicada só depois de o motor ficar pronto. */
  startAtMs?: number
}

/**
 * Transições permitidas. Existe para o serviço nunca voltar de um estado
 * terminal por causa de um callback atrasado do motor — o cuidado que o guia
 * Samsung 06 pede ao trocar de mídia rapidamente.
 *
 * `paused`/`completed` entraram na feature 011. `completed` é terminal exceto
 * por `closed`, como `error` — mesma proteção contra callback atrasado.
 */
const ALLOWED_NEXT: Record<PlayerState, PlayerState[]> = {
  idle: ['preparing', 'closed'],
  preparing: ['buffering', 'playing', 'error', 'closed'],
  buffering: ['playing', 'paused', 'error', 'closed'],
  playing: ['buffering', 'paused', 'completed', 'error', 'closed'],
  paused: ['playing', 'buffering', 'error', 'closed'],
  completed: ['closed'],
  error: ['closed'],
  closed: [],
}

export function canTransition(from: PlayerState, to: PlayerState): boolean {
  return ALLOWED_NEXT[from].includes(to)
}

/**
 * Um destino ABSOLUTO pendente enquanto uma busca está em voo (contrato §5,
 * logic §3). Só `seekTo` enfileira — `jumpBy` não usa mais este mecanismo
 * (R-019: acumular deltas de `jumpBy` produzia saltos gigantes na TV real).
 */
type PendingSeek = { kind: 'absolute'; value: number }

/**
 * Uma sessão de reprodução. Criada por play, encerrada por `close()`, nunca
 * reaproveitada — "tentar de novo" cria uma sessão nova, com uma URL nova
 * buscada pelo id do item (ADR-002 §5: a URL pode expirar ou ser revogada).
 */
export class PlayerServiceSession implements PlayerSession {
  private _state: PlayerState = 'idle'
  private _error: PlayerError | null = null
  private _progress: PlayerProgress | null = null
  private adapter: PlayerAdapter | null = null
  // Copiado na construção: `adapter` é anulado no `close()`, e a camada de
  // reprodução ainda precisa saber como desmontar o fundo depois disso.
  private readonly _rendersOnHardwarePlane: boolean
  private readonly _capabilities: PlayerCapabilities
  private readonly listeners = new Set<() => void>()

  // Feature 029 (`logic/faixas-e-legendas.md` §1.4). Legenda começa
  // desativada (D-005): enquanto `selectedTextId` for `null`, linhas do motor
  // são descartadas. Nada disso passa pelo `emit()` de estado/progresso —
  // uma linha de legenda nunca deve re-renderizar quem assina a sessão.
  private selectedTextId: string | null = null
  private lastAudioId: string | undefined
  private readonly subtitleListeners = new Set<(cue: SubtitleCue | null) => void>()
  readonly supportsTracks: boolean
  readonly supportsStreamInfo: boolean
  /** Feature 042: `PlayerAdapter.name` (nunca inclui dado sensível) — vai para a "Info técnica". */
  readonly engine: string

  // Feature 041 (`logic/aspecto-qualidade.md` §1.1/§2.3). Como as faixas da
  // 029: método ausente = capacidade ausente; fora do `emit()` de estado.
  readonly aspectModes: readonly AspectMode[]
  readonly supportsQuality: boolean
  private _currentAspect: AspectMode | null = null
  private _selectedQualityId: string | null = null

  // Porta single-flight de saltos (contrato §5; logic/reproducao-vod.md §3).
  private seekInFlight = false
  private pendingSeek: PendingSeek | null = null

  constructor(
    url: string,
    region: PlayerRegion,
    kind: PlayableKind,
    createAdapter: PlayerAdapterFactory,
    startAtMs?: number,
  ) {
    this.adapter = createAdapter({
      onStateChange: (state) => this.applyState(state),
      onError: (error) => this.applyError(error),
      onProgress: (progress) => this.applyProgress(progress),
      onCompleted: () => this.applyCompleted(),
      onSubtitle: (cue) => this.applySubtitle(cue),
    })
    this._rendersOnHardwarePlane = this.adapter.rendersOnHardwarePlane
    this.engine = this.adapter.name
    this.supportsTracks = typeof this.adapter.getTracks === 'function'
    this.supportsStreamInfo = typeof this.adapter.getStreamInfo === 'function'
    this.aspectModes = readAspectModes(this.adapter)
    this.supportsQuality =
      typeof this.adapter.getQualities === 'function' && typeof this.adapter.selectQuality === 'function'
    // Resolvida uma vez, na construção: nem o motor nem o tipo de mídia mudam
    // durante a vida da sessão (D-001).
    this._capabilities = resolveCapabilities(this.adapter.capabilities, kind)
    this.applyState('preparing')
    try {
      // A sessão decide SE repassa `startAtMs` (precisa de `canSeek` já
      // resolvido); o adaptador só decide COMO aplicá-lo, antes do play()
      // (contrato §4.1).
      const effectiveStartAtMs =
        this._capabilities.canSeek && startAtMs !== undefined && startAtMs > 0
          ? startAtMs
          : undefined
      this.adapter.open(url, region, effectiveStartAtMs)
    } catch {
      // A exceção original fica de fora de propósito: mensagens de erro de
      // rede/motor costumam embutir a URL, que carrega credencial.
      this.applyError({ code: null, message: 'Não foi possível iniciar a reprodução.' })
    }
  }

  get state(): PlayerState {
    return this._state
  }

  get error(): PlayerError | null {
    return this._error
  }

  get rendersOnHardwarePlane(): boolean {
    return this._rendersOnHardwarePlane
  }

  get capabilities(): PlayerCapabilities {
    return this._capabilities
  }

  get progress(): PlayerProgress | null {
    return this._progress
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  togglePause(): void {
    if (!this._capabilities.canPause) return
    if (this._state === 'playing' || this._state === 'buffering') {
      this.adapter?.pause?.()
    } else if (this._state === 'paused') {
      this.adapter?.resume?.()
    }
  }

  seekTo(positionMs: number): void {
    if (!this._capabilities.canSeek) return
    if (this.seekInFlight) {
      // Substitui qualquer pendente — um destino absoluto novo não se soma
      // ao anterior (logic/reproducao-vod.md §3).
      this.pendingSeek = { kind: 'absolute', value: positionMs }
      return
    }
    this.dispatchSeek(positionMs)
  }

  jumpBy(deltaMs: number): void {
    if (!this._capabilities.canSeek) return
    // Descarta enquanto um salto está em voo — não acumula (R-019, achado na
    // TV física). Segurar a seta emite dezenas de eventos de tecla repetida
    // em poucos segundos; acumular todos produzia UM salto do tamanho da
    // soma quando o motor finalmente respondia (às vezes minutos), e a
    // restrição real da API ("outras chamadas ficam restritas durante a
    // operação") transformava isso numa fila de saltos enormes um atrás do
    // outro — o app parecia congelado. Descartar é previsível: no máximo um
    // salto de 10s por vez, e o próximo toque já mantido pressionado dispara
    // assim que o anterior liberar a porta.
    if (this.seekInFlight) return
    this.dispatchJump(deltaMs)
  }

  getTracks(): MediaTrack[] | null {
    const adapter = this.adapter
    if (this._state === 'closed' || !adapter?.getTracks) return null
    let raw: MediaTrack[] | null
    try {
      raw = adapter.getTracks()
    } catch {
      return null
    }
    if (!raw) return null
    // O AVPlay não informa a legenda ativa: a sessão é a fonte da verdade.
    // Áudio vem do motor; só se o motor não marcar nenhuma, vale a última
    // troca aceita.
    const engineHasActiveAudio = raw.some((t) => t.kind === 'audio' && t.active)
    return raw.map((track) => {
      if (track.kind === 'text') return { ...track, active: track.id === this.selectedTextId }
      if (!engineHasActiveAudio && this.lastAudioId !== undefined) {
        return { ...track, active: track.id === this.lastAudioId }
      }
      return track
    })
  }

  selectAudioTrack(id: string): boolean {
    const adapter = this.adapter
    if (this._state === 'closed' || !adapter?.selectAudioTrack) return false
    let ok = false
    try {
      ok = adapter.selectAudioTrack(id)
    } catch {
      ok = false
    }
    if (ok) this.lastAudioId = id
    return ok
  }

  selectTextTrack(id: string | null): boolean {
    const adapter = this.adapter
    if (this._state === 'closed' || !adapter?.selectTextTrack) return false
    let ok = false
    try {
      ok = adapter.selectTextTrack(id)
    } catch {
      ok = false
    }
    if (ok) {
      this.selectedTextId = id
      // A linha da faixa anterior (ou de "Desativadas") sai da tela na hora.
      this.emitSubtitle(null)
    }
    return ok
  }

  getStreamInfo(): StreamInfo | null {
    const adapter = this.adapter
    if (this._state === 'closed' || !adapter?.getStreamInfo) return null
    try {
      return adapter.getStreamInfo()
    } catch {
      return null
    }
  }

  subscribeSubtitles(listener: (cue: SubtitleCue | null) => void): () => void {
    this.subtitleListeners.add(listener)
    return () => {
      this.subtitleListeners.delete(listener)
    }
  }

  get currentAspect(): AspectMode | null {
    return this._currentAspect
  }

  get selectedQualityId(): string | null {
    return this._selectedQualityId
  }

  setAspectMode(mode: AspectMode): boolean {
    const adapter = this.adapter
    if (this._state === 'closed' || !adapter?.setAspectMode || !this.aspectModes.includes(mode)) return false
    let ok = false
    try {
      ok = adapter.setAspectMode(mode)
    } catch {
      ok = false
    }
    if (ok) this._currentAspect = mode
    return ok
  }

  getQualities(): QualityOption[] | null {
    const adapter = this.adapter
    if (this._state === 'closed' || !adapter?.getQualities) return null
    try {
      return adapter.getQualities()
    } catch {
      return null
    }
  }

  selectQuality(id: string | null): boolean {
    const adapter = this.adapter
    if (this._state === 'closed' || !adapter?.selectQuality) return false
    let ok = false
    try {
      ok = adapter.selectQuality(id)
    } catch {
      ok = false
    }
    if (ok) this._selectedQualityId = id
    return ok
  }

  close(): void {
    if (this._state === 'closed') return
    try {
      this.adapter?.close()
    } finally {
      this.adapter = null
      this._state = 'closed'
      this.emit()
    }
  }

  private dispatchSeek(positionMs: number): void {
    const clamped = this.clampSeekTarget(positionMs)
    this.seekInFlight = true
    this.adapter?.seekTo?.(clamped, () => this.onSeekSettled())
  }

  private dispatchJump(deltaMs: number): void {
    const clamped = this.clampJumpDelta(deltaMs)
    this.seekInFlight = true
    this.adapter?.jumpBy?.(clamped, () => this.onSeekSettled())
  }

  private onSeekSettled(): void {
    this.seekInFlight = false
    const pending = this.pendingSeek
    this.pendingSeek = null
    // Só `seekTo` (destino absoluto) ainda enfileira — `jumpBy` descarta
    // direto em `jumpBy()`, nunca chega a ter pendente aqui (R-019).
    if (pending) this.seekTo(pending.value)
  }

  /**
   * Grampeia um destino absoluto a `[0, duração)`. Sem duração conhecida, só
   * o limite inferior é aplicado — nada é estimado (spec, Edge Cases; T007).
   */
  private clampSeekTarget(positionMs: number): number {
    const lower = Math.max(0, positionMs)
    const duration = this._progress?.durationMs
    if (duration === undefined || duration <= 0) return lower
    // Último instante VÁLIDO, não a duração exata: alcançar o fim por busca
    // não pode ser um atalho para "concluído" (só o motor real conclui).
    return Math.min(lower, duration - 1)
  }

  /**
   * Grampeia um deslocamento relativo usando a última posição conhecida como
   * referência. Mesma regra de limite inferior/superior de `clampSeekTarget`.
   */
  private clampJumpDelta(deltaMs: number): number {
    const position = this._progress?.positionMs ?? 0
    const minDelta = -position
    const duration = this._progress?.durationMs
    if (duration === undefined || duration <= 0) {
      return Math.max(deltaMs, minDelta)
    }
    const maxDelta = duration - 1 - position
    return Math.max(minDelta, Math.min(deltaMs, maxDelta))
  }

  private applyState(next: PlayerState): void {
    if (this._state === next) return
    if (!canTransition(this._state, next)) return
    this._state = next
    this.emit()
  }

  private applyError(error: PlayerError): void {
    if (!canTransition(this._state, 'error')) return
    this._error = error
    this._state = 'error'
    this.emit()
  }

  private applyProgress(progress: PlayerProgress): void {
    if (this._state === 'closed') return
    this._progress = progress
    this.emit()
  }

  /**
   * Fim de mídia relatado pelo motor. A tradução depende só da capacidade
   * resolvida da MÍDIA, nunca do tipo de motor (D-002, D-008):
   * `reportsDuration` verdadeiro (filme, episódio) é conclusão normal;
   * falso (canal ao vivo) é falha de fornecimento — mantém a mensagem que a
   * Live TV já usa hoje, sem regressão (FR-021/FR-022).
   */
  private applyCompleted(): void {
    if (this._capabilities.reportsDuration) {
      if (!canTransition(this._state, 'completed')) return
      this._state = 'completed'
      this.emit()
      return
    }
    this.applyError({ code: 'stream_completed', message: 'A transmissão foi interrompida.' })
  }

  /** Linha do motor: só passa com uma legenda selecionada (D-005) e sessão aberta. */
  private applySubtitle(cue: SubtitleCue): void {
    if (this._state === 'closed' || this.selectedTextId === null) return
    this.emitSubtitle(cue)
  }

  private emitSubtitle(cue: SubtitleCue | null): void {
    for (const listener of this.subtitleListeners) listener(cue)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

/** `ASPECT_MODES ∩ getAspectModes()`, na ordem de `ASPECT_MODES`; `[]` sem o método ou se ele lançar. */
function readAspectModes(adapter: PlayerAdapter): readonly AspectMode[] {
  if (typeof adapter.getAspectModes !== 'function') return []
  try {
    const declared = adapter.getAspectModes()
    return ASPECT_MODES.filter((mode) => declared.includes(mode))
  } catch {
    return []
  }
}

/**
 * `kind` é obrigatório e sem valor padrão (D-004): um padrão `'channel'`
 * faria um filme perder a barra por esquecimento numa chamada nova, sem
 * erro de compilação — exatamente o tipo de falha silenciosa que o contrato
 * existe para impedir.
 */
export function createPlayerSession(
  url: string,
  region: PlayerRegion,
  kind: PlayableKind,
  options: PlayerServiceOptions = {},
): PlayerServiceSession {
  const factory = options.createAdapter ?? resolveAdapterFactory()
  return new PlayerServiceSession(url, region, kind, factory, options.startAtMs)
}

/**
 * Escolhe o motor em tempo de execução. As telas não sabem qual está ativo —
 * é o ponto do contrato (D-007 do plano da spec 003).
 */
export function resolveAdapterFactory(): PlayerAdapterFactory {
  if (hasAvplay()) return createAvplayAdapter
  return createHtmlVideoAdapter
}

export type { PlayableKind, PlayerCapabilities, PlayerProgress } from './capabilities'
export type { MediaTrack, StreamInfo, SubtitleCue, TrackChoice } from './tracks'
export type { AspectMode, QualityChoice, QualityOption, ViewChoice } from './viewChoice'

// Importações no fim para evitar ciclo: os adaptadores dependem dos tipos
// declarados acima.
import { createAvplayAdapter, hasAvplay } from './avplayAdapter'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
