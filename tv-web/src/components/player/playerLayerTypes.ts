import type { ReactNode } from 'react'
import type { PlayerAdapterFactory, PlayerState, TrackChoice, ViewChoice } from '../../lib/player/PlayerService'
import type { MediaKey } from '../../lib/tizenMediaKeys'
import type { StreamInfo } from '../../lib/player/tracks'
import type { PlayerEpisodeStep, PlayerIdentity } from '../chromeControls'

export interface PlayerLayerTopLayer {
  /** Árvore React a desenhar por cima do vídeo, dentro do próprio
   *  `.player-overlay` deste componente — nunca como filho de `.screen` por
   *  fora, ou a regra de `visibility:hidden` do plano de hardware (player.css,
   *  seletor `:root.video-plane-visible .screen > *:not(.player-overlay)`)
   *  a esconde. */
  content: ReactNode
  onDirection: (direction: 'up' | 'down' | 'left' | 'right') => void
  onSelect: () => void
  /** RETURN com esta camada aberta — fecha só ELA. Nunca dispara `onClose`
   *  do player inteiro. */
  onBack: () => void
  /**
   * Opcional (feature 016, edge case da spec): segurar OK sobre um item
   * favoritável desta camada continua favoritando/desfavoritando (feature
   * 013), sem conflito com o toque curto que aciona `onSelect` — mesmo
   * gesto por tempo de tecla já usado no resto do app. `undefined` quando
   * não há item focável pra favoritar (ex.: foco na trilha de categorias) —
   * nesse caso o OK age direto no keydown, como toque comum.
   */
  onLongSelect?: () => void
  /** Mesmo gesto de `onLongSelect`, via a tecla amarela do controle (feature 013). */
  onFavoriteKey?: () => void
  /**
   * Opcional (feature 031, D-011): tecla de mídia com esta camada aberta.
   * Sem isto, o `PlayerLayer` ignora as teclas de mídia sob um `topLayer`
   * (só `MediaStop` fecha) — o guia precisa de CH±.
   */
  onMediaKey?: (key: MediaKey) => void
}

export interface PlayerLayerProps {
  itemId: string
  title: string
  onClose: () => void
  /**
   * Costura de injeção do motor. Em produção fica `undefined` e o
   * `PlayerService` escolhe AVPlay ou `<video>` em tempo de execução; nos
   * testes, permite dirigir a máquina de estados sem depender de qual
   * adaptador está ativo.
   */
  createAdapter?: PlayerAdapterFactory
  /** Posição de retomada em ms, aplicada antes de a reprodução começar. */
  startAtMs?: number
  /** Mensagem de "não há fonte de reprodução" (409). Live TV preserva a sua (FR-022). */
  unavailableMessage?: string
  /** Mensagem genérica de falha. Live TV preserva a sua (FR-022). */
  genericErrorMessage?: string
  /**
   * Se presente, a conclusão chama isto em vez de `onClose` (feature 012,
   * D-008) — quem decide entre encerrar e encadear o próximo episódio é a
   * tela (autoplay), nunca esta camada. Live TV e Filmes não passam isto e
   * não mudam de comportamento.
   */
  onCompleted?: () => void

  /** `null`/ausente (padrão): comportamento de sempre. Não-nulo: PlayerLayer
   *  desenha `content` por cima do vídeo e redireciona onDirection/onSelect/
   *  onBack do seu modal para os handlers daqui, em vez do comportamento
   *  padrão de controles de reprodução. */
  topLayer?: PlayerLayerTopLayer | null

  /** SELECT chega aqui em vez de "revelar controles" quando `topLayer` é
   *  `null` E o canal está na faixa/oculto (feature 027: OK na faixa do
   *  Live abre o zapping — antes, era "sem nenhuma ação de controle").
   *  Ausente: SELECT nesse caso continua só revelando a faixa vazia —
   *  Filmes/Séries não passam isto, comportamento inalterado (FR-013). */
  onIdleSelect?: () => void

  /** Dispara na primeira vez que a sessão ATUAL (a do `itemId`/`attempt`
   *  correntes) atinge `state === 'playing'`. Não dispara de novo por
   *  rebuffering do mesmo item. */
  onEnteredPlaying?: () => void

