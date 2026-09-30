# Implementation Plan: Carga de listas — progresso claro, pré-carga em segundo plano, contagens e atualização visível

**Slug**: `038-carga-listas-pre-carga` | **Date**: 2026-09-30 | **Spec**: `sdd/specs/038-carga-listas-pre-carga/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Depois que uma lista abre, um **agendador em segundo plano** obtém as
categorias das três seções uma de cada vez, pelo mesmo `ensureCategory` da
entrada, só quando a pessoa está parada há ~2 s, sem player/trailer aberto, com
o app visível e com rede — priorizando a seção e as vizinhas da categoria em
foco. Entrar numa categoria já no aparelho lê só do disco; entrar numa vencida
ou com renovação pendente abre na hora com o que tem e passa a renovação para a
frente da fila. A **atualização** (24 h ou "Ressincronizar") deixa de criar uma
geração nova a cada vez: a estrutura é reconciliada **na geração ativa** (Xtream
por id do provedor, M3U pelo nome), as categorias mantidas continuam servindo
os itens de antes e são renovadas atrás; a renovação **preserva o id local** de
cada item (foco, detalhe aberto e snapshot não quebram) e não regrava uma
lista idêntica. A tela de importação passa a mostrar uma linha por parte
(Canais, Filmes, Séries, Guia) com estado e contagem reais; o trilho mostra a
contagem real assim que a categoria chega; o Início ganha uma linha discreta
("Preparando catálogo — N de M", "Atualizando catálogo…", "Catálogo atualizado
há …"). Antes de tudo isso, a primeira entrada fria (~1 min hoje) é **medida e
decomposta** (Fase 2), e o que for do app é corrigido.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Vite (build `chrome108`).

**Primary Dependencies**: `@tanstack/react-query` (cache de telas), Dexie
(IndexedDB), `@tanstack/react-virtual` (grades); nenhuma dependência nova.

**Storage**: IndexedDB via Dexie v13 — **sem subir versão** (só campos sem
índice: `data-model.md`).

**Testing**: Vitest + Testing Library (jsdom, `CatalogDb` real por teste com
nome aleatório, `fake-indexeddb` já configurado no setup), Playwright via
`e2e/*.mjs` contra `npm run dev` com painel falso; roteiros `*-real.mjs` fora de
`test:e2e` para a lista real.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, origem
`file://`), app client-first (ADR-008).

**Performance Goals**: SC-001 ≤ 300 ms OK→itens em categoria no aparelho;
SC-003 p95 tecla→foco ±20 % com pré-carga rodando; SC-005 primeira entrada fria
≤ 3 s em rede boa; SC-002 ≥ 80 % prontas num prazo fixado **depois** da medição
(Fase 2).

**Constraints**: constitution 1.7.0 (foco nunca dispara consulta além do já
aceito na 010; progresso real; identidade por chave estável; segredos fora de
log); gargalo conhecido de gravação no IndexedDB da TV (feature 010); `webapis.
avplay` singleton; `PlayerLayer`/`TrailerLayer`/`LiveScreen`/`VodCatalogScreen`/
`HomeScreen` com contratos travados de outras features.

**Scale/Scope**: lista real de referência — 2.266 canais, 31.304 filmes, 9.637
séries (~22 MB de listagens), centenas de categorias; uma lista ativa por vez.

## Decisões Invariantes

- **D-001 — Uma categoria por vez, nunca abortada.** O agendador roda uma
  `runCategory` de cada vez e não cancela a que está em voo (ela é compartilhada
  com a entrada real pelo `dedup` do `categoryLoader`). Portões só impedem
  **começar**.
- **D-002 — Portões**: tecla nos últimos `IDLE_AFTER_KEY_MS` (2000), camada de
  reprodução aberta (`PlayerLayer` **e** `TrailerLayer`, por contador), app
  oculto, sem rede. Ouvinte de tecla em `window`, fase de captura, passivo.
- **D-003 — Ordem**: `logic/agendador-pre-carga.md` §2 (fixada pelo contrato):
  focada → vizinhas (raio 3, baixo antes de cima no empate) → resto da seção →
  cada outra seção como nível próprio (Canais → Filmes → Séries); fria antes de
  renovação dentro do nível; falhas no fim; 3 falhas por sessão = desiste.
- **D-004 — Atualização no lugar**: mesma rota (Xtream→Xtream, guardado→
  guardado) reconcilia a estrutura na geração ativa; geração nova +
  `publishGeneration` só na primeira importação e na troca de caminho.
- **D-005 — `order` imutável, `position` para exibir.** `order` é chave dos
  itens; categoria nova ganha o próximo `order` livre.
- **D-006 — Um caminho de escrita de itens**: `renewCategoryItems` (id
  preservado por identidade, `episodesFetchedAt` mantido, assinatura igual = só
  carimba). `listChannels` ordena por `categoryPosition`.
- **D-007 — Entrada nunca espera renovação**: com itens no aparelho, vencida
  ou pendente → `stale-served` na hora + `prioritize` no agendador.
- **D-008 — Limpeza de gerações em partes**, pelo agendador, mesmo portão;
  `publishGeneration` só troca a ativa e apaga categorias antigas.
- **D-009 — Pré-busca de 300 ms (R-013 da 010) continua separada** e intacta.
- **D-010 — Só a lista ativa**; o agendador vive na raiz (`App.tsx`), começa
  ao escolher a lista e para ao sair dela.
- **D-011 — Episódios de série M3U** são substituídos inteiros na renovação
  (ids de episódio podem mudar; retomada/assistido são por `stableId`).
- **D-012 — Tela de importação**: "Abrir lista" disponível assim que a
  estrutura termina; o foco vai para ele quando o guia também se resolve.
- **D-013 — Sem subir versão do Dexie.**
- **D-014 — Invalidação agrupada** (≤ 1 rodada/s) das consultas afetadas por
  uma categoria que chegou.
- **D-015 — Foco só reordena a fila**: nenhuma consulta nova nasce de foco
  (FR-011); o que a dica muda é qual categoria começa **depois** de 2 s parado.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Não toca conta; compatível com a 034 (catálogo local nunca bloqueado). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Instrumentação só registra ms/contagens/bytes; assinatura (hash local) nunca logada; nenhuma URL em erro/tela; roteiros `*-real.mjs` imprimem só números. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Nome e posição vêm sempre da atualização da fonte; nenhuma taxonomia externa; `position` só reflete a ordem declarada. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Contagem só de categoria no disco (ou `declaredCount` do M3U guardado); "Não disponível" em vez de "0". |
| Comandos Locais Independem de Rede | ✅ | ✅ | Entrada em categoria com itens nunca espera rede (D-007); pré-carga para sem rede. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Não pré-carrega metadata/TMDB/trailers. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | Nada novo exige outro meio; linha do Início é informativa. |
| Lista de Catálogo ≠ Manifesto de Streaming | ✅ | ✅ | Não toca classificação. |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ✅ (justificado) | Tela de importação mantém focável em todo estado. **Foco × consulta**: a dica de foco reordena uma fila que já ia consultar o painel — ver Complexity Tracking. Linha do Início não focável e não rouba foco. |
| Voltar Restaura Foco e Posição | ⚠️ | ✅ | Risco real: renovação trocava ids (apagar + regravar). Resolvido por D-006 (id preservado) + reconciliação por id nas telas (contrato 4). Ids de categoria passam a sobreviver à atualização (antes mudavam a cada geração). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Identidade de renovação: `seriesId`/`providerStreamId`/`originalName`, nunca URL; estado do usuário segue por `stableId`. Nova geração não é mais criada no caminho comum — o "reconciliar antes de expor" fica mais fácil, não mais difícil. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Nenhum percentual; "N de M categorias" reais; cobertura parcial dita na linha do Início e pela ausência de número no trilho. |
| Documentação É Canônica | ✅ | ✅ | Reabre D-007/R0-1 da 010 **registrado** (spec + R-009); comentário-cabeçalho de `catalogRepository.ts` atualizado na mesma task (D-004); CLAUDE.md/backlog no Polish. |

ADRs: coerente com ADR-002 (catálogo local é a fonte da verdade — pré-carga
aumenta a cobertura offline), ADR-008 (tudo no cliente), ADR-009 (sem
biblioteca de foco; o ouvinte de tecla é só observação), ADR-010 (armazenar
itens/URLs no aparelho). Nenhuma ADR contrariada.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/038-carga-listas-pre-carga/
├── spec.md
├── plan.md
├── research.md            # R0-1 medição da entrada fria (aberto), R0-2 por que não repete a 010
├── data-model.md
├── quickstart.md
├── logic/
│   ├── agendador-pre-carga.md
│   ├── atualizacao-sem-esfriar.md
│   └── progresso-importacao.md
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e/
│   ├── carga-listas.mjs               # NOVO — painel falso, entra em test:e2e
│   └── carga-listas-real.mjs          # NOVO — lista real, fora de test:e2e (só números)
├── package.json                       # test:e2e ganha carga-listas.mjs
└── src/
    ├── App.tsx                        # liga/desliga o agendador; wake() ao fim de importação
    ├── components/
    │   ├── PlayerLayer.tsx            # acquirePlayback() ao montar
    │   └── TrailerLayer.tsx           # idem
    ├── features/
    │   ├── catalog/
    │   │   ├── catalogApi.ts          # serveStale na entrada; invalidação
    │   │   └── prefetchApi.ts         # NOVO — usePrefetchProgress/usePrefetchHint
    │   ├── home/
    │   │   ├── HomeContent.tsx        # linha de estado
    │   │   └── homeStatusLine.ts      # NOVO — texto puro da linha
    │   ├── import/
    │   │   ├── importApi.ts           # sections no job; lastErrorAt
    │   │   ├── importSections.ts      # NOVO — linhas puras (seções + guia)
    │   │   └── ImportProgressScreen.tsx
    │   ├── live/LiveScreen.tsx        # usePrefetchHint
    │   └── vod/VodCatalogScreen.tsx   # usePrefetchHint
    └── lib/
        ├── catalog/
        │   ├── catalogRepository.ts   # renewCategoryItems, position, applyStructureRefresh, applyStoredRefresh, collectStaleGenerations, listChannels ordenado
        │   ├── categoryLoader.ts      # serveStale/renew, storedFrom, storage_full
        │   ├── db.ts                  # campos novos (sem versão)
        │   ├── importPipeline.ts      # sections; atualização no lugar
        │   ├── structureDiff.ts       # NOVO — diff puro
        │   └── prefetch/
        │       ├── activityGate.ts    # NOVO
        │       ├── prefetchOrder.ts   # NOVO — ordem pura
        │       ├── prefetchScheduler.ts # NOVO
        │       └── index.ts           # NOVO — instâncias reais
        ├── epg/types.ts               # EpgStatus.lastErrorAt
        └── perf/entryTiming.ts        # NOVO — instrumentação desligada por padrão (Fase 2)
```

**Structure Decision**: monorepo existente; tudo em `tv-web/` (frontend
client-first). Lógica nova em `lib/catalog/` (dados) e `lib/catalog/prefetch/`
(agendador); telas falam só com `features/catalog/*` e `features/import/*`
(D-001 da 005). `api/` (congelado, ADR-008) e `CCPlayTv/` (só pelo
`build:tizen`) não são tocados à mão — o agendador roda na thread principal,
sem arquivo emitido novo; se algum Worker novo surgir, entra em
`tizen_web_project.yaml`.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| A categoria em foco influencia qual consulta ao painel acontece a seguir (dica da pré-carga) — tangencia "focar não dispara consulta" | FR-005/FR-011 (decisão do usuário): prioridade para onde a pessoa está. Nenhuma consulta **nasce** do foco: a fila consultaria todas de qualquer jeito, só depois de 2 s sem tecla; o foco só muda a ordem. | Ignorar o foco (ordem fixa) — rejeitado pelo usuário na especificação; a pré-busca de 300 ms já aceita (R-013 da 010) é mais forte que isto e continua. |
| Escrever na geração ativa (quebra a regra da casa "escrita sempre numa geração nova", não um princípio da constitution) | Com a pré-carga, publicar uma geração nova apagaria o catálogo inteiro numa transação — o gargalo que congelou a TV (010) — e esfriaria tudo (FR-024). | Geração nova + cópia dos itens: regravar dezenas de milhares de linhas a cada 24 h; geração nova + exclusão em partes sem cópia: esfria tudo, viola FR-024/SC-006. |

## Estratégia de Testes

Prioridade: unitário (funções puras: ordem, diff, linhas da tela, texto do
Início) → contrato/integração (`CatalogDb` real por teste) → componente
(telas com Testing Library) → E2E (`e2e/carga-listas.mjs`, painel falso) →
manual/TV (gate SC-008, quickstart).

Comandos-base (em `tv-web/`):

```powershell
npx vitest run <arquivo>        # o mais estreito primeiro
npm run test                    # suíte inteira (flakes conhecidos: *.favorites.test.tsx / LiveScreen.test.tsx sob paralelismo — confirmar isolado)
npm run lint
npx tsc -b
npm run build; npm run build:tizen
npm run test:e2e                # com npm run dev rodando (reiniciar o dev server antes, lição da 022)
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/prefetch/prefetchOrder.carga-listas.contract.test.ts`,
`tv-web/src/lib/catalog/prefetch/prefetchScheduler.carga-listas.contract.test.ts`,
`tv-web/src/lib/catalog/structureDiff.carga-listas.contract.test.ts`,
`tv-web/src/lib/catalog/catalogRepository.carga-listas.contract.test.ts`,
`tv-web/src/lib/catalog/categoryLoader.carga-listas.contract.test.ts`

Comando (em `tv-web/`):
`npx vitest run src/lib/catalog/prefetch/prefetchOrder.carga-listas.contract.test.ts src/lib/catalog/prefetch/prefetchScheduler.carga-listas.contract.test.ts src/lib/catalog/structureDiff.carga-listas.contract.test.ts src/lib/catalog/catalogRepository.carga-listas.contract.test.ts src/lib/catalog/categoryLoader.carga-listas.contract.test.ts`

Integridade (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 038-carga-listas-pre-carga`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `prioriza a focada e as vizinhas, depois o resto da seção, depois as outras seções; falhas no fim` | FR-005, FR-007, US1-AC4 | Fase 3 | `Error: not implemented` (`prefetchOrder.ts`) |
| `uma categoria por vez, só depois de 2 s sem tecla, nunca com player aberto, e retoma sozinho` | FR-002/003/004/006, SC-004, US1-AC3/AC5 | Fase 3 | `Error: not implemented` (`activityGate.ts`/`prefetchScheduler.ts`) |
| `mantém por seção + id do provedor (ou nome no M3U), acrescenta as novas e remove as que saíram` | FR-024, FR-028, Constitution: Categorias da Fonte | Fase 7 | `Error: not implemented` (`structureDiff.ts`) |
| `mantém o id de quem continua, remove quem saiu, cria quem entrou e não regrava lista idêntica` | FR-027, D-006, Constitution: Voltar Restaura Foco (por id) | Fase 2 | `Error: not implemented` (`renewCategoryItems`) |
| `serve o disco sem tocar a rede e pede a renovação em segundo plano` | FR-024, FR-026, US5-AC1/AC3, SC-006 | Fase 2 | `AssertionError: expected 'fetched' to be 'stale-served'` |

Confirmado vermelho em 2026-09-30 (5/5, pelos motivos acima); `tsc -b` limpo;
suíte `src/lib/catalog` sem regressão (só os contratos já vermelhos das 034/036,
não executadas).

Stubs criados pelo plan (ponto de partida do execute, não travados):
`lib/catalog/prefetch/prefetchOrder.ts`, `activityGate.ts`,
`prefetchScheduler.ts`, `lib/catalog/structureDiff.ts`, `renewCategoryItems` em
`catalogRepository.ts`, opção `serveStale` em `categoryLoader.ts` (só o tipo),
campos novos de `CategoryRecord` (`db.ts`) e `CatalogCategory.renewRequestedAt`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — medição | PC medido (research R0-1); lado TV pendente (leitura do painel pelo usuário) |
| Fase 2 — escrita com id preservado | Concluída (2/2 contratos) |
| Fase 3 — pré-carga (US1) | Concluída (2/2 contratos) |
| Fase 4 — correção da entrada fria (US2) | Bloqueada pela leitura na TV |
| Fase 5 — contagem no trilho (US4) | Concluída |
| Fase 6 — tela de importação (US3) | Concluída |
| Fase 7 — atualização sem esfriar (US5) | Concluída (1/1 contrato) |
| Fase 8 — linha do Início (US6) | Concluída |
| Fase 9 — polish | Automático verde: tsc, lint, build:tizen, 1931/1943 unit (12 = contratos vermelhos da 034/036 + flakes conhecidos, 101/101 isolados), test:e2e 19/19, 16 travas íntegras. Falta: gate na TV (T073) e quickstart na TV (T075) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Causa dos ~60 s da primeira entrada fria é desconhecida (20× a meta aprovada pela 010 na TV). | Sem ela, SC-005 e o prazo de SC-002 não se fixam; a pré-carga poderia esconder uma regressão. | Fase 2 mede e decompõe (research R0-1) **antes** das correções; tabela registrada aqui. **Atualização 2026-09-30 (PC)**: no navegador do PC a pior entrada fria leva 3,8 s (11.130 filmes; rede ~2,2 s + gravação ~1,5 s); canais 0,6 s, séries 1,3 s. O minuto é da TV ou de navegação real — medição na TV pendente (build com painel de números instalado). |
| R-002 | Parse de JSON grande + gravação na thread principal durante a pré-carga pode pesar na navegação da TV (SC-003). | Engasgo ao navegar. | Portão de tecla (2 s) + uma por vez + pausa de 500 ms; se SC-003 falhar na TV, recuo FR-014 (só T0/T1). Worker fica para depois (research R0-2). |
| R-003 | Horas de pedidos sequenciais ao painel (~22 MB) podem acionar limite de taxa. | Falhas em série; pré-carga não progride. | Uma por vez + intervalo; falha → fim da fila, 3 por sessão; medir na TV com a lista real; se aparecer 429, backoff (task ad-hoc). |
| R-004 | Invalidar `['categories']` entrega objetos novos às telas e pode rearmar a pré-busca de 300 ms. | Rajada de `ensureCategory` (sem rede, `fresh`) ou foco pulando. | Invalidação agrupada (D-014); conferir o efeito de `useCategoryFocusPrefetch`; se rearmar, depender de `id` + `itemsFetchedAt`. |
| R-005 | Identidade de item M3U por `originalName`: nomes repetidos (ex.: "Canal HD" duas vezes) trocam ids entre gêmeos. | Foco pode cair no gêmeo de mesmo nome após renovar. | Aceito (raro, sem perda de estado — estado do usuário é por `stableId`); registrado. |
| R-006 | Troca de caminho (Xtream ↔ Modo limitado) ou fonte `eager` legada continua criando geração nova — frio depois disso. | FR-024 não vale nesse caso raro. | Aceito e registrado; limpeza em partes (D-008) evita o congelamento. |
| R-007 | A pré-carga enche o armazenamento com o catálogo inteiro. | `storage_full` em aparelho com pouco espaço. | Dono do produto confirmou que cabe; FR-008 para a pré-carga sem apagar nada. |
| R-008 | Feature 034 (planejamento em curso, contratos travados e ainda vermelhos) mexe em `importPipeline`/fonte. | Conflito de merge; contrato da 034 exige `activeGeneration` estável numa falha. | Esta entra antes (decisão do usuário); o modelo "no lugar" mantém `activeGeneration` — compatível. Não editar os arquivos travados da 034; a 034 rebaseia. |
| R-009 | Reabre D-007/R0-1 da feature 010 ("gravar tudo em segundo plano adia o sintoma"). | Repetir o congelamento que a 010 resolveu. | Registrado na spec e em research R0-2; diferenças: uma categoria por vez, portões, id preservado, assinatura, limpeza em partes; recuo FR-014. |
| R-010 | Escrever na geração ativa contraria a regra do cabeçalho de `catalogRepository.ts`. | Leitor futuro assume a regra antiga. | Complexity Tracking; atualizar o comentário na mesma task (T057, `applyStructureRefresh`). |
| R-011 | Detalhe aberto de um item que a renovação removeu (`useCatalogItem` → `null`). | Tela de detalhe sem item. | Conferir o estado atual de "item não encontrado" do detalhe (T062); garantir saída focável. |
| R-012 | M3U guardada: a pessoa escolheu construir o mecanismo "no lugar" também (em vez de aceitar o desvio). | Mais código (`storedFrom`, geração de varredura). | Desenho em `logic/atualizacao-sem-esfriar.md` §4.3; E2E cenário 7. |
| R-013 | `ensureCategory` devolve `stale-served` ao servir do disco de propósito (contrato), mas as telas usam `stale-served` para dizer "Não foi possível atualizar agora". | Aviso mentiroso a cada entrada numa categoria vencida. | Decidido (Fase 3): `loadCategoryContent` converte para `fresh` quando a renovação foi agendada; `stale-served` na tela continua significando falha real. |
| R-014 | Pré-busca por foco (com `AbortSignal`) e agendador compartilham a mesma busca pelo `dedup`; o cursor saindo aborta a busca compartilhada. | O agendador contaria como falha e gastaria tentativas. | Resolvido: `runCategory` tenta de novo uma vez quando o erro é cancelamento. |
| R-015 | A TV não entrega console (`dlog` vazio), então a instrumentação de medição não é legível lá. | Sem medição na TV, FR-012/SC-005 ficam sem veredito. | Build de medição `VITE_CCPLAY_PERF=1` com painel de números (`PerfOverlay`) — fora dele o código some do pacote; leitura feita por quem está em frente à TV. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-30 | Fase 1 (US2 medição) | Instrumentação só-números + roteiro real; PC: canais 0,6 s, séries 1,3 s, filmes 1,7 s p50 / 3,8 s máx — nada perto de 1 min; build de medição instalado na TV | Leitura na TV (painel no canto) |
| 2026-09-30 | Fase 2 (fundação) | `renewCategoryItems` (id preservado, assinatura), `listChannels` por posição, `categoryLoader` com `serveStale`/`renew`/`storage_full`/`storedFrom`; 2/2 contratos | — |

| 2026-09-30 | Fase 3 (US1) | Ordem, portão, agendador, instâncias reais, ponte React, ligação na raiz/telas/camadas; 2/2 contratos; E2E 8/8 | Leitura na TV (Fase 4) |

| 2026-09-30 | Fases 5, 6 e 7 (parcial) | US4 e US3 concluídas (E2E 1, 2, 3b); US5: diff, applyStructureRefresh, atualização no lugar no pipeline (Xtream e M3U), publishGeneration sem apagar itens + collectStaleGenerations em partes, foco no vizinho (lib/focus/reconcileFocus.ts); contrato 3 verde; T063/T064 verdes | T065 (E2E 6–8) começada: painel falso já tem rename/removedVod//lista.m3u, cenários ainda não escritos |

| 2026-09-30 | Fases 7 (fim), 8 e 9 (automático) | E2E cenários 6–8 (atualização Xtream/M3U, vencida > 24 h); linha de estado no Início; suíte completa, lint, build:tizen, test:e2e 19/19; CLAUDE.md e nota na research da 010 | Gate na TV + medição da Fase 4 |

**PRÓXIMO**: na TV — (1) ler o painel do build de medição já instalado (primeira entrada fria, 3 categorias por seção) → T004/T005 → correções T040+; (2) reinstalar o build normal e fazer o gate SC-008 (T073) e o quickstart (T075).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/perf/entryTiming.ts`, `tv-web/src/components/PerfOverlay.tsx`, `tv-web/e2e/carga-listas-real.mjs` — medição (Fase 4 depende da leitura na TV)
- `tv-web/src/lib/catalog/prefetch/` — ordem, portão, agendador, instâncias reais
- `tv-web/src/lib/catalog/catalogRepository.ts` — `renewCategoryItems`, `applyStructureRefresh`, `collectStaleGenerations`, `publishGeneration`
- `tv-web/src/lib/catalog/importPipeline.ts` — atualização no lugar, `sections`
- `tv-web/e2e/carga-listas.mjs` — cenários 1–8 (39 verificações)

## Cuidados para Retomada

- **Build de medição x build normal**: a TV de referência pode estar com o build `VITE_CCPLAY_PERF=1` (painel de números no canto). Antes do gate SC-008, reinstalar com `deploy-tv.ps1` **sem** essa variável.
- A TV não entrega console (`dlog` vazio): qualquer medição lá é pelo painel na tela, lida por uma pessoa.
- Rodar `vitest`/`node e2e/...` sempre de dentro de `tv-web/` — da raiz, o vitest não acha a config e marca tudo como falho.
- Os cenários de atualização do E2E (6/8) dependem de a fila de renovação esvaziar antes de envelhecer uma categoria — sem isso, o cenário 8 falha por corrida do roteiro.
