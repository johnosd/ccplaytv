import {
  ASPECT_LABEL,
  distinctQualities,
  qualityLabel,
  type AspectMode,
  type QualityOption,
} from '../lib/player/viewChoice'

/**
 * Modelo dos painéis "Aspecto" e "Qualidade" (feature 041,
 * `logic/aspecto-qualidade.md` §1.4/§2.5) — puro, sem React nem motor. Quem
 * decide foco e desenha são o `PlayerLayer` e o `PlayerChoicePanel`.
 */

export interface ChoiceRow {
  /** Estável entre relidas: `a:<modo>`, `q:auto`, `q:<altura>`. */
  key: string
  /** Texto visível e nome acessível. */
  label: string
  /** `aria-checked`. */
  checked: boolean
  /** Só em linha de aspecto. */
  mode?: AspectMode
  /** Só em linha de qualidade: `null` = Auto. */
  qualityId?: string | null
  /** Só em linha de qualidade com altura (não Auto). */
  height?: number
}

export interface ChoicePanelModel {
  title: 'Aspecto' | 'Qualidade'
  rows: ChoiceRow[]
}

/** Uma linha por modo que o motor aplica; a marcada é a que o motor aceitou por último. */
export function buildAspectPanel(modes: readonly AspectMode[], checked: AspectMode | null): ChoicePanelModel {
  return {
    title: 'Aspecto',
    rows: modes.map((mode) => ({
      key: `a:${mode}`,
      label: ASPECT_LABEL[mode],
      checked: mode === checked,
      mode,
    })),
  }
}

/**
 * "Auto" + uma linha por altura que o stream anuncia (da maior para a menor).
 * `selectedId` `null` = Auto; um id que não está mais nas opções deixa nenhuma
 * linha marcada (quem relê decide cair para Auto — logic §2.5).
 */
export function buildQualityPanel(options: readonly QualityOption[], selectedId: string | null): ChoicePanelModel {
  return {
    title: 'Qualidade',
    rows: [
      { key: 'q:auto', label: 'Auto', checked: selectedId === null, qualityId: null },
      ...distinctQualities(options).map<ChoiceRow>((option) => ({
        key: `q:${option.height}`,
        label: qualityLabel(option),
        checked: option.id === selectedId,
        qualityId: option.id,
        height: option.height,
      })),
    ],
  }
}

/** Foco ao abrir: a linha marcada; sem nenhuma marcada, a primeira (FR-002). */
export function initialChoiceFocusKey(model: ChoicePanelModel): string {
  return (model.rows.find((row) => row.checked) ?? model.rows[0]).key
}

/** ↑/↓ sem volta nas pontas. Chave desconhecida cai na primeira linha. */
export function moveChoiceFocus(model: ChoicePanelModel, currentKey: string, direction: 'up' | 'down'): string {
  const index = model.rows.findIndex((row) => row.key === currentKey)
  if (index === -1) return model.rows[0].key
  const next = Math.max(0, Math.min(model.rows.length - 1, index + (direction === 'down' ? 1 : -1)))
  return model.rows[next].key
}

/** Depois de uma releitura: mantém o foco pela chave; se a linha sumiu, vai à marcada (nunca por índice). */
export function reconcileChoiceFocus(model: ChoicePanelModel, currentKey: string): string {
  return model.rows.some((row) => row.key === currentKey) ? currentKey : initialChoiceFocusKey(model)
}
