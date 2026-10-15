import { useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import { AboutPanel } from '../AboutPanel'
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
