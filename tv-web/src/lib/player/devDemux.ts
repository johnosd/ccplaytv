/**
 * Feature 047 — reprodução de MPEG-TS no navegador do dev.
 *
 * O `<video>` do Chromium recusa MPEG-TS bruto (`error.code 4`), o formato das
 * URLs Xtream de canal. No `npm run dev`, o `htmlVideoAdapter` tenta primeiro o
 * caminho nativo e, só se ele recusar uma URL `.ts`, entrega o MESMO elemento a
 * um demux em JavaScript (`mpegts.js`). Regras em
 * `sdd/specs/047-player-dev-mpegts/logic/fallback-demux.md`.
 *
 * **Só dev**: `defaultDemuxStarter()` devolve `null` em produção e sem
 * `MediaSource` (TV, jsdom), e o `import()` da biblioteca fica DENTRO dessa
 * guarda para o bundler de produção eliminá-lo (FR-007/FR-008, verificado por
 * `scripts/check-no-demux-in-build.mjs`). Isto não prova reprodução na TV
 * (FR-011) — só o AVPlay prova.
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

/** `MEDIA_ERR_SRC_NOT_SUPPORTED`: o elemento não reconhece o formato. */
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

/** O caminho (sem query nem fragmento) termina em `.ts`. Nunca devolve nem registra a URL. */
export function isMpegTsUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.ts')
  } catch {
    return false
  }
}

export function shouldFallbackToDemux({ url, mediaErrorCode, alreadyTried, available }: FallbackInput): boolean {
  if (!available || alreadyTried) return false
  if (mediaErrorCode !== MEDIA_ERR_SRC_NOT_SUPPORTED) return false
  return isMpegTsUrl(url)
}

/** `null` em produção ou sem MediaSource (jsdom, TV): comportamento idêntico ao de antes da feature. */
export function defaultDemuxStarter(): DemuxStarter | null {
  if (!import.meta.env.DEV) return null
  if (typeof MediaSource === 'undefined') return null

  return async (video, url, { onFailure }) => {
    // Importação dinâmica DENTRO da guarda acima: em produção o ramo é morto.
    const { default: mpegts } = await import('mpegts.js')
    if (!mpegts.isSupported()) throw new Error('mpegts-unsupported')

    // A biblioteca registra no console; a URL do stream carrega credencial (D-006).
    mpegts.LoggingControl.applyConfig({
      enableAll: false,
      enableDebug: false,
      enableVerbose: false,
      enableInfo: false,
      enableWarn: false,
      enableError: false,
    })

    const player = mpegts.createPlayer({ type: 'mpegts', isLive: true, url }, { enableWorker: false })
    let destroyed = false
    // Sem repassar argumentos: o detalhe do erro pode embutir a URL.
    player.on(mpegts.Events.ERROR, () => {
      if (!destroyed) onFailure()
    })
    player.attachMediaElement(video)
    player.load()
    void Promise.resolve(player.play()).catch(() => {
      /* autoplay bloqueado: o elemento já tem `autoplay`, e um erro real chega por ERROR */
    })

    return {
      destroy() {
        if (destroyed) return
        destroyed = true
        try {
          player.pause()
          player.unload()
          player.detachMediaElement()
          player.destroy()
        } catch {
          /* já solto */
        }
      },
    }
  }
}
