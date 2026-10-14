/** Um ciclo sem overlap; serviços e importações locais permanecem colaboradores externos. */
import { liveQuery } from 'dexie'
import type { CatalogDb } from '../catalog/db'
import { portalTables } from './portalTables'
import { PortalRequestError } from './portalClient'

const DAY = 86_400_000
const RETRIES = [60_000, 300_000, 900_000]

/** Resultado de um ciclo pedido explicitamente (070/D-011, Recarregar): código não secreto em falha. */
export type CycleOutcome = { ok: true } | { ok: false; code: string }

export interface PortalAgentPorts {
  /** Só retorna após ACKs ou lança; pendência fica durável na outbox. */
  flushDeletions(signal: AbortSignal): Promise<void>
  /** 071/FR-008: envia a fila de listas da TV ao site (ausente = nada a enviar). */
  flushUploads?(signal: AbortSignal): Promise<void>
  pull(signal: AbortSignal): Promise<void>
  publishSnapshot(signal: AbortSignal): Promise<void>
  refreshLicense?(signal: AbortSignal): Promise<void>
  onError?(code: string): void
}

export class PortalAgent {
  private timer?: ReturnType<typeof setTimeout>
  private active = false
  private quick = false
  private visible = true
  private online = true
  private running?: AbortController
  private quickDueAt = 0
  private quickFailures = 0
  private generation = 0
  private references = 0
  private quickReferences = 0
  // Exclusão local pendente na outbox pede envio imediato (flushDeletions + snapshot; sem pull/licença/polling).
  private deletionRequested = false
  private lastCompletedAt = Number.NEGATIVE_INFINITY
  private outbox?: { unsubscribe(): void }

  private readonly database: CatalogDb
  private readonly ports: PortalAgentPorts
  private readonly now: () => number
  private readonly random: () => number

  constructor(database: CatalogDb, ports: PortalAgentPorts, now = Date.now, random = Math.random) {
    this.database = database
    this.ports = ports
    this.now = now
    this.random = random
  }

  attach(quick: boolean) {
    this.references++
    if (quick) this.quickReferences++
    this.active = true
    this.setQuick(this.quickReferences > 0)
    this.watchOutbox()
    this.reconcile()
    this.pumpDeletionFlush()
    return () => {
      this.references--
      if (quick) this.quickReferences--
      this.setQuick(this.quickReferences > 0)
      if (this.references === 0) {
        this.active = false
        this.generation++
        this.clearTimer()
        this.running?.abort()
        this.outbox?.unsubscribe()
        this.outbox = undefined
      }
    }
  }

  /** Observa a outbox durável: nova pendência (ou pendência herdada de offline/reinício) dispara o envio. */
  private watchOutbox() {
    if (this.outbox) return
    const deletes = portalTables(this.database).deletes
    this.outbox = liveQuery(() => deletes.filter(row => row.serverAckAt === undefined).count()).subscribe({
      next: pending => { if (pending > 0) this.requestDeletionFlush() },
      error: () => this.ports.onError?.('local_storage_error'),
    })
  }

  private requestDeletionFlush() {
    this.deletionRequested = true
    this.pumpDeletionFlush()
  }

  /** Executa no máximo um envio por vez, depois de qualquer ciclo em andamento e só com app visível/online. */
  private pumpDeletionFlush() {
    if (!this.deletionRequested || !this.active || !this.visible || !this.online || this.running) return
    this.deletionRequested = false
    this.guardedRun(true)
  }

  lifecycle(visible: boolean, online: boolean) {
    const resumed = (!this.visible && visible) || (!this.online && online)
    this.visible = visible
    this.online = online
    this.generation++
    this.clearTimer()
    if (!visible || !online) this.running?.abort()
    else {
      if (resumed && this.quick) this.quickDueAt = this.now()
      this.reconcile()
      this.pumpDeletionFlush()
    }
  }

  private setQuick(value: boolean) {
    if (value === this.quick) return
    this.quick = value
    this.generation++
    this.clearTimer()
    if (value) { this.quickDueAt = this.now(); this.quickFailures = 0 }
    // Sair da tela rápida não cancela commit local; impede a próxima consulta rápida.
  }

  private clearTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private reconcile() {
    void this.schedule().catch(() => {
      this.ports.onError?.('local_storage_error')
      // Não fazer loop automático quando nem o deadline pode ser persistido/lido.
    })
  }

