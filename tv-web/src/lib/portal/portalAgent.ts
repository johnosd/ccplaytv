/**
 * Agente do portal sob demanda (feature 071, D-002/D-003): nenhum timer, nenhum ciclo, nenhuma consulta ao abrir.
 * Só duas portas de entrada falam com o serviço: `refresh(scope)` (botão Atualizar) e o envio imediato de uma
 * exclusão acabada de criar pela pessoa. Serviços e importações locais permanecem colaboradores externos.
 */
import { liveQuery } from 'dexie'
import type { CatalogDb } from '../catalog/db'
import { portalTables } from './portalTables'
import { PortalRequestError } from './portalClient'
import { isQuotaError, StorageFullError } from '../catalog/catalogRepository'

/** Pausa entre dois Atualizar do mesmo escopo; vale também depois de uma falha (limite do serviço). */
const REFRESH_PAUSE_MS = 10_000

/** 072: 'backup' = só o passo de backup (botão Fazer backup agora); 'lists' também faz backup no fim. */
export type RefreshScope = 'lists' | 'license' | 'backup' | 'tmdb'

/** Resultado de um Atualizar: código não secreto em falha. */
export type CycleOutcome = { ok: true } | { ok: false; code: string }

export interface PortalAgentPorts {
  /** Só retorna após ACKs ou lança; pendência fica durável na outbox. */
  flushDeletions(signal: AbortSignal): Promise<void>
  /** 071/FR-008: envia a fila de listas da TV ao site (ausente = nada a enviar). */
  flushUploads?(signal: AbortSignal): Promise<void>
  pull(signal: AbortSignal): Promise<void>
  publishSnapshot(signal: AbortSignal): Promise<void>
  refreshLicense?(signal: AbortSignal): Promise<void>
  /** 072: passo de backup de uso (ausente = nada a fazer); decide sozinho entre subir, oferecer ou pular. */
  backup?(signal: AbortSignal): Promise<void>
  /** 073/D-008: envia a cópia do código de recuperação quando a versão mudou; falha não derruba o Atualizar (D-009). */
  escrowRecoveryCode?(signal: AbortSignal): Promise<unknown>
  /** 077/ADR-020: aplica a chave TMDB pedida pelo portal. Roda entre o pull e o snapshot; falha não derruba o snapshot. */
  applyIntegrations?(signal: AbortSignal): Promise<unknown>
  onError?(code: string): void
}

export class PortalAgent {
  private active = false
  private visible = true
  private online = true
  private running?: AbortController
  private references = 0
  private attachedAt = 0
  // Exclusão local criada agora pela pessoa pede envio imediato (flushDeletions + snapshot; sem pull/licença).
  private deletionRequested = false
  private deletionQueued = false
  private lastRefreshAt: Partial<Record<RefreshScope, number>> = {}
  private queue: Promise<unknown> = Promise.resolve()
  private outbox?: { unsubscribe(): void }

  private readonly database: CatalogDb
  private readonly ports: PortalAgentPorts
  private readonly now: () => number

  /** `_random` é aceito por compatibilidade de assinatura: sem retry automático não há jitter a sortear. */
  constructor(database: CatalogDb, ports: PortalAgentPorts, now = Date.now, _random: () => number = Math.random) {
    this.database = database
    this.ports = ports
    this.now = now
  }

  /** `_quick` é aceito e ignorado (D-002): não existe mais consulta periódica rápida. */
  attach(_quick?: boolean) {
    this.references++
    if (!this.active) this.attachedAt = this.now()
    this.active = true
    this.watchOutbox()
    return () => {
      this.references--
      if (this.references === 0) {
        this.active = false
        this.running?.abort()
        this.outbox?.unsubscribe()
        this.outbox = undefined
      }
    }
  }

  /**
   * Observa a outbox durável só para reagir a uma exclusão NOVA (ação da pessoa no ato): linha criada depois de o
   * agente anexar. Pendência herdada de offline/reinício fica para o próximo Atualizar e nunca dispara rede na
   * abertura (D-011).
   */
  private watchOutbox() {
    if (this.outbox) return
    const deletes = portalTables(this.database).deletes
    const since = this.attachedAt
    let previous = 0
    this.outbox = liveQuery(() => deletes.filter(row => row.serverAckAt === undefined && row.createdAt >= since).count()).subscribe({
      next: pending => {
        const grew = pending > previous
        previous = pending
        if (grew) this.requestDeletionFlush()
      },
      error: () => this.ports.onError?.('local_storage_error'),
    })
  }

  private requestDeletionFlush() {
    // Offline/oculto: a pendência segue na outbox e sobe no próximo Atualizar (FR-009).
    if (!this.active || !this.visible || !this.online) return
    // Um envio já na fila lê a outbox só quando começa: cobre esta exclusão também.
    if (this.deletionQueued) return
    this.deletionRequested = true
    this.pumpDeletionFlush()
  }

  /** No máximo um envio por vez, depois de qualquer Atualizar em andamento. */
  private pumpDeletionFlush() {
    if (!this.deletionRequested || !this.active || !this.visible || !this.online || this.running || this.deletionQueued) return
    this.deletionRequested = false
    this.deletionQueued = true
    void this.enqueue(async () => {
      this.deletionQueued = false
      // Pedido repetido (ação + observação da outbox): se o envio anterior já levou tudo, não há o que enviar.
      const waiting = await portalTables(this.database).deletes.filter(row => row.serverAckAt === undefined).count()
      return waiting ? this.execute(['deletions', 'snapshot']) : { ok: true as const }
    }).catch(() => this.ports.onError?.('local_storage_error'))
  }

