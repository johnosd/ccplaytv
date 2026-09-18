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
 */

export type PlayerState =
  | 'idle'
  | 'preparing'
  | 'buffering'
  | 'playing'
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
  open(url: string, region: PlayerRegion): void
  close(): void
}

export interface PlayerAdapterCallbacks {
  onStateChange(state: PlayerState): void
  onError(error: PlayerError): void
}

export type PlayerAdapterFactory = (callbacks: PlayerAdapterCallbacks) => PlayerAdapter

export interface PlayerSession {
  readonly state: PlayerState
  readonly error: PlayerError | null
  /** Ver `PlayerAdapter.rendersOnHardwarePlane`. */
  readonly rendersOnHardwarePlane: boolean
  close(): void
}

export interface PlayerServiceOptions {
  /** Injetável para teste; na aplicação vem de `resolveAdapterFactory()`. */
  createAdapter?: PlayerAdapterFactory
}

/**
 * Transições permitidas. Existe para o serviço nunca voltar de um estado
 * terminal por causa de um callback atrasado do motor — o cuidado que o guia
 * Samsung 06 pede ao trocar de mídia rapidamente.
 */
const ALLOWED_NEXT: Record<PlayerState, PlayerState[]> = {
  idle: ['preparing', 'closed'],
  preparing: ['buffering', 'playing', 'error', 'closed'],
  buffering: ['playing', 'error', 'closed'],
  playing: ['buffering', 'error', 'closed'],
  error: ['closed'],
  closed: [],
}

export function canTransition(from: PlayerState, to: PlayerState): boolean {
  return ALLOWED_NEXT[from].includes(to)
}

/**
 * Uma sessão de reprodução. Criada por play, encerrada por `close()`, nunca
 * reaproveitada — "tentar de novo" cria uma sessão nova, com uma URL nova
 * buscada pelo id do item (ADR-002 §5: a URL pode expirar ou ser revogada).
 */
export class PlayerServiceSession implements PlayerSession {
  private _state: PlayerState = 'idle'
  private _error: PlayerError | null = null
  private adapter: PlayerAdapter | null = null
  // Copiado na construção: `adapter` é anulado no `close()`, e a camada de
  // reprodução ainda precisa saber como desmontar o fundo depois disso.
  private readonly _rendersOnHardwarePlane: boolean
  private readonly listeners = new Set<() => void>()

  constructor(
    url: string,
    region: PlayerRegion,
    createAdapter: PlayerAdapterFactory,
  ) {
    this.adapter = createAdapter({
      onStateChange: (state) => this.applyState(state),
      onError: (error) => this.applyError(error),
    })
    this._rendersOnHardwarePlane = this.adapter.rendersOnHardwarePlane
    this.applyState('preparing')
    try {
      this.adapter.open(url, region)
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

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
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

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export function createPlayerSession(
  url: string,
  region: PlayerRegion,
  options: PlayerServiceOptions = {},
): PlayerServiceSession {
  const factory = options.createAdapter ?? resolveAdapterFactory()
  return new PlayerServiceSession(url, region, factory)
}

/**
 * Escolhe o motor em tempo de execução. As telas não sabem qual está ativo —
 * é o ponto do contrato (D-007 do plano da spec 003).
 */
export function resolveAdapterFactory(): PlayerAdapterFactory {
  if (hasAvplay()) return createAvplayAdapter
  return createHtmlVideoAdapter
}

// Importações no fim para evitar ciclo: os adaptadores dependem dos tipos
// declarados acima.
import { createAvplayAdapter, hasAvplay } from './avplayAdapter'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
