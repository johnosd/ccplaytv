import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilesScreen, type ProfilesScreenProps } from './ProfilesScreen'
import * as importApi from '../import/importApi'
import type { SourceOut } from '../import/importApi'
import { findUnnamedControls } from '../../testing/accessibleNames'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return {
    ...actual,
    useSources: vi.fn(),
    useDeleteSource: vi.fn(),
    useResyncSource: vi.fn(),
  }
})

function makeSource(id: string, displayName: string, overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id,
    type: 'm3u_url',
    display_name: displayName,
    connection_state: 'synced',
    last_successful_sync_at: '2026-09-20T12:00:00.000Z',
    provider_import_mode: null,
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

const LISTA_1 = makeSource('src-1', 'Lista 1')
const LISTA_2 = makeSource('src-2', 'Lista 2')
const LISTA_3 = makeSource('src-3', 'Lista 3')

type UseSourcesResult = ReturnType<typeof importApi.useSources>

function mockSources(value: Partial<UseSourcesResult>) {
  vi.mocked(importApi.useSources).mockReturnValue(value as UseSourcesResult)
}

function mockLoaded(...sources: SourceOut[]) {
  mockSources({ data: { sources }, isLoading: false, isError: false })
}

function mockDelete(mutate: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) {
  vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate, ...extra } as unknown as ReturnType<
    typeof importApi.useDeleteSource
  >)
}

function mockResync(mutate: ReturnType<typeof vi.fn>) {
  vi.mocked(importApi.useResyncSource).mockReturnValue({ mutate } as unknown as ReturnType<
    typeof importApi.useResyncSource
  >)
}

function renderProfiles(overrides: Partial<ProfilesScreenProps> = {}) {
  const props: ProfilesScreenProps = {
    mode: 'base',
    onChooseSource: vi.fn(),
    onAddSource: vi.fn(),
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
    onSourceDeleted: vi.fn(),
    onManageSources: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  const utils = render(<ProfilesScreen {...props} />, { wrapper: Wrapper })
  return { props, rerender: () => utils.rerender(<ProfilesScreen {...props} />) }
}

// Teclas em `document.body` (nunca em `document`): só assim a captura de um
// `Modal` roda antes da tela por trás — mesmo cuidado dos contratos da 022.
function press(...keys: string[]) {
  for (const key of keys) fireEvent.keyDown(document.body, { key, bubbles: true })
}

beforeEach(() => {
  mockDelete(vi.fn())
  mockResync(vi.fn())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const card = (name: RegExp | string) => screen.getByRole('button', { name })

describe('ProfilesScreen — primeiro uso e carregando (feature 037, US3)', () => {
  it('sem listas: textos de primeiro uso no lugar de "Bem-vindo de volta", só "Adicionar lista" em foco, rodapé e "Configurações" (FR-004, US3/AC1)', () => {
    mockLoaded()
    const { props } = renderProfiles()

    expect(screen.getByText('Configuração inicial')).toBeInTheDocument()
    expect(screen.queryByText('Bem-vindo de volta')).not.toBeInTheDocument()
    expect(screen.getByText('Adicione sua primeira lista para começar.')).toBeInTheDocument()
    expect(screen.queryByText('Escolha uma lista para continuar ou adicione uma nova.')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.source-card')).toHaveLength(0)
    expect(card('Adicionar lista')).toHaveClass('tv-focus')
    expect(screen.getByText('Cada lista mantém seu próprio histórico, favoritos e recomendações.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configurações' })).toBeInTheDocument()

    press('Enter')
    expect(props.onAddSource).toHaveBeenCalledTimes(1)
  })

  it('sem listas, RETURN abre "Sair do CCPlayTV?" (US3/AC3)', () => {
    mockLoaded()
    renderProfiles()
    press('Escape')
    expect(screen.getByRole('dialog', { name: 'Sair do CCPlayTV?' })).toBeInTheDocument()
  })

  it('carregando: esqueletos com a geometria do cartão novo, sem kicker de volta nem de primeiro uso, e dois focáveis reais', () => {
    mockSources({ data: undefined, isLoading: true, isError: false })
    renderProfiles()

    const skeletons = Array.from(document.querySelectorAll<HTMLElement>('.skeleton'))
    expect(skeletons).toHaveLength(3)
    for (const skeleton of skeletons) {
      expect(skeleton.style.width).toBe('var(--profile-card-width)')
      expect(skeleton.style.height).toBe('var(--profile-card-height)')
    }
    expect(screen.getByText('Carregando suas listas…')).toBeInTheDocument()
    expect(screen.queryByText('Bem-vindo de volta')).not.toBeInTheDocument()
    expect(screen.queryByText('Configuração inicial')).not.toBeInTheDocument()
    expect(card('Adicionar lista')).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Configurações' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Suas listas' })).toHaveAttribute('aria-busy', 'true')
  })
})

