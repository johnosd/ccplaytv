import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TextField, type TextFieldPurpose } from './TextField'

afterEach(cleanup)

const CASES: { purpose: TextFieldPurpose; attrs: Record<string, string | undefined> }[] = [
  { purpose: 'search', attrs: { inputmode: 'search' } },
  { purpose: 'url', attrs: { inputmode: 'url', type: 'url' } },
  { purpose: 'username', attrs: { autocomplete: 'username' } },
  { purpose: 'password', attrs: { type: 'password', autocomplete: 'current-password' } },
  { purpose: 'text', attrs: {} },
]

describe('TextField', () => {
  it.each(CASES)('purpose $purpose aplica os atributos certos', ({ purpose, attrs }) => {
    render(<TextField label="Campo" value="" onChange={vi.fn()} purpose={purpose} />)
    const input = screen.getByLabelText('Campo')
    for (const [attr, expected] of Object.entries(attrs)) {
      expect(input).toHaveAttribute(attr, expected)
    }
  })

  it('com erro, aria-describedby aponta pro parágrafo de erro', () => {
    render(<TextField label="Campo" value="" onChange={vi.fn()} purpose="text" error="Campo obrigatório" />)
    const input = screen.getByLabelText('Campo')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent('Campo obrigatório')
  })

  it('hint fica visível e ligado ao campo por aria-describedby (feature 023, D-013)', () => {
    render(<TextField label="Senha" value="" onChange={vi.fn()} purpose="password" hint="Deixe em branco para manter a senha atual" />)
    const input = screen.getByLabelText('Senha')
    expect(screen.getByText('Deixe em branco para manter a senha atual')).toBeVisible()
    const describedBy = input.getAttribute('aria-describedby')!
    expect(document.getElementById(describedBy)).toHaveTextContent('Deixe em branco para manter a senha atual')
  })

  it('com hint e erro juntos, aria-describedby lista os dois e o valor do campo não vira placeholder', () => {
    render(<TextField label="Campo" value="" onChange={vi.fn()} purpose="text" hint="Apoio" error="Obrigatório" />)
    const input = screen.getByLabelText('Campo')
    const ids = input.getAttribute('aria-describedby')!.split(' ')
    expect(ids).toHaveLength(2)
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(
      expect.arrayContaining(['Apoio', expect.stringContaining('Obrigatório')]),
    )
    expect(input).not.toHaveAttribute('placeholder')
  })

  it('sem hint nem erro, não há aria-describedby', () => {
    render(<TextField label="Campo" value="" onChange={vi.fn()} purpose="text" />)
    expect(screen.getByLabelText('Campo')).not.toHaveAttribute('aria-describedby')
  })

  it('rótulo continua visível com o campo vazio', () => {
    render(<TextField label="Campo" value="" onChange={vi.fn()} purpose="text" />)
    expect(screen.getByText('Campo')).toBeInTheDocument()
  })
})
