// Feature 078: leitor mínimo do pacote .wgt (zip) — diretório central +
// zlib.inflateRawSync, sem dependência nova (logic/gate.md §7.2). Erros nunca
// carregam conteúdo do pacote (FR-016).
import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

/** @param {Buffer} buffer */
export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function invalid() {
  return new Error('invalid_wgt')
}

/** Fim do diretório central: procurado de trás pra frente (comentário de até 64 KiB). */
function findEndOfCentralDirectory(buffer) {
  const stop = Math.max(0, buffer.length - 22 - 0xffff)
  for (let offset = buffer.length - 22; offset >= stop; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  return -1
}

/**
 * Entradas do pacote, caminho (com `/`) → conteúdo descompactado. Diretórios ficam de fora.
 *
 * @param {Buffer} buffer
 * @returns {Map<string, Buffer>}
 */
export function readWgt(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw invalid()
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw invalid()
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = new Map()
  try {
    for (let i = 0; i < count; i += 1) {
      if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw invalid()
      const method = buffer.readUInt16LE(offset + 10)
      const compressedSize = buffer.readUInt32LE(offset + 20)
      const nameLength = buffer.readUInt16LE(offset + 28)
      const extraLength = buffer.readUInt16LE(offset + 30)
      const commentLength = buffer.readUInt16LE(offset + 32)
      const localOffset = buffer.readUInt32LE(offset + 42)
      const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength).replace(/\\/g, '/')
      offset += 46 + nameLength + extraLength + commentLength

      if (name.endsWith('/')) continue
      if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw invalid()
      const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
      const data = buffer.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) entries.set(name, Buffer.from(data))
      else if (method === 8) entries.set(name, inflateRawSync(data))
      else throw invalid()
    }
  } catch {
    throw invalid()
  }
  return entries
}
