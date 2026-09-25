/**
 * Agrupamento de episódios de fonte M3U (e "Modo limitado") em séries
 * navegáveis (feature 012, `logic/episodios-autoplay.md` §2, D-003).
 *
 * M3U não tem identificador de série — só o título de cada arquivo. A
 * chave de agrupamento é `grupo (group-title) + título-base normalizado`
 * (o que sobra depois de tirar o padrão `SxxEyy`, já calculado pelo
 * classificador em `seriesKey`/`seriesName`); sem esse padrão (Modo
 * limitado, onde o tipo vem do segmento `/series/` da URL, D-012), cai no
 * próprio nome normalizado. Correspondência é exata — nunca aproximada
 * (constitution, "IA e Classificação Nunca Inventam Dados"): duas séries
 * reais com o mesmo título normalizado no mesmo grupo se unem por
 * coincidência, risco aceito e documentado na spec (Fora de Escopo).
 */

import type { MappedChannel } from './xtreamConnector'

export interface SeriesGroupResult {
  /** O episódio em si, com `seriesId` preenchido. */
  episode: MappedChannel
  /**
   * O registro sintético da série — só presente na PRIMEIRA vez que a
   * chave aparece nesta importação. Chamadas seguintes para a mesma série
   * devolvem só `episode`.
   */
  series?: MappedChannel
}

export interface SeriesGrouper {
  assign(entry: MappedChannel): SeriesGroupResult
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Estado (o mapa de chaves já vistas) fica por importação — uma instância
 * nova por `consumeM3u`, nunca compartilhada entre fontes ou execuções.
 */
export function createSeriesGrouper(): SeriesGrouper {
  const seriesIdByKey = new Map<string, string>()

  return {
    assign(entry: MappedChannel): SeriesGroupResult {
      const base = entry.seriesKey ?? normalize(entry.name)
      const group = entry.group ?? ''
      const key = `${group}|${base}`

      const existing = seriesIdByKey.get(key)
      const seriesId = existing ?? `m3u:${key}`
      const isNew = existing === undefined
      seriesIdByKey.set(key, seriesId)

      const episode: MappedChannel = { ...entry, seriesId }
      if (!isNew) return { episode }

      const series: MappedChannel = {
        kind: 'series',
        name: entry.seriesName ?? entry.name,
        originalName: entry.seriesName ?? entry.name,
        group: entry.group,
        groupOrder: entry.groupOrder,
        seriesId,
        // Feature 015 (D-003 do plan.md): dado real do primeiro episódio
        // desta série, reaproveitado — nunca um valor novo/inventado.
        iconUrl: entry.iconUrl,
      }
      return { episode, series }
    },
  }
}
