import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { PlayerLayer } from '../../components/PlayerLayer'
import { db } from '../../lib/catalog/db'
import { buildStableId, clearProgress, getUserState, updateProgress } from '../../lib/catalog/userStateRepository'
import { RESUME_MIN_SECONDS } from '../../lib/player/resumePolicy'

// `useCatalogItem` é mockado (não depende do catálogo real pra estes
// testes). `useUserState`/`invalidateUserState` ficam com a implementação
// REAL — são elas que este arquivo testa (T031: invalidação de verdade
// contra o Dexie/fake-indexeddb, não um mock que já "sabe" a resposta).
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn() }
})

// A máquina de estados do player já é testada em PlayerLayer.test.tsx. Aqui
// importa só o que MovieDetailScreen decide ANTES de abri-lo: qual
// `startAtMs` mandar, e quando reler o estado do usuário ao fechar.
vi.mock('../../components/PlayerLayer', () => ({
  // `startAtMs` não é usado no corpo — é lido de `mock.calls` (props
  // completas ficam gravadas ali independente do que a função renderiza).
  PlayerLayer: vi.fn(({ title, onClose }: { title: string; startAtMs?: number; onClose: () => void }) => (
    <div role="dialog" aria-label={`Reproduzindo ${title}`}>
      <button type="button" onClick={onClose}>
        Fechar (teste)
      </button>
    </div>
  )),
}))

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Duna',
  original_group: 'Ficção científica',
  published: true,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '100',
  original_name: 'Duna',
}

const STABLE_ID = buildStableId({ sourceId: 'src1', kind: 'movie', providerStreamId: '100' })

function queryResult(data: CatalogItemOut | null, isLoading = false) {
  return { data, isLoading } as ReturnType<typeof catalogApi.useCatalogItem>
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function renderScreen(onBack = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MovieDetailScreen movieId="movie-1" onBack={onBack} />
    </QueryClientProvider>,
  )
  return queryClient
}

function lastPlayerLayerProps() {
  const calls = vi.mocked(PlayerLayer).mock.calls
  return calls[calls.length - 1]?.[0]
}

