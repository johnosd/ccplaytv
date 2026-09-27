import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SplashScreen } from './features/splash/SplashScreen'
import { ProfilesScreen } from './features/profiles/ProfilesScreen'
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
import { registerFavoriteColorKey } from './lib/tizenColorKey'
import { appNavReducer, initialAppNav } from './navigation/appNav'
import { readLastSourceId, writeLastSourceId } from './navigation/lastSource'

function App() {
  // A navegação é um redutor puro (feature 023, D-003): aqui só se despacham
  // ações e se renderiza a tela atual. Toda regra de "para onde RETURN leva" e
  // de "o que zera a pilha" mora em `navigation/appNav.ts`.
  const [nav, dispatch] = useReducer(appNavReducer, undefined, initialAppNav)
  const { screen, activeSource } = nav

  // Tecla amarela como atalho de favoritar (feature 013) — registra uma
  // vez, na raiz do app, nunca por tela: `tizen.tvinputdevice.registerKey`
  // é global à sessão do widget, registrar de novo em cada tela seria
  // redundante. No-op fora da TV (`tizenColorKey.ts`).
  useEffect(() => {
    registerFavoriteColorKey()
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
  }, [autoRefreshJobId, autoRefreshJob.data?.status, queryClient])

  /**
   * Escolher uma lista (feature 023, FR-005/FR-006/FR-007): vira a fonte
   * ativa e abre o Início dela com a pilha zerada, grava a "última usada" e
   * dispara a mesma verificação de atualização por idade que abrir uma fonte
   * sempre disparou (feature 004).
   */
  function chooseSource(source: SourceOut) {
    dispatch({ type: 'choose-source', source })
    writeLastSourceId(source.id)
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
          onAddSource={() => dispatch({ type: 'open', screen: { name: 'add-source' } })}
          onEditSource={(sourceToEdit) => dispatch({ type: 'open', screen: { name: 'edit-source', source: sourceToEdit } })}
          onResyncStarted={(jobId) => dispatch({ type: 'open', screen: { name: 'progress', jobId } })}
          onSourceDeleted={(sourceId) => dispatch({ type: 'source-removed', sourceId })}
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
          onNavigate={(destination, from) =>
            dispatch({ type: 'open', screen: { name: destination }, from: { name: 'home', focus: from } })
          }
          onOpenContinueWatching={(item, from) =>
            dispatch({
              type: 'open',
              screen:
                item.kind === 'movie'
                  ? { name: 'movie-detail', movieId: item.id }
                  : { name: 'series-detail', seriesId: item.id },
              from: { name: 'home', focus: from },
            })
          }
          onOpenProfiles={(from) => dispatch({ type: 'open-profiles', from: { name: 'home', focus: from } })}
        />
      )

    case 'live':
      if (!source) return null
      return <LiveScreen sourceId={source.id} onBack={goBack} onResync={() => resyncFromCategoryScreen(source.id)} />

    case 'movies':
      if (!source) return null
      return (
        <MoviesScreen
          sourceId={source.id}
          restore={screen.restore}
          onOpenMovie={(movieId, snapshot) =>
            dispatch({
              type: 'open',
              screen: { name: 'movie-detail', movieId },
              from: { ...screen, restore: snapshot },
            })
          }
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
        />
      )

    case 'movie-detail':
      return <MovieDetailScreen movieId={screen.movieId} onBack={goBack} />

    case 'series':
      if (!source) return null
      return (
        <SeriesScreen
          sourceId={source.id}
          restore={screen.restore}
          onOpenSeries={(seriesId, snapshot) =>
            dispatch({
              type: 'open',
              screen: { name: 'series-detail', seriesId },
              from: { ...screen, restore: snapshot },
            })
          }
          onBack={goBack}
          onResync={() => resyncFromCategoryScreen(source.id)}
        />
      )

    case 'series-detail':
      return <SeriesDetailScreen seriesId={screen.seriesId} onBack={goBack} />

    default:
      return null
  }
}

export default App
