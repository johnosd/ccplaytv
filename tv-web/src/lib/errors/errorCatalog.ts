/**
 * Tabela única de erros acionáveis (feature 042, `logic/erros-acionaveis.md` §1,
 * DS V14 §45). Pura e sem React: cada tela monta o seu estado com isto.
 *
 * Códigos que já existiam antes da feature (`EPG-02`, `STO-01`, `TRL-*`, `YT-n`)
 * são REGISTRADOS aqui, nunca renomeados — testes e contratos de outras
 * features os citam. Nenhum texto desta tabela pode conter URL ou credencial.
 */

import type { ProviderFailureKind } from '../catalog/xtreamConnector'

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
  | 'EPG-02'
  | 'STO-01'
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

const TABLE: Record<ErrorCode, ErrorDescription> = {
  'NET-01': {
    title: 'Sem internet',
    description: 'O aparelho está sem conexão. O que já está no aparelho continua disponível.',
    primaryAction: 'Tentar de novo',
    retryable: true,
  },
  'NET-02': {
    title: 'O servidor não respondeu',
    description: 'Não foi possível falar com o servidor da lista agora.',
    primaryAction: 'Tentar de novo',
    retryable: true,
  },
  'SRC-001': {
    title: 'Endereço inválido',
    description: 'Confira o endereço do servidor e tente de novo.',
    primaryAction: 'Corrigir',
    retryable: false,
  },
  'SRC-401': {
    title: 'Credencial inválida',
    description: 'O servidor recusou o usuário ou a senha desta lista.',
    primaryAction: 'Editar lista',
    retryable: false,
  },
  'SRC-402': {
    title: 'Conta expirada',
    description: 'O servidor informou que a conta desta lista expirou.',
    primaryAction: 'Editar lista',
    retryable: false,
  },
  'SRC-409': {
    title: 'Este item não tem fonte',
    description: 'Este item não tem uma fonte de reprodução disponível.',
    primaryAction: 'Voltar',
    retryable: false,
  },
  'SRC-422': {
    title: 'Resposta incompatível',
    description: 'O servidor respondeu de um jeito que o app não entende.',
    primaryAction: 'Editar lista',
    retryable: false,
  },
  'API-401': {
    title: 'Chave recusada',
    description: 'O serviço recusou a chave informada.',
    primaryAction: 'Editar chave',
    retryable: false,
  },
  'API-429': {
    title: 'Serviço temporariamente limitado',
    description: 'O serviço pediu um intervalo. Tente mais tarde.',
    primaryAction: 'Tentar mais tarde',
    retryable: true,
  },
  'PLAY-01': {
    title: 'Não foi possível carregar o stream',
    description: 'A conexão com o stream falhou.',
    primaryAction: 'Tentar de novo',
    retryable: true,
  },
  'PLAY-02': {
    title: 'Formato não suportado',
    description: 'Este aparelho não consegue reproduzir o formato deste stream.',
    primaryAction: 'Info técnica',
    retryable: false,
  },
  'PLAY-03': {
    title: 'A fonte deste item não responde',
    description: 'O servidor não entregou este item. A conta ou o item podem ter expirado.',
    primaryAction: 'Editar lista',
    retryable: false,
  },
  'PLAY-04': {
    title: 'Stream indisponível',
    description: 'Não foi possível reproduzir isto.',
    primaryAction: 'Tentar de novo',
    retryable: true,
  },
  'EPG-02': {
    title: 'Programação indisponível',
    description: 'Não foi possível obter a programação desta lista.',
    primaryAction: 'Sincronizar EPG',
    retryable: true,
  },
  'STO-01': {
    title: 'Sem espaço no aparelho',
    description: 'O armazenamento do aparelho está cheio.',
    primaryAction: 'Tentar de novo',
    retryable: true,
  },
  'TRL-REDE': {
    title: 'Sem internet',
    description: 'O trailer precisa de conexão.',
    primaryAction: 'Tentar de novo',
    retryable: true,
  },
  'TRL-TEMPO': {
    title: 'O trailer demorou demais',
    description: 'O trailer não começou a tempo.',
    primaryAction: 'Tentar de novo',
    retryable: true,
  },
  'TRL-PONTE': {
    title: 'Trailer indisponível',
    description: 'Não foi possível carregar o trailer agora.',
    primaryAction: 'Tentar de novo',
    retryable: true,
  },
}

export function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(TABLE, value)
}

export function describeError(code: ErrorCode): ErrorDescription {
  return TABLE[code]
}

/** Todos os códigos registrados (o teste varre a tabela inteira). */
export function listErrorCodes(): ErrorCode[] {
  return Object.keys(TABLE) as ErrorCode[]
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
