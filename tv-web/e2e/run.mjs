// Runner da suíte E2E: roda os scripts em paralelo (concorrência limitada),
// cronometra cada um e imprime um resumo ordenado por duração.
//
// Uso (com `npm run dev` já rodando em :5173):
//   npm run test:e2e                       # suíte completa, 3 em paralelo
//   npm run test:e2e -- --jobs 5           # outra concorrência
//   npm run test:e2e -- --only favoritos,limpar-historico   # só alguns scripts
//   npm run test:e2e -- --retry 1          # reexecuta uma vez o que falhar
//   npm run test:e2e:serial                # um por vez (diagnóstico de flake)
//
// Cada script já é isolado (Chromium próprio => IndexedDB próprio; o servidor
// falso escuta na porta 0), por isso rodar em paralelo é seguro. A saída de
// cada script fica em buffer e só é impressa quando ele termina, para não
// intercalar linhas de scripts diferentes.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

// Ordem = a do antigo `test:e2e` serial (sem a duplicata de fontes-estado).
// Scripts `*-real.mjs` ficam de fora de propósito: precisam do .env e da rede.
export const SUITE = [
  'e2e.mjs',
  'e2e/favoritos.mjs',
  'e2e/m3u-sob-demanda.mjs',
  'e2e/capa-real.mjs',
  'e2e/zapping-live-tv.mjs',
  'e2e/busca-por-categoria.mjs',
  'e2e/historico-continuar-assistindo.mjs',
  'e2e/ciclo-vida-player.mjs',
  'e2e/live-tv-ds-v14.mjs',
  'e2e/home-busca-configuracoes.mjs',
  'e2e/limpeza-qa.mjs',
  'e2e/audio-legendas-info.mjs',
  'e2e/qualidade-aspecto.mjs',
  'e2e/fontes-estado.mjs',
  'e2e/epg-dados-agora.mjs',
  'e2e/epg-guia-completo.mjs',
  'e2e/metadata-tmdb.mjs',
  'e2e/trailers.mjs',
  'e2e/modal-temporada.mjs',
  'e2e/semelhantes-elenco-ator.mjs',
  'e2e/carga-listas.mjs',
  'e2e/catalogo-em-blocos.mjs',
  'e2e/limpar-historico.mjs',
  'e2e/rede-lifecycle-erros.mjs',
  'e2e/ime-formularios.mjs',
  'e2e/memoria-foco-key-repeat.mjs',
  'e2e/player-dev-mpegts.mjs',
]

function lerArgs(argv) {
  const opts = { jobs: 3, only: null, retry: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--jobs') opts.jobs = Number(argv[++i])
    else if (a === '--only') opts.only = argv[++i].split(',').map((s) => s.trim())
    else if (a === '--retry') opts.retry = Number(argv[++i])
    else throw new Error(`Argumento desconhecido: ${a}`)
  }
  if (!Number.isInteger(opts.jobs) || opts.jobs < 1) throw new Error('--jobs deve ser inteiro >= 1')
  if (!Number.isInteger(opts.retry) || opts.retry < 0) throw new Error('--retry deve ser inteiro >= 0')
  return opts
}

function nomeCurto(arquivo) {
  return arquivo.replace(/^e2e\//, '').replace(/\.mjs$/, '')
}

function rodarUma(arquivo) {
  return new Promise((resolve) => {
    const inicio = Date.now()
    const filho = spawn(process.execPath, [arquivo], { cwd: RAIZ })
    let saida = ''
    filho.stdout.on('data', (d) => (saida += d))
    filho.stderr.on('data', (d) => (saida += d))
    filho.on('error', (e) => resolve({ ok: false, ms: Date.now() - inicio, saida: String(e) }))
    filho.on('close', (codigo) => resolve({ ok: codigo === 0, ms: Date.now() - inicio, saida }))
  })
}

async function rodarComRetry(arquivo, retry) {
  let tentativas = 0
  let r
  do {
    tentativas++
    r = await rodarUma(arquivo)
  } while (!r.ok && tentativas <= retry)
  return { arquivo, tentativas, ...r }
}

async function main() {
  const opts = lerArgs(process.argv.slice(2))
  const lista = opts.only
    ? SUITE.filter((f) => opts.only.some((o) => nomeCurto(f) === o || f === o))
    : SUITE
  if (lista.length === 0) throw new Error('Nenhum script casa com --only')

  const inicioTotal = Date.now()
  const resultados = []
  const fila = [...lista]

  async function trabalhador() {
    while (fila.length > 0) {
      const arquivo = fila.shift()
      const r = await rodarComRetry(arquivo, opts.retry)
      resultados.push(r)
      const marca = r.ok ? '✓' : '✗'
      const extra = r.tentativas > 1 ? ` (${r.tentativas} tentativas)` : ''
      console.log(`${marca} ${nomeCurto(arquivo)} — ${(r.ms / 1000).toFixed(1)}s${extra}`)
      // Só imprime a saída completa de quem falhou; os que passam já têm o resumo.
      if (!r.ok) console.log(r.saida.trimEnd().split('\n').map((l) => `    ${l}`).join('\n'))
    }
  }

  await Promise.all(Array.from({ length: Math.min(opts.jobs, lista.length) }, trabalhador))

  const totalMs = Date.now() - inicioTotal
  const somaMs = resultados.reduce((s, r) => s + r.ms, 0)
  console.log('\nMais lentos:')
  for (const r of [...resultados].sort((a, b) => b.ms - a.ms).slice(0, 5)) {
    console.log(`  ${(r.ms / 1000).toFixed(1).padStart(6)}s  ${nomeCurto(r.arquivo)}`)
  }
  const falhas = resultados.filter((r) => !r.ok)
  console.log(
    `\n${resultados.length - falhas.length}/${resultados.length} scripts passaram` +
      ` em ${(totalMs / 1000).toFixed(0)}s (soma serial ${(somaMs / 1000).toFixed(0)}s, ${opts.jobs} em paralelo)`,
  )
  if (falhas.length > 0) {
    console.log(`Falharam: ${falhas.map((r) => nomeCurto(r.arquivo)).join(', ')}`)
    console.log('Se for suspeita de flake, reexecute só eles: npm run test:e2e -- --only <nomes> --jobs 1')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(2)
})
