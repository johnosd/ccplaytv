import { useEffect, useRef } from 'react'
import { useCancelImportJob, useImportJob, useRetryImportJob } from './importApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { OnboardingBrand } from './OnboardingBrand'

export interface ImportProgressScreenProps {
  jobId: string
  onRetried: (newJobId: string) => void
  /**
   * "Voltar" e RETURN. Recebe o id da lista quando o job já carregou (o App
   * usa para abrir os perfis com foco nela, FR-039) e nenhum argumento nos
   * estados de carregando/erro, em que não há lista a apontar.
   */
  onBack: (sourceId?: string) => void
  /** "Abrir lista" (feature 023, D-009/FR-038): a lista importada vira a fonte ativa. */
  onOpenSource: (sourceId: string) => void
}

const STEP_LABELS: Record<string, string> = {
  acquiring: 'Obtendo a lista',
  parsing: 'Lendo entradas',
  classifying: 'Classificando canais, filmes e séries',
  publishing: 'Publicando catálogo',
  done: 'Concluído',
}

/**
 * Fonte de provedor pelo protocolo JSON grava só estrutura e conclui em
 * segundos (feature 010) — as etapas falam de categoria, não de item, e a
 * tela precisa dizer a verdade sobre o que está acontecendo (FR-013).
 */
const CATEGORY_STEP_LABELS: Record<string, string> = {
  acquiring: 'Obtendo a estrutura',
  parsing: 'Lendo categorias',
  classifying: 'Organizando categorias',
  publishing: 'Publicando estrutura',
  done: 'Concluído',
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Na fila',
  running: 'Em andamento',
  completed: 'Concluída',
  completed_with_warnings: 'Concluída com avisos',
  failed: 'Falhou',
  cancelled: 'Cancelada',
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'O provedor recusou o usuário ou senha.',
  subscription_expired: 'Sua assinatura com este provedor expirou.',
  direct_connection_refused:
    'O provedor não aceita conexão direta por este aplicativo. Requer uso do servidor.',
  network_failure: 'Falha de rede ao tentar conectar com o provedor.',
  invalid_playlist: 'O painel não respondeu com um formato de catálogo válido.',
  empty_playlist: 'O painel respondeu com um catálogo vazio.',
  hls_manifest: 'O endereço fornecido aponta para um canal, não para um catálogo.',
  interrupted: 'A importação foi interrompida antes de terminar. O aplicativo foi fechado no meio.',
  storage_full: 'Não há espaço no aparelho para guardar esta lista.',
}

/**
 * Progresso da importação no visual V14 (feature 023, US4). O DS não desenha
 * esta tela — é composta com os componentes da feature 022 (`Button`,
 * `Spinner`). O que ela mostra continua só o que o importador informa:
 * etapas e contagens reais, nunca um percentual estimado (FR-037).
 */
