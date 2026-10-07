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
import type { MessageKey } from './pt'

/** Catálogo em inglês (feature 054): junta as áreas; mesmas chaves e `{marcadores}` de `pt.ts`. */
// Interseção: Record<MessageKey, …> força a completude no tsc; o índice por string deixa o contrato travado indexar por chave.
export const en: Record<MessageKey, string> & Record<string, string> = {
  ...common.en,
  ...components.en,
  ...detail.en,
  ...errors.en,
  ...home.en,
  ...live.en,
  ...comingSoon.en,
  ...player.en,
  ...playerUi.en,
  ...profiles.en,
  ...settings.en,
  ...shell.en,
  ...sources.en,
  ...speed.en,
  ...vodCategory.en,
  ...vodShowcase.en,
}
