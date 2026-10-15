# Implementation Plan: Classificação indicativa e nota TMDB no Início e no detalhe

**Slug**: `061-classificacao-nota-tmdb` | **Date**: 2026-10-06 | **Spec**: `sdd/specs/061-classificacao-nota-tmdb/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Mostrar a classificação indicativa (país pelo idioma do app: pt → Brasil, en → EUA, es → Espanha) e a nota do TMDB
(com mínimo de votos) no hero do detalhe de filme e de série (P1), no billboard do Início (P2) e no card expandido do
Início (P3). Os dois dados vêm da **mesma** chamada de detalhe do TMDB que o app já faz ao abrir (`append_to_response`
ganha `release_dates`/`content_ratings`), são guardados no registro `titleMetadata` existente (BR, US e ES de uma vez,
para a troca de idioma não consultar) e um registro `matched` anterior à 061 é reconsultado uma única vez ao abrir
(mesmo molde da 033/035). No card expandido do Top 10 e da Dica, a nota vem do cache da descoberta da 057. Dois
componentes novos de apresentação (`ContentRatingBadge`, `TmdbRatingBadge`) e regras puras em `contentRating.ts`.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Vite 8 (build mirando `chrome108`).

**Primary Dependencies**: `@tanstack/react-query` (`useTitleMetadata`, `useCachedTitleView`, `useDiscoveryRow`), Dexie
(IndexedDB) via `tv-web/src/lib/catalog/db.ts`, catálogo i18n próprio (`tv-web/src/lib/i18n/`, feature 054).

**Storage**: IndexedDB, tabela `titleMetadata` (feature 032) — campos novos dentro de `tmdb.fields` (objeto já
existente, sem índice) → **sem bump do Dexie** (segue v16; a v17 continua livre). Cache da descoberta (`discoveryCache`,
057) já guarda `voteAverage`/`voteCount`.

**Testing**: Vitest em dois projetos (`dom` para `*.test.tsx`, `node` para `*.test.ts`), Testing Library, IndexedDB
falso nos testes de `lib/`; E2E Playwright em `tv-web/e2e/` (`node e2e/run.mjs`).

**Target Platform**: TV Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120), palco 1920 × 1080; dev em navegador.

**Performance Goals**: nenhuma requisição a mais por abertura de detalhe ou do Início para registro já no formato novo;
uma reconsulta por título antigo, só ao abrir (SC-001).

**Constraints**: constitution "Foco Visível e Sem Becos Sem Saída" (focar nunca consulta), "IA e Classificação Nunca
Inventam Dados" (nenhum valor adivinhado, nenhum país de reserva), "Segredos Fora dos Clientes e dos Logs" (chave
BYOK só ao TMDB), tokens V14 (nenhuma cor literal fora de `index.css`), i18n pt/en/es.

**Scale/Scope**: uma pessoa por TV; lista real de ~55 mil itens; os campos só existem para títulos abertos (detalhe ou
billboard) com chave TMDB.

## Decisões Invariantes

- **D-001** Fonte única dos dois dados: a chamada de detalhe do TMDB que `lookupTmdb` já faz (`detailParams`), com
  `release_dates` (filme) ou `content_ratings` (série) somados ao `append_to_response`. Nenhuma chamada nova, nenhuma
  rota nova. O provedor (Xtream) não é fonte nesta feature.
- **D-002** `TitleFields.certifications` é **sempre** gravado pelo `mapTmdbDetail` (`{}` quando nenhum país serve); a
  ausência da chave num registro `matched` = registro anterior à 061 → reconsulta uma vez (`tmdbLacks061`, molde da
  033/035). `tmdbRating` é opcional.
- **D-003** Guardam-se BR, US e ES; quem mostra escolhe o país pelo idioma (`CERTIFICATION_COUNTRY`). Nunca país de
  reserva. Valores validados pelos conjuntos de `logic/classificacao-e-nota.md` §2 (medidos no TMDB real).
- **D-004** `TMDB_MIN_VOTES = 50`. Abaixo disso (ou média ≤ 0) a nota TMDB não aparece.
- **D-005** Componentes novos e separados: `ContentRatingBadge` e `TmdbRatingBadge` em `tv-web/src/components/`. O
  `RatingBadge` da 055 **não muda** (contrato travado: nunca diz TMDB).
- **D-006** Ordem na metadata: ano · duração/temporadas · `★ Provedor` · classificação · `TMDB` (protótipo `hbMeta`).
- **D-007** Card expandido: só cache local (`useCachedTitleView`) + nota da descoberta (`DiscoveryRowResult.ratings`,
  opcional como `images`); nunca `useTitleMetadata` (que consulta) no card.
- **D-008** Cores oficiais da escala brasileira viram tokens `--rating-br-*` em `tv-web/src/index.css`; EUA/Espanha
  usam tokens neutros existentes.
- **D-009** Pôsteres não expandidos, grades e vitrine de Filmes/Séries ficam como estão (FR-013).
- **D-010** Fechamento de docs: a Spec V14 deixa de marcar os dois como "dado novo" (seções Home l. ~1526 e Detalhe
  l. ~1593) só depois do código pronto (FR-020).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada novo de conta; sem chave TMDB as telas são as de hoje (FR-015). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Chave BYOK só vai ao TMDB pelo `tmdbConnector` existente; nenhum log novo; a sonda de 2026-10-06 leu o `.env` sem imprimir. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Classificação e nota são aditivas; o chip da categoria da lista não muda; nota do provedor e do TMDB lado a lado (FR-009). |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Só valores válidos do país do idioma; sem reserva de outro país; sem nota abaixo de 50 votos (D-003, D-004). |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Troca de idioma muda o selo a partir do guardado (FR-003, SC-005). |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | ✅ | ✅ | Só leitura/escrita em `titleMetadata`; nenhum `userStates`. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Selos não são ações; nenhum foco novo. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | Não toca importação. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Selos não focáveis; focar o card expandido nunca consulta (D-007); a reconsulta da §5 só acontece ao abrir. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Sem mudança de navegação. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Cache por `stableId` (032), inalterado. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ | ✅ | Ausência de dado = ausência de selo, nunca placeholder. |
| Documentação do Repositório É Canônica | ✅ | ✅ | Spec V14 atualizada no fechamento (D-010); backlog e README no Polish. |

Restrições: tokens V14 (D-008) ✅; licença TMDB exige atribuição — o selo diz "TMDB" e a origem segue declarada ✅.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/061-classificacao-nota-tmdb/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/
    └── classificacao-e-nota.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── index.css                         # tokens --rating-br-* (novos)
│   ├── styles/shared.css                 # .content-rating-badge, .tmdb-rating-badge (novos)
│   ├── components/
│   │   ├── ContentRatingBadge.tsx        # novo (stub)
│   │   ├── TmdbRatingBadge.tsx           # novo (stub)
│   │   └── RatingBadge.tsx               # 055 — NÃO muda
│   ├── lib/
│   │   ├── catalog/db.ts                 # TitleFields + CertificationCountry/Certifications/TmdbRating (já adicionados)
│   │   ├── i18n/messages/components.ts   # rating.content.* (pt/en/es)
│   │   └── metadata/
│   │       ├── contentRating.ts          # novo (stub): regras puras
│   │       ├── tmdbLookup.ts             # append_to_response
│   │       ├── tmdbMapping.ts            # mapTmdbDetail grava os dois campos
│   │       ├── titleMetadata.ts          # tmdbLacks061 + mergeTitleMetadata
│   │       └── types.ts                  # TitleMetadataView (já adicionados)
│   └── features/
│       ├── catalog/catalogApi.ts         # DiscoveryRowResult.ratings
│       ├── home/HomeContent.tsx          # billboard + mapa de notas da descoberta
│       ├── home/HomeTitleCard.tsx        # HomeCardExpanded
│       ├── movies/MovieDetailScreen.tsx  # hero
│       └── series/SeriesDetailScreen.tsx # hero
└── e2e/
    ├── run.mjs                           # SUITE
    └── classificacao-nota-tmdb.mjs       # novo
docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md   # D-010
```

