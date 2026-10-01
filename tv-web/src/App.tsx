import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SplashScreen } from './features/splash/SplashScreen'
import { ADD_LIST_FOCUS_ID, ProfilesScreen } from './features/profiles/ProfilesScreen'
import { HomeScreen } from './features/home/HomeScreen'
import { AddSourceScreen } from './features/import/AddSourceScreen'
import { ImportProgressScreen } from './features/import/ImportProgressScreen'
import {
  TERMINAL_STATUSES,
  useImportJob,
  useOpenSource,
  useResyncSource,
  useSources,
  type SourceListResponse,
  type SourceOut,
} from './features/import/importApi'
import { LiveScreen } from './features/live/LiveScreen'
import { MoviesScreen } from './features/movies/MoviesScreen'
import { MovieDetailScreen } from './features/movies/MovieDetailScreen'
import { SeriesScreen } from './features/series/SeriesScreen'
import { SeriesDetailScreen } from './features/series/SeriesDetailScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { EpgSettingsScreen } from './features/settings/EpgSettingsScreen'
import { TmdbKeyScreen } from './features/settings/TmdbKeyScreen'
import { SearchScreen } from './features/search/SearchScreen'
import { FAVORITES_SNAPSHOT } from './features/catalog/categoryScreenSnapshot'
import { registerFavoriteColorKey, registerRemoveColorKey } from './lib/tizenColorKey'
import { registerMediaKeys } from './lib/tizenMediaKeys'
import { onEpgSyncFinished } from './lib/epg/epgRunner'
import { usePrefetchForSource, wakePrefetch } from './features/catalog/prefetchApi'
import { appNavReducer, initialAppNav, type AppScreen, type TopDestination } from './navigation/appNav'
import { readLastSourceId, writeLastSourceId } from './navigation/lastSource'
import type { OpenPersonTarget, OpenTitleTarget } from './features/vod/detailSnapshot'
import { PersonScreen } from './features/person/PersonScreen'

/**
 * "Ver todos (N)"/"Filmes (N)"/"Séries (N)" do Início (feature 026, FR-014)
 * abrem `★ Favoritos` do destino escolhido. Função à parte (em vez de um
 * objeto literal `{ name: destination, openFavorites: true }` inline): o
 * `tsc` não distribui bem um objeto com campo de discriminante não-literal
 * contra a união `AppScreen` quando o objeto tem mais de um campo.
 */
function openFavoritesScreen(destination: TopDestination): AppScreen {
  if (destination === 'live') return { name: 'live', openFavorites: true }
  if (destination === 'movies') return { name: 'movies', openFavorites: true }
  return { name: 'series', openFavorites: true }
}

