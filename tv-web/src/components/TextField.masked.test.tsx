import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TextField, type TextFieldPurpose } from './TextField'

afterEach(cleanup)

// Feature 070 (FR-010): a máscara controlada pelo formulário vale para qualquer finalidade.
describe('TextField — masked controlado pelo formulário', () => {
  function typeFor(purpose: TextFieldPurpose, masked: boolean | undefined) {
    render(<TextField label="Campo" purpose={purpose} value="x" onChange={() => {}} masked={masked} />)
    return (screen.getByLabelText('Campo') as HTMLInputElement).type
  }

  it('sem `masked` nada muda: senha continua mascarada e url continua url', () => {
    expect(typeFor('password', undefined)).toBe('password')
    cleanup()
    expect(typeFor('url', undefined)).toBe('url')
  })

  it('masked=false mostra até a senha; masked=true esconde url e usuário', () => {
    expect(typeFor('password', false)).toBe('text')
    cleanup()
    expect(typeFor('url', false)).toBe('url')
    cleanup()
    expect(typeFor('url', true)).toBe('password')
    cleanup()
    expect(typeFor('username', true)).toBe('password')
  })

  it('o mesmo input troca de tipo sem remontar (foco e cursor preservados)', () => {
    const { rerender } = render(<TextField label="Campo" purpose="username" value="x" onChange={() => {}} masked={false} />)
    const input = screen.getByLabelText('Campo')
    rerender(<TextField label="Campo" purpose="username" value="x" onChange={() => {}} masked />)
    expect(screen.getByLabelText('Campo')).toBe(input)
    expect((input as HTMLInputElement).type).toBe('password')
  })
})
