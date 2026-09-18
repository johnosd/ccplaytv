import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerRegion } from './PlayerService'

/**
 * Adaptador do player nativo da Samsung (`webapis.avplay`) — o motor de
 * produção (ADR-001 §2).
 *
 * Duas características do AVPlay moldam este arquivo:
 *
 * - **Preparação assíncrona.** `prepareAsync` chama o callback de sucesso
 *   quando a mídia está pronta, ainda antes de o vídeo aparecer; só então
 *   `play()` faz sentido.
 * - **Plano de vídeo de hardware.** O AVPlay não desenha no DOM: ele pinta
 *   num plano ATRÁS da camada web, e a área correspondente da página precisa
 *   deixá-lo passar. Por isso a região vai por coordenadas em
 *   `setDisplayRect`, em espaço 1920x1080.
 *
 * Fora da TV, `window.webapis` não existe e `hasAvplay()` é falso — o
 * `PlayerService` então escolhe o adaptador `<video>`. Mesmo padrão de acesso
 * a global Tizen usado em `src/lib/tizenExit.ts`.
 *
 * **Nada aqui foi verificado em hardware ainda** (ADR-006, porta V1).
 */

interface AvplayListener {
  onbufferingstart?: () => void
  onbufferingcomplete?: () => void
  onstreamcompleted?: () => void
  onerror?: (error: unknown) => void
}

interface AvplayApi {
  open: (url: string) => void
  close: () => void
  prepareAsync: (onSuccess: () => void, onError: (error: unknown) => void) => void
  play: () => void
  stop: () => void
  setListener: (listener: AvplayListener) => void
  setDisplayRect: (x: number, y: number, width: number, height: number) => void
  setDisplayMethod?: (method: string) => void
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

/**
 * Traduz uma falha do motor para uma mensagem de usuário.
 *
 * O objeto de erro do AVPlay é deliberadamente NÃO repassado: ele pode
 * carregar a URL do stream, que em fontes Xtream embute usuário e senha
 * (constitution, "Segredos Fora dos Clientes e dos Logs"). Só um código
 * curto, quando existir, atravessa.
 */
function toPlayerError(raw: unknown): { code: string | null; message: string } {
  let code: string | null = null
  if (typeof raw === 'string') {
    code = raw
  } else if (raw && typeof raw === 'object' && 'name' in raw) {
    const name = (raw as { name?: unknown }).name
    if (typeof name === 'string') code = name
  }
  return { code, message: 'Não foi possível reproduzir este canal.' }
}

export function createAvplayAdapter(callbacks: PlayerAdapterCallbacks): PlayerAdapter {
  let opened = false

  return {
    name: 'avplay',
    // O vídeo sai num plano de hardware atrás da camada web — ver o cabeçalho
    // deste arquivo. A camada de reprodução usa isso para liberar a área.
    rendersOnHardwarePlane: true,

    open(url: string, region: PlayerRegion): void {
      const avplay = getAvplay()
      if (!avplay) {
        callbacks.onError({ code: null, message: 'Player da TV indisponível.' })
        return
      }

      avplay.open(url)
      opened = true

      avplay.setListener({
        onbufferingstart: () => callbacks.onStateChange('buffering'),
        onbufferingcomplete: () => callbacks.onStateChange('playing'),
        // Fim de stream num canal ao vivo é falha de fornecimento, não
        // "acabou o conteúdo" — não existe conclusão para transmissão
        // contínua (constitution, "Progresso e Capacidades São Reais").
        onstreamcompleted: () =>
          callbacks.onError({ code: 'stream_completed', message: 'A transmissão foi interrompida.' }),
        onerror: (error: unknown) => callbacks.onError(toPlayerError(error)),
      })

      avplay.setDisplayRect(region.x, region.y, region.width, region.height)

      avplay.prepareAsync(
        () => {
          // Preparado ≠ reproduzindo: o estado só vira `playing` quando o
          // motor reportar buffering completo.
          callbacks.onStateChange('buffering')
          avplay.play()
        },
        (error: unknown) => callbacks.onError(toPlayerError(error)),
      )
    },

    close(): void {
      const avplay = getAvplay()
      if (!avplay || !opened) return
      opened = false
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
