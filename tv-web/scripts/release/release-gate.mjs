// Feature 078: CLI do gate de prontidão para o Samsung TV Seller Office.
//   node scripts/release/release-gate.mjs --variant base|commercial [--wgt <caminho>] [--root <dir>] [--record-local]
// Só este arquivo toca disco e git; os módulos vizinhos recebem dados prontos
// (logic/gate.md §7). Nunca autentica nem envia nada ao Seller Office (FR-015).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declaredFiles } from '../tizenFiles.mjs'
import { checkAuthor, checkCustody, readAuthorCertificate } from './author.mjs'
import { compareWithPrevious, describeCandidate } from './candidate.mjs'
import { STATUS } from './checklist.mjs'
import { decideLaunch } from './decision.mjs'
import { checkEvidence } from './evidence.mjs'
import { checkInventory, checkPackage, parseTizenConfig } from './packageChecks.mjs'
import { checkKit } from './kit.mjs'
import { checkPrivacy } from './privacy.mjs'
import { checkPrivileges } from './privileges.mjs'
import { renderReport } from './report.mjs'
import { readWgt, sha256 } from './wgt.mjs'

// O nome do .wgt segue o <name> do config.xml (CCPlayTV.wgt desde a 078), então o padrão é
// o único .wgt de CCPlayTv/.buildResult, não um nome fixo.
const BUILD_RESULT = 'CCPlayTv/.buildResult'
const VARIANTS = ['base', 'commercial']
const MAX_DIRTY_PATHS = 25
// Piso de runtime do build (D-004): `required_version` não pode oferecer o app a TVs abaixo dele.
const RUNTIME_FLOOR = '8.0'

/** @param {string[]} argv */
export function parseArgs(argv) {
  const args = { variant: undefined, wgt: undefined, root: undefined, recordLocal: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--variant') args.variant = argv[++i]
    else if (flag === '--record-local') args.recordLocal = true
    else if (flag === '--wgt') args.wgt = argv[++i]
    else if (flag === '--root') args.root = argv[++i]
    else throw new Error(`argumento desconhecido: ${flag}`)
  }
  if (!VARIANTS.includes(args.variant)) throw new Error('use --variant base|commercial')
  return args
}

const defaultRoot = () => resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

// Saídas da validação do candidato (R-011): gravá-las não pode sujar o candidato que descrevem.
const VALIDATION_OUTPUTS = ['release/samsung/reports/', 'release/samsung/evidence/', 'release/samsung/target-matrix.json']

/**
 * Caminhos alterados no repositório inteiro, menos as saídas da validação (VALIDATION_OUTPUTS).
 * @param {string} root
 * @returns {string[]}
 */
function listDirtyPaths(root) {
  const out = execFileSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const entries = out.split('\0').filter(Boolean)
  const paths = []
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    paths.push(entry.slice(3))
    if (entry[0] === 'R' || entry[0] === 'C') i += 1 // o próximo registro é o caminho de origem
  }
  return paths.filter((path) => !VALIDATION_OUTPUTS.some((prefix) => path.replace(/\\/g, '/').startsWith(prefix)))
}

/**
 * `--record-local` (T029): roda lint e testes unitários e grava só o código de saída — nunca a
 * saída bruta, que pode carregar valor de ambiente (FR-016).
 */
function recordLocalEvidence(root, evidenceDir, candidate, date) {
  const runs = [['INT-EVD-STATIC', 'static', 'npm run lint'], ['INT-EVD-BUILD', 'build', 'npm run test']]
  mkdirSync(evidenceDir, { recursive: true })
  for (const [gate, name, script] of runs) {
    let exitCode = 0
    try {
      execFileSync(script, { cwd: join(root, 'tv-web'), stdio: 'ignore', shell: true })
    } catch (error) {
      exitCode = typeof error.status === 'number' ? error.status : 1
    }
    const entry = {
      gate,
      candidate: { version: candidate.version, variant: candidate.variant, revision: candidate.revision, wgtSha256: candidate.wgtSha256 },
      environment: 'local', script, exitCode, result: exitCode === 0 ? STATUS.PASS : STATUS.BLOCKED, date, by: 'release-gate --record-local',
    }
    writeFileSync(join(evidenceDir, `${name}-${date}-${candidate.variant}.json`), `${JSON.stringify(entry, null, 2)}\n`)
  }
}

function readEvidence(evidenceDir) {
  if (!existsSync(evidenceDir)) return []
  return readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('privacy-'))
    .map((name) => readJson(join(evidenceDir, name), undefined))
    .filter(Boolean)
}

/** Caminhos de `dir` (recursivo), relativos a ele, com `/`. Vazio se `dir` não existe. */
function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(full, base) : [relative(base, full).replace(/\\/g, '/')]
  })
}

