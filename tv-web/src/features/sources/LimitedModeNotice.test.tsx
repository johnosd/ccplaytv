import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LimitedModeNotice } from './LimitedModeNotice'

afterEach(cleanup)

describe('LimitedModeNotice (feature 014, US2)', () => {
  it('mostra o motivo certo para protocol_unavailable', () => {
    render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={0} />)

    expect(screen.getByText(/não respondeu ao protocolo completo/)).toBeInTheDocument()
  })

  it('mostra o motivo certo para panel_unreachable', () => {
    render(<LimitedModeNotice reason="panel_unreachable" discardedCount={0} />)

    expect(screen.getByText(/não foi possível falar com o painel/i)).toBeInTheDocument()
  })

  it('motivo desconhecido cai num texto genérico, sem inventar um motivo (FR-020)', () => {
    render(<LimitedModeNotice reason="algo-novo-nunca-visto" discardedCount={0} />)

    expect(screen.getByText(/este provedor não respondeu ao protocolo completo/i)).toBeInTheDocument()
  })

  it('diz que os itens identificados continuam disponíveis', () => {
    render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={0} />)

    expect(screen.getByText(/continuam disponíveis/)).toBeInTheDocument()
  })

  it('lista o que se perde em relação ao protocolo completo', () => {
    render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={0} />)

    expect(screen.getByText(/ordem e identificação das categorias/)).toBeInTheDocument()
    expect(screen.getByText(/quantidade de itens de cada categoria/)).toBeInTheDocument()
    expect(screen.getByText(/temporadas e episódios/)).toBeInTheDocument()
    expect(screen.getByText(/situação da assinatura/)).toBeInTheDocument()
  })

  it('não mostra a linha de descartadas quando não houver nenhuma', () => {
    render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={0} />)

    expect(screen.queryByText(/não foi(m)? reconhecida/)).not.toBeInTheDocument()
  })

  it('mostra a contagem de descartadas no singular', () => {
    render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={1} />)

    expect(screen.getByText('1 entrada não foi reconhecida e ficou de fora.')).toBeInTheDocument()
  })

  it('mostra a contagem de descartadas no plural', () => {
    render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={42} />)

    expect(screen.getByText('42 entradas não foram reconhecidas e ficaram de fora.')).toBeInTheDocument()
  })

  it('diz o que a pessoa pode fazer', () => {
    render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={0} />)

    expect(screen.getByText(/ressincronizar mais tarde/i)).toBeInTheDocument()
    expect(screen.getByText(/falar com o provedor/i)).toBeInTheDocument()
  })

  it('nunca mostra endereço, usuário, senha ou fragmento de URL (FR-022)', () => {
    const { container } = render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={0} />)

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/https?:\/\//)
    expect(text).not.toMatch(/username=|password=/)
  })
})
