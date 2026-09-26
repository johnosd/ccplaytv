# Quickstart: Séries — Episódios e Temporadas

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Uma fonte de **provedor Xtream** com ao menos uma série de 2+ temporadas.
- Uma fonte **M3U por URL** com várias entradas `Nome SxxEyy` (ex.: o
  formato `group-title="Series | …",Os Simpsons S34E08` citado na spec). A
  fonte M3U precisa ser **re-sincronizada** depois desta feature — episódios
  gravados antes não ganham agrupamento (`data-model.md` §1).
- Credenciais reais só em `docs/m3u/dados.md` (gitignored) — nunca copiar
  para código, spec, commit ou log.
- Backend `api/` **não** é necessário (ADR-008).

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run
npx tsc -b
npm run lint
npm run build:tizen
```

Todas limpas antes de qualquer cenário manual.

## Cenários no navegador (`npm run dev`, adaptador `<video>`)

- **A — Série de provedor (US1)**: Séries → categoria → série. Ver
  "Carregando episódios…" com "Voltar" focado; depois abas de temporada com
  a primeira focada e a lista da Temporada 1. Direita troca a temporada sem
  nova requisição (DevTools → Network: nenhuma chamada `get_series_info`
  nova).
- **B — Reproduzir e retomar (US1)**: BAIXO para a lista, OK num episódio →
  toca. Assistir >30 s, RETURN. A linha mostra "Continuar de mm:ss". OK de
  novo → retoma daquele ponto. Recarregar a página (equivale a fechar e
  reabrir o app), voltar à mesma série → a retomada continua lá (SC-002).
- **C — Falha de obtenção (US1)**: com rede desligada, abrir uma série nunca
  aberta → erro com "Tentar de novo" focado; OK ativa (não só mouse).
  Religar rede e tentar de novo → lista aparece. Abrir uma série já obtida
  com rede desligada e frescor vencido (ajustar relógio ou `episodesFetchedAt`)
  → lista antiga + aviso "não foi possível atualizar agora".
- **D — Série M3U (US2)**: Séries da fonte M3U → um cartão por série, não um
  por arquivo. Abrir → temporadas e episódios na ordem do número. Duas fontes
  com a mesma série não se misturam.
- **E — Assistido (US3)**: buscar até o fim de um episódio curto (ou até
  >95%). Voltar → selo "✓ Assistido" nele; episódio em andamento sem selo;
  nunca aberto sem nada.
- **F — Autoplay (US4)**: concluir um episódio com próximo na mesma
  temporada → contagem de 10 s com "Cancelar" focado. OK → volta à lista,
  foco no episódio que acabou. Repetir e deixar expirar → próximo toca
  sozinho. Concluir o último da temporada → contagem aponta para o E1 da
  temporada seguinte. Concluir o último da última temporada → volta à lista
  sem contagem. RETURN durante a contagem = cancelar.

## Cenários na TV física (`tizen-tv` skill)

Recomendados, não gate obrigatório (R-005 do `plan.md`).

- **G — Imagem do episódio**: episódio toca **com imagem** (não só áudio) —
  prova a raiz `.series-detail-layout` na regra de plano de hardware (R-006).
- **H — Conclusão real no AVPlay**: um episódio que chega ao fim natural
  dispara a contagem (não uma tela de erro).
- **I — Troca de sessão no autoplay**: após a contagem expirar, o próximo
  episódio toca com imagem e sem áudio residual do anterior; segurar setas
  durante a contagem não trava o app.

## Itens cross-cutting (constitution)

- Nenhuma URL, endereço de provedor ou credencial em mensagem de erro,
  rótulo ou `console` (inspecionar o Web Inspector durante C).
- Todo estado do detalhe tem elemento focado **ativável por OK**.
- Nenhuma cor/raio/tamanho de fonte literal nos estilos novos — só tokens de
  `index.css`.
