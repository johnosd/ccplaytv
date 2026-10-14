// Feature 063 (US2, 49b): fronteiras de código e limite de tamanho, como
// catraca — o que já existia na adoção fica em `architecture-baseline.json` e
// só pode diminuir. Roda dentro de `npm run lint`.
//
//   node scripts/architecture.mjs                    verifica (falha só por violação)
//   node scripts/architecture.mjs --write-baseline   gera a lista na adoção (recusa se já existir)
//   node scripts/architecture.mjs --prune            só aperta: tira exceção obsoleta e baixa teto
//
// Regras e formato: `sdd/specs/063-codigo-saudavel-benchmark/logic/catraca-arquitetura.md`.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/** Linhas físicas acima das quais um arquivo de produção novo reprova. */
export const MAX_LINES = 300

/**
 * @typedef {{ path: string, source: string }} SourceFile
 *   `path` relativo a `tv-web/src`, com `/` (ex.: `features/home/HomeContent.tsx`).
 *
 * @typedef {{ imports: Record<string, string[]>, maxLines: Record<string, number> }} Baseline
 *   `imports`: arquivo → destinos já resolvidos (mesmo formato de `path`) herdados da adoção.
 *   `maxLines`: arquivo → teto de linhas herdado da adoção.
 *
 * @typedef {'feature-to-feature' | 'lib-to-ui' | 'components-to-features' | 'catalog-to-player' | 'max-lines'} Rule
 *
 * @typedef {{ file: string, rule: Rule, target?: string, lines?: number, limit?: number }} Violation
 *
 * @typedef {{ file: string, kind: 'import' | 'max-lines', target?: string, lines?: number, ceiling?: number }} Obsolete
 *   Exceção que não serve mais: import que sumiu, ou arquivo abaixo do teto (dá para baixar) ou do limite (sai da lista).
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SRC_DIR = path.resolve(here, '../src')
const DEFAULT_BASELINE_PATH = path.join(here, 'architecture-baseline.json')

const toPosix = (value) => value.replace(/\\/g, '/')

/** Linhas físicas; a quebra final do arquivo não conta uma linha a mais. */
export function countLines(source) {
  if (source === '') return 0
  return source.replace(/\r?\n$/, '').split(/\r?\n/).length
}

/** Arquivo de produção? Teste, fixture, `src/testing/`, `setupTests*` e `.d.ts` ficam de fora (FR-014). */
export function isProductionFile(filePath) {
  const file = toPosix(filePath)
  if (!/\.tsx?$/.test(file)) return false
  if (/\.d\.ts$/.test(file)) return false
  if (/\.test\.tsx?$/.test(file)) return false
  if (/\.fixtures\.tsx?$/.test(file)) return false
  if (/(^|\/)testing\//.test(file)) return false
  if (/^setupTests[^/]*$/.test(path.posix.basename(file))) return false
  return true
}

/** Especificadores relativos de um arquivo (`import`, `import type`, `export … from`, `import()`). */
function relativeSpecifiers(source) {
  const found = ts.preProcessFile(source, true, true).importedFiles.map((entry) => entry.fileName)
  return [...new Set(found.filter((specifier) => specifier.startsWith('./') || specifier.startsWith('../')))]
}

/** Caminho do destino relativo a `src`; `undefined` se sai de `src`. Prefere o arquivo que existe no conjunto. */
function resolveTarget(origin, specifier, known) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(origin), specifier))
  if (base === '..' || base.startsWith('../')) return undefined
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (known.has(candidate)) return candidate
  }
  return base
}

const featureOf = (file) => /^features\/([^/]+)\//.exec(file)?.[1]

/** @returns {Rule | undefined} a regra de importação que o par origem→destino viola, se houver. */
function ruleOf(origin, target) {
  if (origin.startsWith('lib/catalog/') && target.startsWith('lib/player/')) return 'catalog-to-player'
  const from = featureOf(origin)
  const to = featureOf(target)
  if (from && to && from !== to) return 'feature-to-feature'
  if (origin.startsWith('lib/') && (target.startsWith('components/') || target.startsWith('features/'))) return 'lib-to-ui'
  if (origin.startsWith('components/') && target.startsWith('features/')) return 'components-to-features'
  return undefined
}

/** Todos os destinos relativos de cada arquivo de produção, já resolvidos. */
function importsOf(files) {
  const known = new Set(files.map((file) => toPosix(file.path)))
  const result = new Map()
  for (const file of files) {
    const origin = toPosix(file.path)
    if (!isProductionFile(origin)) continue
    const targets = new Set()
    for (const specifier of relativeSpecifiers(file.source)) {
      const target = resolveTarget(origin, specifier, known)
      if (target !== undefined) targets.add(target)
    }
    result.set(origin, targets)
  }
  return result
}

