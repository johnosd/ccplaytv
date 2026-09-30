# Lógica — "Agora" e "A seguir"

Arquivo: `tv-web/src/lib/epg/nowNext.ts` (stub). Contrato:
`nowNext.epg-dados-agora.contract.test.ts`. Consumidores: linha de canal,
preview, banda do player, rail da Home.

## `nowAndNext(programs, now, offsetMs)`

```text
shifted = programs
  .map(p => ({ ...p, start: p.start + offsetMs, end: p.end + offsetMs }))
  .sort by start asc (estável)

running = shifted.filter(p => p.start <= now && now < p.end)
current = running com o MAIOR start (sobreposição: o mais recente que já começou)
          — empate: o de menor end
next    = primeiro de shifted com start >= (current?.end ?? now)   # nunca o próprio current
          ... e com start > now quando não há current

now  = current ? { title, start, end, description, progress: clamp((now-start)/(end-start), 0, 1) } : undefined
next = next ? { title, start, end, description } : undefined
```

- Lacuna: `current` indefinido → `now` ausente; `next` ainda aparece se
  houver (o preview pode mostrar "A seguir" mesmo sem "Agora").
- Programa encerrado nunca é `now` (`now < end` estrito).
- Nunca estica o anterior, nunca inventa título.

## De onde vêm os programas (hook)

`useEpgPrograms(sourceId, channelKeys)` em `features/catalog/catalogApi.ts`:

- `queryKey: ['epg', sourceId, sortedUniqueKeys]`, `staleTime` longo
  (a programação só muda quando uma sincronização termina — o executor
  invalida `['epg']`, D-009).
- lê `listProgramsForChannels(sourceId, keys, { from: now − 24 h, to: now + 48 h })`
  e o `epgOffsetHours` da fonte.
- **Nunca rede** (FR-029); chaves vazias → nem consulta.
- Só as chaves dos itens **renderizados/visíveis** (a lista é virtualizada;
  consultar 2.000 canais de uma vez é desperdício). Aceitável começar pelas
  chaves de `items` inteiros da categoria se a janela virtual complicar —
  cada consulta é por índice, barata; medir antes de otimizar.

`useNow(30_000)` (novo, `tv-web/src/lib/useNow.ts`): re-render a cada 30 s
para o progresso andar e o programa virar (FR-028: ≤ 1 min de atraso).

Componente → `nowAndNext(programsByKey.get(item.epg_channel_id) ?? [], now, offsetHours * 3_600_000)`.

## Limite conhecido

Programa com duração > 24 h que começou antes de `now − 24 h` não é lido
(D-013). Raro em grade de TV; registrado.
