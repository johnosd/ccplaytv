/**
 * Aspecto e qualidade do vídeo (feature 041,
 * `sdd/specs/041-player-qualidade-aspecto/logic/aspecto-qualidade.md`).
 *
 * Só tipos e funções puras — nada aqui toca motor, DOM ou React. Tudo o que
 * a UI oferece vem do que o MOTOR declara (modos) ou do que o STREAM anuncia
 * (qualidades); nunca uma opção inventada (FR-001/FR-005, SC-001).
 */

/** Os quatro modos do DS V14 §27.7. A ordem é a do painel e das Configurações. */
export type AspectMode = 'fit' | 'fill' | 'original' | 'zoom'

export const ASPECT_MODES: readonly AspectMode[] = ['fit', 'fill', 'original', 'zoom']

export const ASPECT_LABEL: Record<AspectMode, string> = {
  fit: 'Ajustar',
  fill: 'Preencher',
  original: 'Original',
  zoom: 'Zoom',
}

/**
 * Uma variante que o stream anuncia. `id` vale só dentro da SESSÃO (como as
 * faixas da 029); `height` é o que atravessa a sequência.
 */
export interface QualityOption {
  id: string
  height: number
  width?: number
  bitrateKbps?: number
}

/** Preferência do aparelho (aba "Player & reprodução", FR-010/FR-014). */
export type QualityPreference = 'auto' | 'max' | 'min'

export const QUALITY_PREFERENCES: readonly QualityPreference[] = ['auto', 'max', 'min']

export const QUALITY_PREFERENCE_LABEL: Record<QualityPreference, string> = {
  auto: 'Auto',
  max: 'Máxima',
  min: 'Econômica',
}

/**
 * Escolha de qualidade que segue a sequência: uma regra (`auto`/`max`/`min`,
 * vinda da preferência) ou uma altura escolhida no player (FR-008).
 */
export type QualityChoice = QualityPreference | { height: number }

/** Aspecto + qualidade da sequência (Key Entity "Escolha da sequência"). Nunca persistida. */
export interface ViewChoice {
  aspect: AspectMode
  quality: QualityChoice
}

export const DEFAULT_VIEW_CHOICE: ViewChoice = { aspect: 'fit', quality: 'auto' }

/**
 * Variantes como o painel as mostra: uma por altura (a de maior taxa quando
 * há empate), da maior para a menor, sem altura inválida (logic §2.1).
 */
export function distinctQualities(options: readonly QualityOption[]): QualityOption[] {
  const byHeight = new Map<number, QualityOption>()
  for (const option of options) {
    if (!Number.isFinite(option.height) || option.height <= 0) continue
    const current = byHeight.get(option.height)
    // Empate de altura: a de maior taxa; empate total fica com a primeira.
    if (!current || (option.bitrateKbps ?? 0) > (current.bitrateKbps ?? 0)) {
      byHeight.set(option.height, option)
    }
  }
  return [...byHeight.values()].sort((a, b) => b.height - a.height)
}

/** `${height}p` — o que o stream disse, nunca um nome comercial ("Full HD"). */
export function qualityLabel(option: QualityOption): string {
  return `${option.height}p`
}

/**
 * Qual variante aplicar num stream a partir da escolha (logic §2.2).
 * `null` = Auto. Altura não anunciada → Auto (FR-008). Uma variante só ou
 * nenhuma → Auto (FR-014: "a única disponível" é o que o motor já toca).
 */
export function pickQualityForChoice(options: readonly QualityOption[], choice: QualityChoice): string | null {
  const distinct = distinctQualities(options)
  if (distinct.length < 2 || choice === 'auto') return null
  if (choice === 'max') return distinct[0]!.id
  if (choice === 'min') return distinct[distinct.length - 1]!.id
  return distinct.find((option) => option.height === choice.height)?.id ?? null
}

/**
 * Modo a aplicar num motor que aceita `supported` (logic §1.2): o escolhido se
 * aceito; senão `fit` se aceito; senão `null` (não chamar o motor).
 */
export function pickAspectForChoice(supported: readonly AspectMode[], choice: AspectMode): AspectMode | null {
  if (supported.includes(choice)) return choice
  return supported.includes('fit') ? 'fit' : null
}
