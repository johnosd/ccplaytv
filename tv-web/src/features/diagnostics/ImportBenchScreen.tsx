import { useCallback, useEffect, useRef, useState } from 'react'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { createSource, listSources, type SourceView } from '../../lib/catalog/sourceRepository'
import { runImport, type ImportRun } from '../../lib/catalog/importRunner'
import type { ImportRunRecord, ImportStep } from '../../lib/catalog/db'

/**
 * **Superfície temporária.** Existe só para a US1 medir, no aparelho, o
 * custo do caminho client-first. É removida na fase Polish — não é tela de
 * produto e não segue o desenho das outras.
 *
 * Ela existe porque a TV **não entrega console ao desenvolvedor**: acesso
 * privilegiado é negado, o log da plataforma volta vazio e a porta de
 * inspeção remota fica fechada (research.md R5). Se a medição não aparecer
 * na tela, a US1 não tem como produzir evidência nenhuma — e SC-014 exige
 * execução observada, nunca estimativa.
 *
 * O que ela mede é **o pipeline que vai ser usado**, não um protótipo
 * parecido (D-008). É por isso que ela chama `runImport`, o mesmo caminho
 * que as telas vão chamar depois.
 */

export interface ImportBenchScreenProps {
  onBack: () => void
}

const STEP_LABELS: Record<ImportStep, string> = {
  fetching: 'Obtendo',
  parsing: 'Interpretando',
  storing: 'Gravando',
  done: 'Concluído',
}

/**
 * Indicador de memória do runtime, quando o aparelho expuser.
 *
 * Ausência é **"não medido"**, jamais zero: relatar 0 MB faria um aparelho
 * que não informa nada parecer um aparelho excelente — exatamente o tipo de
 * número inventado que a constitution proíbe.
 */
function readHeapMb(): number | undefined {
  const memory = (performance as { memory?: { usedJSHeapSize?: number } }).memory
  const used = memory?.usedJSHeapSize
  return typeof used === 'number' ? Math.round(used / (1024 * 1024)) : undefined
}

function formatHeap(measurement: Measurement | undefined, value: number | undefined): string {
  if (!measurement) return '—'
  return value === undefined ? 'não medido' : `${value} MB`
}

/**
 * O que esta tela mede por fora do pipeline: o tempo de ponta a ponta visto
 * por quem está na frente da TV (inclui subir o Worker) e a memória desta
 * thread. O detalhamento por etapa **não** está aqui — vem carimbado de
 * dentro do pipeline, onde as etapas realmente acontecem.
 */
interface Measurement {
  startedAt: number
  /**
   * Instante do último progresso recebido. É o que permite mostrar quanto
   * já passou **sem ler o relógio durante o desenho** — um relógio lido na
   * renderização dá um número diferente a cada redesenho, por motivo
   * nenhum, e aqui o número é evidência.
   */
  lastProgressAt?: number
  finishedAt?: number
  heapStartMb?: number
  heapPeakMb?: number
  ranInWorker?: boolean
}

