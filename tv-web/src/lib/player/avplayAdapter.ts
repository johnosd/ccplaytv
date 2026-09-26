import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerRegion } from './PlayerService'
import type { EngineCapabilities } from './capabilities'

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
 * **Superfície de VOD (pausa/busca/posição/duração) não foi verificada em
 * hardware ainda** — só `open`/`play`/`stop`/`close` o foram, na feature 003.
 * É o gate de TV física da feature 011
 * (`sdd/specs/011-assistir-filme-retomada/quickstart.md`, Cenários F–I).
 */

interface AvplayListener {
  onbufferingstart?: () => void
  onbufferingcomplete?: () => void
  /** Empurra a posição periodicamente (~1s) enquanto reproduz. */
  oncurrentplaytime?: (currentTimeMs: number) => void
  onstreamcompleted?: () => void
  onerror?: (error: unknown) => void
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
 * O que este motor SABE FAZER, sem considerar a mídia — é a crença do motor,
 * não a decisão final (a sessão resolve contra `mediaCapabilities(kind)`,
 * D-001/D-002). AVPlay declara tudo porque a API oferece as quatro
 * capacidades; o canal ao vivo continua sem elas porque a MÍDIA nega, não
 * porque o motor não soubesse.
 */
const AVPLAY_CAPABILITIES: EngineCapabilities = {
  canPause: true,
  canSeek: true,
  reportsPosition: true,
  reportsDuration: true,
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

/**
 * `getDuration()` chamada a cada tick de progresso, não só uma vez: alguns
 * contêineres só revelam a duração real depois do início, e a duração pode
 * mudar (spec, Edge Cases). `0` do motor vira `undefined` — duração
 * desconhecida, não duração zero.
 */
function safeDuration(avplay: AvplayApi): number | undefined {
  try {
    const duration = avplay.getDuration()
    return duration > 0 ? duration : undefined
  } catch {
    return undefined
  }
}

export function createAvplayAdapter(callbacks: PlayerAdapterCallbacks): PlayerAdapter {
  let opened = false

  return {
    name: 'avplay',
    // O vídeo sai num plano de hardware atrás da camada web — ver o cabeçalho
    // deste arquivo. A camada de reprodução usa isso para liberar a área.
    rendersOnHardwarePlane: true,
    capabilities: AVPLAY_CAPABILITIES,

    open(url: string, region: PlayerRegion, startAtMs?: number): void {
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
        oncurrentplaytime: (currentTimeMs: number) => {
          callbacks.onProgress?.({
            positionMs: currentTimeMs,
            durationMs: safeDuration(avplay),
          })
        },
        // Fim de mídia é um FATO, não um veredito — quem decide se é
        // conclusão normal (filme) ou falha de fornecimento (canal ao vivo)
        // é a sessão, pela capacidade resolvida da mídia (D-008).
        onstreamcompleted: () => callbacks.onCompleted?.(),
        onerror: (error: unknown) => callbacks.onError(toPlayerError(error)),
      })

      avplay.setDisplayRect(region.x, region.y, region.width, region.height)

      avplay.prepareAsync(
        () => {
          // Preparado ≠ reproduzindo: o estado só vira `playing` quando o
          // motor reportar buffering completo.
          callbacks.onStateChange('buffering')
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
        (error: unknown) => callbacks.onError(toPlayerError(error)),
      )
    },

    pause(): void {
      const avplay = getAvplay()
      if (!avplay) return
      try {
        avplay.pause()
        callbacks.onStateChange('paused')
      } catch (error) {
        callbacks.onError(toPlayerError(error))
      }
    },

    resume(): void {
      const avplay = getAvplay()
      if (!avplay) return
      try {
        // Não há resume() na API: play() também retoma de PAUSED.
        avplay.play()
        callbacks.onStateChange('playing')
      } catch (error) {
        callbacks.onError(toPlayerError(error))
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
