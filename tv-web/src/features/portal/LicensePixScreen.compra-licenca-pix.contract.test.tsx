import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PixCharge, PixPurchasePort } from '../../lib/licensing/pixPurchase'
import { PortalRequestError } from '../../lib/portal/portalClient'
import { LicensePixScreen } from './LicensePixScreen'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const QR = '00020126580014br.gov.bcb.pix0136fixture-chave-pix-ccplay52040000530398654053500.005802BR5907CCPLAY6009SAO PAULO6304ABCD'
const pending: PixCharge = { orderId: 'pedido-1', state: 'pending', qrCode: QR, expiresAt: 1_800_000, serverTime: 0,
  priceMinor: 3500, termMonths: 12, displayId: 'A0:8C:FD:19:0A:8C' }

function port(overrides: Partial<PixPurchasePort> = {}) {
  return {
    open: vi.fn<PixPurchasePort['open']>(async () => pending),
    refresh: vi.fn<PixPurchasePort['refresh']>(async () => ({ charge: pending, licensed: false })),
    ...overrides,
  }
}

// US1/AC1, FR-002, FR-003, SC-004: abrir a tela gera/reaproveita o Pix uma vez; mover o foco não consulta nada.
it('abre com um único pedido de Pix e mostra copia-e-cola, R$ 35, 12 meses, ID da TV e prazo; setas não consultam', async () => {
  const purchase = port()
  render(<LicensePixScreen purchase={purchase} onLicensed={vi.fn()} onBack={vi.fn()} />)
  expect(await screen.findByText(QR)).toBeInTheDocument()
  expect(screen.getByRole('dialog')).toHaveTextContent(/R\$\s?35/)
  expect(screen.getByRole('dialog')).toHaveTextContent(/12 meses/)
  expect(screen.getByRole('dialog')).toHaveTextContent('A0:8C:FD:19:0A:8C')
  expect(screen.getByRole('dialog')).toHaveTextContent(/30 min/)
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) fireEvent.keyDown(document, { key })
  expect(purchase.open).toHaveBeenCalledOnce()
  expect(purchase.open).toHaveBeenCalledWith({ renew: false }, expect.anything())
  expect(purchase.refresh).not.toHaveBeenCalled()
})

// US1/AC2, US1/AC3, FR-005, FR-006, FR-007: só o Atualizar consulta; pendente não libera, aprovado libera uma vez.
it('Atualizar com Pix pendente explica e mantém o QR; Atualizar com pagamento aprovado chama onLicensed uma vez', async () => {
  const onLicensed = vi.fn()
  const purchase = port({ refresh: vi.fn<PixPurchasePort['refresh']>()
    .mockResolvedValueOnce({ charge: pending, licensed: false })
    .mockResolvedValueOnce({ charge: { ...pending, state: 'approved', qrCode: undefined }, licensed: true }) })
  render(<LicensePixScreen purchase={purchase} onLicensed={onLicensed} onBack={vi.fn()} />)
  await screen.findByText(QR)
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  expect(await screen.findByText('Pagamento ainda não confirmado.')).toBeInTheDocument()
  expect(screen.getByText(QR)).toBeInTheDocument()
  expect(onLicensed).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  await waitFor(() => expect(onLicensed).toHaveBeenCalledOnce())
  expect(purchase.refresh).toHaveBeenNthCalledWith(1, 'pedido-1', expect.anything())
  expect(purchase.refresh).toHaveBeenCalledTimes(2)
  expect(purchase.open).toHaveBeenCalledOnce()
})

// US1/AC5, US1/AC6, US1/AC7, FR-004, FR-007, FR-013, Constitution: Foco Visível e Sem Becos Sem Saída.
it('falha de rede tem Tentar novamente e Voltar sem falar em recusa; Pix vencido só é trocado por Gerar novo Pix', async () => {
  const onBack = vi.fn()
  const purchase = port({ open: vi.fn<PixPurchasePort['open']>()
    .mockRejectedValueOnce(new PortalRequestError('network_error'))
    .mockResolvedValueOnce({ ...pending, state: 'expired', qrCode: undefined })
    .mockResolvedValueOnce({ ...pending, orderId: 'pedido-2' }) })
  render(<LicensePixScreen purchase={purchase} onLicensed={vi.fn()} onBack={onBack} />)
  expect(await screen.findByText('Sem conexão com o serviço.')).toBeInTheDocument()
  expect(screen.getByRole('dialog')).not.toHaveTextContent(/recusad/i)
  expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('Este Pix venceu.')).toBeInTheDocument()
  expect(screen.queryByText(QR)).not.toBeInTheDocument()
  expect(purchase.open).toHaveBeenCalledTimes(2)
  expect(purchase.open).toHaveBeenNthCalledWith(2, { renew: false }, expect.anything())
  fireEvent.click(screen.getByRole('button', { name: 'Gerar novo Pix' }))
  expect(await screen.findByText(QR)).toBeInTheDocument()
  expect(purchase.open).toHaveBeenNthCalledWith(3, { renew: true }, expect.anything())
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(onBack).toHaveBeenCalledOnce()
})
