import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { PortalDeviceRecord } from '../../lib/portal/portalTables'
import { useCodeReveal } from './useCodeReveal'

const CODE = '0000-1111-2222-3333-4444-5555-6666'
const device = { recoveryCode: CODE, recoveryCodeVersion: 1 } as PortalDeviceRecord

function Harness({ current, active = true }: { current?: PortalDeviceRecord; active?: boolean }) {
  const reveal = useCodeReveal(current, active)
  return <>
    <button type="button" onClick={reveal.toggle}>{reveal.revealed ? 'Ocultar' : 'Mostrar'}</button>
    <p>{reveal.revealed && current ? current.recoveryCode : 'oculto'}</p>
  </>
}
afterEach(() => {
  cleanup()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

it('o código começa oculto e o toggle alterna', () => {
  render(<Harness current={device} />)
  expect(document.body.textContent).not.toContain(CODE)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
  expect(screen.getByText(CODE)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
  expect(document.body.textContent).not.toContain(CODE)
})

it('sair do Avançado (active=false) oculta e o código só volta a aparecer por um novo SELECT', () => {
  const { rerender } = render(<Harness current={device} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
  expect(screen.getByText(CODE)).toBeInTheDocument()
  rerender(<Harness current={device} active={false} />)
  expect(document.body.textContent).not.toContain(CODE)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
  expect(document.body.textContent).not.toContain(CODE)
  rerender(<Harness current={device} />)
  expect(document.body.textContent).not.toContain(CODE)
})

it('pagehide e segundo plano ocultam o código', () => {
  render(<Harness current={device} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
  fireEvent(window, new Event('pagehide'))
  expect(document.body.textContent).not.toContain(CODE)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(document.body.textContent).not.toContain(CODE)
})

it('um código regenerado (nova versão) nunca nasce visível', () => {
  const { rerender } = render(<Harness current={device} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
  rerender(<Harness current={{ ...device, recoveryCode: '9999-8888-7777-6666-5555-4444-3333', recoveryCodeVersion: 2 }} />)
  expect(document.body.textContent).not.toContain('9999-8888-7777-6666-5555-4444-3333')
  expect(screen.getByRole('button', { name: 'Mostrar' })).toBeInTheDocument()
})

it('sem device o toggle não revela nada', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
  expect(screen.getByRole('button', { name: 'Mostrar' })).toBeInTheDocument()
})
