import { portal } from './portal'
import { portalAdvanced } from './portalAdvanced'
import { comingSoon } from './comingSoon'
import { common } from './common'
import { components } from './components'
import { detail } from './detail'
import { errors } from './errors'
import { home } from './home'
import { listSettings } from './listSettings'
import { live } from './live'
import { radio } from './radio'
import { parental } from './parental'
import { player } from './player'
import { playerUi } from './playerUi'
import { profiles } from './profiles'
import { purchase } from './purchase'
import { settings } from './settings'
import { shell } from './shell'
import { sources } from './sources'
import { speed } from './speed'
import { subtitles } from './subtitles'
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
  ...radio.es,
  ...listSettings.es,
  ...parental.es,
  ...comingSoon.es,
  ...player.es,
  ...playerUi.es,
  ...subtitles.es,
  ...profiles.es,
  ...portal.es,
  ...portalAdvanced.es,
  ...purchase.es,
  ...settings.es,
  ...shell.es,
  ...sources.es,
  ...speed.es,
  ...vodCategory.es,
  ...vodShowcase.es,
}