export function ImportProgressScreen({ jobId, onRetried, onBack, onOpenSource }: ImportProgressScreenProps) {
  const containerRef = useRef<HTMLElement>(null)
  const openListRef = useRef<HTMLDivElement>(null)
  useTvKeyNav(containerRef)

  const { data: job, isLoading, isError } = useImportJob(jobId)
  const cancelJob = useCancelImportJob()
  const retryJob = useRetryImportJob()

  // Um só caminho de "voltar" para o botão e para RETURN: leva o id da lista
  // quando existe, e nenhum argumento quando ainda não há job (FR-039).
  const goBack = () => (job ? onBack(job.source_id) : onBack())
  useRemoteNav({ onBack: goBack })

  // "Abrir lista" precisa ficar em foco no instante em que a importação
  // termina (D-009). O `useTvKeyNav` só foca o primeiro focável quando NADA
  // dentro da tela está focado — se a pessoa já tinha descido até "Voltar"
  // durante a execução, o foco ficaria lá. Este efeito move o foco de forma
  // explícita, uma vez, na virada para concluída.
  const isDone = job?.status === 'completed' || job?.status === 'completed_with_warnings'
  useEffect(() => {
    if (isDone) openListRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [isDone])

  // Carregando e "não existe mais" são estados distintos, e nenhum dos dois
  // pode ficar sem saída: a tela precisa de pelo menos um elemento focável
  // sempre, ou o controle fica preso nela (constitution, "Foco Visível e Sem
  // Becos Sem Saída").
  if (isError || (!isLoading && !job)) {
    return (
      <section className="screen onboarding" aria-labelledby="progress-title" ref={containerRef}>
        <OnboardingBrand />
        <p className="onboarding-kicker">Importação</p>
        <h1 id="progress-title" className="onboarding-title">
          Progresso da importação
        </h1>
        <p className="onboarding-subtitle">
          Esta importação não está mais registrada no aparelho. Abra a lista na tela inicial para
          sincronizar de novo.
        </p>
        <div className="progress-actions">
          <Button variant="secondary" onSelect={goBack}>
            Voltar
          </Button>
        </div>
      </section>
    )
  }

  if (!job) {
    return (
      <section className="screen onboarding" aria-labelledby="progress-title" ref={containerRef}>
        <OnboardingBrand />
        <p className="onboarding-kicker">Importação</p>
        <h1 id="progress-title" className="onboarding-title">
          Progresso da importação
        </h1>
        <div className="progress-status-row">
          <Spinner size={32} />
          <p className="progress-status">Carregando estado da importação…</p>
        </div>
        <div className="progress-actions">
          <Button variant="secondary" onSelect={goBack}>
            Voltar
          </Button>
        </div>
      </section>
    )
  }

  const isRunning = job.status === 'queued' || job.status === 'running'
  const cancelRequested = cancelJob.isSuccess || cancelJob.isPending
  const isCategories = job.counts.unit === 'categories'
  const stepLabels = isCategories ? CATEGORY_STEP_LABELS : STEP_LABELS

  return (
    <section className="screen onboarding" aria-labelledby="progress-title" ref={containerRef}>
      <OnboardingBrand />
      <p className="onboarding-kicker">Importação</p>
      <h1 id="progress-title" className="onboarding-title">
        Progresso da importação
      </h1>

      <div className="progress-status-row">
        {/* Indicador indeterminado: sem denominador confiável, nunca um
            percentual inventado (constitution, "Progresso e Capacidades São
            Reais"). */}
        {isRunning && <Spinner size={32} />}
        <p className="progress-status">
          Status: {STATUS_LABELS[job.status] ?? job.status} — Etapa:{' '}
          {stepLabels[job.current_step] ?? job.current_step}
        </p>
      </div>

      <ul aria-label="Contadores" className="progress-counters">
        <li className="progress-counter">
          {isCategories ? 'Categorias lidas' : 'Entradas lidas'}: {job.counts.entries_read}
        </li>
        <li className="progress-counter">
          {isCategories ? 'Categorias gravadas' : 'Itens gravados'}: {job.counts.channels}
        </li>
        {/* Descarte por tipo e invalidez não têm sentido para uma estrutura
            de categorias — nenhuma categoria é "descartada por tipo" ou
            "inválida" neste caminho, então as linhas ficariam sempre em
            zero, sem informar nada. */}
        {!isCategories && (
          <>
            <li className="progress-counter">
              Descartados (tipo não reconhecido): {job.counts.discarded_by_type}
            </li>
            <li className="progress-counter">Inválidos: {job.counts.invalid}</li>
          </>
        )}
      </ul>

      {job.status === 'failed' && job.error_kind && (
        <div className="progress-error" aria-label="Erro">
          {ERROR_MESSAGES[job.error_kind] ?? 'Falha desconhecida'}
        </div>
      )}

      {job.warnings.length > 0 && (
        <ul aria-label="Avisos" className="progress-warnings">
          {job.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <div className="progress-actions">
        {/* Primeiro na ordem do DOM: quando a importação termina, é o
            primeiro focável e o alvo do foco explícito acima (D-009). Sem
            avanço automático — os avisos da importação precisam poder ser
            lidos (FR-038). */}
        {isDone && (
          <div ref={openListRef}>
            <Button variant="accent" onSelect={() => onOpenSource(job.source_id)}>
              Abrir lista
            </Button>
          </div>
        )}

        {isRunning && (
          <Button variant="secondary" loading={cancelRequested} onSelect={() => cancelJob.mutate(jobId)}>
            {cancelRequested ? 'Cancelamento solicitado…' : 'Cancelar'}
          </Button>
        )}

        {job.status === 'failed' && (
          <Button
            variant="secondary"
            loading={retryJob.isPending}
            onSelect={() =>
              retryJob.mutate(jobId, {
                onSuccess: (result) => onRetried(result.id),
              })
            }
          >
            {retryJob.isPending ? 'Tentando novamente…' : 'Tentar novamente'}
          </Button>
        )}

        <Button variant="secondary" onSelect={goBack}>
          Voltar
        </Button>
      </div>
    </section>
  )
}