**Structure Decision**: frontend único em `tv-web/` (client-first, ADR-008); `api/` congelado não é tocado. Regras
puras em `lib/metadata/`, apresentação em `components/`, telas em `features/`.

## Complexity Tracking

Nenhuma violação.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (TV física é recomendação, não gate: a feature é visual e de
dado, sem capacidade de player — constitution "Validação em hardware real").

Comandos-base (de `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run src/lib/metadata src/components src/features/movies src/features/series src/features/home src/features/catalog
npm run test            # suíte inteira
npm run build
node e2e/run.mjs        # com `npm run dev` na 5173
node e2e/run.mjs --only classificacao-nota-tmdb --jobs 1
```

Travas (da raiz):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 061-classificacao-nota-tmdb
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 055-campos-da-listagem-xtream
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 035-semelhantes-elenco-ator
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 033-trailers-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 059-detalhe-cinema-filme-serie
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 060-home-vitrine-expandida
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5/5):
`tv-web/src/lib/metadata/contentRating.classificacao-nota-tmdb.contract.test.ts` (2),
`tv-web/src/components/ContentRatingBadge.classificacao-nota-tmdb.contract.test.tsx` (1),
`tv-web/src/lib/metadata/titleMetadata.classificacao-nota-tmdb.contract.test.ts` (1),
`tv-web/src/features/movies/MovieDetailScreen.classificacao-nota-tmdb.contract.test.tsx` (1).

