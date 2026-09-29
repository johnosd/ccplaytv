/**
 * Programação guardada no aparelho, por fonte (feature 030,
 * `data-model.md` §2/§3).
 *
 * Substituição por geração: a programação nova é gravada inteira numa
 * geração própria e só então vira a ativa — uma sincronização que falha no
 * meio nunca apaga a anterior (FR-005/SC-006).
 *
 * STUB do sdd-plan — o sdd-execute implementa (T006–T008).
 */
import { db, type CatalogDb } from '../catalog/db'
import type { EpgProgram, EpgProgramInput, EpgStatus, EpgWindow } from './types'

/**
 * Grava uma programação completa como nova geração e a publica, apagando a
 * anterior só depois. Aceita fluxo (a leitura do XMLTV não materializa o
 * arquivo inteiro).
 */
export async function writeEpgPrograms(
  _sourceId: string,
  _programs: Iterable<EpgProgramInput> | AsyncIterable<EpgProgramInput>,
  _database: CatalogDb = db,
): Promise<{ programCount: number }> {
  throw new Error('not implemented')
}

/**
 * Programas da geração ativa, por id de canal do XMLTV, que se sobrepõem a
 * `range`, ordenados por início. Canal sem nada fica fora do mapa.
 */
export async function listProgramsForChannels(
  _sourceId: string,
  _channelKeys: readonly string[],
  _range: EpgWindow,
  _database: CatalogDb = db,
): Promise<Map<string, EpgProgram[]>> {
  throw new Error('not implemented')
}

/** Estado persistido do EPG da fonte (FR-015). `undefined` se a fonte não existe. */
export async function getEpgStatus(_sourceId: string, _database: CatalogDb = db): Promise<EpgStatus | undefined> {
  throw new Error('not implemented')
}

/** Apaga toda a programação da fonte, de todas as gerações (FR-012/FR-021). */
export async function deleteEpgForSource(_sourceId: string, _database: CatalogDb = db): Promise<void> {
  throw new Error('not implemented')
}