  private async schedule() {
    this.clearTimer()
    const generation = ++this.generation
    if (!this.active || !this.visible || !this.online || this.running) return
    const device = await portalTables(this.database).device.get('device')
    if (!device || generation !== this.generation || this.running) return
    const dueAt = this.quick ? this.quickDueAt : device.syncRetry?.dueAt ?? device.nextSyncAt
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (generation !== this.generation) return
      // Prazo absoluto também funciona quando standby não emite visibilitychange.
      this.reconcileRun()
    }, Math.min(2_147_483_647, Math.max(0, dueAt - this.now())))
  }

  private reconcileRun() {
    this.guardedRun(false)
  }

  private guardedRun(deletionsOnly: boolean) {
    void this.run(deletionsOnly).catch(() => {
      this.active = false
      this.generation++
      this.clearTimer()
      this.ports.onError?.('local_storage_error')
    })
  }

  /**
   * 070/D-011 "Recarregar": um ciclo completo agora, sem sobrepor o que estiver rodando e sem bater no
   * limite de pull do servidor (1 a cada 10 s por TV). Não liga polling: o agendamento normal continua.
   */
  async syncNow(): Promise<CycleOutcome> {
    if (!this.active || !this.visible || !this.online) return { ok: false, code: 'offline' }
    for (let tries = 0; this.running && tries < 150; tries++) await new Promise(resolve => setTimeout(resolve, 200))
    const wait = this.lastCompletedAt + 10_200 - this.now()
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    return this.run(false, true)
  }

  /**
   * 071/D-003: Atualizar. 'lists' = exclusões → envios → pull → snapshot; 'license' = só a licença. Pausa de 10 s por
   * escopo recusa com { ok: false, code: 'wait' } sem requisição. STUB do sdd-plan — implementar na T006.
   */
  async refresh(_scope: 'lists' | 'license'): Promise<CycleOutcome> {
    throw new Error('not implemented')
  }

  /** `deletionsOnly`: envio imediato da outbox + snapshot; não é ciclo (não adia o prazo de 24 h nem faz pull). */
  private async run(deletionsOnly = false, forced = false): Promise<CycleOutcome> {
    if (!this.active || !this.visible || !this.online || this.running) return { ok: false, code: 'busy' }
    const tables = portalTables(this.database)
    const before = await tables.device.get('device')
    if (!before || this.running || !this.active || !this.visible || !this.online) return { ok: false, code: 'busy' }
    const now = this.now()
    const quick = this.quick
    const dueAt = quick ? this.quickDueAt : before.syncRetry?.dueAt ?? before.nextSyncAt
    if (!deletionsOnly && !forced && now < dueAt) { this.reconcile(); return { ok: false, code: 'not_due' } }
    const controller = new AbortController()
    this.running = controller
    try {
      if (deletionsOnly) {
        await this.ports.flushDeletions(controller.signal)
        controller.signal.throwIfAborted()
        // Sem snapshot novo o portal continuaria listando a lista excluída ("Somente na TV") até o próximo ciclo.
        await this.ports.publishSnapshot(controller.signal)
        return { ok: true }
      }
      await this.ports.refreshLicense?.(controller.signal)
      controller.signal.throwIfAborted()
      await this.ports.flushDeletions(controller.signal)
      controller.signal.throwIfAborted()
      await this.ports.pull(controller.signal)
      controller.signal.throwIfAborted()
      await this.ports.publishSnapshot(controller.signal)
      controller.signal.throwIfAborted()
      const completedAt = this.now()
      await this.database.transaction('rw', tables.device, async () => {
        const current = await tables.device.get('device')
        if (current?.deviceId !== before.deviceId || current.authEpoch !== before.authEpoch ||
            current.recoveryEpoch !== before.recoveryEpoch) return
        await tables.device.put({ ...current, lastSuccessfulSync: completedAt,
          nextSyncAt: completedAt + DAY, syncRetry: undefined })
      })
      this.quickFailures = 0
      this.quickDueAt = completedAt + 10_000
      this.lastCompletedAt = completedAt
      return { ok: true }
    } catch (error) {
      const code = error instanceof PortalRequestError ? error.code : 'sync_error'
      if (!controller.signal.aborted) {
        const failedAt = this.now()
        const retryAfter = error instanceof PortalRequestError ? error.retryAfterMs : 0
        this.ports.onError?.(code)
        if (quick) {
          this.quickFailures++
          const base = Math.min(60_000, 10_000 * 2 ** Math.min(this.quickFailures - 1, 3))
          this.quickDueAt = failedAt + Math.max(retryAfter, Math.min(60_000, base * (1 + this.random() * 0.1)))
        } else {
          await this.database.transaction('rw', tables.device, async () => {
            const current = await tables.device.get('device')
            if (current?.deviceId !== before.deviceId || current.authEpoch !== before.authEpoch ||
                current.recoveryEpoch !== before.recoveryEpoch) return
            const attempt = current.syncRetry?.attempt ?? 0
            if (attempt >= RETRIES.length) {
              await tables.device.put({ ...current, nextSyncAt: failedAt + Math.max(DAY, retryAfter), syncRetry: undefined })
            } else {
              await tables.device.put({ ...current, syncRetry: { attempt: attempt + 1,
                dueAt: failedAt + Math.max(retryAfter, RETRIES[attempt] * (1 + this.random() * 0.1)) } })
            }
          })
        }
      }
      return { ok: false, code: controller.signal.aborted ? 'aborted' : code }
    } finally {
      this.running = undefined
      this.reconcile()
      this.pumpDeletionFlush()
    }
  }
}

// Mesmo banco/portas compartilham mutex; dois mounts não criam dois agentes.
const agents = new WeakMap<CatalogDb, { ports: PortalAgentPorts; agent: PortalAgent }>()
export function sharedPortalAgent(database: CatalogDb, ports: PortalAgentPorts) {
  const existing = agents.get(database)
  if (existing) {
    if (existing.ports !== ports) throw new Error('portal_agent_ports_changed')
    return existing.agent
  }
  const agent = new PortalAgent(database, ports)
  agents.set(database, { ports, agent })
  return agent
}
