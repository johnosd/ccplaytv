import { useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import { AboutPanel } from '../AboutPanel'
import { ComingSoonPanel } from '../ComingSoonPanel'
import type { SettingsTabProps } from './settingsTab'

/** Sobre & créditos (feature 026, FR-030): uma linha só, nada a ativar. */
export function AboutTab({ focused, exitToTabs, goToTopbar, handleRef }: SettingsTabProps): ReactNode {
  useImperativeHandle(handleRef, () => ({
    onEnter: () => {},
    onDirection: (direction) => {
      if (direction === 'left') exitToTabs()
      if (direction === 'up') goToTopbar()
    },
    onSelect: () => {},
  }))
  return <AboutPanel focused={focused} />
}

/** Aba "Em breve" (feature 026, FR-031): uma linha só; OK é "Voltar às abas". */
function ComingSoonTab({ tab, focused, exitToTabs, goToTopbar, handleRef }: SettingsTabProps & { tab: 'player' | 'parental' }): ReactNode {
  useImperativeHandle(handleRef, () => ({
    onEnter: () => {},
    onDirection: (direction) => {
      if (direction === 'left') exitToTabs()
      if (direction === 'up') goToTopbar()
    },
    onSelect: exitToTabs,
  }))
  return <ComingSoonPanel tab={tab} focused={focused} onBack={exitToTabs} />
}

export function PlayerSoonTab(props: SettingsTabProps): ReactNode {
  return <ComingSoonTab {...props} tab="player" />
}

export function ParentalSoonTab(props: SettingsTabProps): ReactNode {
  return <ComingSoonTab {...props} tab="parental" />
}
