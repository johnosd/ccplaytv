import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerRegion } from './PlayerService'
import type { EngineCapabilities } from './capabilities'

/**
 * Adaptador de desenvolvimento, para o navegador do computador.
 *
 * **Não é o alvo de produção** e não prova compatibilidade de mídia: o Chrome
 * não reproduz MPEG-TS bruto, que é justamente o formato mais comum em fonte
 * IPTV. Ele serve para exercitar a máquina de estados e o caminho de erro sem
 * depender da TV — a prova de reprodução é o AVPlay no aparelho (ADR-006 V1).
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

export function createHtmlVideoAdapter(callbacks: PlayerAdapterCallbacks): PlayerAdapter {
  let element: HTMLVideoElement | null = null

  function detach(): void {
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
        // O objeto de erro do elemento não é repassado: além de pobre, pode
        // trazer a URL em alguns navegadores.
        callbacks.onError({
          code: null,
          message: 'Não foi possível reproduzir este canal.',
        })
      })

      const mount = document.getElementById('player-surface') ?? document.body
      mount.appendChild(video)
      element = video
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

    close(): void {
      detach()
    },
  }
}
