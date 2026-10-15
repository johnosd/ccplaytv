import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { useEffect, useRef } from 'react'
import { useCancelImportJob, useEpgSyncing, useImportJob, useRetryImportJob, useSources } from './importApi'
import { guideRow, isGuideSettled, sectionRows } from './importSections'
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

const STEP_LABEL_KEYS: Record<string, MessageKey> = {
  acquiring: 'import.step.acquiring',
  parsing: 'import.step.parsing',
  classifying: 'import.step.classifying',
  publishing: 'import.step.publishing',
  done: 'import.step.done',
}

/**
 * Fonte de provedor pelo protocolo JSON grava só estrutura e conclui em
 * segundos (feature 010) — as etapas falam de categoria, não de item, e a
 * tela precisa dizer a verdade sobre o que está acontecendo (FR-013).
 */
const CATEGORY_STEP_LABEL_KEYS: Record<string, MessageKey> = {
  acquiring: 'import.catStep.acquiring',
  parsing: 'import.catStep.parsing',
  classifying: 'import.catStep.classifying',
  publishing: 'import.catStep.publishing',
  done: 'import.step.done',
}

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  queued: 'import.statusName.queued',
  running: 'import.statusName.running',
  completed: 'import.statusName.completed',
  completed_with_warnings: 'import.statusName.completed_with_warnings',
  failed: 'import.statusName.failed',
  cancelled: 'import.statusName.cancelled',
}

/**
 * Código discreto da tabela de erros (feature 042, FR-016): endereço inválido,
 * falha de conexão, autenticação recusada e resposta incompatível têm códigos
 * próprios. Nunca o erro cru (que embute a URL com a credencial).
 */
const ERROR_CODES: Record<string, string> = {
  invalid_address: 'SRC-001',
  invalid_credentials: 'SRC-401',
  subscription_expired: 'SRC-402',
  direct_connection_refused: 'NET-02',
  network_failure: 'NET-02',
  rate_limited: 'API-429',
  invalid_playlist: 'SRC-422',
  empty_playlist: 'SRC-422',
  hls_manifest: 'SRC-422',
  storage_full: 'STO-01',
}

const ERROR_MESSAGE_KEYS: Record<string, MessageKey> = {
  invalid_credentials: 'import.error.invalid_credentials',
  subscription_expired: 'import.error.subscription_expired',
  direct_connection_refused: 'import.error.direct_connection_refused',
  network_failure: 'import.error.network_failure',
  rate_limited: 'import.error.rate_limited',
  invalid_address: 'import.error.invalid_address',
  invalid_playlist: 'import.error.invalid_playlist',
  empty_playlist: 'import.error.empty_playlist',
  hls_manifest: 'import.error.hls_manifest',
  interrupted: 'import.error.interrupted',
  storage_full: 'import.error.storage_full',
}

/** Avisos que o importador grava em português → chave do catálogo (a tela mostra no idioma do app; texto novo passa como veio). */
const WARNING_KEYS: Record<string, MessageKey> = {
  'A lista não coube inteira no aparelho.': 'import.warn.truncated',
  'Entradas inválidas foram ignoradas.': 'import.warn.invalid',
  'Entradas de tipo não reconhecido ficaram de fora.': 'import.warn.discarded',
  'O provedor não respondeu à lista de filmes.': 'import.warn.movie',
  'O provedor não respondeu à lista de séries.': 'import.warn.series',
}

/**
 * Progresso da importação no visual V14 (feature 023, US4). O DS não desenha
 * esta tela — é composta com os componentes da feature 022 (`Button`,
 * `Spinner`). O que ela mostra continua só o que o importador informa:
 * etapas e contagens reais, nunca um percentual estimado (FR-037).
 */
