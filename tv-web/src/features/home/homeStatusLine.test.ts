import { describe, expect, it } from 'vitest'
import { formatAge, homeStatusLine } from './homeStatusLine'
import type { PrefetchProgress } from '../catalog/prefetchApi'

const NOW = 10 * 24 * 60 * 60 * 1000
const idle: PrefetchProgress = { state: 'done', sourceId: 'f', ready: 10, total: 10 }

describe('homeStatusLine (feature 038, FR-031/FR-032)', () => {
  it('atualizando tem prioridade', () => {
    expect(homeStatusLine({ sourceId: 'f', updating: true, progress: { ...idle, state: 'running', ready: 1 }, lastSuccessfulSyncAt: NOW, now: NOW })).toBe('Atualizando catálogo…')
  })

  it('preparando: N de M reais, também em pausa (pessoa navegando)', () => {
    const progress: PrefetchProgress = { state: 'paused', sourceId: 'f', ready: 34, total: 91 }
    expect(homeStatusLine({ sourceId: 'f', updating: false, progress, lastSuccessfulSyncAt: NOW, now: NOW })).toBe(
      'Preparando catálogo — 34 de 91 categorias',
    )
  })

  it('pré-carga de outra lista não conta', () => {
    const progress: PrefetchProgress = { state: 'running', sourceId: 'outra', ready: 1, total: 5 }
    expect(homeStatusLine({ sourceId: 'f', updating: false, progress, lastSuccessfulSyncAt: NOW - 3 * 60 * 60 * 1000, now: NOW })).toBe(
      'Catálogo atualizado há 3 h',
    )
  })

  it('terminado: idade real da última atualização; sem nenhuma, nada', () => {
    expect(homeStatusLine({ sourceId: 'f', updating: false, progress: idle, lastSuccessfulSyncAt: NOW - 5 * 60 * 1000, now: NOW })).toBe(
      'Catálogo atualizado há 5 min',
    )
    expect(homeStatusLine({ sourceId: 'f', updating: false, progress: idle, lastSuccessfulSyncAt: null, now: NOW })).toBeNull()
  })

  it('relógio atrás nunca mostra idade negativa', () => {
    expect(formatAge(-50_000)).toBe('agora')
    expect(homeStatusLine({ sourceId: 'f', updating: false, progress: idle, lastSuccessfulSyncAt: NOW + 60_000, now: NOW })).toBe(
      'Catálogo atualizado agora',
    )
  })

  it('dias no singular e no plural; nenhum percentual', () => {
    expect(formatAge(24 * 60 * 60 * 1000)).toBe('há 1 dia')
    expect(formatAge(3 * 24 * 60 * 60 * 1000)).toBe('há 3 dias')
  })
})
