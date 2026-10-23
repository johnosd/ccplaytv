# Handoff — 086-montagem-rapida-telas

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. Stack: `tv-web/` (React 19 + TS + Vite 8, Dexie 4 / IndexedDB, Vitest
  `dom`+`node`, Playwright E2E).
- Próximo comando: `/sdd-execute 086-montagem-rapida-telas`. No backlog: **Planejada**, 0/48 tasks.
- Origem: `sdd/assessments/montagem-lenta-das-telas-principais-inicio/` (veredito `go`), com as medições de 2026-10-20.

## O que a feature entrega

- **P1 (US1)**: as fileiras calculadas (Adicionados, Bem avaliados, Top 10, Dica, Porque você assistiu) vêm de **candidatos
  guardados por categoria**, escritos por quem grava a categoria. A abertura deixa de varrer 43 510 filmes / 9 768 séries.
  **E seguem atualizadas na sessão**: o usuário foi explícito — guardar dado não pode significar mostrar dado velho.
- **P2 (US2)**: nenhuma das três telas revela pelo teto, e **a montagem nunca espera rede** (Top 10/Dica leem resultado
  guardado; a consulta roda fora da abertura).
- **P3 (US3)**: renderização — tempo entre ter os dados e estar desenhada, e quadros da navegação.
- **P4 (US4)**: a primeira tela primeiro — prioridade às capas visíveis; o que está abaixo da dobra se prepara ao aproximar.
- Decisão que contraria a expectativa óbvia: **o conteúdo das fileiras não pode mudar** (FR-004). A velocidade vem de onde o
  dado é lido, nunca de mostrar menos itens.

## Leitura obrigatória, em ordem

1. `spec.md` — escopo, 4 user stories, FR-001 a FR-028, SC-001 a SC-013 e 24 clarificações do usuário.
2. `plan.md` — D-001 a D-009 (regras travadas), Constitution Check, Riscos R-001 a R-008, Estratégia de Testes.
3. `logic/selecoes-guardadas.md` — **o coração do desenho**: as duas estruturas, por que a decomposição por categoria é
   exata, o caso de borda do dedupe e os 6 invariantes.
4. `tasks.md` — 7 fases. **A Fase 1 mede na TV antes de qualquer mudança de desenho.**
5. `quickstart.md` — checagens, roteiro na TV (linha de base e validação).
6. `.planning/memory/constitution.md` — "Foco Visível e Sem Becos Sem Saída" e o "Fluxo de Desenvolvimento" (E2E antes da TV).

## Testes de contrato

- `tv-web/src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts` — 4 testes (C1–C4, Fase 3).
- `tv-web/src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts` — 1 teste (C5, Fase 3).
- Rodar (em `tv-web/`):
  `npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts`
