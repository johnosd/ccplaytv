// Feature 078 (US2, FR-003/003a/003b/004, FR-010a): conferência do pacote Tizen.
// Regras em sdd/specs/078-prontidao-publicacao-samsung/logic/gate.md §3.
import { STATUS } from './checklist.mjs'

/**
 * @typedef {{ widgetId?: string, name?: string, version?: string, tizenId?: string, packageId?: string, requiredVersion?: string, privileges: string[], features: string[], profile?: string }} TizenConfig
 */

const REQUIRED_PACKAGE_FILES = ['config.xml', 'author-signature.xml', 'signature1.xml']

/** Valor do atributo `name` dentro de uma tag já isolada. */
function attr(tag, name) {
  if (!tag) return undefined
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]
}

function allAttr(xml, tagName, name) {
  const out = []
  for (const match of xml.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))) {
    const value = attr(match[0], name)
    if (value !== undefined) out.push(value)
  }
  return out
}

/**
 * Regex como em `scripts/tizenInputPrivilege.test.mjs`, não um parser XML genérico.
 * @param {string} xmlText conteúdo de config.xml
 * @returns {TizenConfig}
 */
export function parseTizenConfig(xmlText) {
  const widget = /<widget\b[^>]*>/.exec(xmlText)?.[0]
  const application = /<tizen:application\b[^>]*>/.exec(xmlText)?.[0]
  const profile = /<tizen:profile\b[^>]*>/.exec(xmlText)?.[0]
  return {
    widgetId: attr(widget, 'id'),
    version: attr(widget, 'version'),
    name: /<name\b[^>]*>([^<]*)<\/name>/.exec(xmlText)?.[1]?.trim(),
    tizenId: attr(application, 'id'),
    packageId: attr(application, 'package'),
    requiredVersion: attr(application, 'required_version'),
    privileges: allAttr(xmlText, 'tizen:privilege', 'name'),
    features: allAttr(xmlText, 'feature', 'name'),
    profile: attr(profile, 'name'),
  }
}

/** Compara listas de inteiros componente a componente (0.10.0 > 0.9.0). */
function compareNumeric(a, b) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

const pass = (id, detail) => ({ id, status: STATUS.PASS, detail })
const blocked = (id, detail, nextAction) => ({ id, status: STATUS.BLOCKED, detail, ...(nextAction ? { nextAction } : {}) })

function checkVersion(version, lastPublishedVersion) {
  const id = 'SAM-CFG-VERSION'
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '')
  if (!match) return blocked(id, 'versão fora do formato x.y.z', 'corrigir widget@version em config.xml')
  const [major, minor, patch] = match.slice(1).map(Number)
  if (major > 255 || minor > 255 || patch > 65535) {
    return blocked(id, `versão ${version} fora da faixa 0–255.0–255.0–65535`, 'corrigir widget@version em config.xml')
  }
  if (lastPublishedVersion && compareNumeric(version, lastPublishedVersion) <= 0) {
    return blocked(id, `versão ${version} não é maior que a publicada (${lastPublishedVersion})`, 'incrementar widget@version e reempacotar')
  }
  return pass(id, lastPublishedVersion ? `versão ${version} maior que a publicada` : `versão ${version} na faixa permitida`)
}

function checkApiVersion(requiredVersion, runtimeFloor) {
  const id = 'SAM-CFG-APIVERSION'
  if (!/^\d+\.\d+$/.test(requiredVersion ?? '')) return blocked(id, 'required_version ausente ou fora do formato x.y', 'corrigir tizen:application@required_version')
  if (compareNumeric(requiredVersion, runtimeFloor) < 0) {
    return blocked(id, `required_version ${requiredVersion} abaixo do piso de runtime ${runtimeFloor}: o app seria oferecido a TVs que o build não suporta`, `subir required_version para ${runtimeFloor}`)
  }
  return pass(id, `required_version ${requiredVersion} coerente com o piso ${runtimeFloor}`)
}

function checkTizenId(config, publishedTizenId) {
  const id = 'SAM-CFG-TIZENID'
  const { tizenId, packageId } = config
  if (!tizenId) return blocked(id, 'Tizen ID ausente em tizen:application@id', 'preencher tizen:application@id')
  if (!packageId || !new RegExp(`^${packageId}\\.[A-Za-z0-9_]+$`).test(tizenId)) {
    return blocked(id, 'Tizen ID não segue o formato <packageId>.<nome>', 'alinhar tizen:application@id ao package')
  }
  if (publishedTizenId && tizenId !== publishedTizenId) {
    return blocked(id, `Tizen ID diferente do publicado (${publishedTizenId})`, 'restaurar o Tizen ID publicado: o Seller Office o liga ao App ID')
  }
  return pass(id, publishedTizenId ? 'Tizen ID igual ao publicado' : 'Tizen ID presente e coerente com o package')
}

