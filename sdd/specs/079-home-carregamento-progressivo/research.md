# Research: Home, Filmes e Séries já montadas ao entrar

## R-001 — Uma regra comum, onde

- **Decisão**: regra pura e hook em `tv-web/src/lib/assembly/` (`screenAssembly.ts`, `useScreenAssembly.ts`), usados por `features/home` e `features/vod`.
- **Justificativa**: a ratchet proíbe import feature→feature; `lib/` sem UI é o lugar de código compartilhado entre telas (como `lib/focus/`). Filmes/Séries já têm uma versão local da espera (`rowsReady`/`ROWS_SETTLE_CAP_MS`, ad-hoc 2026-10-09) que vira o caso geral.
- **Alternativas consideradas**: copiar a lógica em cada tela — rejeitada (duas regras divergiriam); `components/` — rejeitada (não é componente visual).

## R-002 — Caminho do cache imposto pelos contratos travados

- **Decisão**: se no 1º render as leituras principais já estão resolvidas, a tela aparece na hora (`reason: 'cache'`), sem esperar capas nem leituras secundárias; o que termina antes do teto se encaixa.
- **Justificativa**: `HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` (026) mocka só o hero e espera "Continuar" focado de forma síncrona; os contratos de Filmes/Séries (052, 056, 057, paridade-v14) são síncronos com as leituras locais mockadas e as do TMDB reais/pendentes. É também o comportamento desejado ao voltar a uma tela (FR-013).
- **Alternativas consideradas**: esperar sempre — quebra 6 contratos travados de outras features; adiar desde a revelação — no caminho quente, "Canais favoritos" (`gcTime` 30 s) sumiria ao voltar à Home.

## R-003 — O que entra na espera

- **Decisão**: todas as leituras das fileiras e do hero, as capas dos cards da primeira tela e o formato largo do "Continue" (Filmes/Séries). Ficam de fora: prévias dos carrosséis de categoria, backdrop do billboard, selos (assistido/favorito/série em dia), metadados do hero.
- **Justificativa**: decisões da entrevista (capas sim, fundo do billboard não); as prévias de categoria podem depender de rede e já têm altura fixa (o card chega no lugar); os contratos 056/057 mockam prévias `pending` para sempre.
- **Alternativas consideradas**: incluir prévias — prenderia a tela até o teto em toda abertura com categorias não obtidas.

> **Emenda 2026-10-16 (R-008 do plano)**: as capas deixaram de segurar a tela até o teto; esperam no máximo ~300 ms (a janela do "Carregando") e depois chegam dentro dos cards — padrão dos apps de streaming, decidido pelo usuário depois da linha de base no navegador abaixo.

## R-004 — Pré-carregar capas

- **Decisão**: `new Image()` + `decode()`; sem `decode` (jsdom), a imagem conta como pronta na hora. O `<img>` do card reaproveita o cache HTTP.
- **Justificativa**: Chromium 120 da TV tem `decode()`; jsdom não carrega imagens, e os contratos 060 (Home) esperam a tela em ≤ 1 s com um backdrop no "Continuar".
- **Alternativas consideradas**: `fetch` — rejeitada (CORS de hosts de capa, e expõe a URL a mais um caminho); esperar o `onLoad` do próprio `<img>` — exigiria desenhar antes de revelar.

## R-005 — Adiamento de "adicionados" na Home (D-013 da 060)

- **Decisão**: sai para as fileiras "Filmes/Séries adicionados" (entram na espera); fica para `useSeriesWatchedSummary` (só selo).
- **Justificativa**: com a tela esperando, o adiamento só somaria 600 ms à revelação.
- **Alternativas consideradas**: manter — atrasaria toda abertura fria.

## R-006 — Medição

- **Decisão**: `tv-web/src/lib/perf/assemblyTiming.ts` no padrão de `entryTiming.ts` (`isPerfEnabled`, `window.__ccplayAssemblyTimings`): por montagem, `screen`, `revealMs`, `reason`, `deferred` (contagem e chaves de slot), `images` (pedidas/terminadas no teto).
- **Justificativa**: o teto está decidido (2 s); a medição só confirma na TV e alimenta a avaliação visual do usuário.
- **Alternativas consideradas**: medir no navegador — não representa a TV.

## Linha de base

### Navegador — NÃO vale para a TV (2026-10-16, T019)

Chromium headless 1920×1080 contra `npm run dev`, lista Xtream real do `.env` já importada num perfil persistente (13 206 filmes, 9 766 séries e 2 355 canais obtidos; estado semeado pelo `home-vitrine-expandida-real.mjs`), `localStorage['ccplaytv:perf']='1'`, 5 rodadas. "Fria" = recarregar a página (sem cache de consultas; o IndexedDB fica); "quente" = voltar à tela pela topbar na mesma sessão. Roteiro: scratchpad da sessão (`medir-montagem.mjs`), só números.

| Abertura | n | p50 | p95 | Motivo | Leituras pendentes | Capas terminadas/pedidas |
| --- | --- | --- | --- | --- | --- | --- |
| Home fria | 5 | 494 ms | 513 ms | `ready` | — | 4–7 / 8 (pedidas acumulam listas intermediárias) |
| Home quente | 5 | 0 ms | 0 ms | `cache` (1º commit) | — | — |
| Filmes fria | 5 | 2018 ms | 2021 ms | `cap` | nenhuma | 9 / 25 |
| Séries fria | 5 | 2017 ms | 2025 ms | `cap` | nenhuma | 9–16 / 16–23 |
| Filmes quente | 5 | 0 ms | 0 ms | `cache` | — | — |

Leitura: na abertura fria de Filmes/Séries **todas as leituras terminam antes do teto**; quem segura a tela até os 2 s são as capas do provedor (lentas ou sem resposta) — e a tela ainda aparece com parte delas pendente. A lista de capas da vitrine é generosa de propósito (não desconta lista lateral nem topbar). `revealMs` 0 no caminho do cache = apareceu no 1º commit.

### Navegador depois da emenda R-008 (capas só até 300 ms) — NÃO vale para a TV (2026-10-16)

Mesmo perfil, mesmo roteiro, 5 rodadas.

| Abertura | n | p50 | p95 | Motivo |
| --- | --- | --- | --- | --- |
| Home fria | 5 | 491 ms | 567 ms | `ready` |
| Home quente | 5 | 0 ms | 0 ms | `cache` |
| Filmes fria | 5 | 766 ms | 845 ms | `ready` (capas 9–10/25 na revelação; o resto chega nos cards) |
| Séries fria | 5 | 321 ms | 349 ms | `ready` |
| Filmes quente | 5 | 0 ms | 0 ms | `cache` |

Filmes/Séries frios saíram de ~2,0 s (sempre no teto) para 0,3–0,8 s, sem nenhuma revelação pelo teto; o tempo de Filmes passou a ser o das leituras locais, não o das capas.

### TV

<!-- T020: abertura fria/quente por tela na Samsung QN50Q60DAGXZD. -->
Pendente (depende do aparelho).

## R-009 — Fileiras tardias na visita atual (emenda 2026-10-17)

- **Decisão**: fileiras prontas aparecem após a janela curta de 300 ms; qualquer fileira que resolver depois entra na visita atual, na posição canônica, mesmo que reacomode as fileiras abaixo.
- **Motivo**: o comportamento anterior deixava conteúdo invisível até sair e entrar novamente; isso divergia do padrão progressivo observado em grandes players.
- **Consequência**: `deferred` deixa de bloquear conteúdo; foco e scroll devem ser reconciliados por identidade estável.