Comando (de `tv-web/`):

```powershell
npx vitest run src/lib/metadata/contentRating.classificacao-nota-tmdb.contract.test.ts src/components/ContentRatingBadge.classificacao-nota-tmdb.contract.test.tsx src/lib/metadata/titleMetadata.classificacao-nota-tmdb.contract.test.ts src/features/movies/MovieDetailScreen.classificacao-nota-tmdb.contract.test.tsx
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `extrai só valores válidos de BR, US e ES…` | FR-006, FR-007, Edge Cases; Constitution: IA e Classificação Nunca Inventam Dados | Fase 2 | `Error: not implemented` |
| `nota do TMDB: … pelo menos 50 votos` | FR-002, FR-008, SC-004 | Fase 2 | `Error: not implemented` |
| `mostra só a classificação do país do idioma…` | FR-004, FR-005, FR-016, SC-003, SC-005 | Fase 2 | `Error: not implemented` |
| `registro TMDB gravado antes da 061 é consultado UMA vez…` | FR-001, FR-002, FR-003, FR-014, SC-001, US1/AC6 | Fase 2 | `expected [] to deeply equal [ '/3/movie/603' ]` |
| `hero: "★ 7,4 Provedor", depois o selo… "TMDB 7,8"…` | US1/AC1+AC3, FR-009, FR-010, FR-016 | Fase 3 | `Unable to find a label with the text of: Classificação indicativa: 14 anos` |

Confirmado em 2026-10-06: os 5 vermelhos pelo motivo da tabela; `tsc -b` limpo; suíte da área (metadata, catalog,
components, movies, series, home, vod, catalog) 247 arquivos / 1576 testes verdes além dos 5.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/metadata/contentRating.ts`
(4 funções `not implemented` + constantes prontas), `tv-web/src/components/ContentRatingBadge.tsx` e
`TmdbRatingBadge.tsx` (`not implemented`); tipos já adicionados em `db.ts` (`CertificationCountry`, `Certifications`,
`TmdbRating`, campos em `TitleFields`) e `types.ts` (`TitleMetadataView.certifications`/`tmdbRating`).

