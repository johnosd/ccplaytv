/**
 * Feature 090, US3 — seção "Legendas" da aba Integrações: foco em todos os estados, campo oculto e RETURN que fecha o
 * diálogo da chave antes de sair da aba (constitution: foco é o estado mais importante).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as importApi from '../../import/importApi'
import { SettingsScreen, type SettingsScreenProps } from '../SettingsScreen'
import { db } from '../../../lib/catalog/db'
import { subtitleCredentials } from '../../../lib/subtitles/subtitleTables'
import { registerPortalRefresh } from '../../../lib/portal/portalRuntime'
import { createSubtitleKeysRemoteStep } from '../../../lib/portal/subtitleKeysRemote'
import type { PortalConnection } from '../../../lib/portal/portalConnection'
import { portalTables } from '../../../lib/portal/portalTables'
import { clearSubtitleKeyFeedback } from '../../../lib/portal/subtitleKeyFeedback'

// 091: o portal visível é o padrão dos testes (dev/teste mostram as superfícies do portal); um teste desliga para ver a
// linha "Atualizar" sumir.
const portal = vi.hoisted(() => ({ visible: true }))
vi.mock('../../../lib/portal/portalRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/portal/portalRuntime')>()),
  portalSurfacesVisible: () => portal.visible,
}))

vi.mock('../../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../import/importApi')>()
  return { ...actual, useSources: vi.fn(), useDeleteSource: vi.fn(), useResyncSource: vi.fn() }
})

const KEY = 'chave-pessoal-ficticia-090'

function press(key: string) {
  act(() => {
    fireEvent.keyDown(document.body, { key, bubbles: true })
  })
}

function renderSettings() {
  vi.mocked(importApi.useSources).mockReturnValue({ data: { sources: [] }, isLoading: false, isError: false } as unknown as ReturnType<
    typeof importApi.useSources
  >)
  vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof importApi.useDeleteSource>)
  vi.mocked(importApi.useResyncSource).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof importApi.useResyncSource>)
  const props: SettingsScreenProps = {
    activeSourceId: null,
    onAddSource: vi.fn(),
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
    onSourceDeleted: vi.fn(),
    onOpenTmdbKey: vi.fn(),
    onBack: vi.fn(),
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<SettingsScreen {...props} />, { wrapper: Wrapper })
  return props
}

/** Da coluna de abas para "Integrações & BYOK" (a 1ª) e para dentro do painel, na linha do TMDB. */
function enterIntegrations() {
  press('ArrowUp')
  press('ArrowRight')
}

/** Para a primeira linha de legenda (OpenSubtitles), logo abaixo do TMDB; a segunda é o SubDL. */
function enterSubtitleRows() {
  press('ArrowDown')
}

const section = () => screen.getByRole('region', { name: 'Legendas' })
const subdlRow = () => within(section()).getByText(/^SubDL —/).closest('[data-provider]') as HTMLElement
const osRow = () => within(section()).getByText(/^OpenSubtitles —/).closest('[data-provider]') as HTMLElement

beforeEach(async () => {
  clearSubtitleKeyFeedback(db)
  await subtitleCredentials(db).clear()
  await db.integrations.clear()
})

afterEach(async () => {
  portal.visible = true
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  await subtitleCredentials(db).clear()
})

