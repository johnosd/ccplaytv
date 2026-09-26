# Agregação "Em dia" por série (D-007/D-008)

## Por que a cobertura é binária, não fracionária

A tentação óbvia ao implementar isto é pensar "cobertura parcial" como
"alguns episódios conhecidos, outros não" — e escrever uma lógica que
tenta descobrir quantos episódios *deveriam* existir versus quantos já
foram lidos. **Essa lógica não existe neste código, e não precisa
existir.**

Motivo: tanto `fetchSeriesInfo` (Xtream, `xtreamConnector.ts` via
`seriesLoader.ts`) quanto a leitura de uma categoria M3U/`eager`/`stored`
(`categoryLoader.ts`) sempre trazem **todos** os episódios de uma série
de uma vez, numa única resposta — nunca paginado, nunca parcial. Não há
"buscar mais episódios" nem "próxima página de episódios" em lugar
nenhum do código atual. Confirmado em `seriesLoader.ts`:
`fetchAndStore()` chama `fetchSeriesInfo(...)` uma vez e grava tudo que
veio (`storeSeriesEpisodes`); se falhar, cai no `catch` sem gravar nada
novo (regra 4 do arquivo: "falha nunca apaga episódios já gravados") —
nunca há uma gravação parcial no meio do caminho.

Isso significa que, para qualquer série, só existem dois estados reais:

1. **Nunca lida**: zero registros `kind:'episode'` com esse `seriesId`
   em `channels`. A série nunca teve seu detalhe aberto (caminho
   `on_demand`) ou sua categoria nunca foi entrada (caminho `eager`/
   `stored`).
2. **Lida** (ao menos uma vez): existe pelo menos 1 registro. Nesse
   caso, **todos** os episódios que a fonte declarava naquela leitura já
   estão lá — não existe "meio lida".

A cobertura, portanto, não precisa comparar contra nenhum número externo
("quantos episódios a fonte diz que tem no total") — ela é simplesmente
"a série já tem episódios conhecidos, sim ou não".

## Regra de "Em dia"

```
function summarizeSeriesWatched(episodes: { completedAt?: number }[]): {
  known: number
  watched: number
  upToDate: boolean
} {
  const known = episodes.length
  const watched = episodes.filter(e => e.completedAt != null).length
  const upToDate = known > 0 && watched === known
  return { known, watched, upToDate }
}
```

- `known === 0` (nunca lida): `upToDate` é sempre `false`. A UI não
  mostra nenhum selo nesse caso (mesmo comportamento de hoje, sem
  regressão) — não é "0 de 0", é "nada a mostrar ainda".
- `known > 0` e `watched < known`: mostra a contagem (`"${watched}/${known}"`
  ou equivalente), nunca "Em dia".
- `known > 0` e `watched === known`: mostra "Em dia".

**Nunca** interpolar ou estimar um "total real" diferente de `known`.
Se a fonte adicionar um episódio novo depois de uma série já estar "Em
dia", isso só é percebido na PRÓXIMA vez que a série for relida (detalhe
reaberto após a janela de frescor de 24h, `freshness.ts` — mesmo
mecanismo que `isCategoryFresh` já usa para categoria). Até lá, o app
não tem como saber que o episódio novo existe — isso é honesto, não um
bug: o app nunca promete saber mais do que já leu (FR-009 da spec).

## Onde a leitura acontece (D-008)

`useSeriesWatchedSummary(sourceId)` — hook novo em `catalogApi.ts` —
lê, **de uma vez para toda a fonte** (não por card):

1. Todos os registros `kind:'episode'` em `channels` para `sourceId`
   (agrupados por `seriesId` em memória — uma única consulta, não uma
   por série).
2. Os `UserStateRecord` correspondentes (`stableId` de cada episódio),
   via o mesmo padrão de `useUserStates` (lote, não um por um).
3. Aplica `summarizeSeriesWatched` por grupo.

Isso **nunca** chama `ensureSeriesEpisodes` — só lê o que já está em
`channels`. Uma série nunca aberta continua com `known === 0` até a
pessoa efetivamente abrir seu detalhe (o que já dispara
`ensureSeriesEpisodes` normalmente, via `useSeriesEpisodes`, mecanismo
existente e intocado por esta feature).
