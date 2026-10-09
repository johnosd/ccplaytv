import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SplashScreen } from './features/splash/SplashScreen'
import { ADD_LIST_FOCUS_ID, ProfilesScreen } from './features/profiles/ProfilesScreen'
import { SourceAccessRoute } from './features/sources/SourceAccessRoute'
import { HomeScreen } from './features/home/HomeScreen'
import { AddSourceScreen } from './features/import/AddSourceScreen'
import { ImportProgressScreen } from './features/import/ImportProgressScreen'
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
import { usePrefetchForSource, wakePrefetch } from './features/catalog/prefetchApi'
import { appNavReducer, initialAppNav, type AppScreen, type TopDestination } from './navigation/appNav'
import { readLastSourceId, writeLastSourceId } from './navigation/lastSource'
import type { OpenPersonTarget, OpenTitleTarget } from './features/vod/detailSnapshot'
import { LiveScreen, VodShowcaseScreen, MovieDetailScreen, SeriesDetailScreen, SettingsScreen, EpgSettingsScreen, TmdbKeyScreen, SearchScreen, VodCategoryScreen, PersonScreen } from './navigation/routeModules'
import { RouteBoundary } from './components/RouteBoundary'
import { useStartupReadiness } from './lib/useStartupReadiness'

/**
 * "Ver todos (N)"/"Filmes (N)"/"SÃ©ries (N)" do InÃ­cio (feature 026, FR-014)
 * abrem `â˜… Favoritos` do destino escolhido. FunÃ§Ã£o Ã  parte (em vez de um
 * objeto literal `{ name: destination, openFavorites: true }` inline): o
 * `tsc` nÃ£o distribui bem um objeto com campo de discriminante nÃ£o-literal
 * contra a uniÃ£o `AppScreen` quando o objeto tem mais de um campo.
 */
function openFavoritesScreen(destination: TopDestination): AppScreen {
  if (destination === 'live') return { name: 'live', openFavorites: true }
  if (destination === 'movies') return { name: 'movies-category', target: { kind: 'favorites' } }
  return { name: 'series-category', target: { kind: 'favorites' } }
}

