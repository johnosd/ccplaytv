import { afterEach, expect, it } from 'vitest'
import { forgetLiveSource, recalledLiveFocus, rememberLiveFocus, resetLiveSessionMemory } from './liveSessionMemory'

// Contrato da feature 046 (US2 / 14b): memória de foco da Live por lista + entrada, só em memória.

afterEach(() => {
  resetLiveSessionMemory()
})

// FR-007, FR-009, FR-012, FR-013
it('lembra o canal por lista e entrada, nunca mistura listas, e esquece uma lista inteira', () => {
  expect(recalledLiveFocus('lista-A', 'category:Esportes')).toBeNull() // entrada nunca visitada

  rememberLiveFocus('lista-A', 'category:Esportes', 'canal-15', 14)
  rememberLiveFocus('lista-A', 'favorites', 'canal-2', 1)
  rememberLiveFocus('lista-B', 'category:Esportes', 'canal-99', 3)

  expect(recalledLiveFocus('lista-A', 'category:Esportes')).toEqual({ channelId: 'canal-15', index: 14 })
  expect(recalledLiveFocus('lista-A', 'favorites')).toEqual({ channelId: 'canal-2', index: 1 })
  expect(recalledLiveFocus('lista-A', 'all')).toBeNull()
  expect(recalledLiveFocus('lista-B', 'category:Esportes')).toEqual({ channelId: 'canal-99', index: 3 })

  forgetLiveSource('lista-A')

  expect(recalledLiveFocus('lista-A', 'category:Esportes')).toBeNull()
  expect(recalledLiveFocus('lista-A', 'favorites')).toBeNull()
  expect(recalledLiveFocus('lista-B', 'category:Esportes')).toEqual({ channelId: 'canal-99', index: 3 })
})
