import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PortalDeviceRecord } from '../../lib/portal/portalTables'
import { PortalAdvanced } from './PortalAdvanced'

afterEach(cleanup)
const CODE = '0000-1111-2222-3333-4444-5555-6666'
const device = { recoveryCode: CODE, recoveryCodeVersion: 1 } as PortalDeviceRecord
const hidden = { revealed: false, toggle: vi.fn() }
const ready = { rotate: true, recover: true, unlink: true }

it('mostra os quatro itens na ordem, cada um com o texto de para que serve, e só os quatro botões', () => {
  render(<PortalAdvanced device={device} available={ready} reveal={hidden} onSelect={vi.fn()} />)
  const region = screen.getByRole('region', { name: 'Avançado' })
  expect(within(region).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent))
    .toEqual(['Código de recuperação', 'Gerar nova chave e código', 'Recuperar pelo site', 'Desvincular esta TV'])
  expect(within(region).getAllByRole('button').map(button => button.textContent))
    .toEqual(['Mostrar código de recuperação', 'Gerar nova chave e código', 'Recuperar pelo site', 'Desvincular esta TV'])
  expect(within(region).getByText(/não é uma licença comprada/)).toBeInTheDocument()
  expect(within(region).getByText(/Guarde fora da TV/)).toBeInTheDocument()
  expect(within(region).getByText(/Vincular de novo volta ao mesmo cadastro/)).toBeInTheDocument()
  expect(region.textContent).not.toContain(CODE)
  expect(region.textContent).toContain('••••')
})

it('o código aparece só quando revelado e o olho muda de nome', () => {
  render(<PortalAdvanced device={device} available={ready} reveal={{ revealed: true, toggle: vi.fn() }} onSelect={vi.fn()} />)
  expect(screen.getByText(CODE)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ocultar código de recuperação' })).toBeInTheDocument()
})

it('sem vínculo: olho, nova chave e Desvincular ficam soft-disabled com o motivo visível; Recuperar continua disponível', () => {
  render(<PortalAdvanced available={{ rotate: false, recover: true, unlink: false }} reveal={hidden} onSelect={vi.fn()} />)
  expect(screen.getAllByText('Disponível depois que esta TV for vinculada ao portal.')).toHaveLength(3)
  for (const name of ['Mostrar código de recuperação', 'Gerar nova chave e código', 'Desvincular esta TV']) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
  }
  expect(screen.getByRole('button', { name: 'Recuperar pelo site' })).not.toHaveAttribute('aria-disabled')
})

it('cada botão chama onSelect com o seu id e só o item focado tem o foco', () => {
  const onSelect = vi.fn()
  render(<PortalAdvanced device={device} available={ready} reveal={hidden} focusedId="recover" onSelect={onSelect} />)
  expect(document.querySelector('.tv-focus')).toHaveTextContent('Recuperar pelo site')
  for (const name of ['Mostrar código de recuperação', 'Gerar nova chave e código', 'Recuperar pelo site', 'Desvincular esta TV']) {
    fireEvent.click(screen.getByRole('button', { name }))
  }
  expect(onSelect.mock.calls.map(call => call[0])).toEqual(['eye', 'rotate', 'recover', 'unlink'])
})