describe('ProfilesScreen — estados e listas (US1)', () => {
  it('carregando: esqueletos + "Adicionar lista" real, focado e ativável (FR-042)', () => {
    mockSources({ data: undefined, isLoading: true, isError: false })
    const { props } = renderProfiles()

    expect(screen.getByText(/Carregando/)).toBeInTheDocument()
    expect(document.querySelectorAll('.skeleton')).toHaveLength(3)
    expect(card('Adicionar lista')).toHaveClass('tv-focus')

    press('Enter')
    expect(props.onAddSource).toHaveBeenCalledTimes(1)
  })

  it('sem nenhuma lista: só "Adicionar lista", focado — sem formulário embutido (FR-004, US1/AC4)', () => {
    mockLoaded()
    const { props } = renderProfiles()

    expect(card('Adicionar lista')).toHaveClass('tv-focus')
    // "Adicionar lista" + "Configurações" (feature 026, FR-032; canto desde a 037).
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Configurações' })).not.toHaveClass('tv-focus')
    expect(screen.queryByText('Nome da lista')).not.toBeInTheDocument()
    expect(screen.getByText('Adicione sua primeira lista para começar.')).toBeInTheDocument()

    press('Enter')
    expect(props.onAddSource).toHaveBeenCalledTimes(1)
  })

  it('com listas: um cartão por lista mais "Adicionar lista", com o título e o subtítulo da escolha de lista (FR-002, FR-003; 037 FR-003)', () => {
    mockLoaded(LISTA_1, LISTA_2)
    renderProfiles()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Selecione ou Adicione sua lista')
    expect(screen.getByText('Escolha uma lista para continuar ou adicione uma nova.')).toBeInTheDocument()
    expect(card(/Lista 1/)).toBeInTheDocument()
    expect(card(/Lista 2/)).toBeInTheDocument()
    expect(card('Adicionar lista')).toBeInTheDocument()
    expect(screen.queryByText('Nome da lista')).not.toBeInTheDocument()
  })

  it('cada cartão diz o tipo da lista: Xtream para provedor, M3U para URL (FR-002)', () => {
    mockLoaded(
      makeSource('a', 'Provedor', { type: 'provider_credentials', provider_import_mode: 'xtream_api' }),
      makeSource('b', 'Lista direta'),
    )
    renderProfiles()

    expect(within(card(/Provedor/)).getByText('Xtream')).toBeInTheDocument()
    expect(within(card(/Lista direta/)).getByText('M3U')).toBeInTheDocument()
  })

  // Feature 037, FR-006: a data/estado de sincronização sai do cartão (continua em Configurações).
  it('o cartão não mostra o estado de sincronização em nenhum caso', () => {
    mockLoaded(
      makeSource('a', 'Nova', { connection_state: 'never_synced', last_successful_sync_at: null }),
      makeSource('b', 'Quebrada', { connection_state: 'error' }),
      makeSource('c', 'Em dia'),
    )
    renderProfiles()

    expect(screen.queryByText('Nunca sincronizada')).not.toBeInTheDocument()
    expect(screen.queryByText('Erro na última sincronização')).not.toBeInTheDocument()
    expect(screen.queryByText(/Sincronizada em/)).not.toBeInTheDocument()
  })

  it('cartão com avatar de iniciais decorativo: fora do nome acessível, par de cores estável por id (FR-005)', () => {
    mockLoaded(makeSource('src-1', 'Minha Lista Principal'))
    renderProfiles()

    const avatar = document.querySelector('.source-card-avatar')
    expect(avatar).toHaveTextContent('ML')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar?.className).toMatch(/list-avatar--[0-5]\b/)
    expect(card(/Minha Lista Principal/).getAttribute('aria-label')).toBeNull()
    expect(screen.queryByRole('button', { name: /ML/ })).not.toBeInTheDocument()
  })

  it('nome longo: o texto é truncado só por CSS, o nome acessível mantém o nome inteiro (Edge Case)', () => {
    const longo = 'Lista com um nome muito comprido que não cabe na largura do cartão'
    mockLoaded(makeSource('longa', longo))
    renderProfiles()

    const name = document.querySelector('.source-card-name')
    expect(name).toHaveTextContent(longo)
    expect(card(new RegExp(longo))).toBeInTheDocument()
  })

  it('fonte em Modo limitado mostra o selo; fonte normal não (feature 004, FR-011)', () => {
    mockLoaded(
      makeSource('lim', 'Provedor sem protocolo', { type: 'provider_credentials', provider_import_mode: 'legacy_m3u' }),
      makeSource('ok', 'Provedor com protocolo', { type: 'provider_credentials', provider_import_mode: 'xtream_api' }),
      makeSource('m3u', 'Lista M3U direta'),
    )
    renderProfiles()

    expect(screen.getAllByText('Modo limitado')).toHaveLength(1)
    expect(within(card(/Provedor sem protocolo/)).getByText('Modo limitado')).toBeInTheDocument()
  })

  it('lista truncada e entradas descartadas mostram os seus selos (T038)', () => {
    mockLoaded(
      makeSource('t', 'Truncada', { last_truncated_by_storage: true }),
      makeSource('d', 'Descartada', { last_discarded_by_type: 100 }),
    )
    renderProfiles()

    expect(within(card(/Truncada/)).getByText('A lista não coube inteira')).toBeInTheDocument()
    expect(within(card(/Descartada/)).getByText('Entradas não reconhecidas ficaram de fora')).toBeInTheDocument()
  })

  it('os avisos ficam juntos na linha compacta abaixo do nome (FR-006)', () => {
    mockLoaded(
      makeSource('tudo', 'Tudo', {
        type: 'provider_credentials',
        provider_import_mode: 'legacy_m3u',
        last_truncated_by_storage: true,
        last_discarded_by_type: 3,
      }),
      makeSource('nada', 'Nada'),
    )
    renderProfiles()

    const notices = card(/Tudo/).querySelector('.source-card-notices')
    expect(notices).not.toBeNull()
    expect(within(notices as HTMLElement).getAllByText(/./).map((el) => el.textContent)).toEqual([
      'Modo limitado',
      'A lista não coube inteira',
      'Entradas não reconhecidas ficaram de fora',
    ])
    // A linha vem depois do nome, dentro do cartão.
    const name = card(/Tudo/).querySelector('.source-card-name') as HTMLElement
    expect(name.compareDocumentPosition(notices as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Sem aviso, sem linha vazia.
    expect(card(/Nada/).querySelector('.source-card-notices')).toBeNull()
  })

  // Feature 028, FR-015/FR-017 — um caso por estado principal.
  it('todo controle tem nome acessível: com listas', () => {
    mockLoaded(LISTA_1, LISTA_2)
    renderProfiles()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('todo controle tem nome acessível: sem nenhuma lista', () => {
    mockLoaded()
    renderProfiles()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('todo controle tem nome acessível: carregando', () => {
    mockSources({ data: undefined, isLoading: true, isError: false })
    renderProfiles()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('NUNCA renderiza o endereço do provedor, URL nem credencial (FR-048)', () => {
    mockLoaded(
      makeSource('x', 'Provedor', {
        type: 'provider_credentials',
        provider_import_mode: 'xtream_api',
        provider_dns: 'painel.exemplo.com:8080',
      }),
    )
    renderProfiles()

    const html = document.body.innerHTML
    expect(html).not.toContain('painel.exemplo.com')
    expect(html).not.toContain('8080')
    expect(html).not.toMatch(/https?:\/\//)
  })
})

describe('ProfilesScreen — foco inicial e navegação (FR-004)', () => {
  it('id inexistente, nulo ou ausente → primeira lista', () => {
    mockLoaded(LISTA_1, LISTA_2)
    for (const initialFocusSourceId of ['nao-existe', null, undefined]) {
      const { rerender } = renderProfiles({ initialFocusSourceId })
      expect(card(/Lista 1/)).toHaveClass('tv-focus')
      expect(card(/Lista 2/)).not.toHaveClass('tv-focus')
      rerender()
      cleanup()
    }
  })

  it('o foco inicial "chega" quando as listas terminam de carregar, e não briga com o movimento depois', () => {
    mockSources({ data: undefined, isLoading: true, isError: false })
    const { rerender } = renderProfiles({ initialFocusSourceId: 'src-3' })
    expect(card('Adicionar lista')).toHaveClass('tv-focus')

    mockLoaded(LISTA_1, LISTA_2, LISTA_3)
    rerender()
    expect(card(/Lista 3/)).toHaveClass('tv-focus')

    // A pessoa se move; um novo render (refetch) não volta ao foco inicial.
    press('ArrowLeft')
    expect(card(/Lista 2/)).toHaveClass('tv-focus')
    mockLoaded(LISTA_1, LISTA_2, LISTA_3)
    rerender()
    expect(card(/Lista 2/)).toHaveClass('tv-focus')
  })

  it('LEFT/RIGHT percorrem as listas e "Adicionar lista", com limite nas pontas; OK escolhe a lista em foco', () => {
    mockLoaded(LISTA_1, LISTA_2)
    const { props } = renderProfiles()

    press('ArrowLeft') // já na primeira: nada muda
    expect(card(/Lista 1/)).toHaveClass('tv-focus')
    press('ArrowRight')
    expect(card(/Lista 2/)).toHaveClass('tv-focus')
    press('ArrowRight')
    expect(card('Adicionar lista')).toHaveClass('tv-focus')
    press('ArrowRight') // limite
    expect(card('Adicionar lista')).toHaveClass('tv-focus')

    press('Enter')
    expect(props.onAddSource).toHaveBeenCalledTimes(1)
    press('ArrowLeft', 'Enter')
    expect(props.onChooseSource).toHaveBeenCalledWith(LISTA_2)
  })

  it('DOWN em "Adicionar lista" leva a "Configurações" (feature 026, FR-032; 037 D-006) — nunca as ações de cartão', () => {
    mockLoaded(LISTA_1)
    const { props } = renderProfiles()

    press('ArrowRight', 'ArrowDown')
    expect(card('Adicionar lista')).not.toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Configurações' })).toHaveClass('tv-focus')
    expect(screen.queryByRole('button', { name: 'Ressincronizar' })).not.toBeInTheDocument()

    press('Enter')
    expect(props.onManageSources).toHaveBeenCalledTimes(1)
  })

  it('RETURN em "Configurações" fecha a camada e devolve o foco a "Adicionar lista"; UP faz o mesmo', () => {
    mockLoaded(LISTA_1)
    renderProfiles()

    press('ArrowRight', 'ArrowDown')
    expect(screen.getByRole('button', { name: 'Configurações' })).toHaveClass('tv-focus')

    press('Escape')
    expect(card('Adicionar lista')).toHaveClass('tv-focus')

    press('ArrowDown', 'ArrowUp')
    expect(card('Adicionar lista')).toHaveClass('tv-focus')
  })

  it('o clique de mouse também escolhe a lista e abre "Adicionar lista"', () => {
    mockLoaded(LISTA_1)
    const { props } = renderProfiles()

    fireEvent.click(card(/Lista 1/))
    expect(props.onChooseSource).toHaveBeenCalledWith(LISTA_1)
    fireEvent.click(card('Adicionar lista'))
    expect(props.onAddSource).toHaveBeenCalledTimes(1)
  })
})

describe('ProfilesScreen — RETURN (FR-030, FR-031, FR-042)', () => {
  it('em mode "base", RETURN abre o modal de saída com Cancelar em foco, e RETURN de novo fecha', () => {
    mockLoaded(LISTA_1)
    const { props } = renderProfiles({ mode: 'base' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    press('Escape')
    const dialog = screen.getByRole('dialog', { name: 'Sair do CCPlayTV?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(props.onBack).not.toHaveBeenCalled()
  })

  it('em mode "switch", RETURN chama onBack e não abre modal nenhum', () => {
    mockLoaded(LISTA_1)
    const { props } = renderProfiles({ mode: 'switch' })

    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('carregando e vazio também têm saída: RETURN abre o modal de saída', () => {
    mockSources({ data: undefined, isLoading: true, isError: false })
    renderProfiles()
    press('Escape')
    expect(screen.getByRole('dialog', { name: 'Sair do CCPlayTV?' })).toBeInTheDocument()
    cleanup()

    mockLoaded()
    renderProfiles()
    press('Escape')
    expect(screen.getByRole('dialog', { name: 'Sair do CCPlayTV?' })).toBeInTheDocument()
  })

  it('erro de leitura também tem saída: RETURN abre o modal de saída (o controle nunca fica preso)', () => {
    mockSources({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as Partial<UseSourcesResult>)
    renderProfiles()

    press('Escape')
    expect(screen.getByRole('dialog', { name: 'Sair do CCPlayTV?' })).toBeInTheDocument()
  })

  it('erro de leitura: o clique de mouse em "Tentar de novo" também chama refetch', () => {
    const refetch = vi.fn()
    mockSources({ data: undefined, isLoading: false, isError: true, refetch } as Partial<UseSourcesResult>)
    renderProfiles()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  // Feature 028, FR-007/FR-009: SELECT no botão focado, não só o clique do mouse.
  it('erro de leitura: SELECT (OK do controle) em "Tentar de novo" chama refetch', () => {
    const refetch = vi.fn()
    mockSources({ data: undefined, isLoading: false, isError: true, refetch } as Partial<UseSourcesResult>)
    renderProfiles()

    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveClass('tv-focus')
    press('Enter')
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle tem nome acessível: erro de leitura', () => {
    mockSources({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as Partial<UseSourcesResult>)
    renderProfiles()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })
})

describe('ProfilesScreen — ações da lista (US3)', () => {
  it('descer no terceiro cartão entra por Ressincronizar, não pela coluna herdada do cartão (bug corrigido na Home antiga)', () => {
    const resync = vi.fn()
    const remove = vi.fn()
    mockResync(resync)
    mockDelete(remove)
    mockLoaded(LISTA_1, LISTA_2, LISTA_3)
    renderProfiles()

    // Terceiro cartão: sem zerar a coluna, descer já chegava com Excluir em
    // foco e o OK seguinte apagaria a lista.
    press('ArrowRight', 'ArrowRight', 'ArrowDown')
    expect(card('Ressincronizar')).toHaveClass('tv-focus')
    press('Enter')

    expect(remove).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(resync).toHaveBeenCalledWith('src-3', expect.anything())
  })

  it('UP restaura o cartão de onde se desceu — por identidade, não pelo índice da ação', () => {
    mockLoaded(LISTA_1, LISTA_2, LISTA_3)
    renderProfiles()

    press('ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowRight') // Lista 2 → ações → Excluir
    expect(card('Excluir')).toHaveClass('tv-focus')
    press('ArrowUp')
    expect(card(/Lista 2/)).toHaveClass('tv-focus')
    expect(screen.queryByRole('button', { name: 'Ressincronizar' })).not.toBeInTheDocument()
    press('ArrowRight')
    expect(card(/Lista 3/)).toHaveClass('tv-focus')
  })

  it('a linha de ações é uma camada: RETURN volta aos cartões, sem sair da tela nem abrir o modal de saída', () => {
    mockLoaded(LISTA_1)
    const { props } = renderProfiles({ mode: 'switch' })

    press('ArrowDown')
    expect(card('Ressincronizar')).toHaveClass('tv-focus')
    press('Escape')
    expect(card(/Lista 1/)).toHaveClass('tv-focus')
    expect(props.onBack).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Editar chama onEditSource com a lista', () => {
    mockLoaded(LISTA_1, LISTA_2)
    const { props } = renderProfiles()

    press('ArrowRight', 'ArrowDown', 'ArrowRight', 'Enter')
    expect(props.onEditSource).toHaveBeenCalledWith(LISTA_2)
  })

  it('Ressincronizar mostra o aviso e, ao iniciar o job, chama onResyncStarted com o id dele', () => {
    const resync = vi.fn((_id: string, options: { onSuccess: (r: { import_job_id: string }) => void }) =>
      options.onSuccess({ import_job_id: 'job-9' }),
    )
    mockResync(resync)
    mockLoaded(LISTA_1)
    const { props } = renderProfiles()

    press('ArrowDown', 'Enter')
    expect(screen.getByText('Ressincronizando lista...')).toBeInTheDocument()
    expect(resync).toHaveBeenCalledWith('src-1', expect.anything())
    expect(props.onResyncStarted).toHaveBeenCalledWith('job-9')
  })
})

describe('ProfilesScreen — exclusão confirmada (FR-010, FR-011)', () => {
  function openDeleteDialogFor(name: string) {
    press('ArrowDown', 'ArrowRight', 'ArrowRight', 'Enter')
    return screen.getByRole('dialog', { name: `Excluir a lista ${name}?` })
  }

  it('Excluir só abre o modal; nada é apagado até "Excluir" dentro dele', () => {
    const remove = vi.fn()
    mockDelete(remove)
    mockLoaded(LISTA_1)
    renderProfiles()

    const dialog = openDeleteDialogFor('Lista 1')
    expect(remove).not.toHaveBeenCalled()
    expect(within(dialog).getByText(/favoritos/i)).toBeInTheDocument()
    press('ArrowRight', 'Enter')
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('src-1', expect.anything())
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle tem nome acessível: modal de exclusão aberto', () => {
    mockLoaded(LISTA_1)
    renderProfiles()
    openDeleteDialogFor('Lista 1')
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('onSourceDeleted só é chamado no sucesso da exclusão, com o id', () => {
    const remove = vi.fn() // nunca chama onSuccess
    mockDelete(remove)
    mockLoaded(LISTA_1)
    const { props } = renderProfiles()

    openDeleteDialogFor('Lista 1')
    press('ArrowRight', 'Enter')
    expect(props.onSourceDeleted).not.toHaveBeenCalled()

    const succeed = vi.fn((_id: string, options: { onSuccess: () => void }) => options.onSuccess())
    mockDelete(succeed)
    cleanup()
    const second = renderProfiles()
    openDeleteDialogFor('Lista 1')
    press('ArrowRight', 'Enter')
    expect(second.props.onSourceDeleted).toHaveBeenCalledWith('src-1')
  })

  it('excluir a lista do meio leva o foco ao cartão que ocupava o lugar dela', () => {
    const succeed = vi.fn((_id: string, options: { onSuccess: () => void }) => options.onSuccess())
    mockDelete(succeed)
    mockLoaded(LISTA_1, LISTA_2, LISTA_3)
    const { rerender } = renderProfiles({ initialFocusSourceId: 'src-2' })

    openDeleteDialogFor('Lista 2')
    press('ArrowRight', 'Enter')
    mockLoaded(LISTA_1, LISTA_3) // a query refeita, sem a lista apagada
    rerender()

    expect(card(/Lista 3/)).toHaveClass('tv-focus')
    expect(screen.queryByText('Lista 2')).not.toBeInTheDocument()
  })

  it('excluir a última lista de uma fileira com outras leva o foco a "Adicionar lista"', () => {
    const succeed = vi.fn((_id: string, options: { onSuccess: () => void }) => options.onSuccess())
    mockDelete(succeed)
    mockLoaded(LISTA_1, LISTA_2)
    const { rerender } = renderProfiles({ initialFocusSourceId: 'src-2' })

    openDeleteDialogFor('Lista 2')
    press('ArrowRight', 'Enter')
    mockLoaded(LISTA_1)
    rerender()

    expect(card('Adicionar lista')).toHaveClass('tv-focus')
  })

  it('excluir a única lista deixa só "Adicionar lista", focado', () => {
    const succeed = vi.fn((_id: string, options: { onSuccess: () => void }) => options.onSuccess())
    mockDelete(succeed)
    mockLoaded(LISTA_1)
    const { rerender } = renderProfiles()

    openDeleteDialogFor('Lista 1')
    press('ArrowRight', 'Enter')
    mockLoaded()
    rerender()

    expect(card('Adicionar lista')).toHaveClass('tv-focus')
    expect(screen.getAllByRole('button')).toHaveLength(2) // + "Configurações"
  })

  it('falha ao excluir avisa e não move o foco nem chama onSourceDeleted', () => {
    const fail = vi.fn((_id: string, options: { onError: () => void }) => options.onError())
    mockDelete(fail)
    mockLoaded(LISTA_1)
    const { props } = renderProfiles()

    openDeleteDialogFor('Lista 1')
    press('ArrowRight', 'Enter')

    expect(screen.getByText('Não foi possível excluir a lista.')).toBeInTheDocument()
    expect(props.onSourceDeleted).not.toHaveBeenCalled()
    expect(card('Excluir')).toHaveClass('tv-focus')
  })

  it('com uma exclusão já em andamento, OK em Excluir não abre outro modal', () => {
    mockDelete(vi.fn(), { isPending: true })
    mockLoaded(LISTA_1)
    renderProfiles()

    press('ArrowDown', 'ArrowRight', 'ArrowRight', 'Enter')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
