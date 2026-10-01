/**
 * Regressão (achado na feature 036): linhas de largura total de Configurações
 * escalavam no foco (`scale(1.06)`) e o `overflow` do painel recortava as
 * bordas ("eduzir movimento" … "Ligad"). Linhas não escalam (DS V14 §11):
 * levam `.no-scale` e mantêm o resto da receita de foco. A folga do anel em
 * `.settings-panel` é CSS — provada pela paridade visual, não aqui.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityPanel } from './AccessibilityPanel'
import { AboutPanel } from './AboutPanel'
import { PrivacyPanel } from './PrivacyPanel'
import { ADD_SOURCE_ID, SourcesPanel } from './SourcesPanel'

afterEach(() => cleanup())

function focusedHasNoScale(): boolean {
  const focused = document.querySelector('.tv-focus')
  return focused !== null && focused.classList.contains('no-scale')
}

describe('Configurações — linhas de largura total não escalam no foco', () => {
  it('Acessibilidade: a linha real e as "Em breve"', () => {
    const { rerender } = render(<AccessibilityPanel reducedMotion={false} focusedRow={0} onActivateRow={vi.fn()} />)
    expect(focusedHasNoScale()).toBe(true)
    rerender(<AccessibilityPanel reducedMotion={false} focusedRow={2} onActivateRow={vi.fn()} />)
    expect(focusedHasNoScale()).toBe(true)
  })

  it('Fontes IPTV: "Adicionar lista"', () => {
    render(
      <SourcesPanel
        sources={[]}
        activeSourceId={null}
        focusedRowId={ADD_SOURCE_ID}
        focusedCol={0}
        resyncPending={false}
        deletePending={false}
        onActivateRow={vi.fn()}
      />,
    )
    expect(focusedHasNoScale()).toBe(true)
  })

  it('Sobre & créditos e Privacidade', () => {
    render(<AboutPanel focused />)
    expect(focusedHasNoScale()).toBe(true)
    cleanup()

    const empty = { titles: 0, unavailable: 0, hasProgress: false }
    render(
      <PrivacyPanel
        listName="Sala"
        summaries={{ movies: empty, series: empty, both: empty }}
        focusedRow={1}
        onActivateRow={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(focusedHasNoScale()).toBe(true)
  })
})