export function ImportProgressScreen({ jobId, onRetried, onBack, onOpenSource }: ImportProgressScreenProps) {
  const t = useT()
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

  // Feature 038 (US3): a linha "Guia" vem do estado do EPG da fonte, que
  // sincroniza depois da importação, em segundo plano.
  const sourceId = job?.source_id ?? null
  const epg = useSources().data?.sources.find((source) => source.id === sourceId)?.epg
  const epgSyncing = useEpgSyncing(sourceId)
  const guide = guideRow(
    {
      importSucceeded: isDone,
      epg,
      syncing: epgSyncing,
      runStartedAt: job ? Date.parse(job.created_at) : 0,
    },
    t,
  )
  // D-012: "Abrir lista" já aparece com a estrutura pronta; o foco vai para ele
  // quando o guia também se resolve (FR-019).
  const settled = isDone && isGuideSettled(guide)
  useEffect(() => {
    if (settled) openListRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [settled])

  // Carregando e "não existe mais" são estados distintos, e nenhum dos dois
  // pode ficar sem saída: a tela precisa de pelo menos um elemento focável
  // sempre, ou o controle fica preso nela (constitution, "Foco Visível e Sem
  // Becos Sem Saída").
  if (isError || (!isLoading && !job)) {
    return (
      <section className="screen onboarding" aria-labelledby="progress-title" ref={containerRef}>
        <OnboardingBrand />
        <p className="onboarding-kicker">{t('import.kicker')}</p>
        <h1 id="progress-title" className="onboarding-title">
          {t('import.title')}
        </h1>
        <p className="onboarding-subtitle">{t('import.missing')}</p>
        <div className="progress-actions">
          <Button variant="secondary" onSelect={goBack}>
            {t('common.back')}
          </Button>
        </div>
      </section>
    )
  }

  if (!job) {
    return (
      <section className="screen onboarding" aria-labelledby="progress-title" ref={containerRef}>
        <OnboardingBrand />
        <p className="onboarding-kicker">{t('import.kicker')}</p>
        <h1 id="progress-title" className="onboarding-title">
          {t('import.title')}
        </h1>
        <div className="progress-status-row">
          <Spinner size={32} />
          <p className="progress-status">{t('import.loading')}</p>
        </div>
        <div className="progress-actions">
          <Button variant="secondary" onSelect={goBack}>
            {t('common.back')}
          </Button>
        </div>
      </section>
    )
  }

  const isRunning = job.status === 'queued' || job.status === 'running'
  const cancelRequested = cancelJob.isSuccess || cancelJob.isPending
  const isCategories = job.counts.unit === 'categories'
  const stepLabelKeys = isCategories ? CATEGORY_STEP_LABEL_KEYS : STEP_LABEL_KEYS
  const stepKey = stepLabelKeys[job.current_step]
  const statusKey = STATUS_LABEL_KEYS[job.status]

  return (
    <section className="screen onboarding" aria-labelledby="progress-title" ref={containerRef}>
      <OnboardingBrand />
      <p className="onboarding-kicker">{t('import.kicker')}</p>
      <h1 id="progress-title" className="onboarding-title">
        {t('import.title')}
      </h1>

      <div className="progress-status-row">
        {/* Indicador indeterminado: sem denominador confiável, nunca um
            percentual inventado (constitution, "Progresso e Capacidades São
            Reais"). */}
        {isRunning && <Spinner size={32} />}
        <p className="progress-status">
          {t('import.status', {
            status: statusKey ? t(statusKey) : job.status,
            step: stepKey ? t(stepKey) : job.current_step,
          })}
        </p>
      </div>

      {/* Feature 038 (FR-015..FR-017): uma linha por parte, com estado e
          contagem reais — texto, nunca só cor, nunca percentual. */}
      <ul aria-label={t('import.sectionsAria')} className="progress-sections">
        {[...sectionRows(job.sections, t), guide].map((row) => (
          <li key={row.key} className="progress-section" data-state={row.state}>
            <span className="progress-section-label">{row.label}</span>
            <span className="progress-section-state">{row.text}</span>
          </li>
        ))}
      </ul>

      {settled && (
        <p className="progress-background-note">{t('import.background')}</p>
      )}

      <ul aria-label={t('import.countersAria')} className="progress-counters">
        <li className="progress-counter">
          {isCategories ? t('import.counter.categoriesRead') : t('import.counter.entriesRead')}: {job.counts.entries_read}
        </li>
        <li className="progress-counter">
          {isCategories ? t('import.counter.categoriesSaved') : t('import.counter.itemsSaved')}: {job.counts.channels}
        </li>
        {/* Descarte por tipo e invalidez não têm sentido para uma estrutura
            de categorias — nenhuma categoria é "descartada por tipo" ou
            "inválida" neste caminho, então as linhas ficariam sempre em
            zero, sem informar nada. */}
        {!isCategories && (
          <>
            <li className="progress-counter">
              {t('import.counter.discarded')}: {job.counts.discarded_by_type}
            </li>
            <li className="progress-counter">{t('import.counter.invalid')}: {job.counts.invalid}</li>
          </>
        )}
      </ul>

      {job.status === 'failed' && job.error_kind && (
        <div className="progress-error" aria-label={t('import.errorAria')}>
          {ERROR_MESSAGE_KEYS[job.error_kind] ? t(ERROR_MESSAGE_KEYS[job.error_kind]) : t('import.error.unknown')}
          {ERROR_CODES[job.error_kind] && (
            <>
              {' '}
              <span data-testid="import-error-code" className="error-state-code">
                {ERROR_CODES[job.error_kind]}
              </span>
            </>
          )}
        </div>
      )}

      {job.warnings.length > 0 && (
        <ul aria-label={t('import.warningsAria')} className="progress-warnings">
          {job.warnings.map((warning) => (
            <li key={warning}>{WARNING_KEYS[warning] ? t(WARNING_KEYS[warning]) : warning}</li>
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
              {t('import.openList')}
            </Button>
          </div>
        )}

        {isRunning && (
          <Button variant="secondary" loading={cancelRequested} onSelect={() => cancelJob.mutate(jobId)}>
            {cancelRequested ? t('import.cancelRequested') : t('common.cancel')}
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
            {retryJob.isPending ? t('import.retrying') : t('import.retry')}
          </Button>
        )}

        <Button variant="secondary" onSelect={goBack}>
          {t('common.back')}
        </Button>
      </div>
    </section>
  )
}
