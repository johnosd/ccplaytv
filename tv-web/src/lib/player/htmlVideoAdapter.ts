import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerRegion } from './PlayerService'

/**
 * Adaptador de desenvolvimento, para o navegador do computador.
 *
 * **Não é o alvo de produção** e não prova compatibilidade de mídia: o Chrome
 * não reproduz MPEG-TS bruto, que é justamente o formato mais comum em fonte
 * IPTV. Ele serve para exercitar a máquina de estados e o caminho de erro sem
 * depender da TV — a prova de reprodução é o AVPlay no aparelho (ADR-006 V1).
 */
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

    open(url: string, _region: PlayerRegion): void {
      // A região é ignorada de propósito: no navegador o vídeo é um nó do DOM
      // posicionado por CSS, ao contrário do plano de hardware do AVPlay.
      const video = document.createElement('video')
      video.autoplay = true
      video.playsInline = true
      video.className = 'player-video'

      video.addEventListener('waiting', () => callbacks.onStateChange('buffering'))
      video.addEventListener('playing', () => callbacks.onStateChange('playing'))
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
    },

    close(): void {
      detach()
    },
  }
}
