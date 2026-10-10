import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyCategoryAccessChanged } from '../lib/catalog/categoryAccess'
import { db } from '../lib/catalog/db'
import { enableParentalControl, verifyPin } from '../lib/parental/pin'
import { ParentalPinPrompt } from './ParentalPinPrompt'

/**
 * Feature 066 (T033, US4 — FR-027..FR-030): "Esqueci o PIN" confere usuário+senha ou endereço só no aparelho; errado é
 * genérico e não repete nada; certo leva a criar um PIN novo. Nenhuma requisição de rede.
 */

const USER = 'usuario-teste-066'
const SECRET = 'senha-teste-066'
const ADDRESS = 'http://exemplo.invalid/lista.m3u'

const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })
const typePin = async (pin: string) => {
  await act(async () => {
    for (const digit of pin) press(digit)
  })
}
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
  await db.sources.bulkPut([
    { id: 'x', type: 'provider_credentials', displayName: 'Sala', connectionState: 'synced', providerUsername: USER, providerPassword: SECRET, createdAt: 0, updatedAt: 0 },
    { id: 'm', type: 'm3u_url', displayName: 'Quarto', connectionState: 'synced', m3uUrl: ADDRESS, createdAt: 0, updatedAt: 0 },
  ])
  await enableParentalControl('1111', [])
})

afterEach(async () => {
  cleanup()
  fetchSpy.mockRestore()
  await Promise.all([db.sources.clear(), db.table('parentalPin').clear()])
  notifyCategoryAccessChanged() // a regra guardada em memória não vê limpeza direta das tabelas
  localStorage.clear()
})

async function openRecovery() {
  const onSubmit = vi.fn<(pin: string) => Promise<boolean>>().mockResolvedValue(false)
  render(<ParentalPinPrompt title="Digite o PIN" onSubmit={onSubmit} onCancel={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Esqueci o PIN' }))
  await screen.findByRole('dialog', { name: 'Recuperar o PIN' })
}

describe('RecoverPinFlow', () => {
  it('Xtream errado: mensagem genérica, nada do digitado na tela nem em atributos, campos limpos; sem rede', async () => {
    await openRecovery()
    fireEvent.click(screen.getByRole('button', { name: 'Lista Xtream (usuário e senha)' }))
    fireEvent.change(field('Usuário'), { target: { value: USER } })
    fireEvent.change(field('Senha'), { target: { value: 'outra-senha-066' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferir' }))

    expect(await screen.findByText('Os dados não conferem com nenhuma lista cadastrada.')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).not.toContain(USER)
    expect(dialog.textContent).not.toContain('outra-senha-066')
    expect(dialog.outerHTML).not.toContain('outra-senha-066')
    expect(field('Usuário').value).toBe('')
    expect(field('Senha').value).toBe('')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('M3U certo leva a criar um PIN novo (2×), que passa a valer; RETURN na escolha volta ao pedido de PIN', async () => {
    await openRecovery()
    press('Escape')
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci o PIN' }))
    await screen.findByRole('dialog', { name: 'Recuperar o PIN' })

    fireEvent.click(screen.getByRole('button', { name: 'Lista M3U (endereço)' }))
    fireEvent.change(field('Endereço da lista'), { target: { value: `  ${ADDRESS}  ` } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferir' }))

    await screen.findByRole('dialog', { name: 'Crie um PIN de 4 dígitos' })
    await typePin('8642')
    await screen.findByRole('dialog', { name: 'Digite o PIN de novo' })
    await typePin('8642')

    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    await waitFor(async () => expect(await verifyPin('8642')).toBe(true))
    expect(await verifyPin('1111')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
