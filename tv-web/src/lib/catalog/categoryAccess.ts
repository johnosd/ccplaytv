/**
 * Acesso às categorias da lista (feature 066): o que está escondido, o que está
 * bloqueado e o desbloqueio da sessão. Regras em
 * `sdd/specs/066-categorias-controle-parental/logic/acesso-categorias.md`.
 *
 * O estado é calculado na leitura (D-001): preferência salva + PIN + sessão +
 * nome adulto. Nada daqui é memorizado entre leituras — os caches de `lib`
 * guardam o dado bruto e o filtro vem depois deles (D-003).
 */

import { db, type CatalogDb, type CatalogRecord, type CategoryKind, type CategoryRecord } from './db'
import { listCategories, type CatalogCategory } from './repository/categories'
import { activeGenerationOf } from './repository/shared'
import { categoryMatchKey } from './structureDiff'
import { categoryPreferences, parentalPin, type CategoryPreferenceRecord } from './parentalTables'
import { verifyPin } from '../parental/pin'

/** A categoria como as telas a veem: só as não escondidas, com o cadeado efetivo agora. */
export interface VisibleCategory extends CatalogCategory {
  /** Bloqueada e ainda não desbloqueada nesta sessão. */
  locked: boolean
  /** Escondidas de `order` menor na mesma seção — só para o número do canal não mudar (D-012). */
  hiddenBefore: CatalogCategory[]
}

/** Identidade estável de uma categoria de uma lista (mesma chave de `structureDiff.categoryMatchKey`). */
export interface CategoryRef {
  sourceId: string
  kind: CategoryKind
  providerCategoryId?: string
  name?: string
}

export interface CategoryPreferencePatch {
  hidden?: boolean
  locked?: boolean
  /** A pessoa recusou a sugestão "adulta" desta categoria (FR-024). */
  declinedSuggestion?: boolean
}

/** Retrato do acesso de uma lista: o que as leituras devem deixar de fora agora. */
export interface CategoryAccess {
  /** Ids locais (geração ativa) escondidos ou bloqueados sem desbloqueio. */
  excluded: ReadonlySet<number>
  /** `true` quando o registro pertence a uma categoria excluída (por `categoryId` ou, em linha antiga, por `kind`+`groupOrder`). */
  isExcludedRecord: (record: Pick<CatalogRecord, 'kind' | 'categoryId' | 'groupOrder'>) => boolean
}

/** Lista desbloqueada nesta sessão — só memória (D-004). */
let unlockedSourceId: string | null = null
const listeners = new Set<() => void>()

/** Avisa quem desenha (reset das consultas, D-005). Usado também por `lib/parental/pin.ts`. */
export function notifyCategoryAccessChanged(): void {
  for (const listener of listeners) listener()
}

