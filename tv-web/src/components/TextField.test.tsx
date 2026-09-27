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

  it('rótulo continua visível com o campo vazio', () => {
    render(<TextField label="Campo" value="" onChange={vi.fn()} purpose="text" />)
    expect(screen.getByText('Campo')).toBeInTheDocument()
  })
})
