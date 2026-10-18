import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PixPurchasePort } from '../../lib/licensing/pixPurchase'
import { PortalRequestError } from '../../lib/portal/portalClient'
import { LicensePixScreen } from './LicensePixScreen'

afterEach(() => { cleanup(); vi.clearAllMocks() })

// FR-010, US2/AC5, Constitution: Foco Visível e Sem Becos Sem Saída — venda aberta sem Pix leva ao cartão no site.
it('Pix desligado com venda aberta mostra QR e endereço do site para pagar com cartão, sem Tentar novamente; Voltar sai', async () => {
  const onBack = vi.fn()
  const purchase: PixPurchasePort = {
    open: vi.fn<PixPurchasePort['open']>().mockRejectedValueOnce(new PortalRequestError('pix_disabled')),
    refresh: vi.fn<PixPurchasePort['refresh']>(),
  }
  render(<LicensePixScreen purchase={purchase} onLicensed={vi.fn()} onBack={onBack} site="https://portal.fixture.test" />)
  expect(await screen.findByText(/portal\.fixture\.test/)).toBeInTheDocument()
  expect(screen.getByRole('dialog').querySelector('svg[role="img"]')).not.toBeNull()
  expect(screen.queryByText('A compra está indisponível no momento.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(onBack).toHaveBeenCalledOnce()
  expect(purchase.open).toHaveBeenCalledOnce()
  expect(purchase.refresh).not.toHaveBeenCalled()
})
