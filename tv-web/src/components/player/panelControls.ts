/**
 * Ramos de aspecto e qualidade dos painéis do player (feature 041), extraídos de `usePlayerPanels` na feature 090
 * sem mudar nada — só para o hook caber no teto de linhas da catraca com a legenda externa (`logic/legenda-externa.md`
 * §8). Sem React: o hook passa o que estas funções precisam.
 */
import type { Translator } from '../../lib/i18n/translate'
import type { PlayerServiceSession, QualityOption, ViewChoice } from '../../lib/player/PlayerService'
import type { ChromeControl } from '../chromeControls'
import type { ChoicePanelModel } from '../playerViewPanels'
import {
  ASPECT_SWITCH_FAILED_KEY,
  ASPECT_UNAVAILABLE_KEY,
  QUALITY_SINGLE_KEY,
  QUALITY_SWITCH_FAILED_KEY,
  QUALITY_UNAVAILABLE_KEY,
} from './playerMessages'

export interface ViewControlDeps {
  t: Translator
  showToast: (message: string) => void
  scheduleHide: () => void
  qualityOptionsRef: { current: QualityOption[] }
  refreshQualityOptions: (session: PlayerServiceSession) => unknown
  openChoicePanel: (session: PlayerServiceSession, kind: 'aspect' | 'quality') => void
}

/** SELECT em "Aspecto"/"Qualidade" no chrome. `false` = o controle não é destes dois. */
export function activateViewControl(control: ChromeControl, session: PlayerServiceSession, deps: ViewControlDeps): boolean {
  const { t, showToast, scheduleHide } = deps
  if (control.id === 'aspect') {
    if (control.availability === 'real') deps.openChoicePanel(session, 'aspect')
    else {
      showToast(t(ASPECT_UNAVAILABLE_KEY))
      scheduleHide()
    }
    return true
  }
  if (control.id === 'quality') {
    // Decide com a leitura de agora, não com a do último render (`logic` §2.4).
    deps.refreshQualityOptions(session)
    const count = deps.qualityOptionsRef.current.length
    if (session.supportsQuality && count >= 2) deps.openChoicePanel(session, 'quality')
    else {
      showToast(t(session.supportsQuality && count === 1 ? QUALITY_SINGLE_KEY : QUALITY_UNAVAILABLE_KEY))
      scheduleHide()
    }
    return true
  }
  return false
}

export interface ViewChoiceDeps {
  t: Translator
  showToast: (message: string) => void
  choiceModelFor: (session: PlayerServiceSession, kind: 'aspect' | 'quality') => ChoicePanelModel
  commitView: (patch: Partial<ViewChoice>) => void
}

/** SELECT numa linha do painel de aspecto/qualidade. Quem chama relê o painel depois (a marcação reflete o motor). */
export function selectViewChoice(session: PlayerServiceSession, kind: 'aspect' | 'quality', focusKey: string, deps: ViewChoiceDeps): void {
  const { t, showToast, commitView } = deps
  const choiceRow = deps.choiceModelFor(session, kind).rows.find((r) => r.key === focusKey)
  if (!choiceRow) return
  if (kind === 'aspect' && choiceRow.mode !== undefined) {
    if (session.setAspectMode(choiceRow.mode)) commitView({ aspect: choiceRow.mode })
    else showToast(t(ASPECT_SWITCH_FAILED_KEY))
  } else if (kind === 'quality' && choiceRow.qualityId !== undefined) {
    if (session.selectQuality(choiceRow.qualityId)) {
      commitView({ quality: choiceRow.qualityId === null || choiceRow.height === undefined ? 'auto' : { height: choiceRow.height } })
    } else {
      showToast(t(QUALITY_SWITCH_FAILED_KEY))
    }
  }
}
