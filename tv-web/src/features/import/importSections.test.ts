import { describe, expect, it } from 'vitest'
import { guideRow, isGuideSettled, sectionRows } from './importSections'

const STARTED = 1_000_000

describe('sectionRows (feature 038, FR-015/FR-017)', () => {
  it('Xtream: categorias no pronto, "Não disponível" no vazio, nunca "0 categorias"', () => {
    const rows = sectionRows({
      channel: { state: 'ready', categories: 41 },
      movie: { state: 'ready', categories: 1 },
      series: { state: 'unavailable' },
    })
    expect(rows.map((r) => r.text)).toEqual([
      'Pronto — 41 categorias',
      'Pronto — 1 categoria',
      'Não disponível nesta lista',
    ])
    expect(rows.map((r) => r.label)).toEqual(['Canais', 'Filmes', 'Séries'])
  })

  it('M3U: itens por tipo enquanto lê, com milhar pt-BR', () => {
    const rows = sectionRows({
      channel: { state: 'loading', items: 1234 },
      movie: { state: 'loading', items: 0 },
      series: { state: 'failed', items: 3 },
    })
    expect(rows.map((r) => r.text)).toEqual(['Carregando — 1.234 itens', 'Carregando — 0 itens', 'Falhou'])
  })

  it('execução sem `sections` (anterior à 038): as três aguardam', () => {
    expect(sectionRows(undefined).every((r) => r.text === 'Aguardando')).toBe(true)
  })

  it('nenhuma linha tem percentual', () => {
    const rows = sectionRows({ channel: { state: 'ready', items: 50 }, movie: { state: 'loading', items: 2 }, series: { state: 'waiting' } })
    expect(rows.some((r) => r.text.includes('%'))).toBe(false)
  })
})

describe('guideRow (feature 038, FR-018/FR-019)', () => {
  it('antes da importação terminar, aguarda', () => {
    expect(guideRow({ importSucceeded: false, epg: undefined, syncing: false, runStartedAt: STARTED }).state).toBe('waiting')
  })

  it('sem EPG configurado ou desativado: não disponível (e isso resolve a tela)', () => {
    const row = guideRow({ importSucceeded: true, epg: { state: 'not_configured', offsetHours: 0 }, syncing: false, runStartedAt: STARTED })
    expect(row.text).toBe('Não disponível nesta lista')
    expect(isGuideSettled(row)).toBe(true)
  })

  it('sincronizando: carregando; sincronização anterior a esta importação não conta como pronta', () => {
    const epg = { state: 'linked' as const, lastSyncAt: STARTED - 1, offsetHours: 0 }
    expect(guideRow({ importSucceeded: true, epg, syncing: true, runStartedAt: STARTED }).state).toBe('loading')
    expect(guideRow({ importSucceeded: true, epg, syncing: false, runStartedAt: STARTED }).state).toBe('loading')
    expect(guideRow({ importSucceeded: true, epg: { ...epg, lastSyncAt: STARTED + 5 }, syncing: false, runStartedAt: STARTED }).state).toBe('ready')
  })

  it('falha desta sincronização: mensagem categorizada com o código, nunca o erro cru; falha antiga não conta', () => {
    const failed = guideRow({
      importSucceeded: true,
      epg: { state: 'error', errorKind: 'network', lastErrorAt: STARTED + 10, offsetHours: 0 },
      syncing: false,
      runStartedAt: STARTED,
    })
    expect(failed.state).toBe('failed')
    expect(failed.text).toMatch(/^Falhou — .*\(EPG-02\)$/)
    expect(failed.text).not.toMatch(/https?:/)
    const old = guideRow({
      importSucceeded: true,
      epg: { state: 'error', errorKind: 'network', lastErrorAt: STARTED - 10, offsetHours: 0 },
      syncing: false,
      runStartedAt: STARTED,
    })
    expect(old.state).toBe('loading')
  })
})
