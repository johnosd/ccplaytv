import { describe, expect, it } from 'vitest'
import { ADVANCED_ACTIONS, initialMain, mainActions, pairingNeedsAction, resolveAction } from './portalActions'

describe('ações de Portal & licença por id (feature 076)', () => {
  it('a tela principal segue retry? → Comprar → Atualizar → Avançado no build comercial e só Avançado fora dele', () => {
    expect(mainActions({ pairingFailed: false, commercial: true })).toEqual(['purchase', 'refresh', 'advanced'])
    expect(mainActions({ pairingFailed: true, commercial: true })).toEqual(['retry', 'purchase', 'refresh', 'advanced'])
    expect(mainActions({ pairingFailed: false, commercial: false })).toEqual(['advanced'])
  })

  it('o foco inicial é Comprar (teste/vencida/sem), Atualizar (ativa) e Avançado (não comercial)', () => {
    const commercial = mainActions({ pairingFailed: false, commercial: true })
    expect(initialMain(commercial, { commercial: true, licenseState: 'trial' })).toBe('purchase')
    expect(initialMain(commercial, { commercial: true })).toBe('purchase')
    expect(initialMain(commercial, { commercial: true, licenseState: 'active' })).toBe('refresh')
    expect(initialMain(mainActions({ pairingFailed: false, commercial: false }), { commercial: false })).toBe('advanced')
  })

  it('cai na primeira ação quando a desejada não existe e o foco guardado só vale se a ação existe', () => {
    expect(initialMain(['advanced'], { commercial: true })).toBe('advanced')
    expect(resolveAction(['purchase', 'refresh', 'advanced'], 'purchase', 'refresh')).toBe('refresh')
    expect(resolveAction(['advanced'], 'advanced', 'refresh')).toBe('advanced')
    expect(resolveAction(['advanced'], 'advanced', undefined)).toBe('advanced')
  })

  it('o Avançado tem sempre as quatro ações, nesta ordem', () => {
    expect(ADVANCED_ACTIONS).toEqual(['eye', 'rotate', 'recover', 'unlink'])
  })

  it('o vínculo pede ação (retry) quando falhou sem QR ou quando a TV foi desvinculada', () => {
    expect(pairingNeedsAction(true, { state: 'failed' }).needed).toBe(true)
    expect(pairingNeedsAction(true, { state: 'ready' }).unlinked).toBe(true)
    expect(pairingNeedsAction(true, { state: 'ready', device: {}, qrUrl: 'x' }).needed).toBe(false)
    expect(pairingNeedsAction(false, { state: 'failed' }).needed).toBe(false)
  })
})
