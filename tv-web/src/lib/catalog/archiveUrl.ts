/**
 * URL de arquivo (catch-up) de um canal de painel Xtream (feature 058,
 * `sdd/specs/058-headers-avplay-catchup/logic/arquivo.md` §2).
 *
 * Função pura, como `buildLiveUrl`: a URL carrega usuário e senha e por isso
 * só existe no instante de tocar (ADR-010) — nunca em estado de tela, log ou
 * mensagem de erro (FR-020).
 *
 * O painel recebe o início do programa no **relógio dele** (`AAAA-MM-DD:HH-MM`),
 * não em UTC: o fuso nomeado do painel (`server_info.timezone`) vence, porque
 * acerta o horário de verão de uma data passada; sem ele, vale o deslocamento
 * medido (`time_now` − `timestamp_now`). Sem nenhum dos dois, não há URL —
 * nunca se adivinha o fuso (constitution, "IA e Classificação Nunca Inventam
 * Dados").
 */

/** As duas formas de URL de arquivo que painéis Xtream servem (`docs/iptvnator/03-apis.md` #8). */
export type ArchiveVariant = 'rest' | 'php'

/** Ordem de tentativa quando a fonte ainda não tem variante conhecida (TS antes de HLS, REST antes do legado). */
export const ARCHIVE_VARIANTS: readonly ArchiveVariant[] = ['rest', 'php']

/** O relógio do painel, como a verificação da conta o leu (`server_info`). */
export interface PanelClock {
  /** Fuso IANA declarado pelo painel (ex.: `America/Sao_Paulo`). */
  timezone?: string
  /** Deslocamento medido do relógio do painel em relação a UTC, em minutos (ex.: −180). */
  utcOffsetMinutes?: number
}

export interface ArchiveUrlInput {
  /** Endereço do painel, sem barra final (como em `buildLiveUrl`). */
  base: string
  username: string
  password: string
  /** `stream_id` do canal no painel. */
  streamId: string
  /** Início do programa (instante real, epoch ms — EPG já com o deslocamento manual da fonte). */
  startMs: number
  /** Fim do programa (epoch ms). A duração vai em minutos, arredondada para cima. */
  endMs: number
  clock: PanelClock
  /** Extensão do contêiner (`ts` preferido; `m3u8` se a conta só permitir HLS). */
  extension: string
}

/** O relógio do painel é desconhecido: não há como montar o início no fuso dele. */
export class ArchiveClockUnknownError extends Error {
  constructor() {
    super('Relógio do painel desconhecido.')
    this.name = 'ArchiveClockUnknownError'
  }
}

/** STUB do sdd-plan: a Fase 3 implementa (`logic/arquivo.md` §2). */
export function buildArchiveUrl(variant: ArchiveVariant, input: ArchiveUrlInput): string {
  void variant
  void input
  throw new Error('not implemented')
}
