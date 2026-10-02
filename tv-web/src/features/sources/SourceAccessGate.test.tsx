import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceAccessGate } from './SourceAccessGate'
import type { AccountCheckResult } from '../../lib/catalog/accountCheck'
import type { SourceOut } from '../import/importApi'
import { findUnnamedControls } from '../../testing/accessibleNames'

afterEach(cleanup)

const SOURCE: SourceOut = {
  id: 'src-xtream',
  type: 'provider_credentials',
  display_name: 'Lista da sala',
  connection_state: 'synced',
  last_successful_sync_at: '2026-09-20T12:00:00.000Z',
  provider_import_mode: 'xtream_api',
  limited_reason: null,
  provider_dns: 'painel.exemplo.test',
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })
const FUTURE = new Date(2099, 0, 1).getTime()
const PAST = new Date(2026, 8, 20, 12).getTime()

type Deferred = { promise: Promise<AccountCheckResult>; resolve: (r: AccountCheckResult) => void }
function deferred(): Deferred {
  let resolve!: (r: AccountCheckResult) => void
  const promise = new Promise<AccountCheckResult>((r) => (resolve = r))
  return { promise, resolve }
}

function renderGate(overrides: Partial<React.ComponentProps<typeof SourceAccessGate>> = {}) {
  const props = {
    source: SOURCE,
    decision: { action: 'blocked', reason: 'expired', expiresAt: PAST } as const,
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onBack: vi.fn(),
    checkAccount: vi.fn(),
    ...overrides,
  }
  const view = render(<SourceAccessGate {...props} />)
  return { props, view }
}

describe('SourceAccessGate (feature 034, US2)', () => {
  it('verificando: só "Voltar", focado, com o texto de espera; RETURN sai sem esperar a rede', () => {
    const pending = deferred()
    const { props } = renderGate({ decision: { action: 'check' }, checkAccount: vi.fn(() => pending.promise) })
    expect(screen.getByText('Verificando a conta da lista…')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)
    expect(props.onOpen).not.toHaveBeenCalled()
  })

  it('verificando → conta válida: abre a lista; a consulta inicial roda uma vez só', async () => {
    const checkAccount = vi.fn().mockResolvedValue({ fresh: true, account: { status: 'active', expiresAt: FUTURE, checkedAt: Date.now() } })
    const { props } = renderGate({ decision: { action: 'check' }, checkAccount })
    await act(async () => {})
    expect(checkAccount).toHaveBeenCalledTimes(1)
    expect(props.onOpen).toHaveBeenCalledWith(SOURCE)
  })

  it('verificando → vencida: vira bloqueio com a data e o foco em "Editar lista"', async () => {
    const checkAccount = vi.fn().mockResolvedValue({ fresh: true, account: { status: 'active', expiresAt: PAST, checkedAt: Date.now() } })
    renderGate({ decision: { action: 'check' }, checkAccount })
    await act(async () => {})
    expect(screen.getByText('A assinatura desta lista venceu em 20/09/2026.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar lista' })).toHaveClass('tv-focus')
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('credencial recusada: a mensagem do FR-010 e as mesmas três ações', () => {
    renderGate({ decision: { action: 'blocked', reason: 'refused' } })
    expect(screen.getByText('O provedor recusou o usuário ou a senha desta lista.')).toBeInTheDocument()
    for (const name of ['Editar lista', 'Verificar de novo', 'Voltar']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('vencida sem data conhecida: "A assinatura desta lista venceu."', () => {
    renderGate({ decision: { action: 'blocked', reason: 'expired' } })
    expect(screen.getByText('A assinatura desta lista venceu.')).toBeInTheDocument()
  })

  it('"Editar lista" chama onEdit; ←/→ andam com clamp nas pontas', () => {
    const { props } = renderGate()
    press('ArrowLeft')
    expect(screen.getByRole('button', { name: 'Editar lista' })).toHaveClass('tv-focus')
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
    press('ArrowLeft')
    press('ArrowLeft')
    press('Enter')
    expect(props.onEdit).toHaveBeenCalledWith(SOURCE)
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
  })

  it('reconsultando: os botões continuam focáveis, há spinner, e uma segunda seleção em voo é ignorada', async () => {
    const pending = deferred()
    const checkAccount = vi.fn(() => pending.promise)
    renderGate({ checkAccount })
    press('ArrowRight')
    press('Enter')
    press('Enter') // em voo: ignorada
    expect(checkAccount).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toHaveClass('tv-focus')
    await act(async () => pending.resolve({ fresh: true, account: { status: 'refused', checkedAt: 1 } }))
    expect(screen.getByText('O provedor recusou o usuário ou a senha desta lista.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('RETURN com a consulta em voo volta na hora, e o resultado tardio não abre a lista', async () => {
    const pending = deferred()
    const { props, view } = renderGate({ checkAccount: vi.fn(() => pending.promise) })
    press('ArrowRight')
    press('Enter')
    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)
    view.unmount()
    await act(async () => pending.resolve({ fresh: true, account: { status: 'active', expiresAt: FUTURE, checkedAt: Date.now() } }))
    expect(props.onOpen).not.toHaveBeenCalled()
  })

  it('sem confirmação (fresh:false) e dado guardado vencido: continua bloqueada e diz que não foi possível confirmar agora', async () => {
    const checkAccount = vi.fn().mockResolvedValue({
      fresh: false,
      reason: 'network',
      account: { status: 'active', expiresAt: PAST, checkedAt: 1 },
    })
    const { props } = renderGate({ checkAccount })
    press('ArrowRight')
    await act(async () => press('Enter'))
    expect(props.onOpen).not.toHaveBeenCalled()
    expect(screen.getByText(/Não foi possível confirmar agora/)).toBeInTheDocument()
    expect(screen.getByText('A assinatura desta lista venceu em 20/09/2026.')).toBeInTheDocument()
  })

  it('check com falha de rede e nada guardado: a lista abre (falha de rede sozinha nunca impede)', async () => {
    const checkAccount = vi.fn().mockResolvedValue({ fresh: false, reason: 'timeout', account: {} })
    const { props } = renderGate({ decision: { action: 'check' }, checkAccount })
    await act(async () => {})
    expect(props.onOpen).toHaveBeenCalledWith(SOURCE)
  })

  it('nenhum endereço, usuário ou senha em texto, nome acessível ou title; todo controle tem nome', () => {
    const { view } = renderGate()
    expect(view.container.innerHTML).not.toMatch(/painel\.exemplo|usuario|senha/i)
    expect(view.container.querySelectorAll('[title]')).toHaveLength(0)
    expect(findUnnamedControls(view.container).map((f) => f.description)).toEqual([])
  })
})