/**
 * @param {SourceFile[]} files
 * @param {Baseline} baseline
 * @returns {{ violations: Violation[], obsolete: Obsolete[] }}
 */
export function checkArchitecture(files, baseline) {
  const inherited = baseline.imports ?? {}
  const ceilings = baseline.maxLines ?? {}
  const imports = importsOf(files)
  /** @type {Violation[]} */
  const violations = []
  /** @type {Obsolete[]} */
  const obsolete = []

  const lineCounts = new Map()
  for (const file of files) {
    const origin = toPosix(file.path)
    if (isProductionFile(origin)) lineCounts.set(origin, countLines(file.source))
  }

  for (const [origin, targets] of imports) {
    for (const target of [...targets].sort()) {
      const rule = ruleOf(origin, target)
      if (!rule) continue
      // `catalog-to-player` nunca é herdável: mesmo listado, reprova.
      if (rule !== 'catalog-to-player' && (inherited[origin] ?? []).includes(target)) continue
      violations.push({ file: origin, rule, target })
    }
  }

  for (const [origin, lines] of lineCounts) {
    const ceiling = ceilings[origin]
    const limit = ceiling ?? MAX_LINES
    if (lines > limit) violations.push({ file: origin, rule: 'max-lines', lines, limit })
    else if (ceiling !== undefined && (lines <= MAX_LINES || lines < ceiling)) {
      obsolete.push({ file: origin, kind: 'max-lines', lines, ceiling })
    }
  }

  for (const [origin, targets] of Object.entries(inherited)) {
    for (const target of targets) {
      if (!imports.get(origin)?.has(target)) obsolete.push({ file: origin, kind: 'import', target })
    }
  }
  for (const [origin, ceiling] of Object.entries(ceilings)) {
    if (!lineCounts.has(origin)) obsolete.push({ file: origin, kind: 'max-lines', ceiling })
  }

  return { violations, obsolete }
}

const sortedObject = (entries) => Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

/**
 * Lista de exceções do estado atual — usada uma vez, na adoção. `catalog-to-player` nunca entra.
 * @param {SourceFile[]} files
 * @returns {Baseline}
 */
export function buildBaseline(files) {
  const imports = []
  for (const [origin, targets] of importsOf(files)) {
    const inheritable = [...targets].filter((target) => {
      const rule = ruleOf(origin, target)
      return rule !== undefined && rule !== 'catalog-to-player'
    })
    if (inheritable.length > 0) imports.push([origin, inheritable.sort()])
  }
  const maxLines = []
  for (const file of files) {
    const origin = toPosix(file.path)
    if (!isProductionFile(origin)) continue
    const lines = countLines(file.source)
    if (lines > MAX_LINES) maxLines.push([origin, lines])
  }
  return { imports: sortedObject(imports), maxLines: sortedObject(maxLines) }
}

/**
 * Só aperta: tira o que ficou obsoleto e baixa tetos ao valor atual. Nunca acrescenta
 * entrada nem sobe teto.
 * @param {SourceFile[]} files
 * @param {Baseline} baseline
 * @returns {Baseline}
 */
export function pruneBaseline(files, baseline) {
  const { obsolete } = checkArchitecture(files, baseline)
  const imports = new Map(Object.entries(baseline.imports ?? {}).map(([file, targets]) => [file, [...targets]]))
  const maxLines = new Map(Object.entries(baseline.maxLines ?? {}))
  for (const entry of obsolete) {
    if (entry.kind === 'import') {
      const left = (imports.get(entry.file) ?? []).filter((target) => target !== entry.target)
      if (left.length > 0) imports.set(entry.file, left)
      else imports.delete(entry.file)
    } else if (entry.lines === undefined || entry.lines <= MAX_LINES) {
      maxLines.delete(entry.file)
    } else {
      maxLines.set(entry.file, entry.lines)
    }
  }
  return {
    imports: sortedObject([...imports].map(([file, targets]) => [file, targets.sort()])),
    maxLines: sortedObject([...maxLines]),
  }
}

/** Chaves e listas em ordem alfabética, 2 espaços e quebra final: o diff da lista fica estável. */
export function serializeBaseline(baseline) {
  const imports = sortedObject(Object.entries(baseline.imports ?? {}).map(([file, targets]) => [file, [...targets].sort()]))
  const maxLines = sortedObject(Object.entries(baseline.maxLines ?? {}))
  return `${JSON.stringify({ imports, maxLines }, null, 2)}\n`
}

