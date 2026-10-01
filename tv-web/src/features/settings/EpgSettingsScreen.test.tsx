/**
 * Feature 030, US2 — tela "EPG da lista" (`logic/tela-epg-configuracoes.md`):
 * todo estado com foco possível (FR-022), validação sem ecoar o endereço
 * (FR-018/FR-017), deslocamento sem baixar (FR-020), desativar com
 * confirmação (FR-021) e nenhum endereço na tela.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type SourceRecord } from '../../lib/catalog/db'
import { writeEpgPrograms } from '../../lib/epg/epgRepository'
import { findUnnamedControls } from '../../testing/accessibleNames'

const requestEpgSync = vi.fn()
vi.mock('../../lib/epg/epgRunner', () => ({
  requestEpgSync: (...args: unknown[]) => requestEpgSync(...args),
  isEpgSyncing: () => false,
  subscribeEpgSyncing: () => () => {},
  onEpgSyncFinished: () => () => {},
}))

import { EpgSettingsScreen } from './EpgSettingsScreen'

const SOURCE_ID = 'fonte-epg-tela'
const PROVIDER: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Sala',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario-secreto',
  providerPassword: 'senha-secreta',
  connectionState: 'synced',
  epgLastSyncAt: Date.UTC(2026, 8, 29, 14, 2),
  createdAt: 1,
  updatedAt: 1,
}

function renderScreen(onBack = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  render(<EpgSettingsScreen sourceId={SOURCE_ID} onBack={onBack} />, { wrapper: Wrapper })
  return { onBack }
}

const stored = () => db.sources.get(SOURCE_ID)
const button = (name: string | RegExp) => screen.getByRole('button', { name })

beforeEach(async () => {
  requestEpgSync.mockReset()
  requestEpgSync.mockResolvedValue({ outcome: 'synced' })
  await db.sources.put(PROVIDER)
})

afterEach(async () => {
  cleanup()
  await db.epgPrograms.clear()
  await db.sources.delete(SOURCE_ID)
})

describe('EpgSettingsScreen', () => {
  it('vinculado: mostra estado, origem do painel e sincroniza agora', async () => {
    renderScreen()

    expect(await screen.findByText(/EPG vinculado · atualizado em/)).toBeInTheDocument()
    expect(screen.getByText('Endereço do painel da lista')).toBeInTheDocument()

    fireEvent.click(button('Sincronizar agora'))
    await waitFor(() => expect(requestEpgSync).toHaveBeenCalledWith(SOURCE_ID))
  })

  it('erro: mensagem §45 com código EPG-02 e "Tentar novamente"', async () => {
    await db.sources.update(SOURCE_ID, { epgLastErrorKind: 'network', epgLastErrorAt: Date.UTC(2026, 8, 30) })
    renderScreen()

    expect(await screen.findByText(/Não foi possível baixar a programação/)).toBeInTheDocument()
    expect(screen.getByText('EPG-02')).toBeInTheDocument()
    fireEvent.click(button('Tentar novamente'))
    await waitFor(() => expect(requestEpgSync).toHaveBeenCalledWith(SOURCE_ID))
  })

  it('endereço inválido: recusa antes de baixar, sem ecoar o que foi digitado, foco de volta ao campo (FR-018)', async () => {
    renderScreen()
    const input = await screen.findByLabelText('Endereço XMLTV (opcional)')

    fireEvent.change(input, { target: { value: 'abc?token=segredo' } })
    fireEvent.click(button('Salvar endereço'))

    expect(await screen.findByText(/Endereço inválido/)).toBeInTheDocument()
    expect(document.activeElement).toBe(input)
    expect(document.body.textContent).not.toContain('segredo')
    expect(requestEpgSync).not.toHaveBeenCalled()
    expect((await stored())?.epgManualUrl).toBeUndefined()
  })

  it('endereço válido: grava, sincroniza, esvazia o campo e mostra só o host (FR-017)', async () => {
    renderScreen()
    const input = await screen.findByLabelText('Endereço XMLTV (opcional)')

    fireEvent.change(input, { target: { value: 'https://guia.exemplo.org/xmltv/tudo.xml?chave=segredo-manual' } })
    fireEvent.click(button('Salvar endereço'))

    await waitFor(() => expect(requestEpgSync).toHaveBeenCalledWith(SOURCE_ID))
    expect((await stored())?.epgManualUrl).toBe('https://guia.exemplo.org/xmltv/tudo.xml?chave=segredo-manual')
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''))
    expect(await screen.findByText('Endereço informado por você (guia.exemplo.org)')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('segredo-manual')
    expect(document.body.textContent).not.toContain('xmltv/tudo')
  })

  it('campo vazio + salvar limpa o endereço manual e volta ao da lista', async () => {
    await db.sources.update(SOURCE_ID, { epgManualUrl: 'http://manual.test/g.xml' })
    renderScreen()
    await screen.findByLabelText('Endereço XMLTV (opcional)')

    fireEvent.click(button('Salvar endereço'))

    await waitFor(async () => expect((await stored())?.epgManualUrl).toBeUndefined())
    expect(requestEpgSync).toHaveBeenCalled()
  })

  it('deslocamento: ± 1 h grava e limita a ±12, sem baixar nada (FR-020)', async () => {
    renderScreen()
    await screen.findByText(/EPG vinculado/)

    fireEvent.click(button('+ 1 h'))
    await waitFor(async () => expect((await stored())?.epgOffsetHours).toBe(1))
    expect(await screen.findByText('+1 h')).toBeInTheDocument()

    await db.sources.update(SOURCE_ID, { epgOffsetHours: 12 })
    cleanup()
    renderScreen()
    await screen.findByText('+12 h')
    fireEvent.click(button('+ 1 h'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect((await stored())?.epgOffsetHours).toBe(12)

    expect(requestEpgSync).not.toHaveBeenCalled()
  })

  it('desativar exige confirmação, apaga a programação e vira "Ativar EPG"; ativar volta a sincronizar (FR-021)', async () => {
    await writeEpgPrograms(SOURCE_ID, [{ channelKey: 'a', start: 1, end: 2, title: 'P' }])
    renderScreen()
    await screen.findByText(/EPG vinculado/)

    fireEvent.click(button('Desativar EPG'))
    expect(screen.getByText('Desativar o EPG desta lista?')).toBeInTheDocument()
    expect((await stored())?.epgDisabled).toBeUndefined() // ainda não confirmou

    fireEvent.click(button('Desativar'))
    await waitFor(async () => expect((await stored())?.epgDisabled).toBe(true))
    expect(await db.epgPrograms.count()).toBe(0)
    expect(await screen.findByText('EPG desativado')).toBeInTheDocument()
    expect(requestEpgSync).not.toHaveBeenCalled()

    fireEvent.click(button('Ativar EPG'))
    await waitFor(() => expect(requestEpgSync).toHaveBeenCalledWith(SOURCE_ID))
    await waitFor(async () => expect((await stored())?.epgDisabled).toBeUndefined())
  })

  it('cancelar a confirmação não desativa nada', async () => {
    renderScreen()
    await screen.findByText(/EPG vinculado/)
    fireEvent.click(button('Desativar EPG'))
    fireEvent.click(button('Cancelar'))
    expect(screen.queryByText('Desativar o EPG desta lista?')).not.toBeInTheDocument()
    expect((await stored())?.epgDisabled).toBeUndefined()
  })

  it('sem endereço configurado: não há "sincronizar", mas continua havendo ação focável (FR-022)', async () => {
    await db.sources.put({
      ...PROVIDER,
      type: 'm3u_url',
      m3uUrl: 'http://lista.test/avulsa.m3u',
      providerDns: undefined,
      providerUsername: undefined,
      providerPassword: undefined,
      epgLastSyncAt: undefined,
    })
    renderScreen()

    expect(await screen.findByText('EPG não configurado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sincronizar agora' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Endereço XMLTV (opcional)')).toBeInTheDocument()
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('RETURN e o botão Voltar saem da tela', async () => {
    const { onBack } = renderScreen()
    await screen.findByText(/EPG vinculado/)

    fireEvent.click(button('Voltar'))
    expect(onBack).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('a fonte que sumiu não deixa um beco sem saída', async () => {
    await db.sources.delete(SOURCE_ID)
    const { onBack } = renderScreen()

    expect(await screen.findByText('Esta lista não está mais disponível.')).toBeInTheDocument()
    fireEvent.click(button('Voltar'))
    expect(onBack).toHaveBeenCalled()
  })

  it('nunca mostra endereço, usuário ou senha da fonte, e todo controle tem nome acessível', async () => {
    renderScreen()
    await screen.findByText(/EPG vinculado/)

    const text = document.body.textContent ?? ''
    for (const secret of ['usuario-secreto', 'senha-secreta', 'painel.test', 'xmltv.php', 'password=']) expect(text).not.toContain(secret)
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })
})