Testes adicionais (escritos no execute, não travados): `tmdbMapping.test.ts` (campos gravados, `{}` sempre), testes de
`mergeTitleMetadata` (só `matched`), `TmdbRatingBadge.test.tsx` (formato en "TMDB 7.8", nada focável),
`ContentRatingBadge` (L → "livre", cores por classe), `SeriesDetailScreen` (hero), `HomeContent`/`HomeTitleCard`
(billboard e expandido, sem consulta ao focar), `catalogApi` (`ratings` da descoberta).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (T001–T002) | Concluído: textos pt/en/es e tokens brasileiros disponíveis. |
| Validação do Setup | 18/18 testes de i18n verdes; `npx tsc -b` limpo; lint sem erros (avisos em arquivos existentes). |
| Contratos 061 | 5/5 verdes na suíte completa; dez travas íntegras (oito do gate e 049/046 dos desvios autorizados). |
| Fundação (T003–T014) | Concluída: regras, chamada única, cache, atualização de registros antigos e selos. |
| US1 — Detalhe | Concluída: filme e série, contrato e testes verdes. |
| US2 — Billboard | Concluída: dados do hero; boas-vindas sem selos. |
| US3 — Cards expandidos | Concluída: cache local e notas da descoberta; sem consulta por foco. |
| Polish | Concluído: quickstart simulado e SC-006 real aprovados; 2841 testes verdes, lint/tipos/build/build Tizen aprovados após T038; V14/README atualizados. |
| Gate E2E geral | 41/41 scripts verdes em 405 s na versão final, sem retries, incluindo paginação e a regressão por rajadas de T038. Dez travas íntegras. |
| SC-006 real | Usuário autorizou; dez títulos reais verificados, três com classificação BR, 3/3 selos corretos (100%). Segunda abertura sem reconsulta; capturas apenas no temporário. |
| Ambiente | Autenticação restabelecida; comandos escalados novamente funcionam. |
| Progresso | 46/46 itens obrigatórios concluídos; status Implementada. T035 preservada como recomendação não executada, sem checkbox e fora da contagem conforme esta Estratégia de Testes. |
| TV física | Não executada; recomendação de legibilidade das cores sobre backdrops, sem bloqueio de implementação. Nenhum aceite AVPlay/hardware inferido do navegador. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Conjuntos de valores aceitos por país (logic §2) vieram de uma sonda de 50 filmes + 50 séries populares (2026-10-06); valores raros (ex.: `TV-Y7-FV`, `X`, `AL`) ficam de fora | Título raro sem selo | Resolvido: Aceito pela regra "nunca inventar"; ampliar a tabela só com evidência real, registrando aqui |
| R-002 | A 054 já relê o TMDB ao abrir num idioma diferente do gravado (`tmdbInOtherLanguage`) | Pode parecer que a troca de idioma "consulta por causa da classificação" | Resolvido: A classificação muda na hora a partir do guardado (contrato ContentRatingBadge); a releitura da 054 é a de antes (SC-005 redigido assim) |
| R-003 | Testes NÃO travados que semeiam `tmdb: { status: 'matched', fields: {…} }` sem `certifications` e esperam 0 requisições, ou comparam `fields` com `toEqual` exato (ex.: `titleMetadata.trailers.test.ts:55`, `titleMetadata.test.ts`, `tmdbMapping.test.ts`) | Vermelhos fora do contrato | Resolvido: Atualizar no mesmo passo citando a 061 (acrescentar `certifications: {}` na semente ou `toMatchObject`); nunca editar os travados |
| R-004 | Contratos travados de outras features que tocam a chamada de detalhe (`titleMetadata.semelhantes.contract`, `.trailers.contract`, `.metadata-tmdb.contract`, 035/033/032) | Quebrar trava alheia | Resolvido: Conferido no plan: usam `arrayContaining` no `append_to_response` e o da 035 já espera exatamente 1 reconsulta de um registro antigo; rodar as travas 033/035/032 no fim de cada fase |
| R-005 | `HomeContent.tsx` já tem 864 linhas (R-008 da 060) | Arquivo cresce mais | Resolvido: Lógica nova fora dele (`contentRating.ts`, componentes); no `HomeContent` só a montagem do mapa de notas e duas linhas no `meta` |
| R-006 | Mocks antigos de `useWeeklyTop10`/`useDailyTip` não devolvem `ratings` | Exceção no Início em testes antigos | Resolvido: `ratings` opcional em `DiscoveryRowResult` (como `images`), leitura com `?? vazio` |
| R-007 | T031: a chave de query da 054 muda no mesmo detalhe ao trocar idioma, deixando data vazio enquanto relê | Selo poderia desaparecer durante a consulta de sinopse | Resolvido: T036 mantém apenas certifications/tmdbRating do mesmo item como placeholder local; não mantém textos no idioma anterior nem dados de outro título. Teste adicional do hook verde. E2E considera a releitura já permitida por SC-005/R-002. |
| R-008 | Medição SC-006 usa credenciais reais de QA do .env | Uso de segredo nos serviços externos configurados | Resolvido: usuário autorizou explicitamente a medição real em 2026-10-06; roteiro criado e executado com navegador isolado, contagens públicas e capturas no temporário. Dez títulos verificados; 3/3 com classificação BR exibiram selo. Nenhum segredo na saída, DOM ou console. |
| R-009 | T032: E2E detectou corrida preexistente na paginação Live TV; usuário autorizou investigar/corrigir em 2026-10-06 | Quadros antigos apagavam destinos mais recentes, perdendo toques em rajadas | Resolvido: T037 usa destino pendente com índice/id; somente callback atual aplica foco, limpar apenas quando alcançado ou invalidado pela lista. Regressão não travada reproduziu Canal 01 em vez de 08 antes da correção; 263 testes Live/foco e paginação na suíte geral verdes. |
| R-010 | Novo achado no gate após T037: Maximum update depth exceeded em memoria-foco-key-repeat, no fluxo de zapping | Flushes síncronos repetidos do virtualizador da Live em rajadas de scroll podem atingir o limite do React | Resolvido: T038 autorizado, reproduzido com 100 eventos de scroll; pilhas em useOverflowEdges/setState e depois virtualizador/flushSync. Alterar só o hook não bastou e foi descartado; correção mínima em LiveScreen, `useFlushSync: false`. Regressão incorporada ao E2E padrão e ensaio original passam com hook compartilhado intacto. Versão final: 2841 testes e 41/41 E2E verdes, sem retries. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-06 | Fase 1 — Setup | T001–T002: chaves acessíveis pt/en/es e 12 tokens de classificação brasileira; 18/18 testes i18n verdes, tipos limpos, lint sem erros e trava 061 íntegra. | Confirmação para iniciar a Fase 2 (modo pausado). |
| 2026-10-06 | Fase 2 — Fundação | T003–T014 concluídas; 4/4 contratos da fase verdes após vermelho esperado; 543 testes metadata/components verdes; tipos limpos, contratos relacionados verdes e travas íntegras. Usuário autorizou modo contínuo. | Integrar no detalhe (US1). |
| 2026-10-06 | Fase 3 — US1 | Heroes de filme/série integrados; contrato do filme verde após vermelho esperado, 61 arquivos / 359 testes da área verdes; travas 061/059/055 íntegras. | Billboard (US2); revisão visual no Polish. |
| 2026-10-06 | Fase 4 — US2 | Billboard com selos após a nota do provedor; 12 arquivos / 85 testes Home verdes, travas 061/060/026 íntegras. | Cards expandidos e notas da descoberta (US3). |
| 2026-10-06 | Fase 5 — US3 | Notas Top 10/Dica e cache local nos cards expandidos; 68 arquivos / 367 testes verdes, tipos limpos, contratos 057/060 e teste sem fetch ao focar verdes; travas íntegras. | E2E, medição real e docs (Polish). |
| 2026-10-06 | Fase 6 — em andamento | Roteiro 061 criado e registrado; primeira execução com timeout na abertura do filme, fixture/SELECT ajustados (reteste pendente). Lint exit 0; import não usado corrigido. Auto-review impediu suíte completa, build e travas finais por falha de autenticação. | Restabelecer sessão e executar validação final; feature ainda Em Execução. |
| 2026-10-06 | Fase 6 — validação | Retomada após restabelecer autenticação. T031/T036 verdes; quickstart 1–10 simulado e capturas revisados. 450 arquivos / 2840 testes verdes, tipos/lint/build/build Tizen aprovados, oito travas íntegras. E2E geral 40/41, com falha alheia na Live TV; V14/README atualizados. Auto-review rejeitou medição real sem autorização específica. | Decidir achado Live TV e autorizar medição SC-006; ainda não Implementada. |
| 2026-10-06 | Fase 6 — desvio autorizado | Usuário decidiu investigar/corrigir Live TV. T037: corrida de callbacks reproduzida em teste adicional, corrigida sem editar contratos. 41 arquivos / 263 testes Live/foco verdes e 4/4 E2E direcionados; trava 049 e 061 íntegras. | Suíte completa/builds novamente; autorização SC-006 real pendente. |
| 2026-10-06 | Fase 6 — checkpoint T037 | T037 concluída: paginação verde na suíte completa; 450 arquivos / 2841 testes, lint, tipos e ambos builds verdes. E2E geral 40/41 em 417 s: novo erro em memória de foco; execução direcionada posterior 3/3, sem considerar a falha resolvida. Travas 046/049/061 íntegras. | Decisão sobre novo achado R-010 e autorização SC-006 real; ainda Em Execução. |
| 2026-10-06 | Fase 6 — QA real e T038 | Usuário autorizou investigar/corrigir R-010 e usar credenciais reais para SC-006. T033: dez títulos reais, 3/3 com BR exibem selo, sete sem BR não usam reserva; segunda abertura sem consulta; capturas no temporário. Polling E2E assíncrono corrigido. R-010 ainda aberto após 21 execuções e ensaio de 60 ciclos sem reprodução; suíte geral em diagnóstico com pilha. | Capturar/corrigir origem de R-010; depois fechar gates e status. |
| 2026-10-06 | Fase 6 — correção T038 | Reprodução por rajada de scroll capturou pilhas do erro; `useFlushSync: false` no virtualizador Live elimina o ciclo, sem alterar o hook compartilhado. Regressão padrão em memoria-foco-key-repeat; 4/4 E2E direcionados verdes. Suíte de diagnóstico anterior terminou 41/41, sem usar o reteste como prova da correção. | Gates completos após a correção mínima; então fechar release. |
| 2026-10-06 | Fase 6 — concluída | T032/T033/T034/T036/T037/T038 e release concluídos: 450 arquivos / 2841 testes, tipos/lint/build/build Tizen e dez travas aprovados. E2E final 41/41 em 405 s, sem retries; SC-006 real 3/3 com classificação BR em dez títulos. V14/README/spec/tasks/backlog sincronizados. T035 mantida sem checkbox como recomendação não executada, conforme o plano. | Nenhuma bloqueante; sdd-converge disponível. TV física continua recomendação. |

