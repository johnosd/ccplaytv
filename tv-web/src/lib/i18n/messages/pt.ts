import { comingSoon } from './comingSoon'
import { common } from './common'
import { components } from './components'
import { detail } from './detail'
import { errors } from './errors'
import { home } from './home'
import { live } from './live'
import { player } from './player'
import { playerUi } from './playerUi'
import { profiles } from './profiles'
import { settings } from './settings'
import { shell } from './shell'
import { sources } from './sources'
import { speed } from './speed'
import { vodCategory } from './vodCategory'
import { vodShowcase } from './vodShowcase'

/**
 * Catálogo-base em português (feature 054): junta as áreas de `messages/` e define
 * o conjunto de chaves — `en.ts` e `es.ts` têm EXATAMENTE as mesmas chaves e os
 * mesmos `{marcadores}`. Texto novo entra na área da tela, nos TRÊS idiomas.
 * Plural: `x.one` + `x.other`.
 */
export const pt = {
  ...common.pt,
  ...components.pt,
  ...detail.pt,
  ...errors.pt,
  ...home.pt,
  ...live.pt,
  ...comingSoon.pt,
  ...player.pt,
  ...playerUi.pt,
  ...profiles.pt,
  ...settings.pt,
  ...shell.pt,
  ...sources.pt,
  ...speed.pt,
  ...vodCategory.pt,
  ...vodShowcase.pt,
}

export type MessageKey = keyof typeof pt
