/**
 * Estado, endereço e mensagens do EPG de uma fonte (feature 030,
 * `data-model.md` §1, `logic/sincronizacao-epg.md` §1).
 *
 * Funções puras sobre o `SourceRecord`. **Nada aqui devolve ou registra um
 * endereço XMLTV para uma tela**: o endereço pode carregar credencial/token
 * (ADR-010), então a interface só recebe o estado (`EpgStatus`) e, no máximo,
 * o hostname do endereço manual (`epgManualHost`).
 */
import type { EpgErrorKind, SourceRecord } from '../catalog/db'
import { parsePanelUrl } from '../catalog/m3uPanelUrl'
import type { EpgStatus, EpgUrlOrigin } from './types'

/** Passado esse tempo desde a última sincronização bem-sucedida, abrir a fonte atualiza o EPG (FR-009). */
export const EPG_STALE_AFTER_MS = 12 * 60 * 60 * 1000

export const EPG_MAX_OFFSET_HOURS = 12

/** Código técnico discreto de toda falha de EPG (§45, D-011). */
export const EPG_ERROR_CODE = 'EPG-02'

/** Credencial do painel, como `readCredential` devolve. */
export interface EpgPanelCredential {
  dns: string
  username: string
  password: string
}

export interface ResolvedEpgUrl {
  url: string
  origin: EpgUrlOrigin
}

/** Endereço `http(s)` sem espaços — a validação de FR-018, antes de qualquer download. */
export function isValidEpgUrl(text: string): boolean {
  const value = text.trim()
  if (value === '' || /\s/.test(value)) return false
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== ''
  } catch {
    return false
  }
}

/**
 * `url-tvg`/`x-tvg-url` pode trazer vários endereços separados por vírgula;
 * vale o primeiro válido. Ausente/inválido → `undefined`.
 */
export function firstEpgUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  for (const part of raw.split(',')) {
    const candidate = part.trim()
    if (isValidEpgUrl(candidate)) return candidate
  }
  return undefined
}

/** Credencial de painel que esta fonte permite derivar, ou `undefined` (M3U avulsa, fonte incompleta). */
function panelCredentialOf(record: SourceRecord): EpgPanelCredential | undefined {
  if (record.type === 'm3u_url') return record.m3uUrl ? parsePanelUrl(record.m3uUrl) : undefined
  if (!record.providerDns || !record.providerUsername || !record.providerPassword) return undefined
  return { dns: record.providerDns, username: record.providerUsername, password: record.providerPassword }
}

/** Endereço XMLTV do painel Xtream, com a credencial da fonte. Nunca guardado, nunca logado. */
export function panelXmltvUrl(credential: EpgPanelCredential): string {
  const query = new URLSearchParams({ username: credential.username, password: credential.password })
  return `${credential.dns}/xmltv.php?${query.toString()}`
}

/**
 * De onde vem o endereço em uso (FR-001): manual → painel → declarado pela
 * lista. Só a **origem** — sem construir a URL.
 */
export function epgUrlOriginOf(record: SourceRecord): EpgUrlOrigin | undefined {
  if (record.epgManualUrl) return 'manual'
  if (panelCredentialOf(record)) return 'panel'
  if (record.epgDeclaredUrl) return 'playlist'
  return undefined
}

/** O endereço a baixar, ou `undefined` = "EPG não configurado". */
export function resolveEpgUrl(record: SourceRecord): ResolvedEpgUrl | undefined {
  if (record.epgManualUrl) return { url: record.epgManualUrl, origin: 'manual' }
  const credential = panelCredentialOf(record)
  if (credential) return { url: panelXmltvUrl(credential), origin: 'panel' }
  if (record.epgDeclaredUrl) return { url: record.epgDeclaredUrl, origin: 'playlist' }
  return undefined
}

/** Estado persistido do EPG (data-model §1). "Sincronizando" nunca sai daqui — é estado de execução. */
export function epgStatusOf(record: SourceRecord): EpgStatus {
  const offsetHours = record.epgOffsetHours ?? 0
  const urlOrigin = epgUrlOriginOf(record)
  const base = { urlOrigin, lastSyncAt: record.epgLastSyncAt, offsetHours }

  if (record.epgDisabled) return { ...base, state: 'disabled' }
  if (urlOrigin === undefined) return { state: 'not_configured', lastSyncAt: record.epgLastSyncAt, offsetHours }

  const failedAfterLastSuccess =
    record.epgLastErrorKind !== undefined &&
    (record.epgLastSyncAt === undefined || (record.epgLastErrorAt ?? 0) > record.epgLastSyncAt)
  if (failedAfterLastSuccess) return { ...base, state: 'error', errorKind: record.epgLastErrorKind }

  if (record.epgLastSyncAt !== undefined) return { ...base, state: 'linked' }
  return { ...base, state: 'never_synced' }
}

/**
 * Só o **hostname** do endereço manual (FR-017): a tela diz "informado por
 * você (exemplo.com)" sem nunca mostrar caminho, query ou credencial.
 */
export function epgManualHostOf(record: SourceRecord): string | undefined {
  if (!record.epgManualUrl) return undefined
  try {
    return new URL(record.epgManualUrl).hostname || undefined
  } catch {
    return undefined
  }
}

/** A sincronização automática ao abrir a fonte é devida? (FR-009) Só com endereço, EPG ativo e dado vencido. */
export function isEpgStale(record: SourceRecord, now: number): boolean {
  if (record.epgDisabled) return false
  if (epgUrlOriginOf(record) === undefined) return false
  if (record.epgLastSyncAt === undefined) return true
  return now - record.epgLastSyncAt > EPG_STALE_AFTER_MS
}

/** Mensagem §45 de uma falha: o que aconteceu e por quê, sem detalhe cru da rede (D-011). */
export function epgErrorMessage(kind: EpgErrorKind): string {
  switch (kind) {
    case 'network':
      return 'Não foi possível baixar a programação. Verifique a conexão ou o endereço.'
    case 'refused':
      return 'O servidor recusou o acesso à programação.'
    case 'not_xmltv':
      return 'O endereço não devolveu uma programação no formato XMLTV.'
    case 'unreadable':
      return 'O arquivo de programação veio incompleto ou ilegível.'
    case 'storage_full':
      return 'Sem espaço no aparelho para guardar a programação.'
  }
}