/**
 * Inventário (logic §3): o que o build emite (tv-web/dist) × o que o yaml declara × o que
 * entrou no pacote. `config.xml` e `icon.png` vêm do projeto Tizen, não do dist: entram com
 * o hash do disco, para que um config.xml editado depois do empacotamento apareça.
 */
function inventoryResult(root, entries, yamlText) {
  const distDir = join(root, 'tv-web', 'dist')
  const tizenDir = join(root, 'CCPlayTv')
  if (!existsSync(distDir)) {
    return { id: 'INT-PKG-INVENTORY', status: STATUS.PENDING, detail: 'tv-web/dist ausente: não há como comparar o emitido', nextAction: 'rodar npm run build:tizen (quickstart §2)' }
  }
  const emitted = Object.fromEntries(listFiles(distDir).map((path) => [path, sha256(readFileSync(join(distDir, path)))]))
  for (const path of ['config.xml', 'icon.png']) {
    if (existsSync(join(tizenDir, path))) emitted[path] = sha256(readFileSync(join(tizenDir, path)))
  }
  const packaged = {}
  for (const path of Object.keys(emitted)) if (entries.has(path)) packaged[path] = sha256(entries.get(path))
  const declared = [...new Set([...declaredFiles(yamlText), 'config.xml'])]
  return checkInventory({ declared, emitted, packaged })[0]
}

function buildTypeOf(yamlText) {
  return /^build_type:\s*(\S+)/m.exec(yamlText)?.[1]
}