describe('MovieDetailScreen', () => {
  beforeEach(async () => {
    await db.userStates.clear()
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(MOVIE))
    vi.mocked(PlayerLayer).mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // --- US1 (Fase 3), preservados ---

  it('sem posição salva, a ação primária é "Assistir", focada por padrão (FR-015)', () => {
    renderScreen()

    expect(screen.getByText('▶ Assistir').className).toContain('tv-focus')
    expect(screen.getByText('▶ Trailer').className).not.toContain('tv-focus')
  })

  it('SELECT em Assistir abre a camada, sem posição de retomada (startAtMs indefinido)', () => {
    renderScreen()

    press('Enter')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(lastPlayerLayerProps()?.startAtMs).toBeUndefined()
  })

  it('SELECT repetido (ou tecla mantida) não abre uma segunda camada (FR-010)', () => {
    renderScreen()

    press('Enter')
    press('Enter')
    press('Enter')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(vi.mocked(PlayerLayer)).toHaveBeenCalledTimes(1)
  })

  it('Trailer continua como placeholder — fora de escopo desta feature', () => {
    renderScreen()

    press('ArrowLeft') // move o foco pra Trailer (índice 0)
    press('Enter')

    expect(screen.getByText('Reproduzindo trailer...')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('o botão "Voltar" do estado de erro é ativável por OK do controle (R-005)', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null))
    const onBack = vi.fn()
    renderScreen(onBack)

    expect(screen.getByText('Este filme não está mais no catálogo.')).toBeInTheDocument()
    press('Enter')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('o botão "Voltar" do estado de carregando também é ativável por OK (R-005)', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null, true))
    const onBack = vi.fn()
    renderScreen(onBack)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    press('Enter')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('RETURN sempre volta, mesmo no estado de erro', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null))
    const onBack = vi.fn()
    renderScreen(onBack)

    press('Escape')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // --- T029: alternância Assistir / Retomar / Reiniciar ---

  describe('retomada (T029)', () => {
    it('com progresso ≥30s, a ação primária é "Retomar" com o tempo formatado, e "Reiniciar" existe', async () => {
      await updateProgress(STABLE_ID, 'src1', RESUME_MIN_SECONDS + 65) // 30+65=95s = 1:35

      renderScreen()

      const resume = await screen.findByText('▶ Retomar (1:35)')
      expect(resume.className).toContain('tv-focus') // ação primária continua no índice 1
      expect(screen.getByText('↺ Reiniciar')).toBeInTheDocument()
      expect(screen.queryByText('▶ Assistir')).not.toBeInTheDocument()
    })

    it('com progresso <30s, continua "Assistir", sem ação secundária de retomada', async () => {
      await updateProgress(STABLE_ID, 'src1', RESUME_MIN_SECONDS - 5)

      renderScreen()

      await waitFor(() => expect(screen.getByText('▶ Assistir')).toBeInTheDocument())
      expect(screen.queryByText('↺ Reiniciar')).not.toBeInTheDocument()
      expect(screen.queryByText(/▶ Retomar/)).not.toBeInTheDocument()
    })

    it('"Retomar" abre a camada passando a posição salva em milissegundos', async () => {
      await updateProgress(STABLE_ID, 'src1', 300) // 5min

      renderScreen()
      await screen.findByText(/▶ Retomar/)

      press('Enter') // ação primária (Retomar) já está focada

      expect(lastPlayerLayerProps()?.startAtMs).toBe(300_000)
    })

    it('"Reiniciar" abre a camada com startAtMs 0 — não undefined (distinção deliberada, logic §5)', async () => {
      await updateProgress(STABLE_ID, 'src1', 300)

      renderScreen()
      await screen.findByText(/▶ Retomar/)

      press('ArrowRight') // move de Retomar (1) pra Reiniciar (2)
      press('Enter')

      expect(lastPlayerLayerProps()?.startAtMs).toBe(0)
    })
  })

  // --- T031: frescor — a leitura não pode ficar defasada depois de fechar a camada ---

  describe('frescor do estado ao fechar a camada (T031, logic §5.1)', () => {
    it('assistir e voltar atualiza a ação primária pra "Retomar", sem releitura manual', async () => {
      renderScreen()
      expect(screen.getByText('▶ Assistir')).toBeInTheDocument()

      press('Enter') // abre a camada (mockada)
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // O player real teria gravado isto via progressRecorder enquanto
      // tocava — aqui simulado diretamente, já que PlayerLayer é mock.
      await updateProgress(STABLE_ID, 'src1', 90)

      act(() => {
        screen.getByRole('button', { name: 'Fechar (teste)' }).click()
      })

      // Sem a invalidação de T037, a tela continuaria mostrando "Assistir"
      // (leitura de quando montou) mesmo com 90s já gravados.
      expect(await screen.findByText('▶ Retomar (1:30)')).toBeInTheDocument()
      expect(screen.queryByText('▶ Assistir')).not.toBeInTheDocument()
    })

    it('concluir o filme (progresso apagado) e voltar restaura "Assistir"', async () => {
      await updateProgress(STABLE_ID, 'src1', 200)
      renderScreen()
      await screen.findByText(/▶ Retomar/)

      press('Enter')
      // Conclusão real limpa o progresso (FR-020) — aqui simulado direto.
      await clearProgress(STABLE_ID, 'src1')

      act(() => {
        screen.getByRole('button', { name: 'Fechar (teste)' }).click()
      })

      expect(await screen.findByText('▶ Assistir')).toBeInTheDocument()
      expect(screen.queryByText('↺ Reiniciar')).not.toBeInTheDocument()
    })
  })

  // --- Feature 019 (US2): correção manual de "assistido" ---

  describe('marcar/desmarcar assistido manualmente (feature 019, US2)', () => {
    it('sem posição salva: "Marcar como assistido" é a última ação, sem deslocar o foco da ação primária', () => {
      renderScreen()

      const primary = screen.getByText('▶ Assistir')
      expect(primary.className).toContain('tv-focus') // ação primária continua no índice 1

      const buttons = screen.getAllByText(/./, { selector: '.detail-button' })
      expect(buttons[buttons.length - 1].textContent).toBe('✓ Marcar como assistido')
    })

    it('com posição salva (Retomar/Reiniciar): a ação de assistido continua por último, sem deslocar a ação primária', async () => {
      await updateProgress(STABLE_ID, 'src1', 300)
      renderScreen()
      await screen.findByText(/▶ Retomar/)

      const primary = screen.getByText(/▶ Retomar/)
      expect(primary.className).toContain('tv-focus') // ainda índice 1

      const buttons = screen.getAllByText(/./, { selector: '.detail-button' })
      expect(buttons[buttons.length - 1].textContent).toBe('✓ Marcar como assistido')
    })

    it('confirmar "Marcar como assistido" grava completedAt e alterna o rótulo para "Desmarcar"', async () => {
      renderScreen()

      press('ArrowRight') // Assistir(1) -> toggle-watched(2), a última ação
      press('Enter')

      await waitFor(async () => expect((await getUserState(STABLE_ID))?.completedAt).toBeDefined())
      expect(await screen.findByText('✗ Desmarcar assistido')).toBeInTheDocument()
    })
  })
})
