/**
 * Tabela única de erros acionáveis (feature 042, `logic/erros-acionaveis.md` §1,
 * DS V14 §45). Pura e sem React: cada tela monta o seu estado com isto.
 *
 * Códigos que já existiam antes da feature (`EPG-02`, `STO-01`, `TRL-*`, `YT-n`)
 * são REGISTRADOS aqui, nunca renomeados — testes e contratos de outras
 * features os citam. Nenhum texto desta tabela pode conter URL ou credencial.
 */

import type { ProviderFailureKind } from '../catalog/xtreamConnector'
import type { MessageKey } from '../i18n/messages/pt'
import { createTranslator, type Translator } from '../i18n/translate'

export type ErrorCode =
  | 'NET-01'
  | 'NET-02'
  | 'SRC-001'
  | 'SRC-401'
  | 'SRC-402'
  | 'SRC-409'
  | 'SRC-422'
  | 'API-401'
  | 'API-429'
  | 'PLAY-01'
  | 'PLAY-02'
  | 'PLAY-03'
  | 'PLAY-04'
  | 'PLAY-05'
  | 'PLAY-06'
  | 'EPG-02'
  | 'STO-01'
  | 'PAR-01'
  | 'TRL-REDE'
  | 'TRL-TEMPO'
  | 'TRL-PONTE'

export interface ErrorDescription {
  title: string
  description: string
  /** Rótulo da ação primária (o rótulo do app é "Tentar de novo", D-012). */
  primaryAction: string
  /** `true` quando tentar de novo pode resolver. */
  retryable: boolean
}

/**
 * Só o que não é texto: se tentar de novo pode resolver. Título, descrição e ação vêm do
 * catálogo de textos (`error.<CÓDIGO>.title|description|action`, feature 054) — a tabela
 * em português é `lib/i18n/messages/errors.ts`.
 */
const RETRYABLE: Record<ErrorCode, boolean> = {
  'NET-01': true,
  'NET-02': true,
  'SRC-001': false,
  'SRC-401': false,
  'SRC-402': false,
  'SRC-409': false,
  'SRC-422': false,
  'API-401': false,
  'API-429': true,
  'PLAY-01': true,
  'PLAY-02': false,
  'PLAY-03': false,
  'PLAY-04': true,
  // Feature 058: header da lista que a TV não envia (tentar de novo não muda o motor)
  // e arquivo do programa que não respondeu nas duas variantes de URL.
  'PLAY-05': false,
  'PLAY-06': false,
  'EPG-02': true,
  'STO-01': true,
  // Feature 066 (R-017): gravar o PIN/as decisões do controle parental falhou por outro motivo que não espaço (ex.: a
  // transação abortada na TV). Falta de espaço usa o STO-01.
  'PAR-01': true,
  'TRL-REDE': true,
  'TRL-TEMPO': true,
  'TRL-PONTE': true,
}
export function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(RETRYABLE, value)
}

/** 	 omitido = português (testes e chamadores ainda não migrados). */
export function describeError(code: ErrorCode, t: Translator = createTranslator('pt')): ErrorDescription {
  return {
    title: t(`error.${code}.title` as MessageKey),
    description: t(`error.${code}.description` as MessageKey),
    primaryAction: t(`error.${code}.action` as MessageKey),
    retryable: RETRYABLE[code],
  }
}

/** Todos os códigos registrados (o teste varre a tabela inteira). */
export function listErrorCodes(): ErrorCode[] {
  return Object.keys(RETRYABLE) as ErrorCode[]
}

/** `ProviderFailureKind` → código (`logic/erros-acionaveis.md` §4). */
export function providerErrorCode(kind: ProviderFailureKind, online: boolean): ErrorCode {
  switch (kind) {
    case 'invalid_credentials':
      return 'SRC-401'
    case 'subscription_expired':
      return 'SRC-402'
    case 'rate_limited':
      return 'API-429'
    case 'direct_connection_refused':
    case 'network_failure':
      return online ? 'NET-02' : 'NET-01'
  }
}