export function ImportBenchScreen({ onBack }: ImportBenchScreenProps) {
  const containerRef = useRef<HTMLElement>(null)
  useTvKeyNav(containerRef, { onBackField: true, onBack })

  const [sources, setSources] = useState<SourceView[] | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [run, setRun] = useState<ImportRunRecord | undefined>(undefined)
  const [measurement, setMeasurement] = useState<Measurement | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const handleRef = useRef<ImportRun | undefined>(undefined)

  // Formulário de cadastro local (T056): a credencial da pessoa vive hoje
  // só no banco do backend, e o backend nunca a devolve — corretamente. Sem
  // uma forma de informá-la aqui, não há fonte local para medir.
  const [showForm, setShowForm] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [dns, setDns] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [m3uUrl, setM3uUrl] = useState('')

  const refresh = useCallback(async () => {
    setSources(await listSources())
  }, [])

  useEffect(() => {
    // O aviso da regra é falso positivo aqui: `refresh` é assíncrono, então
    // o estado só muda depois da leitura do IndexedDB — que é justamente o
    // "sistema externo" para o qual a regra reserva o uso de efeito.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  function elapsed(from: number | undefined, to: number | undefined): string {
    if (from === undefined || to === undefined) return '—'
    return `${((to - from) / 1000).toFixed(1)} s`
  }

  async function handleMeasure() {
    if (!selectedId || busy) return
    setBusy(true)
    setFailure(undefined)
    setRun(undefined)

    const state: Measurement = {
      startedAt: performance.now(),
      heapStartMb: readHeapMb(),
      heapPeakMb: readHeapMb(),
    }
    setMeasurement({ ...state })

    try {
      const handle = await runImport(selectedId, {
        onProgress: (snapshot) => {
          const heap = readHeapMb()
          if (heap !== undefined) {
            state.heapPeakMb = Math.max(state.heapPeakMb ?? heap, heap)
          }
          state.lastProgressAt = performance.now()
          setRun(snapshot)
          setMeasurement({ ...state })
        },
      })
      handleRef.current = handle
      state.ranInWorker = handle.ranInWorker

      const finished = await handle.completion
      state.finishedAt = performance.now()
      setRun(finished)
      setMeasurement({ ...state })
    } catch (error) {
      // Só o nome do erro: a mensagem crua embute a URL completa, com
      // credencial, e esta tela é lida por cima do ombro e fotografada.
      setFailure(error instanceof Error ? error.name : 'Erro desconhecido')
    } finally {
      handleRef.current = undefined
      setBusy(false)
      void refresh()
    }
  }

  async function handleCreate() {
    setFailure(undefined)
    try {
      const id = await createSource(
        m3uUrl.trim()
          ? { type: 'm3u_url', displayName: displayName || 'Lista por URL', m3uUrl }
          : {
              type: 'provider_credentials',
              displayName: displayName || 'Painel',
              providerDns: dns,
              providerUsername: username,
              providerPassword: password,
            },
      )
      // Some com os campos assim que a fonte existe: credencial digitada
      // não fica pendurada na tela (FR-009).
      setDisplayName('')
      setDns('')
      setUsername('')
      setPassword('')
      setM3uUrl('')
      setShowForm(false)
      setSelectedId(id)
      await refresh()
    } catch (error) {
      setFailure(error instanceof Error ? error.name : 'Erro desconhecido')
    }
  }

  // Enquanto roda, o total é "até o último progresso"; no fim, é o total de
  // verdade. O rótulo diz qual dos dois está na tela, porque confundir os
  // dois números é confundir a medição.
  const running = measurement !== undefined && measurement.finishedAt === undefined
  const totalLabel = measurement
    ? elapsed(measurement.startedAt, measurement.finishedAt ?? measurement.lastProgressAt)
    : '—'

  return (
    <section className="screen bench" aria-labelledby="bench-title" ref={containerRef}>
      <h1 id="bench-title" className="screen-title">
        Diagnóstico de importação
      </h1>
      <p className="screen-subtitle">
        Superfície temporária da medição — não faz parte do app. Selecione uma fonte e pressione
        Medir.
      </p>

      <div className="bench-layout">
        <div className="bench-column">
          <h2 className="live-column-title">Fontes no aparelho</h2>

          {sources === undefined && <p className="screen-subtitle">Lendo o armazenamento local…</p>}

          {sources?.length === 0 && (
            <p className="screen-subtitle">
              Nenhuma fonte guardada neste aparelho ainda. Cadastre uma para medir.
            </p>
          )}

          {sources?.map((source) => (
            <button
              key={source.id}
              type="button"
              className={`bench-source${selectedId === source.id ? ' bench-source-selected' : ''}`}
              // Selecionar é o que escolhe a fonte. Mover o foco não
              // escolhe nada e não consulta nada — é OK que decide.
              onClick={() => setSelectedId(source.id)}
            >
              <span className="bench-source-name">{source.displayName}</span>
              <span className="bench-source-meta">
                {source.type === 'm3u_url' ? 'URL M3U' : 'Provedor'}
                {source.activeGeneration !== undefined && ` · geração ${source.activeGeneration}`}
              </span>
            </button>
          ))}

          {/* Todo estado tem ao menos um focável, inclusive vazio e erro:
              sem isso o controle fica preso e não há como sair da tela. */}
          <button type="button" className="submit-button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Fechar cadastro' : '+ Cadastrar fonte neste aparelho'}
          </button>

          {showForm && (
            <div className="field-group">
              <label>
                <span className="field-label">Nome de exibição</span>
                <input
                  className="field-box"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <label>
                <span className="field-label">URL da lista M3U (deixe vazio para usar provedor)</span>
                <input
                  className="field-box"
                  value={m3uUrl}
                  onChange={(event) => setM3uUrl(event.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Endereço do provedor</span>
                <input
                  className="field-box"
                  value={dns}
                  onChange={(event) => setDns(event.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Usuário</span>
                <input
                  className="field-box"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Senha</span>
                <input
                  className="field-box"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button type="button" className="submit-button" onClick={handleCreate}>
                Salvar fonte
              </button>
            </div>
          )}
        </div>

        <div className="bench-column">
          <h2 className="live-column-title">Medição</h2>

          <div className="bench-actions">
            <button
              type="button"
              className="submit-button"
              onClick={handleMeasure}
              disabled={!selectedId || busy}
            >
              {busy ? 'Medindo…' : 'Medir importação'}
            </button>
            <button
              type="button"
              className="submit-button"
              onClick={() => handleRef.current?.cancel()}
              disabled={!busy}
            >
              Cancelar
            </button>
          </div>

          <dl className="bench-metrics">
            <div>
              <dt>{running ? 'Tempo até o último progresso' : 'Tempo total'}</dt>
              <dd>{totalLabel}</dd>
            </div>
            <div>
              <dt>Etapa atual</dt>
              <dd>{run ? STEP_LABELS[run.step] : '—'}</dd>
            </div>
            {/* Do instante carimbado pelo próprio pipeline, não de quando a
                notícia chegou aqui: o trabalho roda noutra thread, e as duas
                coisas não são a mesma. */}
            {(['fetching', 'parsing', 'storing'] as const).map((step) => (
              <div key={step}>
                <dt>Início de {STEP_LABELS[step].toLowerCase()}</dt>
                <dd>{elapsed(run?.startedAt, run?.stepStartedAt?.[step])}</dd>
              </div>
            ))}
            <div>
              <dt>Entradas lidas</dt>
              <dd>{run?.entriesRead ?? '—'}</dd>
            </div>
            <div>
              <dt>Canais gravados</dt>
              <dd>{run?.channelsStored ?? '—'}</dd>
            </div>
            <div>
              <dt>Descartados por tipo</dt>
              <dd>{run?.discardedByType ?? '—'}</dd>
            </div>
            <div>
              <dt>Entradas inválidas</dt>
              <dd>{run?.invalidCount ?? '—'}</dd>
            </div>
            {/* Três estados diferentes, deliberadamente: "—" é "ainda não
                mediu", "não medido" é "o aparelho não informa", e um número
                é um número. Juntar os dois primeiros faria um aparelho que
                não expõe memória parecer apenas ocioso. */}
            <div>
              <dt>Memória no início</dt>
              <dd>{formatHeap(measurement, measurement?.heapStartMb)}</dd>
            </div>
            <div>
              <dt>Memória no pico</dt>
              <dd>{formatHeap(measurement, measurement?.heapPeakMb)}</dd>
            </div>
            <div>
              <dt>Rodou em Worker</dt>
              {/* Se cair para a thread principal, o controle trava durante a
                  medição — e o número de tempo total deixa de significar o
                  que SC-005 pergunta. Por isso isto aparece na tela. */}
              <dd>
                {measurement?.ranInWorker === undefined
                  ? '—'
                  : measurement.ranInWorker
                    ? 'sim'
                    : 'NÃO (thread principal)'}
              </dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>{run?.status ?? '—'}</dd>
            </div>
            {run?.errorKind && (
              <div>
                <dt>Categoria do erro</dt>
                <dd>{run.errorKind}</dd>
              </div>
            )}
            {run?.truncatedByStorage && (
              <div>
                <dt>Truncado por espaço</dt>
                <dd>sim — a lista não coube inteira</dd>
              </div>
            )}
          </dl>

          {failure && (
            <p className="form-error" role="alert">
              Falhou: {failure}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