  /**
   * 071/FR-009: a pessoa acabou de excluir uma lista — pede o envio no ato, direto da ação (não só da observação da
   * outbox). Os dois caminhos se juntam: um envio por vez, sem snapshot duplicado.
   */
  deletedNow() { this.requestDeletionFlush() }

  /**
   * 071/FR-008: a pessoa acabou de criar/editar uma lista — uma tentativa de envio (+ snapshot) no ato. Falha mantém a
   * fila (sourceUploads) para o próximo Atualizar; offline/oculto não tenta e nada é reagendado.
   */
  uploadNow() {
    if (!this.active || !this.visible || !this.online) return
    void this.enqueue(() => this.execute(['uploads', 'snapshot'])).catch(() => this.ports.onError?.('local_storage_error'))
  }

  /** 072: Desvincular — aborta o que corre e esquece pausas e pedidos pendentes; nada é reagendado. */
  reset() {
    this.running?.abort()
    this.lastRefreshAt = {}
    this.deletionRequested = false
  }

  /** Suspender/ficar offline aborta o que estiver em andamento; nada é reagendado ao voltar. */
  get attached() { return this.active }

  lifecycle(visible: boolean, online: boolean) {
    this.visible = visible
    this.online = online
    if (!visible || !online) this.running?.abort()
  }

  /**
   * 071/D-003: Atualizar. 'lists' = exclusões → envios → pull → snapshot; 'license' = só a licença. Repetir dentro da
   * pausa de 10 s do mesmo escopo devolve { ok: false, code: 'wait' } sem requisição e sem dormir.
   */
  refresh(scope: RefreshScope): Promise<CycleOutcome> {
    return this.enqueue(async () => {
      if (!this.active || !this.visible || !this.online) return { ok: false as const, code: 'offline' }
      const last = this.lastRefreshAt[scope]
      if (last !== undefined && this.now() < last + REFRESH_PAUSE_MS) return { ok: false as const, code: 'wait' }
      this.lastRefreshAt[scope] = this.now()
      return this.execute(scope === 'lists' ? ['deletions', 'uploads', 'escrow', 'pull', 'integrations', 'snapshot', 'backup']
        : scope === 'backup' ? ['backup']
        // 077: Atualizar da aba Integrações — só aplica a chave TMDB pedida pelo portal e publica o estado no snapshot.
        : scope === 'tmdb' ? ['integrations', 'snapshot'] : ['escrow', 'license'])
    })
  }

  /** Execução serial: um Atualizar espera o anterior terminar e só então avalia a pausa. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(job, job)
    this.queue = result.catch(() => undefined)
    return result
  }

  private async execute(steps: ('deletions' | 'uploads' | 'escrow' | 'pull' | 'integrations' | 'snapshot' | 'license' | 'backup')[]): Promise<CycleOutcome> {
    const controller = new AbortController()
    this.running = controller
    const { signal } = controller
    try {
      for (const step of steps) {
        signal.throwIfAborted()
        if (step === 'deletions') await this.ports.flushDeletions(signal)
        else if (step === 'uploads') await this.ports.flushUploads?.(signal)
        else if (step === 'pull') await this.ports.pull(signal)
        else if (step === 'integrations') {
          // 077: a chave TMDB é opcional para o resto do Atualizar; o snapshot (e o que ele informa) sai mesmo se falhar.
          try { await this.ports.applyIntegrations?.(signal) } catch {
            signal.throwIfAborted()
            this.ports.onError?.('integrations_failed')
          }
        }
        else if (step === 'snapshot') await this.ports.publishSnapshot(signal)
        else if (step === 'backup') await this.ports.backup?.(signal)
        else if (step === 'escrow') {
          // D-009: a pessoa pediu licença/listas; a cópia do código tenta de novo no próximo Atualizar.
          try { await this.ports.escrowRecoveryCode?.(signal) } catch {
            signal.throwIfAborted()
            this.ports.onError?.('escrow_failed')
          }
        }
        else await this.ports.refreshLicense?.(signal)
      }
      signal.throwIfAborted()
      if (steps.includes('pull')) await this.recordSuccess()
      return { ok: true }
    } catch (error) {
      if (signal.aborted) return { ok: false, code: 'aborted' }
      // Falta de espaço no aparelho não é "erro de sincronização": a tela mostra o limite de armazenamento do app.
      const code = error instanceof PortalRequestError ? error.code
        : error instanceof StorageFullError || isQuotaError(error) ? 'storage_full' : 'sync_error'
      this.ports.onError?.(code)
      return { ok: false, code }
    } finally {
      this.running = undefined
      this.pumpDeletionFlush()
    }
  }

  /** Diagnóstico apenas: o instante do último Atualizar de listas concluído. Nada agenda a partir dele. */
  private async recordSuccess() {
    const table = portalTables(this.database).device
    const completedAt = this.now()
    await this.database.transaction('rw', table, async () => {
      const current = await table.get('device')
      if (current) await table.put({ ...current, lastSuccessfulSync: completedAt })
    })
  }
}

// Mesmo banco/portas compartilham o agente; dois mounts não criam dois agentes.
const agents = new WeakMap<CatalogDb, { ports: PortalAgentPorts; agent: PortalAgent }>()
export function sharedPortalAgent(database: CatalogDb, ports: PortalAgentPorts) {
  const existing = agents.get(database)
  if (existing) {
    if (existing.ports === ports) return existing.agent
    // Portas novas só substituem um agente que ninguém usa; com o agente em uso seria uma troca silenciosa.
    if (existing.agent.attached) throw new Error('portal_agent_ports_changed')
  }
  const agent = new PortalAgent(database, ports)
  agents.set(database, { ports, agent })
  return agent
}
