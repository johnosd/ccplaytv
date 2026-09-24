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
 * reporta algo; `message` é texto para o usuário.
 *
 * Invariante: nem `code` nem `message` podem conter a URL do stream, o
 * endereço do provedor ou credenciais (constitution, "Segredos Fora dos
 * Clientes e dos Logs"). Os adaptadores são responsáveis por não repassar o
 * erro bruto do motor, que costuma embutir a URL.
 */
export interface PlayerError {
  code: string | null
  message: string
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
    })
    this._rendersOnHardwarePlane = this.adapter.rendersOnHardwarePlane
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

  private emit(): void {
    for (const listener of this.listeners) listener()
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

// Importações no fim para evitar ciclo: os adaptadores dependem dos tipos
// declarados acima.
import { createAvplayAdapter, hasAvplay } from './avplayAdapter'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
