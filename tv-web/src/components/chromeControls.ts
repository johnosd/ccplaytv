import type { PlayerCapabilities, PlayerProgress } from '../lib/player/PlayerService'

/**
 * Controles do chrome V14 do player (feature 027, `logic/chrome-player.md` §2).
 */

/** Canal ao vivo × filme/episódio — decidido pelo `playback.kind` da sessão, nunca pelo motor. */
export type ChromeMedia = 'live' | 'vod'

export type ChromeControlId =
  | 'episodePrevious'
  | 'jumpBack'
  | 'playPause'
  | 'jumpForward'
  | 'episodeNext'
  | 'tracks'
  | 'quality'
  | 'speed'
  | 'aspect'
  | 'info'
  | 'guide'

/**
 * `real`: age sobre a sessão. `soon`: mock "Em breve" (registro único
 * `lib/comingSoon.ts`). `limit`: episódio anterior/próximo que não existe
 * no conjunto conhecido — soft disabled, explica o limite.
 */
export type ChromeControlAvailability = 'real' | 'soon' | 'limit' | 'unavailable'

/**
 * Feature 029: o que o motor da sessão sabe fazer além do contrato de
 * capacidades da 011. `false` → o controle aparece soft disabled
 * ("— indisponível"), nunca some e nunca vira mock "Em breve".
 */
export interface ChromeFeatures {
  tracks: boolean
  info: boolean
}

const NO_FEATURES: ChromeFeatures = { tracks: false, info: false }

function tracksControl(features: ChromeFeatures): ChromeControl {
  return features.tracks
    ? { id: 'tracks', availability: 'real', label: 'Áudio e legendas' }
    : { id: 'tracks', availability: 'unavailable', label: 'Áudio e legendas — indisponível' }
}

function infoControl(features: ChromeFeatures): ChromeControl {
  return features.info
    ? { id: 'info', availability: 'real', label: 'Info do stream' }
    : { id: 'info', availability: 'unavailable', label: 'Info do stream — indisponível' }
}

export interface ChromeControl {
  id: ChromeControlId
  availability: ChromeControlAvailability
  /** Rótulo acessível — o mesmo texto que os testes de contrato procuram. */
  label: string
  /** Só em `soon`: a chave em `COMING_SOON`. */
  comingSoonId?: string
}

export interface ChromeEpisodeNeighbors {
  hasPrevious: boolean
  hasNext: boolean
}

/**
 * O que o chrome mostra sobre o item em reprodução — prop `identity` de
 * `PlayerLayer` (feature 027). Definido aqui (não em `PlayerLayer.tsx`) pra
 * `PlayerChrome.tsx` poder importar sem depender do componente que a
 * consome; `PlayerLayer.tsx` reexporta o tipo pelo mesmo caminho de sempre.
 */
export interface PlayerIdentity {
  title: string
  subtitle?: string
  /** Já formatado pela tela (`channelNumberOf`, feature 024). Só faz sentido no canal. */
  channelNumber?: string | null
  /** Só faz sentido no canal. */
  logoUrl?: string | null
}

/** Vizinhança de episódio já calculada pela tela da série (feature 027). */
export interface PlayerEpisodeStep {
  hasPrevious: boolean
  hasNext: boolean
  onStep: (direction: 'previous' | 'next') => void
}

/**
 * A barra de progresso só existe como alvo — e como desenho — quando há
 * duração confiável: sem isso, FR-008 já proíbe até exibi-la (movido de
 * `PlayerControls.tsx`, D-011 do plan.md).
 */
export function hasSeekBar(capabilities: PlayerCapabilities, progress: PlayerProgress | null): boolean {
  return capabilities.reportsDuration && progress?.durationMs !== undefined
}

/**
 * Linha de controles, na ordem de foco (←/→, sem volta nas pontas).
 * VOD: [episódio anterior] ⏪ ▶⏸ ⏩ [próximo episódio] Áudio Qualidade
 * Velocidade Aspecto Info. Live: Guia Áudio Qualidade Aspecto Info.
 * Controle real cuja capacidade é `false` NÃO entra (regra da 011, D-003).
 * `episodePrevious`/`episodeNext` só entram com `episode` não nulo —
 * `availability: 'limit'` quando o lado correspondente de
 * `hasPrevious`/`hasNext` é `false`, senão `'real'`.
 *
 * Feature 029: Áudio e legendas / Info do stream são reais quando o motor
 * sabe fazer (`features`) e `'unavailable'` quando não; o padrão é "nenhum
 * sabe", então chamadas anteriores à 029 continuam válidas.
 */
export function chromeControls(
  media: ChromeMedia,
  capabilities: PlayerCapabilities,
  paused: boolean,
  episode: ChromeEpisodeNeighbors | null,
  features: ChromeFeatures = NO_FEATURES,
): ChromeControl[] {
  if (media === 'live') {
    return [
      { id: 'guide', availability: 'soon', label: 'Guia — em breve', comingSoonId: 'epg-guide' },
      tracksControl(features),
      { id: 'quality', availability: 'soon', label: 'Qualidade — em breve', comingSoonId: 'player-quality' },
      { id: 'aspect', availability: 'soon', label: 'Aspecto — em breve', comingSoonId: 'player-aspect' },
      infoControl(features),
    ]
  }

  const controls: ChromeControl[] = []

  if (episode) {
    controls.push({
      id: 'episodePrevious',
      availability: episode.hasPrevious ? 'real' : 'limit',
      label: episode.hasPrevious ? 'Episódio anterior' : 'Episódio anterior — indisponível',
    })
  }
  if (capabilities.canSeek) {
    controls.push({ id: 'jumpBack', availability: 'real', label: 'Voltar 10 segundos' })
  }
  if (capabilities.canPause) {
    controls.push({ id: 'playPause', availability: 'real', label: paused ? 'Reproduzir' : 'Pausar' })
  }
  if (capabilities.canSeek) {
    controls.push({ id: 'jumpForward', availability: 'real', label: 'Avançar 10 segundos' })
  }
  if (episode) {
    controls.push({
      id: 'episodeNext',
      availability: episode.hasNext ? 'real' : 'limit',
      label: episode.hasNext ? 'Próximo episódio' : 'Próximo episódio — indisponível',
    })
  }
  controls.push(tracksControl(features))
  controls.push({ id: 'quality', availability: 'soon', label: 'Qualidade — em breve', comingSoonId: 'player-quality' })
  controls.push({ id: 'speed', availability: 'soon', label: 'Velocidade — em breve', comingSoonId: 'player-speed' })
  controls.push({ id: 'aspect', availability: 'soon', label: 'Aspecto — em breve', comingSoonId: 'player-aspect' })
  controls.push(infoControl(features))

  return controls
}
