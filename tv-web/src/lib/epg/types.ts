/**
 * Tipos do EPG (feature 030, `sdd/specs/030-epg-dados-agora/data-model.md`).
 *
 * Todo instante é epoch ms **como a fonte declarou** (fuso do XMLTV já
 * resolvido para UTC). O deslocamento manual da fonte (`epgOffsetHours`) é
 * aplicado só na leitura (`nowAndNext`), nunca gravado — é o que permite
 * mudar o deslocamento sem baixar de novo (FR-020).
 */

/** Intervalo `[from, to)` em epoch ms — um programa entra se se sobrepõe a ele. */
export interface EpgWindow {
  from: number
  to: number
}

/** Um programa como sai do parser e como é gravado (FR-004). */
export interface EpgProgramInput {
  /** Id do canal no XMLTV (`<programme channel="...">`), comparado por igualdade exata (FR-008). */
  channelKey: string
  start: number
  end: number
  /** Nunca vazio — programa sem título não é gravado (FR-030). */
  title: string
  description?: string
}

/** Um programa lido do aparelho. */
export type EpgProgram = EpgProgramInput

/** Um programa pronto para exibir — horários já com o deslocamento da fonte aplicado. */
export interface EpgSlot {
  title: string
  start: number
  end: number
  description?: string
}

export interface NowNext {
  /** Programa em exibição agora; ausente em lacuna, sem programação ou janela esgotada (FR-030). */
  now?: EpgSlot & {
    /** 0–1, tempo decorrido ÷ duração (FR-023). */
    progress: number
  }
  /** Programa seguinte do mesmo canal, se houver na janela guardada (FR-025). */
  next?: EpgSlot
}

/** Motivo de uma falha de sincronização — categoria, nunca a mensagem crua da rede (FR-013/FR-019). */
export type EpgErrorKind =
  /** Rede ou servidor inalcançável. */
  | 'network'
  /** O servidor recusou (401/403). */
  | 'refused'
  /** A resposta não é XMLTV. */
  | 'not_xmltv'
  /** Arquivo corrompido/ilegível no meio da leitura. */
  | 'unreadable'
  /** Sem espaço no aparelho para gravar a programação. */
  | 'storage_full'

/** De onde vem o endereço XMLTV em uso (FR-001). */
export type EpgUrlOrigin = 'manual' | 'panel' | 'playlist'

/**
 * Estado persistido do EPG de uma fonte. "Sincronizando EPG" não aparece
 * aqui: é estado de execução, vem do executor (`epgRunner.ts`), nunca do
 * disco — um registro "sincronizando" deixado por um app fechado no meio
 * mentiria para sempre.
 */
export type EpgState = 'not_configured' | 'disabled' | 'never_synced' | 'linked' | 'error'

export interface EpgStatus {
  state: EpgState
  /** `undefined` quando `state === 'not_configured'`. */
  urlOrigin?: EpgUrlOrigin
  /** Última sincronização bem-sucedida — não avança numa falha (FR-005). */
  lastSyncAt?: number
  /** Só quando `state === 'error'`. */
  errorKind?: EpgErrorKind
  /** Deslocamento manual, −12…+12, padrão 0 (FR-016). */
  offsetHours: number
}
