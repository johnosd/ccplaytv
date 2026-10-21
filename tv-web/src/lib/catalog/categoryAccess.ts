/**
 * Acesso às categorias da lista (feature 066): o que está escondido, o que está
 * bloqueado e o desbloqueio da sessão. Regras em
 * `sdd/specs/066-categorias-controle-parental/logic/acesso-categorias.md`.
 *
 * O estado é calculado na leitura (D-001): preferência salva + PIN + sessão +
 * nome adulto. Nada daqui é memorizado entre leituras — os caches de `lib`
 * guardam o dado bruto e o filtro vem depois deles (D-003).
 */

import { clearAllScreenDocuments } from './screenDocumentStore'
import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord, type CategoryKind, type CategoryRecord } from './db'
// Pela fachada (feature 063, D-001): `repository/` também importa daqui, e só a fachada conhece aqueles módulos.
import { activeGeneration, listCategories, type CatalogCategory } from './catalogRepository'
import { categoryMatchKey } from './structureDiff'
import { categoryPreferences, parentalPins, type CategoryPreferenceRecord } from './parentalTables'
import { verifyPin } from '../parental/listPin'
import { isAdultCategoryName, isSavedLock } from './adultCategory'

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

/**
 * Regra salva (PIN existe? quais preferências?) por banco e por lista — só memória. Toda escrita de acesso passa por
 * `notifyCategoryAccessChanged`, que a esquece inteira. Não é dado de catálogo filtrado (D-003): só a regra, para os
 * leitores não lerem o IndexedDB a cada chamada (a vitrine de Filmes chama um por fileira).
 */
let savedRules = new WeakMap<CatalogDb, Map<string, Promise<Omit<Rule, 'unlocked'>>>>()

/** Avisa quem desenha (reset das consultas, D-005) e esquece a regra em memória. Usado também por `lib/parental/listPin.ts`. */
export function notifyCategoryAccessChanged(): void {
  savedRules = new WeakMap()
  // Feature 086 (T089): o documento de tela guarda as fileiras já filtradas, e a leitura dele é síncrona, sem consultar
  // o banco — então é **aqui** que a mudança de visibilidade tem de alcançá-lo. Sem isto, a tela poderia mostrar
  // categoria escondida ou travada até o próximo recálculo.
  clearAllScreenDocuments()
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

// A regra do nome adulto e o bloqueio salvo moram no módulo puro (feature 067, R-003): a migração do PIN também os usa.
export { isAdultCategoryName }

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
  return isSavedLock(rule.pinActive, preferenceOf(rule, category), category.name)
}

async function readSavedRule(sourceId: string, database: CatalogDb): Promise<Omit<Rule, 'unlocked'>> {
  const [pin, prefs] = await Promise.all([
    // PIN por lista (feature 067): o controle está ligado só na lista que tem o seu PIN.
    parentalPins(database).get(sourceId),
    categoryPreferences(database).where('sourceId').equals(sourceId).toArray(),
  ])
  return { pinActive: pin !== undefined, prefs: new Map(prefs.map((pref) => [prefMapKey(pref.kind, pref.matchKey), pref])) }
}

async function loadRule(sourceId: string, database: CatalogDb): Promise<Rule> {
  let bySource = savedRules.get(database)
  if (!bySource) savedRules.set(database, (bySource = new Map()))
  let saved = bySource.get(sourceId)
  if (!saved) {
    const cache = bySource
    saved = readSavedRule(sourceId, database)
    cache.set(sourceId, saved)
    saved.catch(() => cache.delete(sourceId))
  }
  // A sessão é lida na hora, nunca da memória da regra (D-004).
  return { ...(await saved), unlocked: unlockedSourceId === sourceId }
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
  // Sem preferência nem PIN (o caso comum), nada a filtrar — e nada a ler do IndexedDB.
  const rule = await loadRule(sourceId, database)
  if (rule.prefs.size === 0 && !rule.pinActive) return NOTHING_EXCLUDED
  const generation = await activeGeneration(sourceId, database)
  if (generation === undefined) return NOTHING_EXCLUDED
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

/** O que é adulto numa lista, para nunca aparecer no ↺ Histórico nem no Continuar assistindo (FR-035, D-014). */
export interface AdultScope {
  isAdult: (record: Pick<CatalogRecord, 'kind' | 'categoryId' | 'groupOrder' | 'adult'>) => boolean
}

/**
 * Adulto = a lista marca o item (`adult`, do `is_adult` do painel), a categoria tem nome adulto (FR-023), ou a pessoa
 * bloqueou a categoria (bloqueio salvo — vale com o PIN digitado, independe da sessão). Padrão, sem configuração:
 * não depende do controle parental estar ligado. Episódio vale pela série (quem chama passa o registro da série).
 */
export async function getAdultScope(sourceId: string, database: CatalogDb = db): Promise<AdultScope> {
  const [rule, generation] = await Promise.all([loadRule(sourceId, database), activeGeneration(sourceId, database)])
  const adultIds = new Set<number>()
  const byOrder = new Map<string, number>()
  if (generation !== undefined) {
    const categories = (await database.categories.where('sourceId').equals(sourceId).toArray()).filter((category) => category.generation === generation)
    for (const category of categories) {
      byOrder.set(`${category.kind}|${category.order}`, category.id as number)
      if (isAdultCategoryName(category.name) || preferenceOf(rule, category)?.locked === true) adultIds.add(category.id as number)
    }
  }
  return {
    isAdult: (record) => {
      if (record.adult === true) return true
      const categoryId = record.categoryId ?? byOrder.get(`${record.kind}|${record.groupOrder}`)
      return categoryId !== undefined && adultIds.has(categoryId)
    },
  }
}

/** Categorias não escondidas da geração ativa, na ordem da lista, com `locked` efetivo (FR-002, FR-007, FR-013). */
export async function listVisibleCategories(
  sourceId: string,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<VisibleCategory[]> {
  const [categories, rule] = await Promise.all([listCategories(sourceId, kind, database), loadRule(sourceId, database)])
  const hidden = categories.filter((category) => preferenceOf(rule, category)?.hidden === true)
  const shown = categories.filter((category) => !hidden.includes(category))
  // Pedido do usuário (2026-10-09, emenda ao FR-033 — D-013): as bloqueadas pelo controle parental vão para o fim da
  // trilha, na ordem relativa da lista; ficam lá mesmo com a sessão desbloqueada (a trilha não pula de lugar). O número do
  // canal não muda — `channelNumberOf` compara `order`, não a posição aqui.
  const blocked = shown.filter((category) => savedLock(rule, category))
  return [...shown.filter((category) => !blocked.includes(category)), ...blocked]
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

/** Confere o PIN **desta** lista e, se certo, libera as bloqueadas dela até `relockSession` (FR-015; 067 FR-022). */
export async function unlockWithPin(sourceId: string, pin: string, database: CatalogDb = db): Promise<boolean> {
  if (!(await verifyPin(sourceId, pin, database))) return false
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
