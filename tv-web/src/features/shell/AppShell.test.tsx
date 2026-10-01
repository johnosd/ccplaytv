import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('"Testar conexão" usa o handler recebido, se houver', () => {
    setNavigatorOnLine(false)
    const onTestConnection = vi.fn()
    render(
      <AppShell topBar={<div>topbar</div>} hints={HINTS} onTestConnection={onTestConnection}>
        <p>x</p>
      </AppShell>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Testar conexão' }))
    expect(onTestConnection).toHaveBeenCalledTimes(1)
  })

  it('"Testar conexão" sem handler re-lê o estado REAL do navegador, sem inventar conectividade', () => {
    setNavigatorOnLine(false)
    render(
      <AppShell topBar={<div>topbar</div>} hints={HINTS}>
        <p>x</p>
      </AppShell>,
    )
    // Continua offline: o navegador ainda diz que não há conexão.
    fireEvent.click(screen.getByRole('button', { name: 'Testar conexão' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    // O navegador passou a dizer que há conexão, mas o evento se perdeu (TV
    // que volta de standby): o botão republica o valor real e o banner some.
    setNavigatorOnLine(true)
    fireEvent.click(screen.getByRole('button', { name: 'Testar conexão' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
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