/** Último relatório JSON da mesma variante (mais recente por data de gravação). */
function readPreviousReport(reportsDir, variant) {
  if (!existsSync(reportsDir)) return undefined
  const files = readdirSync(reportsDir)
    .filter((name) => name.endsWith(`-${variant}.json`))
    .map((name) => ({ name, mtime: statSync(join(reportsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return files.length ? readJson(join(reportsDir, files[0].name), undefined) : undefined
}

/**
 * `readFile` do kit: só arquivos dentro de `kitDir`. Caminho fora (absoluto, `..`) ou ausente
 * devolve undefined, e o `checkKit` bloqueia o item sem ler nada fora do kit.
 */
export function kitReader(kitDir) {
  const base = resolve(kitDir)
  return (path) => {
    const full = resolve(base, path)
    if (!full.startsWith(base + sep) || !existsSync(full) || !statSync(full).isFile()) return undefined
    return readFileSync(full)
  }
}

function kitResults(samsung, variant, today) {
  const kitDir = join(samsung, 'kit')
  const manifest = readJson(join(kitDir, 'manifest.json'), undefined)
  if (!manifest || !Array.isArray(manifest.items)) {
    return [{ id: 'INT-KIT-SECRETS', status: STATUS.PENDING, detail: 'manifest do kit ausente ou ilegível', nextAction: 'criar release/samsung/kit/manifest.json (data-model.md)' }]
  }
  // SAM-KIT-PRIVACY não depende de artefato do kit, e sim da URL e da evidência de publicação.
  const evidenceDir = join(samsung, 'evidence')
  const evidence = existsSync(evidenceDir)
    ? readdirSync(evidenceDir).filter((name) => /^privacy-.*\.json$/.test(name)).map((name) => readJson(join(evidenceDir, name), undefined)).filter(Boolean)
    : []
  const privacy = checkPrivacy({ privacyUrl: manifest.privacyUrl, item: manifest.items.find((item) => item.id === 'SAM-KIT-PRIVACY'), evidence })
  return [...checkKit({ manifest, readFile: kitReader(kitDir), variant, today }).filter((r) => r.id !== privacy.id), privacy]
}

function findDefaultWgt(root) {
  const dir = join(root, BUILD_RESULT)
  const found = existsSync(dir) ? readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.wgt')) : []
  if (found.length !== 1) {
    throw new Error(`esperava exatamente um .wgt em ${BUILD_RESULT} (achei ${found.length}); empacote de novo ou use --wgt`)
  }
  return join(BUILD_RESULT, found[0])
}

/** @param {{ variant: string, wgt?: string, root?: string }} args */
export function runGate(args) {
  const root = resolve(args.root ?? defaultRoot())
  const samsung = join(root, 'release', 'samsung')
  const wgtPath = resolve(root, args.wgt ?? findDefaultWgt(root))
  if (!existsSync(wgtPath)) throw new Error(`pacote não encontrado: ${args.wgt} (rode o empacotamento — quickstart §2)`)

  const wgtBuffer = readFileSync(wgtPath)
  const entries = readWgt(wgtBuffer)
  const configXml = entries.get('config.xml')?.toString('utf8') ?? ''
  const version = parseTizenConfig(configXml).version ?? ''

  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const dirtyPaths = listDirtyPaths(root)
  const { candidate, results: candidateResults } = describeCandidate({
    variant: args.variant,
    revision,
    dirtyPaths,
    buildMode: args.variant === 'commercial' ? 'commercial' : 'production',
    version,
    wgtSha256: sha256(wgtBuffer),
  })
  // Relatório legível: lista só os primeiros caminhos; a contagem fica no detalhe.
  candidate.dirtyPaths = candidate.dirtyPaths.slice(0, MAX_DIRTY_PATHS)
  for (const result of candidateResults) if (result.paths) result.paths = result.paths.slice(0, MAX_DIRTY_PATHS)

  const results = [...candidateResults]

  const distribution = readJson(join(samsung, 'distribution.json'), {})
  results.push(distribution.variant === args.variant
    ? { id: 'INT-DIST-VARIANT', status: STATUS.PASS, detail: `variante ${args.variant} é a distribuída para o Tizen ID atual` }
    : { id: 'INT-DIST-VARIANT', status: STATUS.NA, detail: 'variante fora da distribuição atual; o relatório não vale para submissão', justification: 'release/samsung/distribution.json lista outra variante' })

  const published = readJson(join(samsung, 'published.json'), {})
  const yamlPath = join(root, 'CCPlayTv', 'tizen_web_project.yaml')
  const yamlText = existsSync(yamlPath) ? readFileSync(yamlPath, 'utf8') : ''
  const storeTitle = readJson(join(samsung, 'kit', 'manifest.json'), {}).storeTitle

  results.push(...checkPackage({
    configXml,
    packageFiles: [...entries.keys()],
    runtimeFloor: RUNTIME_FLOOR,
    lastPublishedVersion: published.lastPublishedVersion ?? undefined,
    publishedTizenId: published.tizenId ?? undefined,
    buildType: buildTypeOf(yamlText),
    storeTitle,
  }))
  results.push(inventoryResult(root, entries, yamlText))

  const ledger = readJson(join(samsung, 'privileges.json'), { features: { checkout: false, inAppAds: false }, privileges: {} })
  results.push(...checkPrivileges({
    declared: parseTizenConfig(configXml).privileges,
    ledger: ledger.privileges ?? {},
    features: ledger.features ?? { checkout: false, inAppAds: false },
    variant: args.variant,
  }))

  const certificate = readAuthorCertificate(entries.get('author-signature.xml')?.toString('utf8') ?? '')
  results.push(checkAuthor({ certificate, publishedFingerprint: published.authorCertSha256 }))
  results.push(checkCustody({ custody: readJson(join(samsung, 'custody.json'), undefined), certificate }))

  // SAM-REG-*: conferências manuais no Seller Office, registradas em published.json (A-01).
  results.push(published.packageNameChecked
    ? { id: 'SAM-REG-PACKAGENAME', status: STATUS.PASS, detail: 'nome do pacote conferido no Seller Office' }
    : { id: 'SAM-REG-PACKAGENAME', status: STATUS.PENDING, detail: 'colisão de nome de pacote ainda não conferida', nextAction: 'conferir no Seller Office e registrar packageNameChecked em published.json' })
  results.push(published.appId
    ? { id: 'SAM-REG-APPID', status: STATUS.PASS, detail: 'App ID do Seller Office registrado' }
    : { id: 'SAM-REG-APPID', status: STATUS.PENDING, detail: 'App ID do Seller Office ainda não registrado (≠ Tizen ID)', nextAction: 'registrar o app no Seller Office e preencher appId em published.json' })

  const generatedAt = new Date().toISOString()
  results.push(...kitResults(samsung, args.variant, generatedAt.slice(0, 10)))

  const evidenceDir = join(samsung, 'evidence')
  if (args.recordLocal) recordLocalEvidence(root, evidenceDir, candidate, generatedAt.slice(0, 10))
  results.push(...checkEvidence({ evidence: readEvidence(evidenceDir), wgtSha256: candidate.wgtSha256 }))

  const matrix = readJson(join(samsung, 'target-matrix.json'), [])
  const { decision, blockers, approvedTargets } = decideLaunch({ results, matrix })

  const reportsDir = join(samsung, 'reports')
  const stale = compareWithPrevious(readPreviousReport(reportsDir, args.variant)?.candidate, candidate)
  const report = { candidate, results, approvedTargets, decision, blockers, stale, generatedAt }

  mkdirSync(reportsDir, { recursive: true })
  const base = join(reportsDir, `${version || 'sem-versao'}-${args.variant}`)
  writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(`${base}.md`, renderReport(report))
  return { report, files: [`${base}.json`, `${base}.md`] }
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
  try {
    const { report, files } = runGate(args)
    console.log(`Decisão: ${report.decision} (${report.blockers.length} bloqueio(s))`)
    if (report.stale.stale) console.log(`Relatório anterior obsoleto: ${report.stale.reasons.join(', ')}`)
    for (const file of files) console.log(file)
    process.exit(report.decision === 'Ready for submission' ? 0 : 2)
  } catch (error) {
    console.error(error.message === 'invalid_wgt' ? 'pacote inválido (invalid_wgt)' : error.message)
    process.exit(1)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