function App() {
  // A navegaÃ§Ã£o Ã© um redutor puro (feature 023, D-003): aqui sÃ³ se despacham
  // aÃ§Ãµes e se renderiza a tela atual. Toda regra de "para onde RETURN leva" e
  // de "o que zera a pilha" mora em `navigation/appNav.ts`.
  const [nav, dispatch] = useReducer(appNavReducer, undefined, initialAppNav)
  const { screen, activeSource, history } = nav

  // Tecla amarela como atalho de favoritar (feature 013) e teclas de mÃ­dia
  // do controle (feature 027, FR-023) â€” registram uma vez, na raiz do app,
  // nunca por tela: `tizen.tvinputdevice.registerKey` Ã© global Ã  sessÃ£o do
  // widget, registrar de novo em cada tela seria redundante. No-op fora da
  // TV (`tizenColorKey.ts`/`tizenMediaKeys.ts`).
  useEffect(() => {
    registerFavoriteColorKey()
    registerRemoveColorKey()
    registerMediaKeys()
  }, [])

  // MigraÃ§Ã£o Ãºnica e atualizaÃ§Ã£o por idade (feature 004, D-004): a TV sÃ³
  // avisa "abri esta fonte" â€” quem decide migrar/atualizar/nada Ã© o
  // backend. Fica no componente raiz, nÃ£o em telas, porque a atualizaÃ§Ã£o
  // pode terminar depois que o usuÃ¡rio jÃ¡ navegou para outra tela, e o
  // acompanhamento nÃ£o pode se perder na troca.
  const openSource = useOpenSource()
  const resyncSource = useResyncSource()
  const [autoRefreshJobId, setAutoRefreshJobId] = useState<string | null>(null)
  const autoRefreshJob = useImportJob(autoRefreshJobId)
  const queryClient = useQueryClient()
  // Evita reconciliar duas vezes pro mesmo job (o efeito roda de novo a
  // cada poll, nÃ£o sÃ³ na virada pra terminal) â€” sem precisar de outro
  // setState dentro do efeito pra "desarmar" o acompanhamento.
  const reconciledJobRef = useRef<string | null>(null)

  // Feature 030 (D-009): uma sincronizaÃ§Ã£o de EPG terminou, com sucesso ou
  // nÃ£o â€” a programaÃ§Ã£o e/ou o estado da fonte mudaram. Fica na raiz pelo
  // mesmo motivo da atualizaÃ§Ã£o por idade acima: pode terminar depois de a
  // pessoa jÃ¡ ter navegado para outra tela.
  useEffect(
    () =>
      onEpgSyncFinished(() => {
        void queryClient.invalidateQueries({ queryKey: ['epg'] })
        void queryClient.invalidateQueries({ queryKey: ['sources'] })
      }),
    [queryClient],
  )

  // Feature 034: o fim de uma sincronizaÃ§Ã£o muda a conta, o estado e as contagens da
  // lista â€” ConfiguraÃ§Ãµes e o cartÃ£o relÃªem em vez de ficarem em Sincronizando.
  useEffect(() => {
    return onSourceSyncFinished(() => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] })
      void queryClient.invalidateQueries({ queryKey: ['catalog-counts'] })
      // O Ã­ndice de busca (vitrine, Todos, Top 10/Dica) Ã© do catÃ¡logo da geraÃ§Ã£o ativa: uma sincronizaÃ§Ã£o o troca.
      void queryClient.invalidateQueries({ queryKey: ['catalog-search-index'] })
    })
  }, [queryClient])

  // Observador ativo da lista de fontes na raiz: mantÃ©m `['sources']` vivo
  // durante a sessÃ£o e dÃ¡ ao InÃ­cio a versÃ£o mais nova da fonte ativa (o
  // `activeSource` do redutor Ã© sÃ³ o retrato do momento da escolha â€” uma
  // sincronizaÃ§Ã£o depois dele pode ter mudado o selo de Modo limitado).
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
    // O catÃ¡logo pode ter sido substituÃ­do (D-002) â€” invalida em vez de
    // assumir; quem estiver com a tela de canais montada revalida sozinho,
    // reconciliando o foco por identidade (LiveScreen). Fonte de falha nÃ£o
    // muda nada visÃ­vel aqui: connection_state/last_successful_sync_at jÃ¡
    // nÃ£o avanÃ§am no backend quando o job falha (FR-023).
    void queryClient.invalidateQueries({ queryKey: ['catalog-items'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-counts'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-item'] })
    void queryClient.invalidateQueries({ queryKey: ['sources'] })
    // Feature 038: a estrutura pode ter mudado (categorias novas/removidas,
    // renovaÃ§Ã£o pedida) â€” a trilha relÃª e a prÃ©-carga relÃª o disco.
    void queryClient.invalidateQueries({ queryKey: ['categories'] })
    void queryClient.invalidateQueries({ queryKey: ['category-content'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-search-index'] })
    wakePrefetch()
  }, [autoRefreshJobId, autoRefreshJob.data?.status, queryClient])

  // Feature 038 (D-010): a prÃ©-carga acompanha a lista ativa.
  usePrefetchForSource(activeSource?.id ?? null)

  /**
   * Feature 042: "Editar lista" do erro de fonte do player (credencial recusada,
   * conta expirada). Empilha a ediÃ§Ã£o da lista pelo id â€” a camada do player
   * desmonta junto da tela, entÃ£o nÃ£o sobra Ã¡udio nem plano de vÃ­deo.
   */
  function editSourceFromPlayer(sourceId: string, from: AppScreen) {
    const target = sourcesQuery.data?.sources.find((candidate) => candidate.id === sourceId) ?? currentSource
    if (!target) return
    dispatch({ type: 'open', screen: { name: 'edit-source', source: target }, from })
  }

  /**
   * Escolher uma lista (feature 023, FR-005/FR-006/FR-007): vira a fonte
   * ativa e abre o InÃ­cio dela com a pilha zerada, grava a "Ãºltima usada" e
   * dispara a mesma verificaÃ§Ã£o de atualizaÃ§Ã£o por idade que abrir uma fonte
   * sempre disparou (feature 004).
   */
  function chooseSource(source: SourceOut) {
    // Feature 034 (US2, `logic/conta-da-fonte.md` Â§5): uma lista Xtream com
    // conta vencida/recusada â€” ou ainda por verificar â€” passa pela tela de
    // acesso em vez de abrir o InÃ­cio. M3U avulsa e Modo limitado nunca passam
    // (FR-022). Nada abaixo (Ãºltima lista usada, prÃ©-carga, atualizaÃ§Ã£o por
    // idade) acontece enquanto o acesso nÃ£o abrir (D-004, D-007).
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

  /** O que escolher uma lista sempre fez (feature 023) â€” agora sÃ³ depois de o acesso abrir. */
  function enterSource(source: SourceOut) {
    dispatch({ type: 'choose-source', source })
    writeLastSourceId(source.id)
    // Mesma lista de antes (ex.: "Abrir lista" depois de ressincronizar): a
    // prÃ©-carga jÃ¡ roda, mas a estrutura pode ter mudado â€” relÃª o disco.
    wakePrefetch()
    // Fogo e esquece: a leitura do catÃ¡logo sempre serve o que estÃ¡
    // publicado agora (cache-first, ADR-002); a navegaÃ§Ã£o nunca espera essa
    // decisÃ£o.
    openSource.mutate(source.id, {
      onSuccess: (result) => {
        if (result.triggered && result.import_job_id) {
          setAutoRefreshJobId(result.import_job_id)
        }
      },
    })
  }

  /**
   * Detalhe â†’ outro detalhe (Semelhantes, feature 035, `logic/navegacao-detalhe.md`
   * Â§1): empilha a tela de origem jÃ¡ com o snapshot de onde o foco estava, para
   * o RETURN restaurar aba e cartÃ£o por identidade.
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

  /** Elenco â†’ pÃ¡gina de ator (feature 035, US4); RETURN volta ao detalhe com a aba Elenco e a pessoa focada. */
  function openPerson(person: OpenPersonTarget, from: AppScreen) {
    dispatch({ type: 'open', screen: { name: 'person', personId: person.personId, personName: person.name }, from })
  }

  /** "Configurar TMDB" da aba Semelhantes â†’ ConfiguraÃ§Ãµes â€º IntegraÃ§Ãµes & BYOK; RETURN volta ao detalhe. */
  function openTmdbSettings(from: AppScreen) {
    dispatch({ type: 'open', screen: { name: 'settings', restore: { zone: 'panel', tab: 'integrations' } }, from })
  }

  /**
   * "Abrir lista" no fim de uma importaÃ§Ã£o (FR-038). Sempre relÃª a lista de
   * fontes antes: `useCreateSource` nÃ£o invalida `['sources']`, entÃ£o o
   * cache pode ainda nem ter a lista nova, ou tÃª-la com o estado de antes da
   * importaÃ§Ã£o (sem o selo de Modo limitado que ela acabou de ganhar).
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
   * D-008): o conteÃºdo guardado de uma categoria `stored` sumiu do
   * aparelho, e "Tentar de novo" nÃ£o resolve isso â€” sÃ³ uma importaÃ§Ã£o
   * nova. Navega pra tela de progresso; "Abrir lista" volta ao InÃ­cio da
   * fonte ativa (FR-033).
   */
  function resyncFromCategoryScreen(sourceId: string) {
    resyncSource.mutate(sourceId, {
      onSuccess: (result) => dispatch({ type: 'open', screen: { name: 'progress', jobId: result.import_job_id } }),
    })
  }

  const goBack = () => dispatch({ type: 'back' })

  /** Topbar de Filmes/SÃ©ries (vitrine e categoria; sem rodapÃ©): "InÃ­cio" vai ao InÃ­cio mais prÃ³ximo da pilha (026, D-006). */
  const vodShell = (src: SourceOut, current: Extract<AppScreen, { name: 'movies' | 'series' | 'movies-category' | 'series-category' }>) => ({
    sourceName: src.display_name,
    onGoHome: () => dispatch({ type: 'go-home' }),
    onSwitchTop: (destination: TopDestination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
    onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
    onOpenSettings: () => dispatch({ type: 'open', screen: { name: 'settings' }, from: { ...current, topbarFocus: 'settings' } }),
    onOpenSearch: () => dispatch({ type: 'open', screen: { name: 'search' }, from: { ...current, topbarFocus: 'search' } }),
  })
  // EstÃ¡vel de propÃ³sito: `SplashScreen` reagenda o timer a cada mudanÃ§a da
  // identidade do callback, e este componente re-renderiza com as consultas.
  const finishSplash = useCallback(() => dispatch({ type: 'splash-finished' }), [])

  // Toda tela abaixo do InÃ­cio existe sÃ³ com uma fonte ativa â€” o Ãºnico caminho
  // atÃ© elas Ã© escolher uma lista. Sem fonte nÃ£o hÃ¡ o que mostrar.
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
          // Voltar do cadastro cai em "Adicionar lista", nÃ£o na Ãºltima lista
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
          // "Gerenciar listas" (feature 026, FR-032): ConfiguraÃ§Ãµes â€º Fontes
          // IPTV sem lista ativa, sem topbar (`standalone`).
          onManageSources={() => dispatch({ type: 'open', screen: { name: 'settings', standalone: true } })}
          onBack={goBack}
        />
      )

    case 'source-access':
      return (
        <SourceAccessRoute
          // A versÃ£o mais nova da lista: voltar de "Editar lista" jÃ¡ traz a conta atualizada.
          source={sourcesQuery.data?.sources.find((candidate) => candidate.id === screen.source.id) ?? screen.source}
          onOpen={enterSource}
          onEdit={(sourceToEdit) => dispatch({ type: 'open', screen: { name: 'edit-source', source: sourceToEdit } })}
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
          // Feature 038 (US6): a atualizaÃ§Ã£o automÃ¡tica por idade roda calada â€”
          // o InÃ­cio diz "Atualizando catÃ¡logoâ€¦" enquanto ela nÃ£o termina.
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
              screen: { name: 'settings', restore: { zone: 'panel', tab: 'integrations', service: from.zone === 'dock' && from.service === 'dock-speedtest' ? 'speedtest' : undefined } },
              from: { name: 'home', focus: from },
            })
          }
          onOpenSearch={(from) => dispatch({ type: 'open', screen: { name: 'search' }, from: { name: 'home', focus: from } })}
          onOpenSettings={(from) =>
            dispatch({ type: 'open', screen: { name: 'settings' }, from: { name: 'home', focus: from } })
          }
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
          initialTopbarItem={screen.topbarFocus}
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
          // Reempilha a Live SEM `initialChannel` (nunca com ele) â€” senÃ£o voltar da
          // ediÃ§Ã£o tocaria o canal de novo (mesma regra da Busca/ConfiguraÃ§Ãµes).
          onEditSource={(sourceId) => editSourceFromPlayer(sourceId, { name: 'live' })}
          shell={{
            sourceName: source.display_name,
            // "InÃ­cio" na topbar leva ao InÃ­cio mais prÃ³ximo da pilha, nunca
            // `back` (feature 026, D-006 â€” a Live agora tambÃ©m pode ser
            // aberta a partir da Busca; `back` voltaria pra lÃ¡, nÃ£o pro InÃ­cio).
            onGoHome: () => dispatch({ type: 'go-home' }),
            onSwitchTop: (destination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
            onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
            // Empilha a Live SEM `initialChannel` (nunca com ele) â€” senÃ£o
            // voltar da Busca/ConfiguraÃ§Ãµes tocaria o canal de novo
            // (feature 026, `logic/navegacao.md` Â§3).
            onOpenSettings: () =>
              dispatch({ type: 'open', screen: { name: 'settings' }, from: { name: 'live', topbarFocus: 'settings' } }),
            onOpenSearch: () =>
              dispatch({ type: 'open', screen: { name: 'search' }, from: { name: 'live', topbarFocus: 'search' } }),
          }}
        />
      )

    case 'movies':
    case 'series': {
      if (!source) return null
      const isMovies = screen.name === 'movies'
      return (
        <VodShowcaseScreen
          // Feature 053: Filmes e SÃ©ries sÃ£o a mesma tela; sem `key` o React reaproveitava foco, janela de prÃ©vias e a
          // lista recolhida de uma seÃ§Ã£o na outra ao trocar pela topbar.
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
          initialTopbarItem={screen.topbarFocus}
          shell={vodShell(source, screen)}
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
          // Um detalhe novo (Semelhantes â†’ outro tÃ­tulo) nunca reaproveita o estado do anterior.
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
  })()
  return <RouteBoundary key={`${screen.name}:${history.length}:${route?.key ?? ''}`} onBack={goBack}>{route}</RouteBoundary>
}

export default App



