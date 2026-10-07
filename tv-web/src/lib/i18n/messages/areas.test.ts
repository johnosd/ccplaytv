import { describe, expect, it } from 'vitest'
import { COMING_SOON } from '../../comingSoon'
import { comingSoon } from './comingSoon'
import { common } from './common'
import { components } from './components'
import { en } from './en'
import { detail } from './detail'
import { errors } from './errors'
import { es } from './es'
import { home } from './home'
import { live } from './live'
import { player } from './player'
import { playerUi } from './playerUi'
import { profiles } from './profiles'
import { pt } from './pt'
import { settings } from './settings'
import { shell } from './shell'
import { sources } from './sources'
import { speed } from './speed'
import { vodCategory } from './vodCategory'
import { vodShowcase } from './vodShowcase'

/** Toda área nova entra aqui E em `pt.ts`/`en.ts`/`es.ts` — o teste de chaves únicas só vê o que está nesta lista. */
const AREAS = { common, components, comingSoon, detail, errors, home, live, player, playerUi, profiles, settings, shell, sources, speed, vodCategory, vodShowcase }

describe('áreas do catálogo (feature 054)', () => {
  it('nenhuma chave se repete entre áreas (o spread esconderia a sobrescrita) e nenhuma área ficou de fora do catálogo', () => {
    const total = Object.values(AREAS).reduce((sum, area) => sum + Object.keys(area.pt).length, 0)
    expect(Object.keys(pt)).toHaveLength(total)
    expect(Object.keys(en)).toHaveLength(total)
    expect(Object.keys(es)).toHaveLength(total)
  })

  it('todo mock "Em breve" do registro tem mensagem no catálogo, igual ao texto em português do registro', () => {
    for (const [id, entry] of Object.entries(COMING_SOON)) {
      expect(pt[`comingSoon.${id}` as keyof typeof pt], id).toBe(entry.message)
      expect(en[`comingSoon.${id}`], id).toBeTruthy()
      expect(es[`comingSoon.${id}`], id).toBeTruthy()
    }
  })
})