/** Avisa qualquer mudança de acesso (preferência, PIN, desbloqueio, rebloqueio). */
export function subscribeCategoryAccess(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Chave da preferência no IndexedDB. */
export function preferenceKey(ref: CategoryRef): [string, CategoryKind, string] {
  return [ref.sourceId, ref.kind, categoryMatchKey(ref.providerCategoryId, ref.name)]
}

/** Nome declarado pela lista parece adulto (FR-023). Regra completa na Fase 5 (T029). */
export function isAdultCategoryName(_name: string | undefined): boolean {
  return false
}

interface Rule {
  pinActive: boolean
  unlocked: boolean
  prefs: Map<string, CategoryPreferenceRecord>
}

const prefMapKey = (kind: CategoryKind, matchKey: string) => `${kind}|${matchKey}`

function preferenceOf(rule: Rule, category: Pick<CategoryRecord, 'kind' | 'providerCategoryId' | 'name'>) {
  return rule.prefs.get(prefMapKey(category.kind, categoryMatchKey(category.providerCategoryId, category.name)))
}

/** Bloqueio salvo (`logic/acesso-categorias.md` §1), sem olhar a sessão. */
function savedLock(rule: Rule, category: Pick<CategoryRecord, 'kind' | 'providerCategoryId' | 'name'>): boolean {
  if (!rule.pinActive) return false
  const pref = preferenceOf(rule, category)
  if (pref?.locked !== undefined) return pref.locked
  return pref?.declinedSuggestion !== true && isAdultCategoryName(category.name)
}

async function loadRule(sourceId: string, database: CatalogDb): Promise<Rule> {
  const [pin, prefs] = await Promise.all([
    parentalPin(database).get('pin'),
    categoryPreferences(database).where('sourceId').equals(sourceId).toArray(),
  ])
  return {
    pinActive: pin !== undefined,
    unlocked: unlockedSourceId === sourceId,
    prefs: new Map(prefs.map((pref) => [prefMapKey(pref.kind, pref.matchKey), pref])),
  }
}

/** Grava a preferência de uma categoria (FR-004) e avisa os ouvintes. Campo ausente no `patch` fica como estava. */
export async function setCategoryPreference(
  ref: CategoryRef,
  patch: CategoryPreferencePatch,
  database: CatalogDb = db,
): Promise<void> {
  const [sourceId, kind, matchKey] = preferenceKey(ref)
  const table = categoryPreferences(database)
  await database.transaction('rw', table, async () => {
    const current = await table.get([sourceId, kind, matchKey])
    await table.put({ ...current, ...stripUndefined(patch), sourceId, kind, matchKey, updatedAt: Date.now() })
  })
  notifyCategoryAccessChanged()
}

function stripUndefined(patch: CategoryPreferencePatch): CategoryPreferencePatch {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
}

/** Retrato do acesso para as leituras de `lib/catalog` filtrarem (FR-007, FR-014). */
export async function getCategoryAccess(sourceId: string, database: CatalogDb = db): Promise<CategoryAccess> {
  const generation = await activeGenerationOf(sourceId, database)
  const rule = await loadRule(sourceId, database)
  if (generation === undefined || (rule.prefs.size === 0 && !rule.pinActive)) return NOTHING_EXCLUDED
  const categories = (await database.categories.where('sourceId').equals(sourceId).toArray()).filter(
    (category) => category.generation === generation,
  )
  const excluded = new Set<number>()
  const byOrder = new Map<string, number>()
  for (const category of categories) {
    const id = category.id as number
    byOrder.set(`${category.kind}|${category.order}`, id)
    const hidden = preferenceOf(rule, category)?.hidden === true
    if (hidden || (!rule.unlocked && savedLock(rule, category))) excluded.add(id)
  }
  if (excluded.size === 0) return NOTHING_EXCLUDED
  return {
    excluded,
    isExcludedRecord: (record) => {
      const categoryId = record.categoryId ?? byOrder.get(`${record.kind}|${record.groupOrder}`)
      return categoryId !== undefined && excluded.has(categoryId)
    },
  }
}

const NOTHING_EXCLUDED: CategoryAccess = { excluded: new Set(), isExcludedRecord: () => false }

/** Categorias não escondidas da geração ativa, na ordem da lista, com `locked` efetivo (FR-002, FR-007, FR-013). */
export async function listVisibleCategories(
  sourceId: string,
  kind?: CategoryKind,
  database: CatalogDb = db,
): Promise<VisibleCategory[]> {
  const [categories, rule] = await Promise.all([listCategories(sourceId, kind, database), loadRule(sourceId, database)])
  const hidden = categories.filter((category) => preferenceOf(rule, category)?.hidden === true)
  return categories
    .filter((category) => !hidden.includes(category))
    .map((category) => ({
      ...category,
      locked: !rule.unlocked && savedLock(rule, category),
      hiddenBefore: hidden.filter((other) => other.kind === category.kind && other.order < category.order),
    }))
}

/** Todas as categorias da geração ativa (inclusive escondidas) com o estado salvo — só para a tela de gestão. */
export async function listManagedCategories(
  sourceId: string,
  kind: CategoryKind,
  database: CatalogDb = db,
): Promise<Array<CatalogCategory & { hidden: boolean; locked: boolean; suggested: boolean }>> {
  const [categories, rule] = await Promise.all([listCategories(sourceId, kind, database), loadRule(sourceId, database)])
  return categories.map((category) => {
    const pref = preferenceOf(rule, category)
    return {
      ...category,
      hidden: pref?.hidden === true,
      locked: savedLock(rule, category),
      suggested: pref?.locked === undefined && pref?.declinedSuggestion !== true && isAdultCategoryName(category.name),
    }
  })
}

/** Confere o PIN e, se certo, libera as bloqueadas desta lista até `relockSession` (FR-015). */
export async function unlockWithPin(sourceId: string, pin: string, database: CatalogDb = db): Promise<boolean> {
  if (!(await verifyPin(pin, database))) return false
  unlockedSourceId = sourceId
  notifyCategoryAccessChanged()
  return true
}

/** Volta a bloquear tudo (segundo plano, troca de lista, desligar o controle). Sem sessão aberta, não avisa ninguém. */
export function relockSession(): void {
  if (unlockedSourceId === null) return
  unlockedSourceId = null
  notifyCategoryAccessChanged()
}

export function isSessionUnlocked(sourceId: string): boolean {
  return unlockedSourceId === sourceId
}
