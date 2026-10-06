import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HomeBillboard, type BillboardAction, type HomeBillboardProps } from './HomeBillboard'

/**
 * Billboard do Início (feature 060, `logic/billboard-e-navegacao.md` §2). O nome acessível da primária é só o rótulo — o
 * contrato travado da 026 exige `/^(▶\s*)?Continuar$/` — e "T1:E3 · faltam X" é a DESCRIÇÃO, nunca parte do nome.
 */

afterEach(cleanup)

const CONTINUE_NAME = /^(▶\s*)?Continuar$/

function renderBillboard(actions: BillboardAction[], over: Partial<HomeBillboardProps> = {}) {
  return render(
    <HomeBillboard
      state="expanded"
      ariaLabel="Arrival"
      eyebrow="FILME · CONTINUAR ASSISTINDO"
      title="Arrival"
      synopsis="Uma linguista decifra a língua de visitantes."
      actions={actions}
      focusedActionId="primary"
      dock={<div role="group" aria-label="Serviços" />}
      {...over}
    />,
  )
}

describe('HomeBillboard — primária (nome × descrição)', () => {
  it('com progresso real: o nome continua só "Continuar"; o episódio e o tempo restante são a descrição; a barra é decorativa', () => {
    const { container } = renderBillboard([
      { id: 'primary', label: '▶ Continuar', code: 'T1:E3', progress: { percent: 40, remainingSeconds: 26 * 60 } },
      { id: 'details', label: 'Mais informações' },
    ])
    const button = screen.getByRole('button', { name: CONTINUE_NAME })
    expect(button).toHaveClass('tv-focus')
    expect(button).toHaveAccessibleDescription('T1:E3 · faltam 26 min')
    const fill = container.querySelector<HTMLElement>('.home-hero-progress-fill')!
    expect(fill.style.width).toBe('40%')
    expect(container.querySelector('.home-hero-progress')).toHaveAttribute('aria-hidden', 'true')
  })

  it('sem progresso (falta posição ou duração): nada de barra, de "faltam" nem de descrição', () => {
    const { container } = renderBillboard([{ id: 'primary', label: '▶ Continuar', progress: null }])
    const button = screen.getByRole('button', { name: CONTINUE_NAME })
    expect(button).not.toHaveAttribute('aria-describedby')
    expect(container.querySelector('.home-hero-progress')).toBeNull()
    expect(container.querySelector('.home-hero-action-hint')).toBeNull()
  })

  it('série sem duração do episódio: só o código na descrição, sem "faltam"', () => {
    renderBillboard([{ id: 'primary', label: '▶ Continuar', code: 'T2:E5', progress: null }])
    expect(screen.getByRole('button', { name: CONTINUE_NAME })).toHaveAccessibleDescription('T2:E5')
  })
})

describe('HomeBillboard — ações e estados', () => {
  it('Trailer soft-disabled (consultando/indisponível) continua um botão focável, dito indisponível por aria-disabled', () => {
    renderBillboard(
      [
        { id: 'primary', label: '▶ Continuar' },
        { id: 'trailer', label: 'Trailer indisponível', softDisabled: true },
      ],
      { focusedActionId: 'trailer' },
    )
    const trailer = screen.getByRole('button', { name: 'Trailer indisponível' })
    expect(trailer).toHaveAttribute('aria-disabled', 'true')
    expect(trailer).toHaveClass('is-soft-disabled', 'tv-focus')
  })

  it('só a ação com o foco recebe tv-focus; sem foco nas ações (foco nas fileiras/dock) nenhuma recebe', () => {
    const actions: BillboardAction[] = [
      { id: 'primary', label: '▶ Continuar' },
      { id: 'details', label: 'Mais informações' },
    ]
    const { container, rerender } = renderBillboard(actions, { focusedActionId: 'details' })
    expect([...container.querySelectorAll('.tv-focus')].map((el) => el.textContent)).toEqual(['Mais informações'])

    rerender(
      <HomeBillboard state="collapsed" ariaLabel="Arrival" title="Arrival" actions={actions} dock={<div />} />,
    )
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(0)
    expect(container.querySelector('.home-hero')).toHaveAttribute('data-state', 'collapsed')
  })

  it('boas-vindas: título, descrição e os dois atalhos, sem metadata, chips nem sinopse', () => {
    const { container } = renderBillboard(
      [
        { id: 'shortcut-live', label: 'Abrir TV ao vivo' },
        { id: 'shortcut-movies', label: 'Abrir Filmes' },
      ],
      { eyebrow: undefined, synopsis: undefined, description: 'Favorite canais, filmes e séries.', title: 'Bem-vindo(a) ao CCPlayTV', focusedActionId: 'shortcut-live' },
    )
    expect(screen.getByText('Favorite canais, filmes e séries.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir TV ao vivo' })).toHaveClass('tv-focus')
    expect(container.querySelector('.home-hero-synopsis')).toBeNull()
    expect(container.querySelector('.home-hero-eyebrow')).toBeNull()
  })

  it('o dock vai dentro do billboard, no canto', () => {
    const { container } = renderBillboard([{ id: 'primary', label: '▶ Continuar' }])
    expect(container.querySelector('.home-hero-dock')).toContainElement(screen.getByRole('group', { name: 'Serviços' }))
  })
})
