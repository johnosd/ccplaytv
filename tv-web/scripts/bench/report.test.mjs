// Cobertura dos ajudantes puros do runner do benchmark (feature 063, T043/T048).
import { hostname, userInfo } from 'node:os'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareResults, deviceSlug, findLeaks, findPrevious, formatComparison, resultFileName } from './report.mjs'

const stages = (n) => ({ fetchMs: n, parseMs: n * 2, classifyMs: n * 3, storeMs: n * 4, totalMs: n * 10 })
const ok = (format, size, n, realMs = n * 20) => ({
  format,
  size,
  status: 'ok',
  stages: stages(n),
  realPath: { status: 'ok', totalMs: realMs },
})
const result = (slug, date, results) => ({ schema: 1, date, device: { slug }, results })

describe('report — aparelho e nome do arquivo', () => {
  it('o slug do aparelho só descreve hardware: sem nome da máquina nem usuário', () => {
    const slug = deviceSlug({ platform: 'win32', cpuModel: 'AMD Ryzen 7 5700X 8-Core Processor' })
    expect(slug).toBe('desktop-win32-amd-ryzen-7-5700x-8-core-processor')
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(slug).not.toContain(hostname().toLowerCase())
    expect(slug).not.toContain(userInfo().username.toLowerCase())
    expect(deviceSlug({ platform: 'linux', cpuModel: '' })).toBe('desktop-linux-cpu-desconhecida')
    expect(deviceSlug({ platform: 'win32', cpuModel: 'Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz' })).toBe('desktop-win32-intel-core-i7-9700k-cpu-3-60ghz')
  })

  it('o runner e os ajudantes não leem nome da máquina nem usuário', () => {
    for (const file of ['report.mjs', 'run-import-bench.mjs']) {
      let source = ''
      try {
        source = readFileSync(new URL(file, import.meta.url), 'utf8')
      } catch {
        continue // o runner entra em outra task; o teste passa a valer quando ele existir
      }
      expect(source, file).not.toMatch(/hostname\s*\(|userInfo\s*\(|USERNAME|USERPROFILE|process\.env\.USER\b/)
    }
  })

  it('o nome do arquivo é data UTC, aparelho e commit', () => {
    expect(resultFileName({ date: '2026-10-08T14:03:00.000Z', device: 'desktop-win32-amd-ryzen-7', commit: 'ac649dd' })).toBe(
      '2026-10-08T1403-desktop-win32-amd-ryzen-7-ac649dd.json',
    )
    expect(resultFileName({ date: '2026-01-02T03:04:05Z', device: 'tv-qn50q60d', commit: '' })).toBe('2026-01-02T0304-tv-qn50q60d-sem-commit.json')
  })
})

describe('report — comparação com o anterior', () => {
  const antigo = result('pc-a', '2026-10-01T10:00:00Z', [ok('m3u', 1000, 10), ok('xtream', 1000, 20)])
  const outroAparelho = result('tv-b', '2026-10-05T10:00:00Z', [ok('m3u', 1000, 999)])
  const atual = result('pc-a', '2026-10-08T10:00:00Z', [ok('m3u', 1000, 12), ok('xtream', 1000, 20)])

  it('só compara com o resultado anterior do MESMO aparelho, o mais recente', () => {
    const maisNovoDoMesmo = result('pc-a', '2026-10-03T10:00:00Z', [ok('m3u', 1000, 11)])
    expect(findPrevious([antigo, outroAparelho, maisNovoDoMesmo], atual)).toBe(maisNovoDoMesmo)
    expect(findPrevious([outroAparelho], atual)).toBeUndefined()
    // Um resultado posterior ao atual nunca é "anterior".
    expect(findPrevious([result('pc-a', '2026-10-20T10:00:00Z', [])], atual)).toBeUndefined()
  })

  it('calcula a variação por etapa em ms e em %', () => {
    const rows = compareResults(antigo, atual)
    const fetch = rows.find((row) => row.format === 'm3u' && row.stage === 'fetchMs')
    expect(fetch).toMatchObject({ previousMs: 10, currentMs: 12, deltaMs: 2 })
    expect(fetch.deltaPct).toBeCloseTo(20)
    expect(rows.find((row) => row.format === 'xtream' && row.stage === 'totalMs')).toMatchObject({ deltaMs: 0 })
    expect(rows.some((row) => row.stage === 'realMs')).toBe(true)
  })

  it('primeira execução, sem anterior, não quebra e avisa', () => {
    expect(compareResults(undefined, atual)).toEqual([])
    expect(formatComparison(compareResults(undefined, atual))).toEqual(['Sem resultado anterior do mesmo aparelho para comparar.'])
  })

  it('uma combinação com falha aparece na tabela sem derrubar as outras', () => {
    const comFalha = result('pc-a', '2026-10-08T10:00:00Z', [
      { format: 'm3u', size: 100000, status: 'failed', failedStage: 'store', errorName: 'QuotaExceededError' },
      ok('m3u', 1000, 12),
    ])
    const rows = compareResults(antigo, comFalha)
    expect(rows.find((row) => row.status === 'failed')).toMatchObject({ format: 'm3u', size: 100000, failedStage: 'store' })
    expect(rows.some((row) => row.status !== 'failed' && row.size === 1000)).toBe(true)
    const text = formatComparison(rows).join('\n')
    expect(text).toContain('FALHOU na etapa store')
    expect(text).toContain('+2.0 ms')
    // Falha também no resultado anterior: a combinação é ignorada, sem exceção.
    const anteriorComFalha = result('pc-a', '2026-10-01T10:00:00Z', [{ format: 'm3u', size: 1000, status: 'failed', failedStage: 'parse' }])
    expect(() => compareResults(anteriorComFalha, atual)).not.toThrow()
  })
})

describe('report — nada que identifique pessoa, máquina ou fonte', () => {
  it('reprova URL, endereço com porta e os nomes proibidos; aceita um resultado limpo', () => {
    const limpo = result('desktop-win32-x', '2026-10-08T10:00:00Z', [ok('m3u', 1000, 10)])
    expect(findLeaks(limpo, ['MINHA-MAQUINA', 'maria'])).toEqual([])
    expect(findLeaks({ ...limpo, fixtures: 'http://127.0.0.1:5000' })).toContain('url')
    expect(findLeaks({ ...limpo, host: '192.168.0.10:5173/' })).toContain('url')
    expect(findLeaks({ ...limpo, note: 'rodou na Minha-Maquina' }, ['MINHA-MAQUINA'])).toContain('nome-da-maquina-ou-usuario')
    expect(findLeaks(limpo, ['', undefined])).toEqual([])
  })
})
