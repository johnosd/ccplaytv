import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerRegion } from './PlayerService'
import type { EngineCapabilities } from './capabilities'
import type { StreamInfo } from './tracks'
import { ASPECT_MODES, type AspectMode } from './viewChoice'
import { defaultDemuxStarter, shouldFallbackToDemux, type DemuxHandle, type DemuxStarter } from './devDemux'

/**
 * Adaptador de desenvolvimento, para o navegador do computador.
 *
 * **Não é o alvo de produção** e não prova compatibilidade de mídia: o Chrome
 * não reproduz MPEG-TS bruto, que é justamente o formato mais comum em fonte
 * IPTV. Ele serve para exercitar a máquina de estados e o caminho de erro sem
 * depender da TV — a prova de reprodução é o AVPlay no aparelho (ADR-006 V1).
 *
 * Feature 047: **só em `npm run dev`**, uma URL `.ts` que o `<video>` recusar
 * (`error.code 4`) passa a ser demultiplexada em JavaScript (`devDemux.ts`,
 * `mpegts.js`) sobre o mesmo elemento, para testar zapping/chrome/guia com
 * vídeo de verdade. Isso continua **não** provando nada da TV: o AVPlay, o
 * codec e o desempenho reais só se veem no aparelho. Em produção e na TV a
 * biblioteca nem é carregada; o que já tocava pelo `<video>` segue igual.
 *
 * **Suporta pausa, busca, posição e duração sempre** — ao contrário do AVPlay
 * real, cuja superfície de VOD ainda não foi verificada em hardware. Por
 * isso o navegador é estruturalmente incapaz de reprovar uma capacidade
 * ausente no motor real (ver `quickstart.md` da feature 011).
 */

/** O `<video>` do navegador suporta as quatro capacidades sempre. */
const HTML_VIDEO_CAPABILITIES: EngineCapabilities = {
  canPause: true,
  canSeek: true,
  reportsPosition: true,
  reportsDuration: true,
}

/** Feature 047: `startDemux: null` desliga o fallback; ausente = padrão (só dev, e só com MediaSource). */
export interface HtmlVideoAdapterOptions {
  startDemux?: DemuxStarter | null
}