- Trava (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas`
- **Travas de outras features que esta pode quebrar**: 052/056/065 (`features/vod/vodShowcase.*.contract.test.ts`,
  `ratedSelection*.contract.test.ts` — a D-006 existe por causa delas), 066, 079
  (`screenAssembly.home-carregamento-progressivo.contract.test.ts`), 082 e 085.

## Stubs criados

- `tv-web/src/lib/catalog/showcaseCandidates.ts` — `RECENT_CANDIDATES` (12), `RATED_CANDIDATES` (48), os tipos e
  `pickCandidates`/`writeCandidates`/`clearCandidates`/`readCandidates` com `not implemented`.
- `tv-web/src/lib/catalog/showcaseRows.ts` — `buildShowcaseRowsFromCandidates`, `readExternalRow`, `writeExternalRow` e os
  tipos das fileiras externas.
- `tv-web/src/lib/catalog/showcaseSelection.ts` — `selectShowcaseRowsByScan` (a varredura de hoje, a ser **movida** para cá
  pela T012; serve de referência do contrato C1 e de caminho de reserva).

## Armadilhas já mapeadas

- **`lib/` não pode importar de `features/`** (ratchet `lib-to-ui`). Por isso a T011 move os acumuladores de seleção para
  `lib/catalog/showcaseSelection.ts` e faz `features/vod/*` **reexportar** — sem isso, três contratos travados de outras
  features quebram (R-004).
- **Não reimplemente a seleção.** A igualdade do conteúdo (FR-004, contrato C1) depende de usar os mesmos acumuladores, na
  mesma ordem de alimentação (categoria na ordem da fonte, itens na ordem do bloco) — os desempates dependem disso.
- **Filtro de categoria escondida/PIN é na leitura**, nunca no dado guardado (D-003): é o que faz mudar o PIN refletir sem
  recalcular. O contrato C2 verifica isso sem recalcular candidatos entre as duas montagens.
- **Achado da exploração (R-005)**: em `features/catalog/prefetchApi.ts` → `flush()`, o índice de busca tem limite de 1
  remontagem por 10 s, mas a **chave da vitrine** (6 elementos) cai no `predicate: queryKey.length !== 3` e é invalidada a
  cada lote da pré-carga (até 1/s) — hoje cada uma revarre o tipo inteiro. Com a leitura barata deixa de doer; confirme na
  medição antes de mexer.
- **A Home não tem virtualização vertical** (as vitrines têm): as 5 fileiras são desenhadas de uma vez. Pode ser parte do
  custo de renderização — **medir primeiro** (R-006), não presumir.
- **Top 10/Dica precisam do índice de nomes do tipo** para casar títulos; esse casamento continua caro e por isso roda fora
  da abertura (D-004). Não o traga de volta para a montagem.
- **Ratchet de 300 linhas** nos arquivos de produção novos.
- **No PowerShell, `npm run x -- --flag` perde o `--`**: rode o E2E com `--only` pelo Bash.
- **TV**: cada instalação pede autorização antes (memória do usuário); ao fim, reinstalar o pacote normal, avisando. O `sdb`
  às vezes recusa a conexão logo depois de uma instalação — reconectar (`sdb disconnect` + `connect`) resolve; se travar ao
  lançar o app, a instalação já foi feita e basta abrir pela TV.
- **Nunca ler `staging.env.yaml`**; credenciais reais só pelo `.env` da raiz, nunca impressas.

## Pendências do Analyze

- **A-01 (MEDIUM)**: o SC-004 (montar as fileiras ≤ 100 ms) não tem linha de base na TV — só a estimativa de ~1,2 s vinda do
  PC. A Fase 1 (T003) precisa medir isso antes, senão o critério fica sem referência.
- **A-02 (MEDIUM)**: as US3 e US4 dependem do resultado da medição para saber **o que** atacar; as tasks T040 e T050 estão
  deliberadamente abertas. Se a Fase 1 não acontecer, elas viram adivinhação — pare e reporte em vez de chutar.
- **A-03 (LOW)**: o FR-019 (`paintMs`) e o FR-020 (quadros) são medidos pelo canal, mas não têm teste automatizado possível
  no PC — a verificação é a comparação com a linha de base na TV (SC-008, SC-009).
- **A-04 (LOW)**: o FR-025 (preservar virtualização e carregamento preguiçoso) é uma garantia de não-regressão sem teste
  próprio; fica coberto pelos E2E `carrosseis-filmes-series` e `vitrine-filmes-series`.

## Gate de pronto

- Contratos 5/5 verdes e travas da 086, 052, 056, 065, 066, 079, 082 e 085 íntegras.
- Em `tv-web/`: `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` e `npm run test:e2e` com `npm run dev` no ar.
- `quickstart.md` §2 (automatizado), §4 (linha de base na TV) e §5 (validação na TV).
- **A TV física é gate** (SC-001 a SC-011), com 2 passadas planejadas. Fechar sem ela só por decisão explícita do usuário,
  registrada em R-007.
