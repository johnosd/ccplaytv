import type { SourceOut } from '../features/import/importApi'
import type { CategoryScreenSnapshot } from '../features/catalog/categoryScreenSnapshot'
import type { SearchSnapshot } from '../features/search/searchSnapshot'
import type { SettingsFocus } from '../features/settings/SettingsScreen'
import type { DetailSnapshot } from '../features/vod/detailSnapshot'
import type { PersonSnapshot } from '../features/person/personSnapshot'

/**
 * Navegação do app como função pura (feature 023, D-003 do plan.md —
 * `sdd/specs/023-shell-navegacao-entrada-ds-v14/logic/navegacao-app.md`).
 * `App.tsx` só despacha ações e renderiza `state.screen`; toda regra de
 * "para onde RETURN leva" e de "o que zera a pilha" mora aqui.
 */

/** Destinos de topo alcançáveis pelo Início (atalhos ou topbar). */
export type TopDestination = 'live' | 'movies' | 'series'

/** Item da topbar, na ordem visual (FR-013). */
export type TopbarItem = 'home' | TopDestination | 'profile' | 'search' | 'settings'

/**
 * Onde estava o foco do Início quando a pessoa saiu dele — restaurado no
 * RETURN (FR-029). Tudo por id, nunca por índice (constitution, "Voltar
 * Restaura Foco e Posição"). `hero`/`rail`/`dock` são da Home definitiva
 * (feature 026, `logic/foco-home.md` §5); `topbar`/`shortcuts` são da
 * feature 023 e não podem mudar de forma (contratos travados 023/024).
 */
export type HomeFocus =
  | { zone: 'topbar'; item: TopbarItem }
  | { zone: 'shortcuts'; destination: TopDestination }
  | { zone: 'hero'; action: 'primary' | 'details' | 'mylist' | 'trailer' }
  | { zone: 'rail'; rail: 'continue' | 'mylist' | 'channels' | 'ai'; itemId: string }
  | { zone: 'dock'; service: string }

export type AppScreen =
  | { name: 'splash' }
  /** `base`: primeira tela da pilha (abertura, pós-falha de importação, lista ativa removida). `switch`: aberta pelo indicador da topbar. */
  | { name: 'profiles'; mode: 'base' | 'switch'; focusSourceId?: string | null }
  | { name: 'add-source' }
  | { name: 'edit-source'; source: SourceOut }
  /** EPG da lista (feature 030, US2) — aberta por Configurações › Fontes IPTV › EPG. RETURN volta ao botão "EPG" (`restore` da tela de Configurações). */
  | { name: 'epg-settings'; source: SourceOut }
  /** Chave do TMDB (feature 032, US2) — aberta por Configurações › Integrações & BYOK. RETURN volta ao card do TMDB (`restore` da tela de Configurações). */
  | { name: 'tmdb-key' }
  | { name: 'progress'; jobId: string }
  | { name: 'home'; focus?: HomeFocus }
  | {
      name: 'live'
      /** Entra tocando este canal (feature 026, `logic/navegacao.md` §3) — uma única vez. */
      initialChannel?: { channelId: string; entry: 'favorites' | 'category' }
      /** Entra direto em `★ Favoritos`, sem canal específico ("Ver todos"). */
      openFavorites?: boolean
      /** Remonta com a topbar ativa neste item — volta de Busca/Configurações (FR-034/FR-044). */
      topbarFocus?: TopbarItem
    }
  | { name: 'movies'; restore?: CategoryScreenSnapshot; topbarFocus?: TopbarItem; openFavorites?: boolean }
  /** `restore` (feature 035): aba e item focado ao voltar de Semelhantes/Elenco/Configurações — por identidade. */
  | { name: 'movie-detail'; movieId: string; restore?: DetailSnapshot }
  | { name: 'series'; restore?: CategoryScreenSnapshot; topbarFocus?: TopbarItem; openFavorites?: boolean }
  | { name: 'series-detail'; seriesId: string; restore?: DetailSnapshot }
  /** Página de ator (feature 035, US4) — aberta pela aba Elenco de um detalhe; sem topbar. RETURN volta ao detalhe com aba Elenco e a pessoa focada. */
  | { name: 'person'; personId: number; personName: string; restore?: PersonSnapshot }
  /** Busca global (feature 026, US3). */
  | { name: 'search'; restore?: SearchSnapshot }
  /** Configurações (feature 026, US2). `standalone`: sem lista ativa, sem topbar (FR-033, "Gerenciar listas"). */
  | { name: 'settings'; restore?: SettingsFocus; standalone?: boolean }