export function createHtmlVideoAdapter(
  callbacks: PlayerAdapterCallbacks,
  options?: HtmlVideoAdapterOptions,
): PlayerAdapter {
  let element: HTMLVideoElement | null = null

  // Feature 047 (logic/fallback-demux.md §2): fallback de demux para `.ts`
  // que o `<video>` recusou. Estado por abertura, zerado em `open()`.
  const startDemux = options?.startDemux === undefined ? defaultDemuxStarter() : options.startDemux
  let demux: DemuxHandle | null = null
  let demuxTried = false
  let demuxDead = false
  let errorReported = false
  let closed = false

  function reportError(): void {
    // Depois de uma tentativa de demux o elemento pode disparar `error` de novo
    // ao ser solto: a falha é uma só. Sem demux, o comportamento é o de sempre.
    if (demuxTried && errorReported) return
    errorReported = true
    // O objeto de erro do elemento (e o da biblioteca de demux) não é
    // repassado: além de pobre, pode trazer a URL com credencial. Sem
    // `message`: o texto fica com quem apresenta o erro, que sabe o tipo da
    // mídia (`PlayerError`).
    callbacks.onError({ code: null })
  }

  function failDemux(video: HTMLVideoElement): void {
    // Falha tardia de um demux já fechado/trocado: ninguém está ouvindo.
    if (closed || element !== video) return
    demuxDead = true
    demux?.destroy()
    demux = null
    reportError()
  }

  function beginDemux(video: HTMLVideoElement, url: string): void {
    if (startDemux === null) return
    startDemux(video, url, { onFailure: () => failDemux(video) })
      .then((handle) => {
        // `close()` (ou uma falha) chegou antes de o anexo terminar: solta na hora.
        if (closed || element !== video || demuxDead) handle.destroy()
        else demux = handle
      })
      .catch(() => failDemux(video))
  }

  function detach(): void {
    demux?.destroy()
    demux = null
    if (!element) return
    element.removeAttribute('src')
    try {
      // Força o elemento a soltar o recurso — sem isso o download continua.
      // Protegido porque nem todo ambiente implementa `load()` (jsdom, por
      // exemplo); soltar a referência abaixo já é o essencial.
      element.load()
    } catch {
      /* ambiente sem HTMLMediaElement completo */
    }
    element.remove()
    element = null
  }

  return {
    name: 'html-video',
    // Nó do DOM dentro da camada web: o fundo da camada deve continuar opaco,
    // senão o vídeo fica sobre o que houver atrás no navegador.
    rendersOnHardwarePlane: false,
    capabilities: HTML_VIDEO_CAPABILITIES,

    open(url: string, _region: PlayerRegion, startAtMs?: number): void {
      // A região é ignorada de propósito: no navegador o vídeo é um nó do DOM
      // posicionado por CSS, ao contrário do plano de hardware do AVPlay.
      const video = document.createElement('video')
      video.autoplay = true
      video.playsInline = true
      video.className = 'player-video'

      video.addEventListener('waiting', () => callbacks.onStateChange('buffering'))
      video.addEventListener('playing', () => callbacks.onStateChange('playing'))
      video.addEventListener('pause', () => callbacks.onStateChange('paused'))
      video.addEventListener('timeupdate', () => {
        // `duration` chega em segundos; convertida a cada evento, não só uma
        // vez — o valor pode não estar disponível ainda no início (NaN) e
        // chegar depois, ou mudar para alguns contêineres.
        const durationMs = Number.isFinite(video.duration) && video.duration > 0
          ? video.duration * 1000
          : undefined
        callbacks.onProgress?.({ positionMs: video.currentTime * 1000, durationMs })
      })
      video.addEventListener('ended', () => callbacks.onCompleted?.())
      video.addEventListener('error', () => {
        if (
          shouldFallbackToDemux({
            url,
            mediaErrorCode: video.error?.code ?? null,
            alreadyTried: demuxTried,
            available: startDemux !== null,
          })
        ) {
          // O `<video>` recusou o formato: o demux assume o MESMO elemento e,
          // por ora, isto não é uma falha.
          demuxTried = true
          beginDemux(video, url)
          return
        }
        reportError()
      })

      const mount = document.getElementById('player-surface') ?? document.body
      mount.appendChild(video)
      element = video
      demux = null
      demuxTried = false
      demuxDead = false
      errorReported = false
      closed = false
      video.src = url
      if (startAtMs !== undefined && startAtMs > 0) {
        // Atribuir `currentTime` antes dos metadados carregarem é um "pending
        // seek" padrão do elemento — o navegador o aplica assim que possível,
        // sem o filme aparecer do início antes de saltar (mesmo cuidado do
        // AVPlay em `avplayAdapter.ts`).
        video.currentTime = startAtMs / 1000
      }
    },

    pause(): void {
      element?.pause()
    },

    resume(): void {
      // `play()` devolve uma Promise em navegadores modernos; uma rejeição
      // (ex.: autoplay bloqueado) já dispara o evento `error` do elemento.
      void element?.play()
    },

    seekTo(positionMs: number, onSettled: () => void): void {
      if (element) element.currentTime = positionMs / 1000
      // Atribuir `currentTime` não é assíncrono como no AVPlay, mas o
      // contrato exige `onSettled` de qualquer forma — mantém a porta
      // single-flight igual para os dois motores.
      onSettled()
    },

    jumpBy(deltaMs: number, onSettled: () => void): void {
      if (element) element.currentTime = element.currentTime + deltaMs / 1000
      onSettled()
    },

    // Só o que o elemento realmente sabe. Sem métodos de faixa: o Chromium
    // não expõe faixas de áudio sem flag, então no navegador "Áudio e
    // legendas" fica indisponível (feature 029, logic §1.3).
    getStreamInfo(): StreamInfo | null {
      if (!element) return null
      const info: StreamInfo = {}
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        info.width = element.videoWidth
        info.height = element.videoHeight
      }
      return info
    },

    // Feature 041 (research R0-3): aspecto por `object-fit`, os quatro modos.
    // Sem métodos de qualidade — o elemento não expõe variantes, então no
    // navegador "Qualidade" fica indisponível, honesto.
    getAspectModes(): AspectMode[] {
      return [...ASPECT_MODES]
    },

    setAspectMode(mode: AspectMode): boolean {
      if (!element) return false
      element.style.objectFit = OBJECT_FIT[mode]
      return true
    },

    close(): void {
      // Antes de soltar o elemento: um demux ainda anexando se destrói sozinho ao terminar.
      closed = true
      detach()
    },
  }
}

const OBJECT_FIT: Record<AspectMode, string> = { fit: 'contain', fill: 'fill', original: 'none', zoom: 'cover' }
