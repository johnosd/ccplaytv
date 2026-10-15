import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { TextField, type TextFieldPurpose } from './TextField'

function Harness({ revealable = true, purpose = 'password' }: { revealable?: boolean; purpose?: TextFieldPurpose }) {
  const [value, setValue] = useState('minha-senha-secreta')
  return <TextField label="Senha" purpose={purpose} revealable={revealable} revealNoun="senha" value={value} onChange={setValue} hint="dica" />
}

describe('TextField — "Mostrar/Ocultar" (feature 045, US4)', () => {
  afterEach(cleanup)

  it('nasce mascarado; o controle revela e mascara, trocando nome, texto e aria-pressed', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Senha')
    expect(input).toHaveAttribute('type', 'password')

    const show = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(show).toHaveAttribute('aria-pressed', 'false')
    expect(show).toHaveTextContent('Mostrar')
    fireEvent.click(show)

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text')
    const hide = screen.getByRole('button', { name: 'Ocultar senha' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    expect(hide).toHaveTextContent('Ocultar')

    fireEvent.click(hide)
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  })

  it('é o mesmo <input> (não remonta): o foco e o valor sobrevivem ao revelar', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Senha')
    input.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(screen.getByLabelText('Senha')).toBe(input)
    expect(input).toHaveValue('minha-senha-secreta')
  })

  it('o botão vem logo depois do campo no DOM (ordem de foco)', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Senha')
    const button = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(input.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(input.nextElementSibling).toBe(button)
  })

  it('desmontar e voltar mascara de novo', () => {
    const { unmount } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    unmount()
    render(<Harness />)
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  })

  it('nunca imprime o valor em nome acessível nem em atributo aria-*', () => {
    const { container } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    const attributes = Array.from(container.querySelectorAll('*')).flatMap((element) =>
      element.getAttributeNames().filter((name) => name.startsWith('aria-')).map((name) => element.getAttribute(name)),
    )
    expect(attributes.join(' ')).not.toContain('minha-senha-secreta')
  })

  it('sem `revealable`, ou fora de purpose="password", não há botão', () => {
    const { rerender } = render(<Harness revealable={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<Harness purpose="text" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