**PRÓXIMO**: `sdd-converge sdd/specs/061-classificacao-nota-tmdb` para auditar a implementação contra spec/plano/constitution; passada de legibilidade na TV física permanece recomendação, não gate.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/metadata/{contentRating,titleMetadata,tmdbLookup,tmdbMapping}.ts` — regras e origem/cache dos dados.
- `tv-web/src/components/{ContentRatingBadge,TmdbRatingBadge}.tsx` — apresentação acessível dos selos.
- `tv-web/src/features/{home,movies,series}` — integração nos heroes e cards expandidos.
- `tv-web/e2e/classificacao-nota-tmdb.mjs` — quickstart simulado com SELECT/RETURN/foco.
- `tv-web/e2e/classificacao-nota-tmdb-real.mjs` — SC-006 real, fora da SUITE e sem segredos na saída.
- `tv-web/src/features/live/useLiveKeyboard.ts` e `LiveScreen.tsx` — desvios autorizados T037/T038.
- `tv-web/e2e/memoria-foco-key-repeat.mjs` — regressão de rajadas, diagnóstico com pilha e ensaios opcionais.
- `sdd/specs/061-classificacao-nota-tmdb/{tasks,quickstart}.md` — release e evidências de validação.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Nesta execução, o sandbox Windows falhou ao iniciar terminal e Node com `helper_unknown_error: apply deny-read ACLs`; comandos necessários rodaram com `require_escalated`, após aprovação automática. `apply_patch` funcionou no workspace.
- No Polish, a revisão automática falhou com token que não pode ser renovado após saída/troca de conta. Os comandos rejeitados não executaram; não contornar a revisão. Restabelecer autenticação antes dos próximos comandos escalados.

## Resultado Final

**Convergida em 2026-10-06**, sem lacunas acionáveis contra FR-001–FR-020, SC-001–SC-006, as três user stories,
as decisões D-001–D-010 e os princípios aplicáveis da constitution. Os 46 itens obrigatórios estão concluídos;
`tasks.md` permaneceu byte-idêntico durante a convergência. Nenhum código-fonte foi alterado nesta auditoria.

### Implementação confirmada

- Classificações BR/US/ES e nota TMDB obtidas na chamada de detalhe existente e guardadas em `titleMetadata`, sem
  versão ou índice novo no Dexie. `certifications: {}` distingue resposta nova sem classificação de cache anterior
  à 061; registros antigos `matched` renovam uma vez ao abrir, nunca por foco ou em lote (FR-001–003, FR-014).
- País pelo idioma, sem reserva; valores validados por tipo de conteúdo, cores brasileiras por tokens, selo neutro
  para US/ES e nome acessível traduzido. Nota com média positiva, pelo menos 50 votos, origem TMDB e uma casa
  decimal no idioma do app (FR-004–008, FR-016–018).
- Selos nos heroes de filme/série, billboard e card expandido, após a nota do provedor. Cards leem somente o cache
  local e as notas já obtidas do Top 10/Dica, com precedência da metadata; pôsteres pequenos e boas-vindas não
  recebem os novos selos. Nenhuma consulta disparada por foco (FR-009–013, SC-002).
- Sem casamento, classificação válida ou nota elegível, o respectivo selo fica ausente; chave BYOK segue o fluxo
  existente, sem novos logs ou exposição. Spec V14 e README já refletem o comportamento entregue (FR-015, FR-019–020).

### Desvios e decisões acumulados

- T036 acrescentou um placeholder apenas de classificação/nota do mesmo título durante a releitura de idioma da
  054. Não preserva textos no idioma anterior nem dados de outro título; mantém a exceção prevista em SC-005/R-002.
- T037 e T038 corrigiram achados da Live TV com autorização explícita: destinos pendentes de paginação protegidos
  contra callbacks antigos e `useFlushSync: false` no virtualizador para evitar ciclos em rajadas de scroll. Testes
  de regressão foram acrescentados fora das travas; o hook compartilhado de bordas permaneceu intacto.
- Roteiros 061 passaram a usar `expect.poll` aguardando a leitura assíncrona do IndexedDB. A medição real usa as
  credenciais de QA autorizadas, com capturas apenas no temporário e resultados sem segredos. Nenhuma decisão
  invariante foi substituída, nem houve emenda aos contratos travados.
- As mitigações R-001–R-006 foram confirmadas por esta auditoria e receberam `Resolvido:`; R-007–R-010 já estavam
  resolvidos e tiveram sua evidência conferida. Os conjuntos conhecidos de classificação continuam limitados à
  regra documentada; valores raros não são adivinhados.

### Evidência de aceite

- Nesta convergência: pré-requisitos aprovados; 5/5 contratos em quatro arquivos verdes novamente; dez travas
  íntegras (061/055/035/033/032/059/060/057/049/046); E2E `classificacao-nota-tmdb` aprovado novamente em 16,7 s.
- Gates da versão final, registrados na execução: 450 arquivos / 2841 testes verdes; tipos, lint, build e build
  Tizen aprovados; suíte E2E completa 41/41 em 405 s, sem retries. Não houve mudança de código após esses gates.
- SC-006: dez títulos reais distintos verificados; três tinham classificação BR válida e os três exibiram o selo
  correto (100% do denominador elegível). Sete sem BR não usaram reserva; dez segundas aberturas sem reconsulta.
  A amostra real não tinha notas TMDB elegíveis; esse caso foi verificado por fixtures e contratos.
- README não recebeu alteração nesta convergência: a descrição da feature 061 já cobre os dados, países, mínimo
  de votos e uso de cache. Spec e painel do backlog passam a Convergida.

**Recomendação remanescente, fora dos gates**: T035, legibilidade dos selos na TV física sobre backdrops claros e
escuros, não executada. A convergência não declara validação de hardware, AVPlay, codecs ou desempenho.
