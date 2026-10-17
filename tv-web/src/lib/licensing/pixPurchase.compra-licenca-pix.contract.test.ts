import { expect, it, vi } from 'vitest'
import { PortalRequestError } from '../portal/portalClient'
import { createPixPurchase } from './pixPurchase'

const QR = '00020126580014br.gov.bcb.pix0136fixture-chave-pix-ccplay52040000530398654053500.005802BR5907CCPLAY6009SAO PAULO6304ABCD'
const BEARER = 'device-a.' + 'a'.repeat(42) + 'A'
const body = { orderId: 'pedido-1', state: 'pending', qrCode: QR, expiresAt: '2026-10-15T12:30:00.000Z',
  serverTime: '2026-10-15T12:00:00.000Z', priceMinor: 3500, termMonths: 12, displayId: 'A0:8C:FD:19:0A:8C' }

// FR-002, FR-005, FR-006, FR-008, FR-012: rotas fixas com bearer; licença só depois de aprovado; resposta adulterada
// (preço, QR que não é Pix, estado desconhecido) vira erro sanitizado, sem ecoar o corpo.
it('abre e atualiza pelas rotas fixas, só busca a licença quando aprovado e recusa resposta adulterada sem ecoar', async () => {
  const request = vi.fn()
  const refreshLicense = vi.fn(async () => ({ ok: true }))
  const purchase = createPixPurchase({ request: request as never, device: async () => ({ bearer: BEARER, displayId: 'A0:8C:FD:19:0A:8C' }),
    refreshLicense, newRequestId: () => 'tentativa-1' })

  request.mockResolvedValueOnce(body)
  expect(await purchase.open({ renew: false })).toMatchObject({ orderId: 'pedido-1', state: 'pending', qrCode: QR,
    expiresAt: Date.parse(body.expiresAt), serverTime: Date.parse(body.serverTime), priceMinor: 3500, termMonths: 12 })
  expect(request).toHaveBeenLastCalledWith('/portal/v1/device/orders/pix',
    expect.objectContaining({ bearer: BEARER, body: { renew: false, requestId: 'tentativa-1' } }))

  request.mockResolvedValueOnce(body)
  expect(await purchase.refresh('pedido-1')).toMatchObject({ licensed: false, charge: { state: 'pending' } })
  expect(request).toHaveBeenLastCalledWith('/portal/v1/device/orders/pix/refresh',
    expect.objectContaining({ bearer: BEARER, body: { orderId: 'pedido-1' } }))
  expect(refreshLicense).not.toHaveBeenCalled()

  request.mockResolvedValueOnce({ ...body, state: 'approved', qrCode: undefined })
  expect(await purchase.refresh('pedido-1')).toMatchObject({ licensed: true, charge: { state: 'approved' } })
  expect(refreshLicense).toHaveBeenCalledOnce()

  for (const tampered of [{ ...body, priceMinor: 1 }, { ...body, qrCode: 'https://evil.test/pix' }, { ...body, state: 'pago' }]) {
    request.mockResolvedValueOnce(tampered)
    const error = await purchase.open({ renew: false }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PortalRequestError)
    expect((error as PortalRequestError).code).toBe('service_unavailable')
    expect(String(error)).not.toContain('evil')
  }
})
