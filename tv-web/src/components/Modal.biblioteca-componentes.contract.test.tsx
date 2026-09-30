import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRemoteNav } from '../lib/useRemoteNav'
import { Modal } from './Modal'

afterEach(cleanup)

function ScreenBehind({
  onDirection,
  onSelect,
  onBack,
}: {
  onDirection: () => void
  onSelect: () => void
  onBack: () => void
}) {
  useRemoteNav({ onDirection, onSelect, onBack })
  return <div>tela por trás</div>
}

describe('022 — Modal', () => {
  // US1/AC1-AC3 · FR-006-FR-008 · Constitution: Foco Visível e Sem Becos Sem Saída / Voltar Restaura Foco e Posição
  it('intercepta o teclado — setas/SELECT vão pro conteúdo do modal, RETURN chama onBack, e a tela por trás não recebe nada enquanto ele está aberto', () => {
    const backgroundOnDirection = vi.fn()
    const backgroundOnSelect = vi.fn()
    const backgroundOnBack = vi.fn()
    const modalOnDirection = vi.fn()
    const modalOnSelect = vi.fn()
    const modalOnBack = vi.fn()

    render(
      <>
        <ScreenBehind onDirection={backgroundOnDirection} onSelect={backgroundOnSelect} onBack={backgroundOnBack} />
        <Modal onDirection={modalOnDirection} onSelect={modalOnSelect} onBack={modalOnBack} ariaLabel="Teste">
          <button type="button">conteúdo do modal</button>
        </Modal>
      </>,
    )

    // Dispara em `document.body` (descendente de `document`), nunca em
    // `document` diretamente: só assim a fase de CAPTURA do Modal
    // (`useRemoteNav({modal:true})`) roda antes da fase de BUBBLE da tela
    // por trás (sem `modal`) — disparado direto em `document`, os dois
    // listeners ficam no mesmo nó-alvo, e a ordem vira só a de registro,
    // não a de fase (confirmado experimentalmente antes de travar este
    // contrato — ver Cuidados para Retomada do plan.md).
    fireEvent.keyDown(document.body, { key: 'ArrowRight', bubbles: true })
    expect(modalOnDirection).toHaveBeenCalledWith('right')
    expect(backgroundOnDirection).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    expect(modalOnSelect).toHaveBeenCalledTimes(1)
    expect(backgroundOnSelect).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'Backspace', bubbles: true })
    expect(modalOnBack).toHaveBeenCalledTimes(1)
    expect(backgroundOnBack).not.toHaveBeenCalled()
  })

  // FR-009 · D-010
  it('um segundo Modal montado enquanto o primeiro está aberto não renderiza conteúdo nem intercepta teclado', () => {
    const onBackA = vi.fn()
    const onSelectA = vi.fn()
    const onBackB = vi.fn()
    const onSelectB = vi.fn()

    render(
      <>
        <Modal onSelect={onSelectA} onBack={onBackA} ariaLabel="Modal A">
          <button type="button">conteúdo A</button>
        </Modal>
        <Modal onSelect={onSelectB} onBack={onBackB} ariaLabel="Modal B">
          <button type="button">conteúdo B</button>
        </Modal>
      </>,
    )

    expect(screen.getByText('conteúdo A')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo B')).not.toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    expect(onSelectA).toHaveBeenCalledTimes(1)
    expect(onSelectB).not.toHaveBeenCalled()
  })
})
