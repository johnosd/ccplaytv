# Implementation Plan: Metadata de Filmes e Séries — Provedor Primeiro, TMDB (BYOK) Completa, e Tela Integrações

**Slug**: `032-metadata-tmdb-integracoes` | **Date**: 2026-09-29 | **Spec**: `sdd/specs/032-metadata-tmdb-integracoes/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

O detalhe de filme/série passa a mostrar backdrop, sinopse (com "Ver mais"
em modal), gênero, duração, direção, país e elenco em texto, obtidos **do
próprio provedor** ao abrir o detalhe (`get_vod_info` para filme;
`get_series_info.info` para série, reaproveitando a ida que o
`seriesLoader` já faz). Com uma chave TMDB da própria pessoa (BYOK, aba
real "Integrações & BYOK"), o TMDB preenche **só** os campos vazios, por
`tmdb_id` do provedor ou por título + ano com candidato único, marcando
"Dados: TMDB". Tudo fica num cache local por identidade estável (24 h
provedor, 6 meses TMDB). O item TMDB do dock da Home vira status real.
A constitution foi emendada (1.6.0) para permitir a chave BYOK no aparelho.

## Technical Context

**Language/Version**: TypeScript ~5.x, React 19 (`tv-web/`), build Vite 8 com alvo `chrome108`.

**Primary Dependencies**: Dexie 4 (IndexedDB), `@tanstack/react-query`, `fetch` nativo; API TMDB v3 (`api.themoviedb.org/3`, imagens em `image.tmdb.org/t/p/w1280`); protocolo Xtream (`player_api.php`). Nenhuma dependência nova.

**Storage**: IndexedDB via Dexie — **v12** com tabelas novas `titleMetadata` (`'stableId, sourceId'`) e `integrations` (`'id'`) (`data-model.md`).

**Testing**: Vitest + Testing Library + `fake-indexeddb` (unit/contrato); Playwright (`tv-web/e2e/*.mjs`) contra o dev server.

**Target Platform**: Samsung Tizen 8.0 / Chromium 108 (QN50Q60DAGXZD); navegador desktop no desenvolvimento.

**Performance Goals**: abrir o detalhe no mesmo tempo de hoje (SC-002) — metadata é assíncrona e não bloqueia a ação primária. Uma requisição ao provedor por título a cada 24 h; no máximo 2–3 ao TMDB por título a cada 6 meses.

**Constraints**: foco nunca dispara consulta externa; chave BYOK nunca em log/tela/erro/terceiro; backdrop nunca como fundo do `.screen` (plano de hardware AVPlay); tokens do DS V14, sem literais; fonte/asset local (nada de CDN).

**Scale/Scope**: catálogo real medido: 31 413 filmes, 9 663 séries; a feature grava só os títulos cujo detalhe foi aberto.

## Decisões Invariantes

- **D-001** Metadata vive numa tabela própria `titleMetadata`, chaveada por `stableId` (`buildStableId`), nunca em `channels` nem por URL; sobrevive a nova geração e é apagada com a fonte.
- **D-002** Obtenção só ao **abrir** o detalhe (`useTitleMetadata` → `ensureTitleMetadata`). Nenhuma grade, hero de catálogo, Home ou foco chama rede para metadata.
- **D-003** Provedor sempre vence campo a campo; TMDB só preenche vazio; mescla feita na **leitura** (o registro TMDB é guardado inteiro).
- **D-004** Casamento TMDB: `tmdb_id` do provedor primeiro (descartado se o ano diverge > 1 ou 404); senão busca por título normalizado + ano (do registro ou "(AAAA)" do título, só para casar) aceitando **exatamente um** candidato com título comparável e ano ±1. Sem ano → não busca.
- **D-005** "Sem correspondência" e "id morto" também são cacheados por 6 meses; erro (401/429/rede) não é cacheado e não é repetido em laço.
- **D-006** A chave BYOK fica em `integrations` e só `tmdbKeyRepository`/`tmdbConnector` a leem; v3 via `?api_key=`, v4 via `Authorization: Bearer`. Chave recusada nunca é gravada.
- **D-007** "Ver mais" aparece por regra determinística: sinopse com mais de **220** caracteres (`SYNOPSIS_PREVIEW_CHARS`), não por medição de layout.
- **D-008** O backdrop é um `<img>` filho dentro do hero — nunca `background-image` no `.screen.vod-detail` (regra de visibilidade do plano de hardware em `player.css` só esconde filhos).
- **D-009** Série: `get_series_info` é chamado uma vez para episódios **e** metadata (`fetchSeriesInfo` devolve `{episodes, info}`); o painel não declara `tmdb_id` de série, então série só casa por busca.
- **D-010** Cards "Em breve" de Integrações reusam os mocks `dock-ai`, `dock-weather`, `dock-speedtest`; `settings-integrations` e `dock-tmdb` saem de `comingSoon.ts`.
- **D-011** A chave é digitada numa tela própria (`TmdbKeyScreen`, foco DOM real + IME, molde `EpgSettingsScreen`), com o campo sempre vazio ao abrir.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | TMDB é opcional; sem chave o app funciona e US1 entrega sem chave. |
| Segredos Fora dos Clientes e dos Logs | ❌→✅ | ✅ | Violava ("chaves TMDB proibidas no cliente, sem exceção"). **Emendada para 1.6.0** por decisão do usuário (FR-027): exceção BYOK. Mitigações: D-006, `logic/chave-tmdb.md` §6, contrato 4. Credencial do provedor nunca vai ao TMDB (contrato 2). |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Gênero é fato adicional na aba Detalhes; categoria da fonte intacta (FR-007). |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | D-004/D-005; candidato ambíguo não enriquece (contrato 3); campo ausente não é exibido. |
| Comandos Locais Independem de Rede | ✅ | ✅ | Ação primária não espera metadata (contrato 5, FR-005). |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Nenhuma escrita em `userStates`. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | "Ver mais", modal, Integrações, tela da chave e dock por D-pad/OK/RETURN. |
| Lista de Catálogo ≠ Manifesto | n/a | n/a | Não toca importação. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Todo estado novo tem focável; foco nunca dispara consulta (D-002). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Modal devolve a "Ver mais"; `TmdbKeyScreen` e dock voltam a `{panel, integrations}` por `SettingsFocus`. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | D-001 (`stableId`). |
| Progresso e Capacidades São Reais | ✅ | ✅ | Estado do TMDB real (testado), nada de "Conectado" sem teste. |
| Documentação É Canônica | ✅ | ✅ | Polish atualiza `CLAUDE.md` (frase "TMDB/OpenAI keys never reach the client"), backlog, migração DS. |
| Restrição: licenças (atribuição TMDB) | ✅ | ✅ | Texto de atribuição no card + selo "Dados: TMDB". |
| Restrição: Design system | ✅ | ✅ | Só tokens; componentes existentes (`Modal`, `Button`, `TextField`, `EmptyState`). |
| Fluxo: E2E antes da TV | ✅ | ✅ | `e2e/metadata-tmdb.mjs` no `test:e2e`. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/032-metadata-tmdb-integracoes/
├── spec.md
├── plan.md
├── data-model.md
├── quickstart.md
├── logic/
│   ├── metadados-e-casamento.md
│   ├── chave-tmdb.md
│   ├── detalhe-com-metadata.md
│   └── integracoes-e-dock.md
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e/                                   # + metadata-tmdb.mjs, metadata-tmdb-real.mjs
├── package.json                           # test:e2e ganha e2e/metadata-tmdb.mjs
└── src/
    ├── App.tsx                            # rota tmdb-key; dock → Configurações/integrations
    ├── navigation/appNav.ts               # screen 'tmdb-key' + ação
    ├── lib/
    │   ├── comingSoon.ts                  # − settings-integrations, − dock-tmdb
    │   ├── catalog/
    │   │   ├── db.ts                      # v12: titleMetadata, integrations
    │   │   ├── xtreamConnector.ts         # fetchVodInfo; fetchSeriesInfo → {episodes, info}
    │   │   ├── seriesLoader.ts            # grava metadata do provedor na mesma ida
    │   │   └── sourceRepository.ts        # deleteSource apaga titleMetadata
    │   └── metadata/                      # NOVO
    │       ├── types.ts                   # (stub do plan)
    │       ├── titleMetadata.ts           # (stub do plan) ensureTitleMetadata
    │       ├── tmdbKeyRepository.ts       # (stub do plan) save/get/remove/test
    │       ├── providerMetadata.ts        # normalização get_vod_info/get_series_info
    │       ├── tmdbConnector.ts           # único ponto de rede TMDB
    │       └── tmdbMatch.ts               # normalização de título + escolha de candidato
    ├── features/
    │   ├── catalog/catalogApi.ts          # useTitleMetadata (stub funcional), useTmdbStatus
    │   ├── movies/MovieDetailScreen.tsx   # hero com backdrop/sinopse/Ver mais; aba Detalhes
    │   ├── series/SeriesDetailScreen.tsx  # idem
    │   ├── settings/
    │   │   ├── SettingsScreen.tsx         # aba integrations real
    │   │   ├── IntegrationsPanel.tsx      # NOVO
    │   │   ├── TmdbKeyScreen.tsx          # NOVO
    │   │   └── ComingSoonPanel.tsx        # − integrations
    │   └── home/HomeContent.tsx           # dock TMDB real
    └── styles/                            # CSS do detalhe/integrações (arquivo do dono)
```

**Structure Decision**: frontend único em `tv-web/` (client-first, ADR-008). A lógica nova fica em `tv-web/src/lib/metadata/` (sem UI, testável isolada); telas em `features/`. `api/` (fallback congelado) não é tocado.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Chave de terceiro (TMDB) no cliente — resolvida por **emenda** (constitution 1.6.0), não por exceção local | BYOK direto do aparelho é a decisão da ADR-008 §3; sem guardar a chave, não há enriquecimento | Relay/backend próprio reintroduz infraestrutura sempre ligada (ADR-008 rejeitou); não guardar a chave tira o TMDB da feature |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
cd tv-web
npx tsc -b
npm run lint
npx vitest run <arquivo>        # o mais estreito primeiro
npx vitest run                   # suíte completa (flakes conhecidos *.favorites.test.tsx: confirmar isolado com --no-file-parallelism)
npm run build:tizen
npm run test:e2e                 # com npm run dev rodando
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/metadata/titleMetadata.metadata-tmdb.contract.test.ts`,
`tv-web/src/lib/metadata/tmdbKeyRepository.metadata-tmdb.contract.test.ts`,
`tv-web/src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx`

Comando: `cd tv-web; npx vitest run src/lib/metadata src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| filme de painel sem chave TMDB: um get_vod_info, campos com origem "provider", e reabrir não chama a rede de novo | US1/AC1, FR-001/002/003, SC-004 | Fase 3 | `Error: not implemented` (ensureTitleMetadata) |
| com chave: TMDB preenche só o que o provedor deixou vazio, pelo tmdb_id do provedor, e a chave só vai ao TMDB | US3/AC1, FR-007/018/019, FR-013 | Fase 5 | `Error: not implemented` (saveTmdbKey) |
| M3U sem tmdb_id: busca por título + ano; dois candidatos plausíveis não enriquecem, e reabrir não busca de novo | US3/AC2, FR-020/023, Constitution "Nunca Inventam Dados" | Fase 5 | `Error: not implemented` (saveTmdbKey) |
| chave recusada não é salva; chave aceita vira "connected" mascarada…; remover volta a "not_configured" | US2/AC2-3, FR-011/012/013/014, SC-005 | Fase 4 | `Error: not implemented` (saveTmdbKey) |
| com metadata pendente "Assistir" já toca; com sinopse longa, "Ver mais" abre a sinopse completa e RETURN devolve o foco a ele | US1/AC1-2-4, FR-003/004/005 | Fase 3 | `Unable to find … role "button" and name /Ver mais/` |

Vermelho confirmado em 2026-09-29 (5/5, pelos motivos acima); `tsc -b` limpo; suítes de `movies/series/home/lib/catalog` verdes exceto os 2 flakes conhecidos (`MoviesScreen`/`SeriesScreen.favorites.test.tsx`, 8/8 isolados).

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/metadata/types.ts` (tipos definitivos),
`tv-web/src/lib/metadata/titleMetadata.ts` (`ensureTitleMetadata` → `not implemented`),
`tv-web/src/lib/metadata/tmdbKeyRepository.ts` (`saveTmdbKey`/`getTmdbStatus`/`removeTmdbKey` → `not implemented`),
`tv-web/src/features/catalog/catalogApi.ts` (`useTitleMetadata` já funcional, delega ao stub).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 2 (Foundational) | Concluída em 2026-09-29: Dexie v12, `fetchVodInfo`/`fetchSeriesDetail`, `providerMetadata`, `tmdbConnector`, descarte por fonte; `tsc` limpo, 98 testes verdes |
| Fase 3 (US1, P1) | Concluída em 2026-09-29: metadata do provedor no detalhe de filme e série (backdrop, sinopse + "Ver mais", fatos) e sinopse por episódio (FR-028); contratos 1 e 5 verdes |
| Fase 4 (US2, P2) | Concluída em 2026-09-29: chave BYOK (`tmdbKeyRepository`), aba Integrações & BYOK, `TmdbKeyScreen`, rota `tmdb-key`, dock TMDB real; mocks `settings-integrations`/`dock-tmdb` removidos; contrato 4 verde |
| Fase 5 (US3, P3) | Concluída em 2026-09-29: casamento TMDB (`tmdbMatch`/`tmdbLookup`/`tmdbMapping`), ramo TMDB de `ensureTitleMetadata`, cache de 6 meses, estado do TMDB atualizado sem laço; contratos 2 e 3 verdes |
| Fase 6 (Polish) | Concluída em 2026-09-29: `e2e/metadata-tmdb.mjs` (em `test:e2e`, 3/3 verdes) e `-real.mjs` (SC-001 medido: 90 % séries, 87–93 % filmes), docs canônicas, revisão de segredos; gates finais verdes |
| SC-003 | Medido com a chave TMDB real (`e2e/metadata-tmdb-real-match.mjs`): 80 filmes por título + ano sem o `tmdb_id`, contra o gabarito do provedor → 74 certos, **0 errados**, 6 sem correspondência; séries 25/30 casadas e conferidas à mão. Cumprido (amostral) |
| Passada física | **Feita em 2026-09-29** na QN50Q60DAGXZD (deploy por `deploy-tv.ps1`; observado pelo usuário): backdrop sem pintar sobre o vídeo do AVPlay e hero de volta ao sair, sinopse + "Ver mais" + modal + RETURN, TMDB preenchendo a sinopse com o selo "Dados: TMDB" (prova o CORS do `api.themoviedb.org` no WebView), chave digitada pelo IME da TV com "Mostrar chave", dock da Home mostrando "conectado". Resposta do usuário: "tudo funcionou corretamente". R-002 e R-006 resolvidos |
| Aba Elenco | Feita (R-012, T044/T045) a pedido do usuário depois da passada física: aba real com o elenco em texto; mock `cast` removido; testes/E2E ajustados e verdes. **Ainda não reinstalada na TV** — a instalação anterior tem a aba "Em breve" |
| Em aberto | Nada bloqueante. `similar` e páginas de ator seguem no item 45 |
| Contratos | 5/5 verdes; trava íntegra; as 16 travas do repositório íntegras |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Constitution proibia chave TMDB no cliente "sem exceção" (contradizia ADR-008 §3) | Bloqueava a feature | Resolvido: emenda 1.6.0 (2026-09-29, decisão do usuário na spec, FR-027). `CLAUDE.md` precisa acompanhar no Polish. |
| R-002 | CORS do TMDB a partir do WebView da TV (Chromium 108) | Sem CORS, US3 não funciona na TV | Resolvido: confirmado na passada na TV física (2026-09-29, visto pelo usuário — o TMDB preencheu a sinopse com o selo). TMDB é CORS-friendly por design (ADR-008 §3). Imagens de `image.tmdb.org` são `<img>` (sem CORS). |
| R-003 | Nomes de campo variam entre painéis Xtream | Campo ausente num painel diferente | Resolvido: normalização tolerante (`plot`→`description`, `cast`→`actors`, `backdrop_path` array ou string, `duration_secs`→`duration`→`episode_run_time`); campo desconhecido = ausente, nunca erro. Formato real medido em 2026-09-29. |
| R-004 | Série aberta antes desta feature: episódios frescos, sem metadata | Uma chamada extra de `get_series_info` na primeira abertura | Resolvido: aceito (uma vez por série, depois 24 h) e limitado pela R-010 — só ocorre com os episódios já frescos. |
| R-005 | Busca por título casa pouco em M3U (sem ano no nome) | US3 ajuda pouco em listas avulsas | Resolvido: intencional (D-004, "nunca inventar"); medido com a lista e a chave reais (`e2e/metadata-tmdb-real-match.mjs`): 93 % dos filmes com ano casam por título + ano, 0 errados; sem ano não se busca. |
| R-006 | Digitar 32 caracteres (v3) ou ~200 (token v4) no controle remoto | Fricção de UX | Resolvido: v3 recomendado no texto de ajuda; digitar pelo IME da TV foi aprovado na passada física (2026-09-29). Colar pelo celular fica para o item 22/34. |
| R-007 | Episódios: o provedor manda `plot` por episódio, mas exibir a sinopse do episódio não entrou nos FRs | Lacuna percebida | Fora desta entrega (spec: "episódios só exibem o que o provedor já manda" não exige UI nova); candidato a ad-hoc depois. **Resolvido:** o usuário decidiu em 2026-09-29 que a sinopse por episódio é desejável → entra como FR-028 e tasks T041–T043 (dado local vindo do mesmo `get_series_info`; nenhuma consulta nova). |
| R-012 | **Decisão do usuário na passada física (2026-09-29)**: a aba "Elenco" continuava "Em breve" na TV embora o elenco em texto já estivesse na aba Detalhes. A spec deixava "aba Elenco navegável" fora de escopo (item 45); o usuário pediu para ligá-la ao que já existe | Desvio pequeno da spec (Fora de Escopo) | Resolvido: feito como tarefa ad-hoc T044/T045 e aprovado pelo usuário na TV: aba **real** só com a lista de nomes (provedor, ou TMDB onde o provedor não disse), estado vazio honesto, mock `cast` removido. `similar` e páginas de ator ficam no item 45. Mudou 3 testes antigos e 1 E2E (esperavam "Em breve"). Sem nova chamada de rede: usa a mesma metadata já lida. |
| R-011 | Achado pelo E2E: `removeTmdbKey` limpava o banco, mas o cache em memória do React Query (`title-metadata`) continuava com a sinopse do TMDB — invalidar só marcava como "velho", e a sinopse reaparecia por um instante ao reabrir o detalhe | FR-014 violado por ~1 s | Resolvido: `useRemoveTmdbKey` faz `removeQueries` (descarta) em vez de invalidar; teste em `useTitleMetadata.test.tsx` e checagem no E2E. `useSaveTmdbKey` ganhou `gcTime: 0` para a chave digitada (`variables` da mutação) não ficar no cache de mutações. |
| R-010 | Achado pelo E2E: abrir uma série pedia `get_series_info` DUAS vezes (a query de episódios e a de metadata rodam em paralelo), contra a promessa de D-009/SC de "uma requisição" | Requisição duplicada a cada série aberta | Resolvido: `ensureTitleMetadata` adia (`'deferred'`) quando os episódios ainda vão ser buscados — nem o provedor nem o TMDB são chamados nessa passada (o TMDB só completa o que o provedor NÃO trouxe, e ainda não se sabe o que ele trouxe); `useSeriesEpisodes` invalida `title-metadata` quando termina em `fetched`. Só pergunta sozinho quando os episódios já estão frescos e a metadata não (série aberta antes da feature, uma vez). Testes em `titleMetadata.test.ts`/`titleMetadata.tmdb.test.ts`, asserção no E2E. |
| R-009 | Sinopse por episódio (FR-028) só existe onde o provedor a manda: na lista real, ~4 % (483 episódios de 8 séries) a ~30 % (105 de 8 outras) dos episódios a trazem | A faixa de sinopse do episódio fica vazia na maioria dos casos | Resolvido: aceito e honesto: sem texto de preenchimento, e a faixa só reserva altura na temporada em que algum episódio tem sinopse. O TMDB por episódio ficou fora de escopo (decisão do usuário na spec). |
| R-008 | T003 previa `fetchSeriesInfo` devolvendo `{episodes, info}`; isso quebraria 11 chamadas em `xtreamConnector.test.ts` sem ganho | Churn de teste desnecessário | Resolvido: `fetchSeriesInfo` manteve a assinatura (delega) e ganhou `fetchSeriesDetail` → `{episodes, info}`; o `seriesLoader` usa o segundo (T011). Mesma requisição, mesmo comportamento dos episódios. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-29 | Fase 2 (Foundational) | Dexie v12; `fetchVodInfo` e `fetchSeriesDetail` (R-008); `providerMetadata`; `tmdbConnector`; `deleteSource` apaga a metadata da fonte. `tsc` limpo, 98 testes verdes, trava íntegra | `seriesLoader` ainda usa `fetchSeriesInfo` (T011) |
| 2026-09-29 | Fase 3 (US1) | `ensureTitleMetadata` (provedor), `mergeTitleMetadata`, `titleMetadataStore` (também usado pelo `seriesLoader`); sinopse de episódio (FR-028, T041–T043); `DetailMetadata.tsx` + `detailMetadataFormat.ts`; detalhe de filme e série com backdrop/sinopse/"Ver mais"/fatos; contratos 1 e 5 verdes; 4 flakes conhecidos confirmados isolados (106/106) | Ramo TMDB (T031) e chave (T019) ainda stubs |

| 2026-09-29 | Fase 4 (US2) | `tmdbKeyRepository` (save/get/test/remove + `readTmdbCredential`/`markTmdbState`), hooks de status, `IntegrationsPanel` + `RemoveTmdbKeyModal` + `integrationsModel`, `TmdbKeyScreen` (campo vazio, trava síncrona anti-OK duplicado), rota `tmdb-key`, dock TMDB real; `settings-integrations`/`dock-tmdb` saíram de `comingSoon.ts`; 3 testes antigos ajustados; contrato 4 verde; 16 travas do repo íntegras | Ramo TMDB de `ensureTitleMetadata` (T031) |

| 2026-09-29 | Fase 5 (US3) | `tmdbMatch`, `tmdbMapping`, `tmdbLookup`, `storeTmdbResult`, ramo TMDB de `ensureTitleMetadata` (`enrichFromTmdb`), `useTitleMetadata` invalida `['tmdb-status']`; 30 testes novos verdes; contratos 5/5 verdes | E2E, docs e revisão de segredos (Fase 6) |

| 2026-09-29 | Fase 6 (Polish) | `e2e/metadata-tmdb.mjs` + `metadata-tmdb-real.mjs`, docs (`CLAUDE.md`, matriz da migração, backlog), revisão de segredos. O E2E achou 2 bugs de produto (R-010 requisição duplicada da série, R-011 sinopse do TMDB reaparecendo após remover a chave) e 1 erro de rota do próprio script; BOM que eu introduzi no `package.json` removido. Gates: tsc/lint/vitest (3 flakes conhecidos, 103/103 isolados)/build:tizen/test:e2e verdes; 17 travas íntegras | SC-003 e passada física (não gates) |

| 2026-09-29 | Fase 7 (Convergence) | `sdd-converge` achou 3 lacunas MEDIUM: F-01 (backdrop do TMDB sem selo — T046: selo `Dados: TMDB` no hero, com testes e E2E), F-02 (logic/quickstart defasados — T047: alinhados a R-010/R-012/FR-028) e F-03 (README dizia que o TMDB trazia "trailers" — T048: seção corrigida). Gates: tsc/lint/vitest (3 flakes conhecidos, 27/27 isolados)/E2E 2/2/17 travas verdes | Reconverger |

**PRÓXIMO**: `sdd-converge` na 032. SC-003 (chave real) e a passada na TV física já foram feitos (ver Estado Atual). A aba "Elenco" foi ligada a pedido do usuário (R-012); falta reinstalar na TV para ele ver.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/metadata/` (`titleMetadata`, `tmdbKeyRepository`, `tmdbConnector`, `tmdbLookup`, `tmdbMatch`, `tmdbMapping`, `providerMetadata`, `titleMetadataStore`)
- `tv-web/src/features/vod/DetailMetadata.tsx`, `MovieDetailScreen.tsx`, `SeriesDetailScreen.tsx`; `features/settings/{IntegrationsPanel,TmdbKeyScreen,RemoveTmdbKeyModal,SettingsScreen}.tsx`; `features/home/HomeContent.tsx`; `features/catalog/catalogApi.ts`
- `tv-web/e2e/metadata-tmdb.mjs`, `metadata-tmdb-real.mjs`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)

## Resultado Final

**Convergida em 2026-09-29** (`sdd-converge`, 2ª passada, depois de a Phase 7 cobrir F-01…F-03). Os três user stories foram construídos como especificados; os 5 testes de contrato estão verdes com a trava íntegra (e as 17 travas do repositório também).

**O que foi de fato construído**

- **US1 — metadata do provedor no detalhe, sem chave.** O painel Xtream já entrega sinopse, backdrop, gênero, elenco, direção, país e `tmdb_id` (filme em `get_vod_info`; série em `get_series_info.info`); o app não capturava nada disso. `lib/metadata/` normaliza e guarda por `stableId` (Dexie v12, tabela `titleMetadata`; 24 h para o provedor, 6 meses para o TMDB) e o detalhe de filme e de série mostra backdrop (um `<img>` no hero, nunca `background-image` no `.screen`), sinopse em 3 linhas com "Ver mais" (regra: mais de 220 caracteres) abrindo um modal, e Gênero/Duração/Direção/País/Elenco na aba Detalhes — só ao **abrir** o detalhe, nunca por foco nem em lote (provado em Chromium real: percorrer a grade faz zero requisições de metadata).
- **US2 — Integrações & BYOK.** Aba real em Configurações com o card do TMDB (estado, chave só mascarada, capacidades, a atribuição exigida, Configurar/Testar/Editar/Remover), `TmdbKeyScreen` (campo sempre vazio, IME da TV, "Mostrar chave"), cards "Em breve" de IA/Clima/Teste de velocidade reusando os mocks do dock, e o ícone TMDB do dock da Home com o estado real. A constitution foi emendada para **1.6.0** (chave BYOK digitada pela pessoa pode ficar no aparelho).
- **US3 — TMDB só completa lacunas.** O provedor sempre vence, a mescla é feita na leitura; o casamento usa o `tmdb_id` do provedor (descartado se o ano diverge mais de 1 ou o TMDB responde 404) ou título normalizado + ano com **um único** candidato — sem ano, ou com zero/vários candidatos, não enriquece e o "sem correspondência" fica em cache. Selo "Dados: TMDB" em sinopse, fatos, elenco e (T046) backdrop; erro 401/429/rede atualiza o estado em Integrações/dock, nunca vira laço e nunca é cacheado.

**Desvios em relação ao plano original** (todos registrados em Riscos e Decisões)

- **R-008** — `fetchSeriesInfo` manteve a assinatura; `fetchSeriesDetail` devolve `{episodes, info}` da mesma resposta.
- **R-010** — o E2E achou `get_series_info` pedido duas vezes ao abrir uma série; `ensureTitleMetadata` passou a **adiar** (provedor e TMDB) enquanto os episódios ainda vão ser buscados, e `useSeriesEpisodes` invalida `title-metadata` ao terminar.
- **R-011** — o E2E achou a sinopse do TMDB reaparecendo por um instante depois de remover a chave; o cache em memória agora é descartado (`removeQueries`), e a chave digitada usa `gcTime: 0` na mutação.
- **R-012 / FR-028 (pedidos do usuário durante a execução)** — sinopse por episódio (dado local, sem consulta nova; só ~4–30 % dos episódios a trazem neste painel) e a aba **Elenco** real com a lista de nomes (o mock `cast` saiu); Semelhantes e páginas de ator seguem no item 45.
- **Convergência** — F-01 (selo do backdrop do TMDB), F-02 (documentos de desenho defasados) e F-03 (README dizia que o TMDB trazia "trailers") foram cobertos pelas tasks T046–T049.

**Evidência**

- **Automatizada:** `tsc`/lint limpos; `npx vitest run` com 182 arquivos verdes e 3 falhas = os flakes conhecidos de paralelismo (`*.favorites.test.tsx`), 27/27 isolados; `build:tizen` limpo; `npm run test:e2e` (15 roteiros, incluindo `e2e/metadata-tmdb.mjs`, 3/3 execuções seguidas verdes).
- **Lista real:** sinopse **e** backdrop em 90 % das 9.663 séries e 87–93 % dos filmes amostrados (SC-001).
- **Chave TMDB real (SC-003):** 80 filmes casados por título + ano **sem** o `tmdb_id`, contra o `tmdb_id` do próprio provedor como gabarito → 74 certos, **0 errados**, 6 sem correspondência; 30 séries → 25 casadas e conferidas à mão. Amostral, não exaustivo.
- **TV física (QN50Q60DAGXZD, 2026-09-29, visto pelo usuário):** backdrop sem cobrir o vídeo do AVPlay, CORS do `api.themoviedb.org`, chave digitada pelo IME da TV, sinopse com o selo "Dados: TMDB", dock "conectado" e a aba Elenco aprovados.

**Não coberto, de propósito** — nota IMDb (item 29), Trailer (item 32), Semelhantes e páginas de ator (item 45), TMDB por episódio, enriquecimento em lote e metadata na grade/hero do catálogo.