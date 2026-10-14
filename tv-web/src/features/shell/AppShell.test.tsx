import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'
import { HintBar } from './HintBar'

let restoreOnLine: PropertyDescriptor | undefined

function setNavigatorOnLine(value: boolean) {
  restoreOnLine ??= Object.getOwnPropertyDescriptor(window.navigator, 'onLine')
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

afterEach(() => {
  if (restoreOnLine) Object.defineProperty(window.navigator, 'onLine', restoreOnLine)
  restoreOnLine = undefined
  cleanup()
})

const HINTS = [
  { keyLabel: 'OK', action: 'Selecionar' },
  { keyLabel: 'RETURN', action: 'Sair' },
]

describe('AppShell', () => {
  it('monta a moldura: topbar, conteúdo em <main> e a HintBar, com a classe raiz app-shell', () => {
    setNavigatorOnLine(true)
    const { container } = render(
      <AppShell topBar={<div>topbar-de-teste</div>} hints={HINTS}>
        <p>conteúdo do início</p>
      </AppShell>,
    )
    expect(container.firstElementChild).toHaveClass('app-shell')
    expect(screen.getByText('topbar-de-teste')).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(screen.getByText('conteúdo do início'))
    expect(screen.getByRole('note', { name: 'Teclas do controle remoto' })).toBeInTheDocument()
    expect(screen.getByText('Selecionar')).toBeInTheDocument()
  })

  it('OfflineBanner aparece sem conexão e some sozinho ao voltar, sem tirar o conteúdo (FR-022)', () => {
    setNavigatorOnLine(false)
    render(
      <AppShell topBar={<div>topbar</div>} hints={HINTS}>
        <p>conteúdo do início</p>
      </AppShell>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão com a internet.')
    expect(screen.getByText('conteúdo do início')).toBeInTheDocument()

    act(() => {
      setNavigatorOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => {
      setNavigatorOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('conteúdo do início')).toBeInTheDocument()
  })

  it('online desde o início: nenhum banner', () => {
    setNavigatorOnLine(true)
    render(
      <AppShell topBar={<div>topbar</div>} hints={HINTS}>
        <p>x</p>
      </AppShell>,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // Feature 042 (D-007): a ação "Tentar de novo" saiu do banner e foi para a topbar
  // (coberta em `TopBar.conexao.test.tsx`); o banner offline é só texto.
  it('offline: o banner é só texto — nenhum botão dentro dele', () => {
    setNavigatorOnLine(false)
    render(
      <AppShell topBar={<div>topbar</div>} hints={HINTS}>
        <p>x</p>
      </AppShell>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão com a internet.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

// Feature 060 (D-004): fundo opcional da tela, dentro do shell (sai junto com ele quando o player abre).
describe('AppShell — backdrop opcional (feature 060)', () => {
  it('sem a prop o DOM é o de sempre: nenhuma camada de fundo e a classe raiz continua só app-shell', () => {
    setNavigatorOnLine(true)
    const { container } = render(
      <AppShell topBar={<div>topbar</div>}>
        <p>conteúdo</p>
      </AppShell>,
    )
    expect(container.firstElementChild?.className).toBe('app-shell')
    expect(container.querySelector('.app-shell-backdrop')).toBeNull()
  })

  it('com a prop o fundo é a 1ª camada do shell, decorativa, antes da topbar e do conteúdo', () => {
    setNavigatorOnLine(true)
    const { container } = render(
      <AppShell topBar={<div>topbar</div>} backdrop={<div>fundo-de-teste</div>}>
        <p>conteúdo</p>
      </AppShell>,
    )
    const shell = container.firstElementChild as HTMLElement
    expect(shell).toHaveClass('app-shell', 'app-shell--backdrop')
    const layer = shell.firstElementChild as HTMLElement
    expect(layer).toHaveClass('app-shell-backdrop')
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer).toHaveTextContent('fundo-de-teste')
    expect(screen.getByText('topbar')).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(screen.getByText('conteúdo'))
  })
})

describe('HintBar', () => {
  it('mostra cada tecla com a ação daquele contexto, legível e sem itens focáveis', () => {
    render(<HintBar hints={HINTS} />)
    const bar = screen.getByRole('note')
    expect(bar).toHaveTextContent('OK')
    expect(bar).toHaveTextContent('Selecionar')
    expect(bar).toHaveTextContent('RETURN')
    expect(bar).toHaveTextContent('Sair')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(bar).not.toHaveAttribute('aria-hidden')
  })
})
