import { allowListEntry } from './lib/licensing/licenseRuntime'
import { usePortalIntegration } from './features/portal/usePortalIntegration'
import { PortalPairingPanel } from './features/portal/PortalPairingPanel'
import { getPortalConnection, portalSurfacesVisible } from './lib/portal/portalRuntime'
import { remoteImportRunForEntry } from './lib/portal/remoteImportEntry'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SplashScreen } from './features/splash/SplashScreen'
import { ADD_LIST_FOCUS_ID, ProfilesScreen } from './features/profiles/ProfilesScreen'
import { decideSourceAccess } from './lib/catalog/sourceAccount'
import {
  TERMINAL_STATUSES,
  useImportJob,
  useOpenSource,
  useResyncSource,
  useSources,
  type SourceListResponse,
  type SourceOut,
} from './features/import/importApi'
import { isShowcaseFocus } from './features/vod/vodTarget'
import { registerFavoriteColorKey, registerRemoveColorKey } from './lib/tizenColorKey'
import { registerMediaKeys } from './lib/tizenMediaKeys'
import { onEpgSyncFinished } from './lib/epg/epgRunner'
import { onSourceSyncFinished } from './features/import/sourceSyncing'
import { useRefreshOnForeground } from './features/import/useRefreshOnForeground'
import { usePrefetchForSource, wakePrefetch } from './features/catalog/prefetchApi'
import { useCategoryAccessLifecycle } from './features/catalog/categoryAccessApi'
import { HomeScreen } from './features/home/HomeScreen'
import { appNavReducer, initialAppNav, type AppScreen, type TopbarDestination, type TopDestination } from './navigation/appNav'
import { readLastSourceId, writeLastSourceId } from './navigation/lastSource'
import type { OpenPersonTarget, OpenTitleTarget } from './features/vod/detailSnapshot'
import { AddSourceScreen, ImportProgressScreen, SourceAccessRoute, LiveScreen, VodShowcaseScreen, MovieDetailScreen, SeriesDetailScreen, SearchScreen, VodCategoryScreen, PersonScreen, renderRadioRoute, useRouteWarmup } from './navigation/routeModules'
import { RouteBoundary } from './components/RouteBoundary'
import { ProgressSaveNotice } from './components/ProgressSaveNotice'
import { openListSettings, renderSettingsRoute } from './navigation/settingsRoutes'
import { useStartupReadiness } from './lib/useStartupReadiness'

/**
 * "Ver todos (N)"/"Filmes (N)"/"Séries (N)" do Início (feature 026, FR-014)
 * abrem `★ Favoritos` do destino escolhido. Função à parte (em vez de um
 * objeto literal `{ name: destination, openFavorites: true }` inline): o
 * `tsc` não distribui bem um objeto com campo de discriminante não-literal
 * contra a união `AppScreen` quando o objeto tem mais de um campo.
 */
/** Configuração inválida do portal vira o estado honesto do painel, nunca uma tela quebrada (070, D-008). */
function safePortalConnection() {
  try { return getPortalConnection() } catch { return undefined }
}

function openFavoritesScreen(destination: TopDestination): AppScreen {
  if (destination === 'live') return { name: 'live', openFavorites: true }
  if (destination === 'movies') return { name: 'movies-category', target: { kind: 'favorites' } }
  return { name: 'series-category', target: { kind: 'favorites' } }
}