/**
 * Lê todos os `.ts`/`.tsx` de produção sob `srcDir`.
 * @returns {SourceFile[]}
 */
export function loadSourceFiles(srcDir) {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map(toPosix)
    .filter(isProductionFile)
    .sort()
    .map((relative) => ({ path: relative, source: readFileSync(path.join(srcDir, relative), 'utf8') }))
}

/** @returns {Baseline} */
export function loadBaseline(baselinePath) {
  if (!existsSync(baselinePath)) {
    throw new Error(
      `Lista de exceções não encontrada (${toPosix(path.relative(process.cwd(), baselinePath))}). Gere-a uma vez com: node scripts/architecture.mjs --write-baseline`,
    )
  }
  const parsed = JSON.parse(readFileSync(baselinePath, 'utf8'))
  return { imports: parsed.imports ?? {}, maxLines: parsed.maxLines ?? {} }
}

const RULE_WIDTH = 24

function describeViolation(violation) {
  const rule = violation.rule.padEnd(RULE_WIDTH)
  if (violation.rule === 'max-lines') return `architecture: ${rule}${violation.file} (${violation.lines} > ${violation.limit})`
  return `architecture: ${rule}${violation.file} -> ${violation.target}`
}

function describeObsolete(entry) {
  if (entry.kind === 'import') return `architecture: aviso — exceção obsoleta (import)  ${entry.file} -> ${entry.target}`
  if (entry.lines === undefined) return `architecture: aviso — exceção obsoleta (arquivo sumiu)  ${entry.file}`
  if (entry.lines <= MAX_LINES) return `architecture: aviso — exceção obsoleta (cabe em ${MAX_LINES})  ${entry.file} (${entry.lines})`
  return `architecture: aviso — teto pode baixar  ${entry.file} (${entry.lines} < ${entry.ceiling})`
}

const COUNTS = (baseline) => `${Object.values(baseline.imports).flat().length} imports herdados, ${Object.keys(baseline.maxLines).length} arquivos com teto`

/**
 * CLI: devolve o código de saída (`0` ok, `1` violação, `2` lista ausente ou já existente).
 * Só imprime caminhos e números, nunca trecho de código.
 */
export function runCli(argv, options = {}) {
  const srcDir = options.srcDir ?? DEFAULT_SRC_DIR
  const baselinePath = options.baselinePath ?? DEFAULT_BASELINE_PATH
  const out = options.out ?? ((line) => console.log(line))
  const err = options.err ?? ((line) => console.error(line))

  if (argv.includes('--write-baseline')) {
    if (existsSync(baselinePath)) {
      err('architecture: a lista de exceções já existe e nunca é regenerada. Para apertar use --prune; para abrir uma exceção, edite scripts/architecture-baseline.json à mão, com justificativa no PR/commit.')
      return 2
    }
    const baseline = buildBaseline(loadSourceFiles(srcDir))
    writeFileSync(baselinePath, serializeBaseline(baseline))
    out(`architecture: lista de exceções gerada — ${COUNTS(baseline)}.`)
    return 0
  }

  let baseline
  try {
    baseline = loadBaseline(baselinePath)
  } catch (error) {
    err(`architecture: ${error.message}`)
    return 2
  }
  const files = loadSourceFiles(srcDir)

  if (argv.includes('--prune')) {
    const pruned = pruneBaseline(files, baseline)
    const text = serializeBaseline(pruned)
    if (text === serializeBaseline(baseline)) out('architecture: nada a apertar.')
    else {
      writeFileSync(baselinePath, text)
      out(`architecture: lista apertada — ${COUNTS(baseline)} → ${COUNTS(pruned)}.`)
    }
    return 0
  }

  const { violations, obsolete } = checkArchitecture(files, baseline)
  for (const entry of obsolete) out(describeObsolete(entry))
  for (const violation of violations) err(describeViolation(violation))
  if (violations.length > 0) {
    err(`architecture: ${violations.length} violação(ões). Import herdado só entra editando scripts/architecture-baseline.json à mão, com justificativa no PR/commit.`)
    return 1
  }
  out(`architecture: ok — ${files.length} arquivos de produção, ${COUNTS(baseline)}${obsolete.length > 0 ? `, ${obsolete.length} aviso(s) (use --prune)` : ''}.`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli(process.argv.slice(2)))
}
