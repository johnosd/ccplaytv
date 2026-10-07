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

/** Catálogo em espanhol (feature 054): junta as áreas; mesmas chaves e `{marcadores}` de `pt.ts`. */
// Interseção: Record<MessageKey, …> força a completude no tsc; o índice por string deixa o contrato travado indexar por chave.
export const es: Record<MessageKey, string> & Record<string, string> = {
  ...common.es,
  ...components.es,
  ...detail.es,
  ...errors.es,
  ...home.es,
  ...live.es,
  ...comingSoon.es,
  ...player.es,
  ...playerUi.es,
  ...profiles.es,
  ...settings.es,
  ...shell.es,
  ...sources.es,
  ...speed.es,
  ...vodCategory.es,
  ...vodShowcase.es,
}
