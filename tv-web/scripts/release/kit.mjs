// Feature 078 (US4, FR-008/009/010/010a/012/016): manifest do kit do Seller Office.
// Módulo puro (logic/gate.md §5): recebe o manifest e um `readFile` já restrito pelo CLI a
// release/samsung/kit/. Nunca devolve trecho de arquivo — só caminho e nome do padrão.
import { createHash } from 'node:crypto'
import { STATUS } from './checklist.mjs'

/**
 * @typedef {{ path: string, sha256: string }} KitArtifact
 * @typedef {{ id: string, owner: string, status: import('./checklist.mjs').Status, artifacts?: KitArtifact[], naReason?: string, nextAction?: string, value?: string, justification?: string }} KitItem
 * @typedef {{ kitVersion: string, items: KitItem[], languages?: string[], defaultLanguage?: string, storeTitle?: string, privacyUrl?: string }} KitManifest
 */

const KNOWN_STATUS = new Set(Object.values(STATUS))
const TEXT_EXT = /\.(md|txt|json|html|csv)$/i
// Material de chave/certificado nunca entra no kit, qualquer que seja o conteúdo.
const KEY_EXT = /\.(p12|pfx|pem|key)$/i
const MAX_SHOT_BYTES = 500000
const SHOT_SIZES = ['1280x720', '1920x1080']
const DEFAULT_LANGUAGES = ['pt', 'en', 'es']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// SOF0–3, 5–7, 9–11, 13–15 (C4 = DHT, C8 = JPG reservado, CC = DAC não são SOF).
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

const SECRET_PATTERNS = [
  ['xtream-credential-url', /username=[^&\s]+&password=[^&\s]+/i],
  ['xtream-credential-url', /\/(?:live|movie|series)\/[^/\s]+\/[^/\s]+\/\d+/i],
  ['credential-query', /\b(?:password|pass|token)=[^&\s"']+/i],
  ['hex32-key', /(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9\-._~+/]{8,}=*/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/],
  ['private-key-block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

/** @param {Buffer} buffer @returns {{ width: number, height: number } | null} */
export function inspectJpeg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  let i = 2
  while (i + 1 < buffer.length) {
    if (buffer[i] !== 0xff) return null
    const marker = buffer[i + 1]
    if (marker === 0xff) { i += 1; continue } // byte de preenchimento
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue } // sem comprimento
    if (marker === 0xd9 || marker === 0xda) return null // fim/início dos dados sem SOF antes
    if (i + 4 > buffer.length) return null
    if (JPEG_SOF.has(marker)) {
      if (i + 9 > buffer.length) return null
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) }
    }
    const length = buffer.readUInt16BE(i + 2)
    if (length < 2) return null
    i += 2 + length
  }
  return null
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** @param {Buffer} buffer @returns {{ width: number, height: number, hasAlpha: boolean } | null} */
export function inspectPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 26 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const colorType = buffer[25]
  let hasAlpha = colorType === 4 || colorType === 6
  // Paleta/RGB/cinza com transparência declarada por chunk tRNS também contam como alfa.
  for (let i = 8; !hasAlpha && i + 8 <= buffer.length;) {
    const length = buffer.readUInt32BE(i)
    const type = buffer.toString('ascii', i + 4, i + 8)
    if (type === 'tRNS') hasAlpha = true
    if (type === 'IDAT' || type === 'IEND') break
    i += 12 + length
  }
  return { width, height, hasAlpha }
}

/** @param {string} text @returns {string[]} nomes dos padrões encontrados — nunca o trecho */
export function findSecrets(text) {
  if (typeof text !== 'string' || !text) return []
  return [...new Set(SECRET_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name))]
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

/** Caminho relativo ao kit, sem subir de diretório nem ser absoluto. */
function isSafeKitPath(path) {
  if (typeof path !== 'string' || !path) return false
  const normalized = path.replace(/\\/g, '/')
  return !normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized) && !normalized.split('/').includes('..')
}

const blocked = (item, detail, paths) => ({
  id: item.id, status: STATUS.BLOCKED, detail, owner: item.owner, ...(paths?.length ? { paths } : {}),
  nextAction: item.nextAction ?? 'corrigir o artefato e o manifest do kit',
})

/** Lê e confere cada artefato; devolve os buffers por caminho ou a lista de caminhos com falha. */
function loadArtifacts(artifacts, readFile) {
  const buffers = new Map()
  const failed = []
  for (const artifact of artifacts) {
    const buffer = isSafeKitPath(artifact?.path) ? readFile(artifact.path) : undefined
    if (!buffer || sha256(buffer) !== artifact.sha256) failed.push(String(artifact?.path ?? '(sem caminho)'))
    else buffers.set(artifact.path, buffer)
  }
  return { buffers, failed }
}

