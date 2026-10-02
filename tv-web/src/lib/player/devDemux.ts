/**
 * Feature 047 — reprodução de MPEG-TS no navegador do dev (STUB do sdd-plan).
 *
 * Só tipos e assinaturas: o corpo é entregue pelo `sdd-execute` (tasks T008+),
 * seguindo `sdd/specs/047-player-dev-mpegts/logic/fallback-demux.md`. Nada aqui
 * é carregado na TV nem entra no build de produção (FR-007/FR-008).
 */

/** Sessão de demux em andamento; `destroy()` solta o stream e o `<video>`. Idempotente. */
export interface DemuxHandle {
  destroy(): void
}

/** O demux nunca repassa o erro bruto (pode embutir a URL com credencial): só avisa que falhou. */
export interface DemuxCallbacks {
  onFailure(): void
}

export type DemuxStarter = (
  video: HTMLVideoElement,
  url: string,
  callbacks: DemuxCallbacks,
) => Promise<DemuxHandle>

export interface FallbackInput {
  url: string
  /** `video.error?.code` do elemento no evento `error`; `null` se não houver. */
  mediaErrorCode: number | null
  /** Já houve uma tentativa de demux nesta abertura. */
  alreadyTried: boolean
  /** Há um `DemuxStarter` utilizável (dev + MediaSource). */
  available: boolean
}

export function shouldFallbackToDemux(_input: FallbackInput): boolean {
  throw new Error('not implemented')
}

/** `null` em produção ou sem MediaSource (jsdom, TV): comportamento idêntico ao de antes da feature. */
export function defaultDemuxStarter(): DemuxStarter | null {
  throw new Error('not implemented')
}
