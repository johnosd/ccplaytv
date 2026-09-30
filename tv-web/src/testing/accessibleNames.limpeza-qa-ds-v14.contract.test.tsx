/**
 * Contrato da feature 028 (Limpeza e QA do DS V14) — o verificador de nomes
 * acessíveis que todos os testes de tela usam (FR-017). Pela interface
 * pública só: quais elementos ele aponta e por quê.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { findUnnamedControls } from './accessibleNames'

afterEach(() => {
  cleanup()
})

describe('findUnnamedControls (feature 028)', () => {
  // FR-015: todo elemento focável/interativo precisa de nome acessível; os ocultos não contam.
  it('aponta, em ordem de documento, só os controles focáveis sem nome acessível', () => {
    const { container } = render(
      <div>
        <button type="button">Assistir</button>
        <button type="button" aria-label="Voltar 10 segundos">
          <svg aria-hidden="true" />
        </button>
        <span id="rotulo-busca">Buscar</span>
        <input aria-labelledby="rotulo-busca" />
        <label>
          Nome de exibição <input />
        </label>
        <button type="button" data-testid="so-icone">
          <svg aria-hidden="true" />
        </button>
        <div tabIndex={0} data-testid="div-focavel" />
        <div role="tab" data-testid="aba-sem-nome" />
        <div aria-hidden="true">
          <button type="button" />
        </div>
        <button type="button" hidden />
        <div tabIndex={-1} />
      </div>,
    )

    const found = findUnnamedControls(container)

    expect(found.map((f) => f.element)).toEqual([
      screen.getByTestId('so-icone'),
      screen.getByTestId('div-focavel'),
      screen.getByTestId('aba-sem-nome'),
    ])
    expect(found.every((f) => f.reason === 'no-name')).toBe(true)
    expect(found.every((f) => f.description.trim().length > 0)).toBe(true)
  })

  // FR-016: soft/hard disabled anuncia a indisponibilidade no nome ou em aria-disabled; sem nome, "no-name" prevalece.
  it('exige que controle soft/hard disabled anuncie a indisponibilidade, com uma entrada só por elemento', () => {
    const { container } = render(
      <div>
        <button type="button" className="is-soft-disabled" aria-disabled="true">
          Guia
        </button>
        <button type="button" className="is-soft-disabled">
          Qualidade — em breve
        </button>
        <button type="button" className="is-hard-disabled">
          Próximo episódio — indisponível
        </button>
        <button type="button" disabled>
          Salvar
        </button>
        <button type="button" className="is-soft-disabled" data-testid="soft-mudo">
          Velocidade
        </button>
        <button type="button" className="is-hard-disabled" data-testid="hard-mudo">
          Excluir
        </button>
        <button type="button" className="is-soft-disabled" data-testid="soft-sem-nome">
          <svg aria-hidden="true" />
        </button>
      </div>,
    )

    const found = findUnnamedControls(container)

    expect(found.map((f) => [f.element, f.reason])).toEqual([
      [screen.getByTestId('soft-mudo'), 'disabled-unannounced'],
      [screen.getByTestId('hard-mudo'), 'disabled-unannounced'],
      [screen.getByTestId('soft-sem-nome'), 'no-name'],
    ])
  })
})
