import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PixCharge, PixPurchasePort } from '../../lib/licensing/pixPurchase'
import { PortalRequestError } from '../../lib/portal/portalClient'
import { LicensePixScreen } from './LicensePixScreen'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const SITE = 'https://portal.fixture.test'
const pending: PixCharge = { orderId: 'pedido-1', state: 'pending', serverTime: 0, expiresAt: 1_800_000, priceMinor: 3500,
  termMonths: 12, qrCode: '00020126580014br.gov.bcb.pix0136fixture6304ABCD' }

function port(open: PixPurchasePort['open']): PixPurchasePort {
  return { open: vi.fn(open), refresh: vi.fn<PixPurchasePort['refresh']>() }
}

// 081/T044, FR-010 (emenda): o Pix falhou agora com a venda aberta → site como alternativa, Tentar novamente e Voltar.
it('Pix que falhou agora mostra o erro, o site como alternativa e mantém Tentar novamente', async () => {
  const purchase = port(vi.fn<PixPurchasePort['open']>()
    .mockRejectedValueOnce(new PortalRequestError('pix_failed'))
    .mockResolvedValueOnce(pending))
  render(<LicensePixScreen purchase={purchase} onLicensed={vi.fn()} onBack={vi.fn()} site={SITE} />)
  expect(await screen.findByText('Não foi possível gerar o Pix agora.')).toBeInTheDocument()
  expect(screen.getByText(/compre com cartão no site https:\/\/portal\.fixture\.test/)).toBeInTheDocument()
  expect(screen.getByRole('dialog').querySelector('svg[role="img"]')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText(pending.qrCode!)).toBeInTheDocument()
  expect(purchase.open).toHaveBeenCalledTimes(2)
})

// Venda fechada para todos: o site também não vende — não manda a pessoa para lá.
it('venda fechada diz indisponível e não oferece o site', async () => {
  const purchase = port(async () => { throw new PortalRequestError('service_unavailable') })
  render(<LicensePixScreen purchase={purchase} onLicensed={vi.fn()} onBack={vi.fn()} site={SITE} />)
  expect(await screen.findByText('A compra está indisponível no momento. Tente mais tarde.')).toBeInTheDocument()
  expect(screen.queryByText(/portal\.fixture\.test/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
})

// 081/FR-009: quem vende, contato e reembolso aparecem antes de pagar (tela do Pix e alternativas).
it('mostra vendedor, contato e reembolso de 7 dias junto do Pix', async () => {
  render(<LicensePixScreen purchase={port(async () => pending)} onLicensed={vi.fn()} onBack={vi.fn()} site={SITE} />)
  await screen.findByText(pending.qrCode!)
  expect(screen.getByText(/Vendido por CCPlayTV · ccplaytv@gmail\.com · Reembolso em até 7 dias/)).toBeInTheDocument()
})