describe('Integrações › Legendas (chave pessoal)', () => {
  it('os dois fornecedores têm linha própria com "Adicionar chave"', async () => {
    renderSettings()
    enterIntegrations()
    await within(osRow()).findByRole('button', { name: 'Adicionar chave' })
    expect(within(subdlRow()).getByRole('button', { name: 'Adicionar chave' })).toBeInTheDocument()
  })

  it('sem chave: "Adicionar chave" recebe o foco e o foco passa pela linha e volta', async () => {
    renderSettings()
    enterIntegrations()
    await within(subdlRow()).findByRole('button', { name: 'Adicionar chave' })
    enterSubtitleRows()
    expect(within(osRow()).getByRole('button', { name: 'Adicionar chave' })).toHaveClass('tv-focus')
    press('ArrowDown')
    expect(within(subdlRow()).getByRole('button', { name: 'Adicionar chave' })).toHaveClass('tv-focus')
    press('ArrowDown') // linha "Atualizar" das legendas (091)
    expect(within(screen.getByRole('region', { name: 'Legendas' })).getByRole('button', { name: 'Atualizar' })).toHaveClass('tv-focus')
    press('ArrowDown') // 1º card "Em breve": o foco não se perdeu
    expect(within(screen.getByRole('region', { name: 'Assistente de IA' })).getByRole('button')).toHaveClass('tv-focus')
    press('ArrowUp')
    press('ArrowUp')
    press('ArrowUp')
    expect(within(osRow()).getByRole('button', { name: 'Adicionar chave' })).toHaveClass('tv-focus')
  })

  it('com chave em uso: Testar/Trocar chave/Remover (chave só mascarada); remover devolve o foco a "Adicionar chave"', async () => {
    await subtitleCredentials(db).put({ provider: 'subdl', key: KEY, state: 'valid', lastTestedAt: Date.now(), chosen: true })
    renderSettings()
    enterIntegrations()
    await within(section()).findByText(/Sua chave — válida/)
    expect(section().textContent).not.toContain(KEY)
    expect(within(section()).getByText(`SubDL — Sua chave — válida (••••${KEY.slice(-4)})`)).toBeInTheDocument()
    for (const name of ['Testar', 'Trocar chave', 'Remover']) expect(within(subdlRow()).getByRole('button', { name })).toBeInTheDocument()

    enterSubtitleRows()
    press('ArrowDown') // SubDL
    press('ArrowRight')
    press('ArrowRight')
    expect(within(subdlRow()).getByRole('button', { name: 'Remover' })).toHaveClass('tv-focus')
    press('Enter')
    await within(subdlRow()).findByRole('button', { name: 'Adicionar chave' })
    expect(await subtitleCredentials(db).count()).toBe(0)
    expect(within(subdlRow()).getByRole('button', { name: 'Adicionar chave' })).toHaveClass('tv-focus')
  })

  it('guardada mas não usada: "Usar a minha chave" religa sem digitar de novo; recusada aparece como recusada', async () => {
    await subtitleCredentials(db).put({ provider: 'subdl', key: KEY, state: 'valid', lastTestedAt: Date.now(), chosen: false })
    renderSettings()
    enterIntegrations()
    expect(await within(section()).findByText(/Padrão do ccplayTv \(sua chave está guardada\)/)).toBeInTheDocument()
    enterSubtitleRows()
    press('ArrowDown') // SubDL
    expect(within(subdlRow()).getByRole('button', { name: 'Usar a minha chave' })).toHaveClass('tv-focus')
    press('Enter')
    expect(await within(section()).findByText(/SubDL — Sua chave — válida/)).toBeInTheDocument()
    expect((await subtitleCredentials(db).get('subdl'))?.chosen).toBe(true)
    cleanup()

    await subtitleCredentials(db).put({ provider: 'subdl', key: KEY, state: 'rejected', lastTestedAt: Date.now(), chosen: true })
    renderSettings()
    enterIntegrations()
    expect(await within(section()).findByText(/SubDL — Sua chave — recusada/)).toBeInTheDocument()
  })

  it('o diálogo abre com o campo vazio e oculto; RETURN fecha só o diálogo e devolve o foco à linha', async () => {
    const props = renderSettings()
    enterIntegrations()
    await within(osRow()).findByRole('button', { name: 'Adicionar chave' })
    enterSubtitleRows()
    press('Enter')

    const dialog = await screen.findByRole('dialog', { name: 'Chave do OpenSubtitles' })
    const field = within(dialog).getByLabelText('Chave') as HTMLInputElement
    expect(field.value).toBe('')
    expect(field.type).toBe('password')
    expect(field).toHaveFocus()

    press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chave do OpenSubtitles' })).not.toBeInTheDocument())
    expect(props.onBack).not.toHaveBeenCalled()
    expect(within(osRow()).getByRole('button', { name: 'Adicionar chave' })).toHaveClass('tv-focus')
  })

  it('chave recusada pelo fornecedor não grava e mostra o motivo sem ecoar a chave; aceita grava e fecha', async () => {
    renderSettings()
    enterIntegrations()
    await within(subdlRow()).findByRole('button', { name: 'Adicionar chave' })
    enterSubtitleRows()
    press('ArrowDown') // SubDL
    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Chave do SubDL' })
    const field = within(dialog).getByLabelText('Chave')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    fireEvent.change(field, { target: { value: KEY } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar e testar' }))
    expect(await within(dialog).findByText('O fornecedor recusou esta chave.')).toBeInTheDocument()
    expect(dialog.textContent).not.toContain(KEY)
    expect(await subtitleCredentials(db).count()).toBe(0)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: true, subtitles: [] }), { status: 200 })))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar e testar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chave do SubDL' })).not.toBeInTheDocument())
    expect(await within(section()).findByText(`SubDL — Sua chave — válida (••••${KEY.slice(-4)})`)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(KEY)
    expect((await subtitleCredentials(db).get('subdl'))?.chosen).toBe(true)
  })
  it('linha "Atualizar" (091): focável com e sem chave; SELECT busca só as legendas e relê as linhas', async () => {
    const scopes: string[] = []
    // O agente grava a chave que o portal mandou — a seção precisa mostrá-la sem reabrir a aba.
    const unregister = registerPortalRefresh(async (scope) => {
      scopes.push(scope)
      await subtitleCredentials(db).put({ provider: 'subdl', key: KEY, state: 'valid', lastTestedAt: Date.now(), chosen: true })
      return { ok: true }
    })
    renderSettings()
    enterIntegrations()
    await within(subdlRow()).findByRole('button', { name: 'Adicionar chave' })
    enterSubtitleRows()
    press('ArrowDown') // SubDL
    press('ArrowDown') // Atualizar
    expect(within(section()).getByRole('button', { name: 'Atualizar' })).toHaveClass('tv-focus')
    press('Enter')
    expect(await within(section()).findByText(`SubDL — Sua chave — válida (••••${KEY.slice(-4)})`)).toBeInTheDocument()
    expect(await within(section()).findByRole('status')).toHaveTextContent('Chaves de legenda atualizadas.')
    expect(scopes).toEqual(['subtitles'])
    expect(section().textContent).not.toContain(KEY)
    // Com chave guardada a linha continua focável: a seção nunca fica sem elemento focável.
    expect(within(section()).getByRole('button', { name: 'Atualizar' })).toBeInTheDocument()
    unregister()
  })

  it('sem portal (build de loja sem portal) a linha "Atualizar" some e o foco desce direto ao 1º card "Em breve"', async () => {
    portal.visible = false
    renderSettings()
    enterIntegrations()
    await within(subdlRow()).findByRole('button', { name: 'Adicionar chave' })
    expect(within(section()).queryByRole('button', { name: 'Atualizar' })).not.toBeInTheDocument()
    enterSubtitleRows()
    press('ArrowDown') // SubDL
    press('ArrowDown')
    expect(within(screen.getByRole('region', { name: 'Assistente de IA' })).getByRole('button')).toHaveClass('tv-focus')
  })

  it('remoção do portal aplicada no Atualizar volta ao padrão e mantém a chave do outro fornecedor', async () => {
    const other = { provider: 'opensubtitles' as const, key: 'chave-os-preservada-091', state: 'valid' as const, lastTestedAt: 1, chosen: true }
    await subtitleCredentials(db).bulkPut([other, { provider: 'subdl', key: KEY, state: 'valid', lastTestedAt: 1, chosen: true }])
    const device = { id: 'device' as const, deviceId: 'test-remove-091', bearer: 'fixture', authEpoch: 1, recoveryEpoch: 'epoch' }
    await portalTables(db).device.put(device as never)
    const connection = { ready: async () => device, client: { request: async (path: string) => path.endsWith('/ack')
      ? {} : { operations: [{ provider: 'subdl', operationId: 'op-remove-091', action: 'remove' }] } } } as unknown as PortalConnection
    const step = createSubtitleKeysRemoteStep(db, connection)
    const unregister = registerPortalRefresh(async () => { await step(new AbortController().signal); return { ok: true } })
    try {
      renderSettings()
      enterIntegrations()
      await within(subdlRow()).findByRole('button', { name: 'Trocar chave' })
      fireEvent.click(within(section()).getByRole('button', { name: 'Atualizar' }))
      expect(await within(subdlRow()).findByText('SubDL — Padrão do ccplayTv')).toBeInTheDocument()
      expect(within(subdlRow()).getByRole('button', { name: 'Adicionar chave' })).toBeInTheDocument()
      expect(within(section()).getByRole('button', { name: 'Atualizar' })).toHaveClass('tv-focus')
      expect(await subtitleCredentials(db).get('opensubtitles')).toEqual(other)
      expect(await subtitleCredentials(db).get('subdl')).toBeUndefined()
    } finally { unregister() }
  })

  it.each([
    ['offline', 'Sem conexão para testar a chave enviada pelo portal. Tente de novo mais tarde.'],
    ['rate_limited', 'O fornecedor está no limite. Tente de novo mais tarde.'],
    ['refused', 'O fornecedor recusou a chave enviada pelo portal. Confira e envie outra.'],
  ] as const)('Atualizar mostra o motivo %s do ack na linha certa sem trocar a chave anterior', async (reason, message) => {
    await subtitleCredentials(db).put({ provider: 'subdl', key: KEY, state: 'valid', lastTestedAt: 1, chosen: true })
    const device = { id: 'device' as const, deviceId: 'test-091', bearer: 'fixture', authEpoch: 1, recoveryEpoch: 'epoch' }
    await portalTables(db).device.put(device as never)
    const acks: unknown[] = []
    const connection = {
      ready: async () => device,
      client: { request: async (path: string, options: { body?: unknown }) => {
        if (path.endsWith('/ack')) { acks.push(options.body); return {} }
        return { operations: [{ provider: 'subdl', operationId: 'op-091', action: 'set', key: 'nova-chave-ficticia-091' }] }
      } },
    } as unknown as PortalConnection
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (reason === 'offline') throw new TypeError('nova-chave-ficticia-091')
      return new Response('{}', { status: reason === 'rate_limited' ? 429 : 401 })
    }))
    const step = createSubtitleKeysRemoteStep(db, connection)
    const unregister = registerPortalRefresh(async () => { await step(new AbortController().signal); return { ok: true } })
    try {
      renderSettings()
      enterIntegrations()
      await within(subdlRow()).findByRole('button', { name: 'Trocar chave' })
      const refresh = within(section()).getByRole('button', { name: 'Atualizar' })
      for (let count = 0; !refresh.classList.contains('tv-focus') && count < 12; count++) press('ArrowDown')
      expect(refresh).toHaveClass('tv-focus')
      press('Enter')
      expect(await within(subdlRow()).findByText(message)).toBeInTheDocument()
      expect(section()).not.toHaveTextContent('Nenhuma chave de legenda nova do portal.')
      expect(section()).not.toHaveTextContent('Chaves de legenda atualizadas.')
      expect(osRow()).not.toHaveTextContent(message)
      expect(await subtitleCredentials(db).get('subdl')).toMatchObject({ key: KEY, state: 'valid', chosen: true, lastTestedAt: 1 })
      expect(acks).toEqual([{ provider: 'subdl', operationId: 'op-091', state: reason === 'refused' ? 'rejected' : 'retry', reason }])
      expect(section().textContent).not.toContain('nova-chave-ficticia-091')
      expect(section().textContent).not.toContain(KEY)
      expect(refresh).toHaveClass('tv-focus')
      // Corrigir a chave diretamente na TV encerra a mensagem da tentativa anterior pelo portal.
      fireEvent.click(within(subdlRow()).getByRole('button', { name: 'Trocar chave' }))
      const dialog = await screen.findByRole('dialog', { name: 'Chave do SubDL' })
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"status":true,"subtitles":[]}')))
      fireEvent.change(within(dialog).getByLabelText('Chave'), { target: { value: 'chave-corrigida-na-tv-091' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar e testar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(subdlRow()).not.toHaveTextContent(message))
    } finally { unregister() }
  })
})
