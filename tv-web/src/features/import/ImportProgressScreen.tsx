import { useRef } from 'react'
import { useCancelImportJob, useImportJob, useRetryImportJob } from './importApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'

export interface ImportProgressScreenProps {
  jobId: string
  onRetried: (newJobId: string) => void
  onBack: () => void
}

const STEP_LABELS: Record<string, string> = {
  acquiring: 'Obtendo a lista',
  parsing: 'Lendo entradas',
  classifying: 'Classificando canais, filmes e séries',
  publishing: 'Publicando catálogo',
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
}

export function ImportProgressScreen({ jobId, onRetried, onBack }: ImportProgressScreenProps) {
  const containerRef = useRef<HTMLElement>(null)
  useTvKeyNav(containerRef)
  useRemoteNav({ onBack })

  const { data: job, isLoading, isError } = useImportJob(jobId)
  const cancelJob = useCancelImportJob()
  const retryJob = useRetryImportJob()

  // Carregando e "não existe mais" são estados distintos, e nenhum dos dois
  // pode ficar sem saída: a tela precisa de pelo menos um elemento focável
  // sempre, ou o controle fica preso nela (constitution, "Foco Visível e Sem
  // Becos Sem Saída").
  if (isError || (!isLoading && !job)) {
    return (
      <section className="screen" aria-labelledby="progress-title" ref={containerRef}>
        <h1 id="progress-title" className="screen-title">
          Progresso da importação
        </h1>
        <p className="screen-subtitle">
          Esta importação não está mais registrada no aparelho. Abra a lista na tela inicial para
          sincronizar de novo.
        </p>
        <div className="movie-detail-actions" style={{ marginTop: 32 }}>
          <button className="detail-button" type="button" onClick={onBack}>
            Voltar
          </button>
        </div>
      </section>
    )
  }

  if (!job) {
    return (
      <section className="screen" aria-labelledby="progress-title" ref={containerRef}>
        <h1 id="progress-title" className="screen-title">
          Progresso da importação
        </h1>
        <p className="screen-subtitle">Carregando estado da importação…</p>
        <div className="movie-detail-actions" style={{ marginTop: 32 }}>
          <button className="detail-button" type="button" onClick={onBack}>
            Voltar
          </button>
        </div>
      </section>
    )
  }

  const isRunning = job.status === 'queued' || job.status === 'running'
  const cancelRequested = cancelJob.isSuccess || cancelJob.isPending

  return (
    <section className="screen" aria-labelledby="progress-title" ref={containerRef}>
      <h1 id="progress-title" className="screen-title">
        Progresso da importação
      </h1>

      <p className="screen-subtitle" style={{ marginBottom: 24 }}>
        Status: {STATUS_LABELS[job.status] ?? job.status} — Etapa:{' '}
        {STEP_LABELS[job.current_step] ?? job.current_step}
      </p>

      <ul aria-label="Contadores" className="episode-list" style={{ maxWidth: 480 }}>
        <li className="live-item">Entradas lidas: {job.counts.entries_read}</li>
        <li className="live-item">Itens gravados: {job.counts.channels}</li>
        <li className="live-item">
          Descartados (tipo não reconhecido): {job.counts.discarded_by_type}
        </li>
        <li className="live-item">Inválidos: {job.counts.invalid}</li>
      </ul>

      {job.status === 'failed' && job.error_kind && (
        <div className="form-error" style={{ marginTop: 24 }} aria-label="Erro">
          {ERROR_MESSAGES[job.error_kind] ?? 'Falha desconhecida'}
        </div>
      )}

      {job.warnings.length > 0 && (
        <ul aria-label="Avisos" className="episode-list" style={{ marginTop: 24, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          {job.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <div className="movie-detail-actions" style={{ marginTop: 32 }}>
        {isRunning && (
          <button
            className="detail-button"
            type="button"
            disabled={cancelRequested}
            onClick={() => cancelJob.mutate(jobId)}
          >
            {cancelRequested ? 'Cancelamento solicitado…' : 'Cancelar'}
          </button>
        )}

        {job.status === 'failed' && (
          <button
            className="detail-button"
            type="button"
            disabled={retryJob.isPending}
            onClick={() =>
              retryJob.mutate(jobId, {
                onSuccess: (result) => onRetried(result.id),
              })
            }
          >
            {retryJob.isPending ? 'Tentando novamente…' : 'Tentar novamente'}
          </button>
        )}

        <button className="detail-button" type="button" onClick={onBack}>
          Voltar
        </button>
      </div>
    </section>
  )
}