function App() {
  // A navegação é um redutor puro (feature 023, D-003): aqui só se despacham
  // ações e se renderiza a tela atual. Toda regra de "para onde RETURN leva" e
  // de "o que zera a pilha" mora em `navigation/appNav.ts`.
  const [nav, dispatch] = useReducer(appNavReducer, undefined, initialAppNav)
  const { screen, activeSource, history } = nav

  // Tecla amarela como atalho de favoritar (feature 013) e teclas de mídia
  // do controle (feature 027, FR-023) — registram uma vez, na raiz do app,
  // nunca por tela: `tizen.tvinputdevice.registerKey` é global à sessão do
  // widget, registrar de novo em cada tela seria redundante. No-op fora da
  // TV (`tizenColorKey.ts`/`tizenMediaKeys.ts`).
  useEffect(() => {
    registerFavoriteColorKey()
    registerRemoveColorKey()
    registerMediaKeys()
  }, [])

  // Migração única e atualização por idade (feature 004, D-004): a TV só
  // avisa "abri esta fonte" — quem decide migrar/atualizar/nada é o
  // backend. Fica no componente raiz, não em telas, porque a atualização
  // pode terminar depois que o usuário já navegou para outra tela, e o
  // acompanhamento não pode se perder na troca.
  const openSource = useOpenSource()
  const resyncSource = useResyncSource()
  const [autoRefreshJobId, setAutoRefreshJobId] = useState<string | null>(null)
  const autoRefreshJob = useImportJob(autoRefreshJobId)
  const queryClient = useQueryClient()
  // Evita reconciliar duas vezes pro mesmo job (o efeito roda de novo a
  // cada poll, não só na virada pra terminal) — sem precisar de outro
  // setState dentro do efeito pra "desarmar" o acompanhamento.
  const reconciledJobRef = useRef<string | null>(null)

  // Feature 030 (D-009): uma sincronização de EPG terminou, com sucesso ou
  // não — a programação e/ou o estado da fonte mudaram. Fica na raiz pelo
  // mesmo motivo da atualização por idade acima: pode terminar depois de a
  // pessoa já ter navegado para outra tela.
  useEffect(
    () =>
      onEpgSyncFinished(() => {
        void queryClient.invalidateQueries({ queryKey: ['epg'] })
        void queryClient.invalidateQueries({ queryKey: ['sources'] })
      }),
    [queryClient],
  )

  // Observador ativo da lista de fontes na raiz: mantém `['sources']` vivo
  // durante a sessão e dá ao Início a versão mais nova da fonte ativa (o
  // `activeSource` do redutor é só o retrato do momento da escolha — uma
  // sincronização depois dele pode ter mudado o selo de Modo limitado).
  const sourcesQuery = useSources()
  const currentSource: SourceOut | null = activeSource
    ? (sourcesQuery.data?.sources.find((source) => source.id === activeSource.id) ?? activeSource)
    : null

  useEffect(() => {
    const status = autoRefreshJob.data?.status
    if (!autoRefreshJobId || !status || !TERMINAL_STATUSES.includes(status)) return
    if (reconciledJobRef.current === autoRefreshJobId) return
    reconciledJobRef.current = autoRefreshJobId
    // O catálogo pode ter sido substituído (D-002) — invalida em vez de
    // assumir; quem estiver com a tela de canais montada revalida sozinho,
    // reconciliando o foco por identidade (LiveScreen). Fonte de falha não
    // muda nada visível aqui: connection_state/last_successful_sync_at já
    // não avançam no backend quando o job falha (FR-023).
    void queryClient.invalidateQueries({ queryKey: ['catalog-items'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-counts'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-item'] })
    void queryClient.invalidateQueries({ queryKey: ['sources'] })
    // Feature 038: a estrutura pode ter mudado (categorias novas/removidas,
    // renovação pedida) — a trilha relê e a pré-carga relê o disco.
    void queryClient.invalidateQueries({ queryKey: ['categories'] })
    void queryClient.invalidateQueries({ queryKey: ['category-content'] })
    wakePrefetch()
  }, [autoRefreshJobId, autoRefreshJob.data?.status, queryClient])

  // Feature 038 (D-010): a pré-carga acompanha a lista ativa.
  usePrefetchForSource(activeSource?.id ?? null)

  /**
   * Escolher uma lista (feature 023, FR-005/FR-006/FR-007): vira a fonte
   * ativa e abre o Início dela com a pilha zerada, grava a "última usada" e
   * dispara a mesma verificação de atualização por idade que abrir uma fonte
   * sempre disparou (feature 004).
   */
  function chooseSource(source: SourceOut) {
    dispatch({ type: 'choose-source', source })
    writeLastSourceId(source.id)
    // Mesma lista de antes (ex.: "Abrir lista" depois de ressincronizar): a
    // pré-carga já roda, mas a estrutura pode ter mudado — relê o disco.
    wakePrefetch()
    // Fogo e esquece: a leitura do catálogo sempre serve o que está
    // publicado agora (cache-first, ADR-002); a navegação nunca espera essa
    // decisão.
    openSource.mutate(source.id, {
      onSuccess: (result) => {
        if (result.triggered && result.import_job_id) {
          setAutoRefreshJobId(result.import_job_id)
        }
      },
    })
  }

  /**
   * Detalhe → outro detalhe (Semelhantes, feature 035, `logic/navegacao-detalhe.md`
   * §1): empilha a tela de origem já com o snapshot de onde o foco estava, para
   * o RETURN restaurar aba e cartão por identidade.
   */
  function openDetail(target: OpenTitleTarget, from: AppScreen) {
    dispatch({
      type: 'open',
      screen:
        target.kind === 'movie'
          ? { name: 'movie-detail', movieId: target.itemId }
          : { name: 'series-detail', seriesId: target.itemId },
      from,
    })
  }

  /** Elenco → página de ator (feature 035, US4); RETURN volta ao detalhe com a aba Elenco e a pessoa focada. */
  function openPerson(person: OpenPersonTarget, from: AppScreen) {
    dispatch({ type: 'open', screen: { name: 'person', personId: person.personId, personName: person.name }, from })
  }

  /** "Configurar TMDB" da aba Semelhantes → Configurações › Integrações & BYOK; RETURN volta ao detalhe. */
  function openTmdbSettings(from: AppScreen) {
    dispatch({ type: 'open', screen: { name: 'settings', restore: { zone: 'panel', tab: 'integrations' } }, from })
  }

  /**
   * "Abrir lista" no fim de uma importação (FR-038). Sempre relê a lista de
   * fontes antes: `useCreateSource` não invalida `['sources']`, então o
   * cache pode ainda nem ter a lista nova, ou tê-la com o estado de antes da
   * importação (sem o selo de Modo limitado que ela acabou de ganhar).
   */
  async function openImportedSource(sourceId: string) {
    await queryClient.refetchQueries({ queryKey: ['sources'] })
    const fresh = queryClient
      .getQueryData<SourceListResponse>(['sources'])
      ?.sources.find((source) => source.id === sourceId)
    if (fresh) chooseSource(fresh)
    // Sem a lista (removida no meio do caminho): cai nos perfis, nunca num beco.
    else dispatch({ type: 'import-back', sourceId: null })
  }

  /**
   * Ressincroniza a fonte a partir de uma tela de categoria (feature 014,
   * D-008): o conteúdo guardado de uma categoria `stored` sumiu do
   * aparelho, e "Tentar de novo" não resolve isso — só uma importação
   * nova. Navega pra tela de progresso; "Abrir lista" volta ao Início da
   * fonte ativa (FR-033).
   */
  function resyncFromCategoryScreen(sourceId: string) {
    resyncSource.mutate(sourceId, {
      onSuccess: (result) => dispatch({ type: 'open', screen: { name: 'progress', jobId: result.import_job_id } }),
    })
  }

  const goBack = () => dispatch({ type: 'back' })
  // Estável de propósito: `SplashScreen` reagenda o timer a cada mudança da
  // identidade do callback, e este componente re-renderiza com as consultas.
  const finishSplash = useCallback(() => dispatch({ type: 'splash-finished' }), [])

  // Toda tela abaixo do Início existe só com uma fonte ativa — o único caminho
  // até elas é escolher uma lista. Sem fonte não há o que mostrar.
  const source = currentSource

  switch (screen.name) {
    case 'splash':
      return <SplashScreen onFinished={finishSplash} />

    case 'profiles':
      return (
        <ProfilesScreen
          mode={screen.mode}
          initialFocusSourceId={screen.focusSourceId ?? readLastSourceId()}
          onChooseSource={chooseSource}
          // Voltar do cadastro cai em "Adicionar lista", não na última lista
          // usada (feature 037, FR-019/D-007): a pilha guarda este `from`.
          onAddSource={() =>
            dispatch({
              type: 'open',
              screen: { name: 'add-source' },
              from: { ...screen, focusSourceId: ADD_LIST_FOCUS_ID },
            })
          }
          onEditSource={(sourceToEdit) => dispatch({ type: 'open', screen: { name: 'edit-source', source: sourceToEdit } })}
          onResyncStarted={(jobId) => dispatch({ type: 'open', screen: { name: 'progress', jobId } })}
          onSourceDeleted={(sourceId) => dispatch({ type: 'source-removed', sourceId })}
          // "Gerenciar listas" (feature 026, FR-032): Configurações › Fontes
          // IPTV sem lista ativa, sem topbar (`standalone`).
          onManageSources={() => dispatch({ type: 'open', screen: { name: 'settings', standalone: true } })}
          onBack={goBack}
        />
      )

    case 'add-source':
      return (
        <AddSourceScreen
          onSourceCreated={({ jobId }) => dispatch({ type: 'open', screen: { name: 'progress', jobId } })}
          onBack={goBack}
        />
      )

    case 'edit-source':
      return (
        <AddSourceScreen
          existingSource={screen.source}
          onSourceCreated={({ jobId }) => dispatch({ type: 'open', screen: { name: 'progress', jobId } })}
          onSourceUpdated={goBack}
          onBack={goBack}
        />
      )

    case 'epg-settings':
      return <EpgSettingsScreen sourceId={screen.source.id} onBack={goBack} />

    case 'tmdb-key':
      return <TmdbKeyScreen onSaved={goBack} onBack={goBack} />

    case 'progress':
      return (
        <ImportProgressScreen
          jobId={screen.jobId}
          onRetried={(newJobId) => dispatch({ type: 'open', screen: { name: 'progress', jobId: newJobId } })}
          onOpenSource={(sourceId) => void openImportedSource(sourceId)}
          onBack={(sourceId) => dispatch({ type: 'import-back', sourceId })}
        />
      )

    case 'home':
      if (!source) return null
      return (
        <HomeScreen
          source={source}
          initialFocus={screen.focus}
          // Feature 038 (US6): a atualização automática por idade roda calada —
          // o Início diz "Atualizando catálogo…" enquanto ela não termina.
          updating={
            autoRefreshJob.data?.source_id === source.id && !TERMINAL_STATUSES.includes(autoRefreshJob.data.status)
          }
          onNavigate={(destination, from) =>
            dispatch({ type: 'open', screen: { name: destination }, from: { name: 'home', focus: from } })
          }
          onOpenProfiles={(from) => dispatch({ type: 'open-profiles', from: { name: 'home', focus: from } })}
          onOpenItem={(item, from) =>
            dispatch({
              type: 'open',
              screen:
                item.kind === 'movie'
                  ? { name: 'movie-detail', movieId: item.id }
                  : { name: 'series-detail', seriesId: item.id },
              from: { name: 'home', focus: from },
            })
          }
          onOpenChannel={(channel, from) =>
            dispatch({
              type: 'open',
              screen: { name: 'live', initialChannel: { channelId: channel.id, entry: 'favorites' } },
              from: { name: 'home', focus: from },
            })
          }
          onOpenFavorites={(destination, from) =>
            dispatch({ type: 'open', screen: openFavoritesScreen(destination), from: { name: 'home', focus: from } })
          }
          onOpenIntegrations={(from) =>
            dispatch({
              type: 'open',
              screen: { name: 'settings', restore: { zone: 'panel', tab: 'integrations' } },
              from: { name: 'home', focus: from },
            })
          }
          onOpenSearch={(from) => dispatch({ type: 'open', screen: { name: 'search' }, from: { name: 'home', focus: from } })}
          onOpenSettings={(from) =>
            dispatch({ type: 'open', screen: { name: 'settings' }, from: { name: 'home', focus: from } })
          }
        />
      )

    case 'live':
      if (!source) return null
      return (
        <LiveScreen
          sourceId={source.id}
          initialChannel={screen.initialChannel}
          openFavorites={screen.openFavorites}
          initialTopbarItem={screen.topbarFocus}
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
          shell={{
            sourceName: source.display_name,
            // "Início" na topbar leva ao Início mais próximo da pilha, nunca
            // `back` (feature 026, D-006 — a Live agora também pode ser
            // aberta a partir da Busca; `back` voltaria pra lá, não pro Início).
            onGoHome: () => dispatch({ type: 'go-home' }),
            onSwitchTop: (destination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
            onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
            // Empilha a Live SEM `initialChannel` (nunca com ele) — senão
            // voltar da Busca/Configurações tocaria o canal de novo
            // (feature 026, `logic/navegacao.md` §3).
            onOpenSettings: () =>
              dispatch({ type: 'open', screen: { name: 'settings' }, from: { name: 'live', topbarFocus: 'settings' } }),
            onOpenSearch: () =>
              dispatch({ type: 'open', screen: { name: 'search' }, from: { name: 'live', topbarFocus: 'search' } }),
          }}
        />
      )

    case 'movies':
      if (!source) return null
      return (
        <MoviesScreen
          sourceId={source.id}
          // "Filmes (N)" do Início (feature 026, FR-014): sem snapshot próprio
          // ainda, abre direto em ★ Favoritos com uma restauração sintética
          // (`logic/navegacao.md` §1) — sem precisar de uma prop nova aqui.
          restore={screen.restore ?? (screen.openFavorites ? FAVORITES_SNAPSHOT : undefined)}
          initialTopbarItem={screen.topbarFocus}
          onOpenMovie={(movieId, snapshot) =>
            dispatch({
              type: 'open',
              screen: { name: 'movie-detail', movieId },
              from: { ...screen, restore: snapshot },
            })
          }
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
          shell={{
            sourceName: source.display_name,
            // "Início" leva ao Início mais próximo da pilha (feature 026,
            // D-006), nunca `back` — mesmo motivo da Live.
            onGoHome: () => dispatch({ type: 'go-home' }),
            onSwitchTop: (destination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
            onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
            onOpenSettings: () =>
              dispatch({ type: 'open', screen: { name: 'settings' }, from: { ...screen, topbarFocus: 'settings' } }),
            onOpenSearch: () =>
              dispatch({ type: 'open', screen: { name: 'search' }, from: { ...screen, topbarFocus: 'search' } }),
          }}
        />
      )

    case 'movie-detail':
      return (
        <MovieDetailScreen
          // Um detalhe novo (Semelhantes → outro título) nunca reaproveita o estado do anterior.
          key={`movie-${screen.movieId}-${history.length}`}
          movieId={screen.movieId}
          restore={screen.restore}
          onBack={goBack}
          onOpenTitle={(target, from) => openDetail(target, { ...screen, restore: from })}
          onOpenPerson={(person, from) => openPerson(person, { ...screen, restore: from })}
          onOpenTmdbSettings={(from) => openTmdbSettings({ ...screen, restore: from })}
        />
      )

    case 'series':
      if (!source) return null
      return (
        <SeriesScreen
          sourceId={source.id}
          // "Séries (N)" do Início (feature 026, FR-014) — mesma restauração
          // sintética de "Filmes (N)".
          restore={screen.restore ?? (screen.openFavorites ? FAVORITES_SNAPSHOT : undefined)}
          initialTopbarItem={screen.topbarFocus}
          onOpenSeries={(seriesId, snapshot) =>
            dispatch({
              type: 'open',
              screen: { name: 'series-detail', seriesId },
              from: { ...screen, restore: snapshot },
            })
          }
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
          shell={{
            sourceName: source.display_name,
            // "Início" leva ao Início mais próximo da pilha (feature 026,
            // D-006), nunca `back` — mesmo motivo da Live.
            onGoHome: () => dispatch({ type: 'go-home' }),
            onSwitchTop: (destination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
            onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
            onOpenSettings: () =>
              dispatch({ type: 'open', screen: { name: 'settings' }, from: { ...screen, topbarFocus: 'settings' } }),
            onOpenSearch: () =>
              dispatch({ type: 'open', screen: { name: 'search' }, from: { ...screen, topbarFocus: 'search' } }),
          }}
        />
      )

    case 'series-detail':
      return (
        <SeriesDetailScreen
          key={`series-${screen.seriesId}-${history.length}`}
          seriesId={screen.seriesId}
          restore={screen.restore}
          onBack={goBack}
          onOpenTitle={(target, from) => openDetail(target, { ...screen, restore: from })}
          onOpenPerson={(person, from) => openPerson(person, { ...screen, restore: from })}
          onOpenTmdbSettings={(from) => openTmdbSettings({ ...screen, restore: from })}
        />
      )

    case 'person':
      return (
        <PersonScreen
          key={`person-${screen.personId}-${history.length}`}
          personId={screen.personId}
          personName={screen.personName}
          sourceId={source?.id ?? ''}
          restore={screen.restore}
          onOpenTitle={(target, from) => openDetail(target, { ...screen, restore: from })}
          onBack={goBack}
        />
      )

    case 'settings':
      return (
        <SettingsScreen
          activeSourceId={source?.id ?? null}
          initialFocus={screen.restore}
          onAddSource={(from) =>
            dispatch({
              type: 'open',
              screen: { name: 'add-source' },
              from: { name: 'settings', restore: from, standalone: screen.standalone },
            })
          }
          onEditSource={(sourceToEdit, from) =>
            dispatch({
              type: 'open',
              screen: { name: 'edit-source', source: sourceToEdit },
              from: { name: 'settings', restore: from, standalone: screen.standalone },
            })
          }
          onResyncStarted={(jobId, from) =>
            dispatch({
              type: 'open',
              screen: { name: 'progress', jobId },
              from: { name: 'settings', restore: from, standalone: screen.standalone },
            })
          }
          onOpenEpg={(sourceToOpen, from) =>
            dispatch({
              type: 'open',
              screen: { name: 'epg-settings', source: sourceToOpen },
              from: { name: 'settings', restore: from, standalone: screen.standalone },
            })
          }
          onOpenTmdbKey={(from) =>
            dispatch({
              type: 'open',
              screen: { name: 'tmdb-key' },
              from: { name: 'settings', restore: from, standalone: screen.standalone },
            })
          }
          onSourceDeleted={(sourceId) => dispatch({ type: 'source-removed', sourceId })}
          onBack={goBack}
          shell={
            !screen.standalone && source
              ? {
                  sourceName: source.display_name,
                  onGoHome: () => dispatch({ type: 'go-home' }),
                  onSwitchTop: (destination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
                  onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
                  onOpenSearch: () => dispatch({ type: 'switch-top', screen: { name: 'search' } }),
                }
              : undefined
          }
        />
      )

    case 'search':
      if (!source) return null
      return (
        <SearchScreen
          sourceId={source.id}
          restore={screen.restore}
          onOpenItem={(item, snapshot) =>
            dispatch({
              type: 'open',
              screen:
                item.kind === 'movie'
                  ? { name: 'movie-detail', movieId: item.id }
                  : { name: 'series-detail', seriesId: item.id },
              from: { name: 'search', restore: snapshot },
            })
          }
          onOpenChannel={(channel, snapshot) =>
            dispatch({
              type: 'open',
              screen: { name: 'live', initialChannel: { channelId: channel.id, entry: 'category' } },
              from: { name: 'search', restore: snapshot },
            })
          }
          onBack={goBack}
          shell={{
            sourceName: source.display_name,
            onGoHome: () => dispatch({ type: 'go-home' }),
            onSwitchTop: (destination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
            onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
            onOpenSettings: () => dispatch({ type: 'switch-top', screen: { name: 'settings' } }),
          }}
        />
      )

    default:
      return null
  }
}

export default App
