import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SectionEmptyState } from '../../../components/SectionEmptyState'
import { CategoryManager, type CategoryManagerProps } from './CategoryManager'
import { SuggestionStep } from './SuggestionStep'

/** Feature 066 (T041, SC-007/FR-031): todo estado novo tem um elemento focável e que faz algo. */

afterEach(cleanup)

const managerProps = (overrides: Partial<CategoryManagerProps>): CategoryManagerProps => ({
  section: 'channel',
  categories: undefined,
  failed: false,
  pinActive: false,
  gated: false,
  onOpenGate: vi.fn(),
  onControl: vi.fn(),
  onSelectSection: vi.fn(),
  onToggleHidden: vi.fn(),
  onToggleLocked: vi.fn(),
  onRetry: vi.fn(),
  ...overrides,
})

describe('CategoryManager — estados', () => {
  it('carregando: avisa e o interruptor e as seções continuam focáveis', () => {
    render(<CategoryManager {...managerProps({ focus: { row: 'sections', col: 0 } })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando categorias…')
    expect(screen.getByRole('tab', { name: 'Canais' })).toHaveClass('tv-focus')
  })

  it('erro: "Tentar de novo" tem o foco e tenta de novo', () => {
    const onRetry = vi.fn()
    render(<CategoryManager {...managerProps({ failed: true, focus: { row: 'retry' }, onRetry })} />)
    expect(screen.getByText('Não foi possível ler as categorias.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(retry).toHaveClass('tv-focus')
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('com PIN e a aba não liberada: só o pedido de PIN, focado', () => {
    const onOpenGate = vi.fn()
    render(<CategoryManager {...managerProps({ gated: true, pinActive: true, focus: { row: 'gate' }, onOpenGate })} />)
    const gate = screen.getByRole('button', { name: 'Digite o PIN' })
    expect(gate).toHaveClass('tv-focus')
    fireEvent.click(gate)
    expect(onOpenGate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('tab')).toBeNull()
  })
})

describe('SectionEmptyState', () => {
  it('lista sem categorias: o vazio de sempre, com "Voltar" focado', () => {
    const onBack = vi.fn()
    render(<SectionEmptyState allHidden={false} title="Nenhum filme" onBack={onBack} onManage={vi.fn()} />)
    const back = screen.getByRole('button', { name: 'Voltar' })
    expect(back).toHaveClass('tv-focus')
    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('todas escondidas: explica e "Gerenciar categorias" focado leva à gestão', () => {
    const onManage = vi.fn()
    render(<SectionEmptyState allHidden title="Nenhum filme" onBack={vi.fn()} onManage={onManage} />)
    expect(screen.getByText('Todas as categorias estão escondidas')).toBeInTheDocument()
    const manage = screen.getByRole('button', { name: 'Gerenciar categorias' })
    expect(manage).toHaveClass('tv-focus')
    fireEvent.click(manage)
    expect(onManage).toHaveBeenCalledTimes(1)
  })
})

describe('SuggestionStep — carregando', () => {
  it('enquanto lê as categorias, "Cancelar" tem o foco e cancela', () => {
    const onCancel = vi.fn()
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    render(<SuggestionStep sourceId="sem-lista-066" onConfirm={vi.fn()} onCancel={onCancel} />, { wrapper })
    expect(screen.getByRole('status')).toHaveTextContent('Carregando categorias…')
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    expect(cancel).toHaveClass('tv-focus')
    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