  /** Dispara quando a sessão ATUAL cai em erro — ADEMAIS do desenho padrão
   *  da tela de erro nativa do PlayerLayer (que só fica de fato visível
   *  quando `topLayer` for `null`; com `topLayer` aberto, o scrim+conteúdo
   *  do zapping cobre a tela de erro por trás dela). Mensagem já sanitizada
   *  (a mesma que a tela de erro nativa usaria). */
  onSessionError?: (message: string) => void

  /**
   * Feature 027: identidade exibida no chrome V14. Ausente: o chrome usa
   * `title`. `channelNumber`/`logoUrl` só fazem sentido no canal; `subtitle`
   * no episódio (`T1:E2 • Nome`).
   */
  identity?: PlayerIdentity

  /**
   * Feature 027: ↑/↓/CH± no canal. Devolve `true` se trocou (a tela mudou
   * `itemId`) ou `false` no limite da lista — sem volta ao início (FR-011).
   * Ausente: ↑/↓ só revelam a faixa (sem trocar nada).
   */
  onChannelStep?: (direction: 'previous' | 'next') => boolean

  /**
   * Feature 031 (D-004): o Guia completo. Presente = o controle "Guia" da
   * linha do Live é REAL e OK nele chama isto; ausente = continua o
   * "Guia — em breve" de sempre (o contrato travado da 027 monta o player
   * sem isto). STUB do sdd-plan: ainda não é lida — a T021 liga.
   */
  onGuide?: () => void

  /**
   * Feature 027: anterior/próximo episódio. Ausente (filme, ou episódio
   * aberto de fora do detalhe da série): sem botões de episódio.
   */
  episodeStep?: PlayerEpisodeStep | null

  /**
   * Feature 029 (FR-021/FR-023, D-008): escolha de áudio/legenda/atraso a
   * reaplicar, por idioma, na primeira sessão desta montagem. Ausente = padrão
   * (sem preferência de áudio, legenda desativada, atraso 0). Trocas de
   * `itemId` DENTRO da mesma montagem (zapping, CH±, "Próximo episódio")
   * herdam a escolha sozinhas; esta prop existe para quem desmonta a camada
   * entre dois itens da mesma sequência (autoplay da série, via countdown).
   */
  initialTrackChoice?: TrackChoice | null
  /** Feature 029: chamada a cada escolha feita pela pessoa no painel. */
  onTrackChoiceChange?: (choice: TrackChoice) => void

  /**
   * Feature 041 (FR-003/FR-008/FR-012, D-003): aspecto/qualidade da sequência,
   * mesmo papel de `initialTrackChoice`. Ausente = reprodução NOVA: parte das
   * preferências do aparelho (`readPlayerPreferences`), lidas na montagem —
   * vale também para `initialTrackChoice` ausente.
   */
  initialViewChoice?: ViewChoice | null
  /** Feature 041: chamada a cada escolha de aspecto/qualidade feita pela pessoa no player. */
  onViewChoiceChange?: (choice: ViewChoice) => void
}

export type Phase =
  | { kind: 'resolving' }
  | { kind: 'session'; state: PlayerState }
  | { kind: 'error'; message: string; retryable: boolean }

/**
 * Painel aberto por cima do vídeo (feature 029, D-002) — estado do próprio
 * `PlayerLayer`, não um `Modal` filho: esta camada já intercepta o teclado na
 * captura, e um `Modal` só recebe tecla quando é o primeiro interceptador.
 * `originIndex` é o botão do chrome que abriu o painel (o foco volta a ele).
 */
export type PanelState =
  | { kind: 'tracks'; focusKey: string; originIndex: number }
  | { kind: 'info'; originIndex: number }
  // Feature 041: painéis de escolha única (`PlayerChoicePanel`).
  | { kind: 'aspect'; focusKey: string; originIndex: number }
  | { kind: 'quality'; focusKey: string; originIndex: number }

/** Última leitura do painel de info: o que o motor disse e a faixa de áudio ativa. */
export interface InfoSnapshot {
  info: StreamInfo | null
  activeAudioLabel: string | undefined
}

/**
 * Nível do chrome (feature 027, `logic/chrome-player.md` §3). VOD só usa
 * `hidden`/`full` (o comportamento da 011 preservado); Live usa os três —
 * `band` é a faixa de identidade sem nenhum controle focável, `full` é a
 * linha de controles revelada por ←/→.
 */
export type ChromeLevel = 'hidden' | 'band' | 'full'
