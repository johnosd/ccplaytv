import { createTranslator, type Translator } from '../lib/i18n/translate'
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
  /**
   * Feature 031: a tela sabe abrir o Guia completo. Opcional (padrão
   * `false`) para as chamadas anteriores à 031 continuarem válidas — sem
   * isso, "Guia" segue "em breve" (sem entrada em `comingSoon.ts`: o guia é
   * real, só falta a tela que monta o player saber abri-lo).
   */
  guide?: boolean
  /**
   * Feature 041: o motor aplica ao menos um modo de aspecto. Opcional
   * (ausente = indisponível) para chamadas antigas continuarem válidas.
   */
  aspect?: boolean
  /**
   * Feature 041: quantas qualidades distintas o stream anuncia — `many` (≥ 2,
   * real), `single` (1) ou `none` (0 ou motor sem a API). Ausente = `none`.
   */
  quality?: 'many' | 'single' | 'none'
}

const NO_FEATURES: ChromeFeatures = { tracks: false, info: false }

function unavailable(t: Translator, label: string): string {
  return t('player.tracks.unavailableSuffix', { label })
}

function qualityControl(features: ChromeFeatures, t: Translator): ChromeControl {
  const label = t('player.chrome.quality')
  switch (features.quality) {
    case 'many':
      return { id: 'quality', availability: 'real', label }
    case 'single':
      return { id: 'quality', availability: 'unavailable', label: t('player.chrome.onlyOne', { label }) }
    default:
      return { id: 'quality', availability: 'unavailable', label: unavailable(t, label) }
  }
}

function aspectControl(features: ChromeFeatures, t: Translator): ChromeControl {
  const label = t('player.chrome.aspect')
  return features.aspect
    ? { id: 'aspect', availability: 'real', label }
    : { id: 'aspect', availability: 'unavailable', label: unavailable(t, label) }
}

function tracksControl(features: ChromeFeatures, t: Translator): ChromeControl {
  const label = t('player.tracks.title')
  return features.tracks
    ? { id: 'tracks', availability: 'real', label }
    : { id: 'tracks', availability: 'unavailable', label: unavailable(t, label) }
}

function infoControl(features: ChromeFeatures, t: Translator): ChromeControl {
  const label = t('player.info.title')
  return features.info
    ? { id: 'info', availability: 'real', label }
    : { id: 'info', availability: 'unavailable', label: unavailable(t, label) }
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
  /**
   * Programa em exibição no canal (feature 030, D-014, FR-026): título e
   * progresso 0–1, já calculados pela tela — o player nunca sabe o que é EPG.
   * Ausente = a banda fica exatamente como era. Só faz sentido no canal.
   */
  now?: { title: string; progress: number }
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
 * Aspecto Info (sem Velocidade — feature 041, D-001). Live: Guia Áudio
 * Qualidade Aspecto Info.
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
  t: Translator = createTranslator('pt'),
): ChromeControl[] {
  if (media === 'live') {
    const guide = t('player.chrome.guide')
    return [
      features.guide
        ? { id: 'guide', availability: 'real', label: guide }
        : { id: 'guide', availability: 'soon', label: t('player.chrome.soon', { label: guide }) },
      tracksControl(features, t),
      qualityControl(features, t),
      aspectControl(features, t),
      infoControl(features, t),
    ]
  }

  const controls: ChromeControl[] = []

  if (episode) {
    controls.push({
      id: 'episodePrevious',
      availability: episode.hasPrevious ? 'real' : 'limit',
      label: episode.hasPrevious ? t('player.chrome.previousEpisode') : t('player.chrome.previousEpisodeUnavailable'),
    })
  }
  if (capabilities.canSeek) {
    controls.push({ id: 'jumpBack', availability: 'real', label: t('player.chrome.jumpBack') })
  }
  if (capabilities.canPause) {
    controls.push({ id: 'playPause', availability: 'real', label: paused ? t('player.chrome.play') : t('player.chrome.pause') })
  }
  if (capabilities.canSeek) {
    controls.push({ id: 'jumpForward', availability: 'real', label: t('player.chrome.jumpForward') })
  }
  if (episode) {
    controls.push({
      id: 'episodeNext',
      availability: episode.hasNext ? 'real' : 'limit',
      label: episode.hasNext ? t('player.chrome.nextEpisode') : t('player.chrome.nextEpisodeUnavailable'),
    })
  }
  controls.push(tracksControl(features, t))
  controls.push(qualityControl(features, t))
  controls.push(aspectControl(features, t))
  controls.push(infoControl(features, t))

  return controls
}