export interface AppNavState {
  screen: AppScreen
  /** Pilha de RETURN — o topo é `history[history.length - 1]`. Vazia = tela base (RETURN nela é decisão da própria tela: modal de saída). */
  history: AppScreen[]
  /** Fonte ativa da sessão (ADR-011 §3). `null` até a primeira escolha, ou depois de a lista ativa ser removida. */
  activeSource: SourceOut | null
}

export type AppNavAction =
  | { type: 'splash-finished' }
  /** Escolher uma lista na tela de perfis, ou concluir a importação dela: vira a fonte ativa, Início com pilha zerada (FR-006, FR-032, FR-038). */
  | { type: 'choose-source'; source: SourceOut }
  /**
   * Empilha a tela atual e abre `screen`. `from`, quando presente, substitui
   * a tela atual ao empilhá-la — é assim que o Início guarda o próprio foco
   * e Filmes/Séries guardam o snapshot de restauração (feature 017).
   */
  | { type: 'open'; screen: AppScreen; from?: AppScreen }
  /**
   * Topbar de um destino de topo (Live, feature 024) escolhendo OUTRO destino
   * de topo: troca a tela atual sem empilhá-la — RETURN no novo destino volta
   * ao Início, nunca ao destino de onde se saiu (D-004 do plan.md da 024).
   */
  | { type: 'switch-top'; screen: AppScreen }
  /** Indicador da lista ativa na topbar (FR-017). */
  | { type: 'open-profiles'; from?: AppScreen }
  | { type: 'back' }
  /** Uma lista foi excluída. Se era a ativa, a tela de perfis vira a base (edge case da spec). */
  | { type: 'source-removed'; sourceId: string }
  /** "Voltar" da tela de progresso sem abrir a lista (FR-039): perfis como base, foco na lista importada. */
  | { type: 'import-back'; sourceId?: string | null }
  /**
   * "Início" na topbar de Live/Filmes/Séries/Busca/Configurações (feature
   * 026, `logic/navegacao.md` §2) — diferente de `back`, porque a Live
   * agora pode ser aberta a partir da Busca (RETURN nela não pode voltar
   * pra Busca). Com um `home` na pilha, volta até ele (descarta tudo acima,
   * preservando o `focus` que ele guardou); sem um `home` na pilha, troca a
   * tela atual por `{ name: 'home' }` com a pilha zerada.
   */
  | { type: 'go-home' }

export function initialAppNav(): AppNavState {
  return { screen: { name: 'splash' }, history: [], activeSource: null }
}

/** Perfis como tela base: pilha vazia, sem fonte ativa (não há Início de lista para onde voltar). */
function profilesAsBase(focusSourceId?: string | null): AppNavState {
  const screen: AppScreen =
    focusSourceId === undefined
      ? { name: 'profiles', mode: 'base' }
      : { name: 'profiles', mode: 'base', focusSourceId }
  return { screen, history: [], activeSource: null }
}

export function appNavReducer(state: AppNavState, action: AppNavAction): AppNavState {
  switch (action.type) {
    case 'splash-finished':
      // O Splash nunca entra na pilha (é só a abertura).
      return { ...state, screen: { name: 'profiles', mode: 'base' }, history: [] }

    case 'choose-source':
      return { screen: { name: 'home' }, history: [], activeSource: action.source }

    case 'open':
      return {
        ...state,
        screen: action.screen,
        history: [...state.history, action.from ?? state.screen],
      }

    case 'switch-top':
      // Troca o destino de topo sem empilhar (D-004 da feature 024) — a
      // pilha e a fonte ativa continuam as mesmas; só `screen` muda.
      return { ...state, screen: action.screen }

    case 'open-profiles': {
      // Sem fonte ativa não há Início de lista para onde RETURN voltar: os
      // perfis viram a base, em vez de um modo "troca" sem destino.
      if (!state.activeSource) return profilesAsBase()
      return {
        ...state,
        screen: { name: 'profiles', mode: 'switch', focusSourceId: state.activeSource.id },
        history: [...state.history, action.from ?? state.screen],
      }
    }

    case 'back': {
      if (state.history.length === 0) return state
      return {
        ...state,
        screen: state.history[state.history.length - 1],
        history: state.history.slice(0, -1),
      }
    }

    case 'source-removed': {
      if (state.activeSource?.id !== action.sourceId) return state
      return profilesAsBase()
    }

    case 'import-back':
      return profilesAsBase(action.sourceId ?? null)

    case 'go-home': {
      const homeIndex = state.history.findIndex((entry) => entry.name === 'home')
      if (homeIndex === -1) return { ...state, screen: { name: 'home' }, history: [] }
      return {
        ...state,
        screen: state.history[homeIndex],
        history: state.history.slice(0, homeIndex),
      }
    }

    default:
      return state
  }
}