/** Regras de mídia/conteúdo por item; devolve um motivo de bloqueio ou undefined. */
function specificProblem(item, buffers, { manifest, variant, today }) {
  const entries = [...buffers]
  switch (item.id) {
    case 'SAM-KIT-SHOTS': {
      if (entries.length !== 4) return { detail: `são exigidos exatamente 4 screenshots (há ${entries.length})` }
      const bad = entries.filter(([path, buffer]) => {
        const info = inspectJpeg(buffer)
        return !/\.jpe?g$/i.test(path) || !info || buffer.length >= MAX_SHOT_BYTES || !SHOT_SIZES.includes(`${info.width}x${info.height}`)
      }).map(([path]) => path)
      return bad.length ? { detail: 'screenshot fora do padrão (JPEG < 500 kB, 1280×720 ou 1920×1080)', paths: bad } : undefined
    }
    case 'SAM-KIT-LOGO': {
      if (!entries.length) return { detail: 'logo sem artefato' }
      const bad = entries.filter(([, buffer]) => !inspectPng(buffer)?.hasAlpha).map(([path]) => path)
      return bad.length ? { detail: 'logo precisa ser PNG com transparência', paths: bad } : undefined
    }
    case 'SAM-KIT-ICONBG': {
      if (!entries.length) return { detail: 'fundo do ícone sem artefato' }
      const bad = entries.filter(([, buffer]) => !inspectPng(buffer) && !inspectJpeg(buffer)).map(([path]) => path)
      return bad.length ? { detail: 'fundo do ícone precisa ser PNG ou JPEG legível', paths: bad } : undefined
    }
    case 'SAM-KIT-LISTING': {
      // FR-010a / A-02: título e descrição não vazios em cada idioma suportado.
      const languages = manifest.languages ?? DEFAULT_LANGUAGES
      const missing = languages.filter((lang) => {
        const buffer = buffers.get(`listing/${lang}.md`)
        if (!buffer) return true
        const text = buffer.toString('utf8')
        const title = /^#\s+(\S.*)$/m.exec(text)?.[1]?.trim()
        const body = text.replace(/^#.*$/gm, '').trim()
        return !title || !body
      })
      return missing.length ? { detail: 'listagem sem título ou descrição em idioma suportado', paths: missing.map((lang) => `listing/${lang}.md`) } : undefined
    }
    case 'SAM-KIT-VOC':
      return EMAIL.test(item.value ?? '') ? undefined : { detail: 'e-mail VOC ausente ou inválido no manifest' }
    case 'SAM-KIT-TESTACCESS': {
      // FR-012 / A-03 / R-004: o comercial não tem licença de teste para o revisor.
      if (variant === 'commercial') return { detail: 'build comercial sem licença/voucher de teste para o revisor (R-004)' }
      if (!entries.length) return { detail: 'acesso de demonstração sem artefato' }
      const validUntil = entries.map(([, buffer]) => /validUntil:\s*(\d{4}-\d{2}-\d{2})/.exec(buffer.toString('utf8'))?.[1]).find(Boolean)
      if (!validUntil) return { detail: 'acesso de demonstração sem validade registrada (validUntil)' }
      if (today && validUntil < today) return { detail: 'acesso de demonstração vencido' }
      return undefined
    }
    default:
      return entries.length ? undefined : { detail: 'Pass declarado sem artefato' }
  }
}

function checkItem(item, readFile, context) {
  if (!KNOWN_STATUS.has(item.status)) return blocked(item, 'estado desconhecido no manifest')
  if (item.status === STATUS.NA) {
    return item.naReason?.trim()
      ? { id: item.id, status: STATUS.NA, detail: 'não se aplica a este candidato', owner: item.owner, justification: item.naReason }
      : blocked(item, 'Not Applicable sem justificativa (naReason)')
  }
  if (item.status === STATUS.PENDING) {
    return { id: item.id, status: STATUS.PENDING, detail: 'item ainda não entregue', owner: item.owner, nextAction: item.nextAction ?? 'entregar o artefato' }
  }
  if (item.status === STATUS.WAIVED) {
    return { id: item.id, status: STATUS.WAIVED, detail: 'dispensa declarada no manifest', owner: item.owner, justification: item.justification }
  }
  if (item.status === STATUS.BLOCKED) return blocked(item, 'bloqueio declarado no manifest')

  const { buffers, failed } = loadArtifacts(item.artifacts ?? [], readFile)
  if (failed.length) return blocked(item, 'artefato ausente, fora do kit ou com hash divergente', failed)
  const problem = specificProblem(item, buffers, context)
  if (problem) return blocked(item, problem.detail, problem.paths)
  return { id: item.id, status: STATUS.PASS, detail: 'artefato(s) conferido(s)', owner: item.owner }
}

function secretsResult(manifest, readFile) {
  const patterns = new Set()
  const paths = new Set()
  for (const item of manifest.items ?? []) {
    for (const artifact of item.artifacts ?? []) {
      const path = String(artifact?.path ?? '')
      if (KEY_EXT.test(path)) { patterns.add('key-material-file'); paths.add(path); continue }
      if (!TEXT_EXT.test(path) || !isSafeKitPath(path)) continue
      const found = findSecrets(readFile(path)?.toString('utf8') ?? '')
      if (found.length) { found.forEach((name) => patterns.add(name)); paths.add(path) }
    }
  }
  const inManifest = findSecrets(JSON.stringify(manifest))
  if (inManifest.length) { inManifest.forEach((name) => patterns.add(name)); paths.add('manifest.json') }
  return patterns.size
    ? { id: 'INT-KIT-SECRETS', status: STATUS.BLOCKED, detail: `possível segredo no kit: ${[...patterns].join(', ')}`, paths: [...paths], nextAction: 'remover o valor do kit; segredo fica no cofre (FR-012)' }
    : { id: 'INT-KIT-SECRETS', status: STATUS.PASS, detail: 'nenhum padrão de segredo no kit nem no manifest' }
}

/**
 * @param {{ manifest: KitManifest, readFile: (path: string) => Buffer | undefined, variant?: string, today?: string }} input
 *   `today` (AAAA-MM-DD) habilita a checagem de validade do acesso de demonstração.
 * @returns {import('./checklist.mjs').CheckResult[]} um resultado por item do manifest + `INT-KIT-SECRETS`
 */
export function checkKit({ manifest, readFile, variant, today }) {
  const safeRead = (path) => {
    try {
      return readFile(path)
    } catch {
      return undefined
    }
  }
  const context = { manifest, variant, today }
  return [...(manifest.items ?? []).map((item) => checkItem(item, safeRead, context)), secretsResult(manifest, safeRead)]
}
