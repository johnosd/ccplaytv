/**
 * Bancada do benchmark de importação (feature 063, US3) — só em dev, servida
 * como `/bench.html`; fora do build (T051 confere o `dist/`). Expõe
 * `window.__importBench.run(...)` para o runner Node/Playwright e, com
 * `?auto=1&fixtures=<url>`, roda sozinha o plano do servidor e devolve o
 * resultado por `POST /result` (rodada opcional no navegador da TV, FR-024).
 * Formato: `sdd/specs/063-codigo-saudavel-benchmark/logic/benchmark.md` §3–§5.
 */
import { cleanupBenchSources, runStages } from './benchStages'
import { runReal } from './benchReal'
import type { BenchFormat, BenchModeResult, BenchRunOptions } from './benchTypes'

interface BenchPlan {
  combos: Array<{ format: BenchFormat; size: number }>
  clock: number
}

declare global {
  interface Window {
    __importBench?: {
      run: (options: BenchRunOptions) => Promise<BenchModeResult>
      cleanup: () => Promise<void>
    }
  }
}

const run = (options: BenchRunOptions): Promise<BenchModeResult> => (options.mode === 'stages' ? runStages(options) : runReal(options))

/** Só produto e versão do navegador (`Chrome/120.0.0.0` → `chromium 120.0.0.0`), nunca o texto inteiro do agente. */
function browserOf(): string {
  const match = /(?:Chrome|Chromium)\/([\d.]+)/.exec(navigator.userAgent)
  return match ? `chromium ${match[1]}` : 'navegador desconhecido'
}

function show(line: string): void {
  const log = document.getElementById('log')
  if (log) log.textContent = `${log.textContent ?? ''}${line}\n`
}

/** Roda o plano do servidor em sequência, limpando as fontes fictícias entre uma combinação e outra. */
async function runAuto(fixturesUrl: string): Promise<void> {
  const plan = (await (await fetch(`${fixturesUrl}/plan`)).json()) as BenchPlan
  const results: Array<BenchModeResult & { format: BenchFormat; size: number }> = []
  for (const combo of plan.combos) {
    for (const mode of ['stages', 'real'] as const) {
      show(`${combo.format} ${combo.size} (${mode})…`)
      const comboUrl = `${fixturesUrl}/f/${combo.format}-${combo.size}`
      results.push({ format: combo.format, size: combo.size, ...(await run({ ...combo, mode, fixturesUrl: comboUrl, clock: plan.clock })) })
      await cleanupBenchSources()
    }
  }
  await fetch(`${fixturesUrl}/result`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ browser: browserOf(), results }),
  })
  show('Concluído: resultado enviado ao PC.')
}

window.__importBench = { run, cleanup: cleanupBenchSources }

const params = new URLSearchParams(window.location.search)
if (params.get('auto') === '1' && params.get('fixtures')) {
  runAuto(params.get('fixtures') as string).catch((error: unknown) => {
    show(`Falhou (${error instanceof Error ? error.name : 'Error'}).`)
  })
}