/**
 * @param {{ configXml: string, packageFiles: string[], runtimeFloor: string, lastPublishedVersion?: string, publishedTizenId?: string, buildType: string, storeTitle?: string }} input
 * @returns {import('./checklist.mjs').CheckResult[]}
 */
export function checkPackage(input) {
  const config = parseTizenConfig(input.configXml ?? '')
  const files = new Set((input.packageFiles ?? []).map((file) => file.replace(/\\/g, '/')))
  const missing = REQUIRED_PACKAGE_FILES.filter((file) => !files.has(file))
  const results = []

  results.push(missing.length === 0
    ? pass('SAM-PKG-FILES', 'config.xml, author-signature.xml e signature1.xml presentes')
    : { ...blocked('SAM-PKG-FILES', `arquivo(s) obrigatório(s) ausente(s) no pacote: ${missing.join(', ')}`, 'empacotar com o perfil de certificado Samsung (quickstart §2)'), paths: missing })
  results.push({ id: 'SAM-PKG-MULTIARCH', status: STATUS.NA, detail: 'pacote .wgt Web, arquitetura única', justification: 'multi-arquitetura só vale para binários nativos' })
  results.push(checkTizenId(config, input.publishedTizenId))
  results.push(/^[A-Za-z0-9]{10}$/.test(config.packageId ?? '')
    ? pass('SAM-CFG-PACKAGEID', 'package ID de 10 caracteres alfanuméricos')
    : blocked('SAM-CFG-PACKAGEID', 'package ID ausente, fora de 10 caracteres ou com caractere especial', 'corrigir tizen:application@package'))
  results.push(checkVersion(config.version, input.lastPublishedVersion))
  results.push(checkApiVersion(config.requiredVersion, input.runtimeFloor))

  if (!input.storeTitle) {
    results.push({ id: 'SAM-CFG-TITLE', status: STATUS.PENDING, detail: 'título do idioma padrão ainda não definido no kit', nextAction: 'definir storeTitle em release/samsung/kit/manifest.json' })
  } else if (config.name === input.storeTitle) {
    results.push(pass('SAM-CFG-TITLE', 'name do pacote igual ao título do idioma padrão'))
  } else {
    results.push(blocked('SAM-CFG-TITLE', `name do pacote "${config.name ?? ''}" difere do título do kit "${input.storeTitle}" (a comparação respeita maiúsculas)`, 'alinhar <name> em config.xml ao storeTitle'))
  }

  results.push(config.features.some((name) => name.startsWith('http://tizen.org/feature/screen.size.'))
    ? pass('SAM-CFG-SCREENSIZE', 'tamanho de tela declarado em feature')
    : blocked('SAM-CFG-SCREENSIZE', 'nenhuma feature screen.size.* em config.xml', 'declarar http://tizen.org/feature/screen.size.*'))

  results.push(input.buildType === 'Release'
    ? pass('INT-PKG-RELEASE', 'build_type Release')
    : blocked('INT-PKG-RELEASE', `build_type ${input.buildType ?? 'ausente'}: o pacote de submissão precisa ser Release`, 'definir build_type: Release em tizen_web_project.yaml e reempacotar'))
  return results
}

/**
 * @param {{ declared: string[], emitted: Record<string, string>, packaged: Record<string, string> }} input
 *   `emitted`/`packaged`: caminho → SHA-256 (dist sincronizado / dentro do .wgt).
 * @returns {import('./checklist.mjs').CheckResult[]}
 */
export function checkInventory(input) {
  const norm = (path) => path.replace(/\\/g, '/')
  const normMap = (map) => Object.fromEntries(Object.entries(map).map(([path, hash]) => [norm(path), hash]))
  const declared = new Set(input.declared.map(norm))
  const emitted = normMap(input.emitted)
  const packaged = normMap(input.packaged)

  const drift = new Set()
  for (const path of declared) if (!(path in emitted)) drift.add(path) // declarado e não emitido (obsoleto)
  for (const [path, hash] of Object.entries(emitted)) {
    if (!declared.has(path)) drift.add(path) // emitido e não declarado
    else if (!(path in packaged) || packaged[path] !== hash) drift.add(path) // ausente do pacote ou hash diferente
  }
  const paths = [...drift].sort()
  return [paths.length === 0
    ? pass('INT-PKG-INVENTORY', 'emitido, declarado e empacotado coincidem')
    : { ...blocked('INT-PKG-INVENTORY', `${paths.length} arquivo(s) divergem entre emitido, declarado e empacotado`, 'rodar npm run build:tizen e reempacotar'), paths }]
}