function App() {
  // A navegação é um redutor puro (feature 023, D-003): aqui só se despacham
  // ações e se renderiza a tela atual. Toda regra de "para onde RETURN leva" e
  // de "o que zera a pilha" mora em `navigation/appNav.ts`.
  const [nav, dispatch] = useReducer(appNavReducer, undefined, initialAppNav)
  const { screen, activeSource, history } = nav

  const portalConfirmation = usePortalIntegration({ activeSourceId: activeSource?.id,
    leaveSource: sourceId => dispatch({ type: 'import-back', sourceId: sourceId ?? activeSource?.id }),
    // 071/FR-007: licença liberada pelo Atualizar do bloqueio — entra de novo na lista que foi negada.
    resumeEntry: sourceId => {
      const target = sourcesQuery.data?.sources.find(candidate => candidate.id === sourceId)
      if (target) chooseSource(target)
    },
    sourceDeleted: sourceId => dispatch({ type: 'source-removed', sourceId }), catalogChanged: wakePrefetch })

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

  // Feature 065 (FR-022, SC-011): aquece só o código do próximo destino provável da tela atual.
  useRouteWarmup(screen.name)

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

  // Feature 034: o fim de uma sincronização muda a conta, o estado e as contagens da
  // lista — Configurações e o cartão relêem em vez de ficarem em Sincronizando.
  useEffect(() => {
    return onSourceSyncFinished(() => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] })
      void queryClient.invalidateQueries({ queryKey: ['catalog-counts'] })
      // O índice de busca (vitrine, Todos, Top 10/Dica) é do catálogo da geração ativa: uma sincronização o troca.
      void queryClient.invalidateQueries({ queryKey: ['catalog-search-index'] })
    })
  }, [queryClient])

  // Observador ativo da lista de fontes na raiz: mantém `['sources']` vivo
  // durante a sessão e dá ao Início a versão mais nova da fonte ativa (o
  // `activeSource` do redutor é só o retrato do momento da escolha — uma
  // sincronização depois dele pode ter mudado o selo de Modo limitado).
  const sourcesQuery = useSources()
  const startupReady = useStartupReadiness(sourcesQuery.isSuccess || sourcesQuery.isError)
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
    void queryClient.invalidateQueries({ queryKey: ['catalog-search-index'] })
    wakePrefetch()
  }, [autoRefreshJobId, autoRefreshJob.data?.status, queryClient])

  // Feature 038 (D-010): a pré-carga acompanha a lista ativa; feature 066: o acesso às categorias também.
  usePrefetchForSource(activeSource?.id ?? null)
  useCategoryAccessLifecycle(activeSource?.id ?? null)

  /**
   * Feature 042: "Editar lista" do erro de fonte do player (credencial recusada,
   * conta expirada). Empilha a edição da lista pelo id — a camada do player
   * desmonta junto da tela, então não sobra áudio nem plano de vídeo.
   */
  function editSourceFromPlayer(sourceId: string, from: AppScreen) {
    const target = sourcesQuery.data?.sources.find((candidate) => candidate.id === sourceId) ?? currentSource
    if (!target) return
    dispatch({ type: 'open', screen: { name: 'edit-source', source: target }, from })
  }

  /**
   * Escolher uma lista (feature 023, FR-005/FR-006/FR-007): vira a fonte
   * ativa e abre o Início dela com a pilha zerada, grava a "última usada" e
   * dispara a mesma verificação de atualização por idade que abrir uma fonte
   * sempre disparou (feature 004).
   */
  function chooseSource(source: SourceOut) {
    if (!allowListEntry(source.id)) return
    // 071/A008: lista ainda sem nenhuma sincronização cuja 1ª importação vinda do site corre em segundo plano →
    // mostra o progresso (categorias carregando) em vez de entrar numa lista vazia. Leitura síncrona, sem rede.
    // 077: decide pela marca em memória e pelo registro durável da importação (sobrevive a recarregar a TV): pendente,
    // interrompida ou com erro → progresso com Tentar novamente; só entra na lista quando o catálogo estiver pronto.
    if (source.last_successful_sync_at !== null) { openChosen(source); return }
    void remoteImportRunForEntry(source.id).then(
      runId => (runId ? dispatch({ type: 'open', screen: { name: 'progress', jobId: runId } }) : openChosen(source)),
      () => openChosen(source))
  }

  function openChosen(source: SourceOut) {
    // Feature 034 (US2, `logic/conta-da-fonte.md` §5): uma lista Xtream com
    // conta vencida/recusada — ou ainda por verificar — passa pela tela de
    // acesso em vez de abrir o Início. M3U avulsa e Modo limitado nunca passam
    // (FR-022). Nada abaixo (última lista usada, pré-carga, atualização por
    // idade) acontece enquanto o acesso não abrir (D-004, D-007).
    if (decideSourceAccess(source, Date.now()).action !== 'open') {
      dispatch({
        type: 'open',
        screen: { name: 'source-access', source },
        from: { name: 'profiles', mode: screen.name === 'profiles' ? screen.mode : 'base', focusSourceId: source.id },
      })
      return
    }
    enterSource(source)
  }

  /** O que escolher uma lista sempre fez (feature 023) — agora só depois de o acesso abrir. */
  function enterSource(source: SourceOut) {
    if (!allowListEntry(source.id)) return
    dispatch({ type: 'choose-source', source })
    writeLastSourceId(source.id)
    // Mesma lista de antes (ex.: "Abrir lista" depois de ressincronizar): a
    // pré-carga já roda, mas a estrutura pode ter mudado — relê o disco.
    wakePrefetch()
    checkSourceForUpdates(source.id)
  }

  // Fogo e esquece (cache-first, ADR-002): a navegação nunca espera. Também ao voltar
  // ao primeiro plano (bug `lista-xtream-nao-atualiza-novos-filmes`).
  function checkSourceForUpdates(sourceId: string) {
    openSource.mutate(sourceId, {
      onSuccess: (result) => {
        if (result.triggered && result.import_job_id) setAutoRefreshJobId(result.import_job_id)
      },
    })
  }
  useRefreshOnForeground(currentSource, checkSourceForUpdates)

  /**
   * Detalhe â†’ outro detalhe (Semelhantes, feature 035, `logic/navegacao-detalhe.md`
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

  const goBack = () => {
    if (screen.name === 'profiles' && activeSource && !allowListEntry(activeSource.id)) return
    dispatch({ type: 'back' })
  }

  /** Topbar de Filmes/Séries (vitrine e categoria; sem rodapé): "Início" vai ao Início mais próximo da pilha (026, D-006). */
  const vodShell = (src: SourceOut, current: Extract<AppScreen, { name: 'movies' | 'series' | 'movies-category' | 'series-category' }>) => ({
    sourceName: src.display_name,
    onGoHome: () => dispatch({ type: 'go-home' }),
    onSwitchTop: (destination: TopbarDestination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
    onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
    // Feature 066 (FR-009): `'parental'` abre a gestão — desde a 067, na tela da lista ativa (D-010); voltar devolve o foco ao conteúdo.
    onOpenSettings: (tab?: 'parental') => (tab ? openListSettings(dispatch, src.id, current, { tab }) : dispatch({ type: 'open', screen: { name: 'settings' }, from: { ...current, topbarFocus: 'settings' } })),
    onOpenSearch: () => dispatch({ type: 'open', screen: { name: 'search' }, from: { ...current, topbarFocus: 'search' } }),
  })
  // Estável de propósito: `SplashScreen` reagenda o timer a cada mudança da
  // identidade do callback, e este componente re-renderiza com as consultas.
  const finishSplash = useCallback(() => dispatch({ type: 'splash-finished' }), [])

  // Toda tela abaixo do Início existe só com uma fonte ativa — o único caminho
  // até elas é escolher uma lista. Sem fonte não há o que mostrar.
  const source = currentSource

  const route = (() => {
    switch (screen.name) {
    case 'splash':
      return <SplashScreen onFinished={finishSplash} ready={startupReady} />

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
          onConfigureSource={(target) => openListSettings(dispatch, target.id, { ...screen, focusSourceId: target.id })}
          // "Gerenciar listas" (feature 026, FR-032): Configurações › Fontes
          // IPTV sem lista ativa, sem topbar (`standalone`).
          onManageSources={() => dispatch({ type: 'open', screen: { name: 'settings', standalone: true } })}
          onBack={goBack}
        />
      )

    case 'source-access':
      return (
        <SourceAccessRoute
          // A versão mais nova da lista: voltar de "Editar lista" já traz a conta atualizada.
          source={sourcesQuery.data?.sources.find((candidate) => candidate.id === screen.source.id) ?? screen.source}
          onOpen={enterSource}
          onEdit={(sourceToEdit) => dispatch({ type: 'open', screen: { name: 'edit-source', source: sourceToEdit } })}
          onBack={goBack}
        />
      )

    case 'add-source':
      // 071/A006: Xtream Codes, Lista M3U e "Pelo site" são abas da mesma tela — RETURN de qualquer uma cai na tela
      // de listas. Em dev a aba do site aparece mesmo sem portal (estado honesto); no build de loja sem portal ela
      // some (078, `portalSurfacesVisible`). Painel montado aqui: features/import não importa features/portal
      // (070, D-008). Recarregar com lista nova volta à tela de listas com o foco nela (071/FR-006).
      return (
        <AddSourceScreen
          onSourceCreated={({ jobId }) => dispatch({ type: 'open', screen: { name: 'progress', jobId } })}
          onBack={goBack}
          sitePanel={portalSurfacesVisible() ? <PortalPairingPanel connection={safePortalConnection()} onBack={goBack}
            onReloaded={(newSourceId) => dispatch({ type: 'import-back', sourceId: newSourceId })} /> : undefined}
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
          onOpenSearch={(from) => dispatch({ type: 'open', screen: { name: 'search' }, from: { name: 'home', focus: from } })}
          onOpenSettings={(from) =>
            dispatch({ type: 'open', screen: { name: 'settings' }, from: { name: 'home', focus: from } })
          }
          onLeaveList={() => dispatch({ type: 'leave-list' })}
          onEditSource={(sourceId) => editSourceFromPlayer(sourceId, { name: 'home' })}
        />
      )

    case 'live':
      if (!source) return null
      return (
        <LiveScreen
          sourceId={source.id}
          initialChannel={screen.initialChannel}
          openFavorites={screen.openFavorites}
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
          // Reempilha a Live SEM `initialChannel` (nunca com ele) — senão voltar da
          // edição tocaria o canal de novo (mesma regra da Busca/Configurações).
          onEditSource={(sourceId) => editSourceFromPlayer(sourceId, { name: 'live' })}
          // Feature 068 (US2, D-008): sem topbar — RETURN volta ao Início. "Gerenciar categorias" do vazio "todas
          // escondidas" abre a tela da lista ativa em Categorias (D-010 da 067), como o `shell` fazia.
          onManageCategories={() => openListSettings(dispatch, source.id, { name: 'live' }, { tab: 'parental' })}
        />
      )

    case 'movies':
    case 'series': {
      if (!source) return null
      const isMovies = screen.name === 'movies'
      return (
        <VodShowcaseScreen
          // Feature 053: Filmes e Séries são a mesma tela; sem `key` o React reaproveitava foco, janela de prévias e a
          // lista recolhida de uma seção na outra ao trocar pela topbar.
          key={isMovies ? 'movies' : 'series'}
          section={isMovies ? 'movies' : 'series'}
          sourceId={source.id}
          restore={isShowcaseFocus(screen.restore) ? screen.restore : undefined}
          initialTopbarItem={screen.topbarFocus}
          shell={vodShell(source, screen)}
          onOpenItem={(itemId, focus) =>
            dispatch({
              type: 'open',
              screen: isMovies ? { name: 'movie-detail', movieId: itemId } : { name: 'series-detail', seriesId: itemId },
              from: { ...screen, restore: focus },
            })
          }
          onOpenTarget={(target, focus) =>
            dispatch({
              type: 'open',
              screen: isMovies ? { name: 'movies-category', target } : { name: 'series-category', target },
              from: { ...screen, restore: focus },
            })
          }
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
        />
      )
    }

    case 'movies-category':
    case 'series-category': {
      if (!source) return null
      const isMovies = screen.name === 'movies-category'
      return (
        <VodCategoryScreen
          section={isMovies ? 'movies' : 'series'}
          sourceId={source.id}
          target={screen.target}
          restore={screen.restore}
          onOpenItem={(itemId, restore) =>
            dispatch({
              type: 'open',
              screen: isMovies ? { name: 'movie-detail', movieId: itemId } : { name: 'series-detail', seriesId: itemId },
              from: { ...screen, restore },
            })
          }
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
        />
      )
    }
    case 'movie-detail':
      return (
        <MovieDetailScreen
          // Um detalhe novo (Semelhantes → outro título) nunca reaproveita o estado do anterior.
          key={`movie-${screen.movieId}-${history.length}`}
          movieId={screen.movieId}
          restore={screen.restore}
          onEditSource={(sourceId) => editSourceFromPlayer(sourceId, screen)}
          onBack={goBack}
          onOpenTitle={(target, from) => openDetail(target, { ...screen, restore: from })}
          onOpenPerson={(person, from) => openPerson(person, { ...screen, restore: from })}
          onOpenTmdbSettings={(from) => openTmdbSettings({ ...screen, restore: from })}
        />
      )

    case 'series-detail':
      return (
        <SeriesDetailScreen
          key={`series-${screen.seriesId}-${history.length}`}
          seriesId={screen.seriesId}
          restore={screen.restore}
          onEditSource={(sourceId) => editSourceFromPlayer(sourceId, screen)}
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
        // Configurações (`navigation/settingsRoutes.tsx`, feature 067, R-002) e Rádio (`routeModules.ts`, feature 074).
        return renderSettingsRoute(screen, { dispatch, goBack, activeSource: source }) ?? renderRadioRoute(screen, goBack, source !== null) ?? null
    }
  })()
  return (
    <>
      <RouteBoundary key={`${screen.name}:${history.length}:${route?.key ?? ''}`} onBack={goBack}>{route}</RouteBoundary>
      <ProgressSaveNotice />
      {portalConfirmation}
    </>
  )
}

export default App



