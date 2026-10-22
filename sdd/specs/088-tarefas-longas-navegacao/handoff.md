# Handoff — feature 088: tarefas longas no caminho de navegação das vitrines

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. TypeScript + React 19 (**com React Compiler ativo**) + Vite, app
  Tizen rodando de `file://`.
- Próximo comando: **`/sdd-execute 088-tarefas-longas-navegacao`**
- Backlog: **Planejada**, 0/38 tasks.
- **Mudou em disco recentemente e precisa ser relido**: `lib/perf/longTasks.ts` e `lib/perf/autopilot.ts` (ad-hoc de
  2026-10-22 e feature 087 — são as ferramentas desta feature), `lib/perf/phaseSpans.ts` (stub novo),
  `components/PerfOverlay.tsx` e `lib/catalog/externalRows.ts` (instrumentação já emitindo).
- A feature **087 convergiu** e o assessment `tarefa-longa-na-leitura-categoria-gorda` deu o `go` que originou esta.

## O que a feature entrega

- **US1 (P1)** — descer entre os cards sem engasgo: a thread presa em menos de 15% da janela, pior quadro abaixo de
  300 ms e fps mediano ≥ 45, medidos na TV em duas rodadas. **Em duas partes**: atribuir (Fase 3) e só então reduzir
  (Fase 4).
- **US2 (P2)** — entrar numa categoria: a mediana de 627 ms é **critério acompanhado**, reportado antes e depois,
  **não** gate.
- **US3 (P3)** — quem vier depois não começa do zero: a atribuição registrada e a medição repetível. **Esta entrega
  vale mesmo se os alvos não forem atingidos.**

**Decisões do usuário que contrariam a expectativa óbvia:**

1. **Encerrar com o alvo "não cumprido" é resultado válido** (FR-008/T024). Se o custo dominante for decodificação de
   capa ou ficar fora dos três intervalos e exigir Worker/outro formato de dados, a feature **para e registra**. Não
   escale sem decisão nova.
2. **Mudança visual é permitida** — mas só fica com a tela **aprovada pelo usuário** antes de integrar (FR-005).
3. **Card em estado intermediário pode aparecer** com moldura e título real; **nunca** nota, posição ou capa
   inventados.
4. **Não otimize antes de medir** (FR-001). Vale inclusive para o que parece óbvio.

## Leitura obrigatória, em ordem

1. **`spec.md`** — escopo, o que fica **fora** (e por quê), FR-001 a FR-012 e SC-001 a SC-010.
2. **`plan.md`** — Technical Context, as 7 Decisões Invariantes e os 6 riscos (R-001 a R-006).
3. **`logic/atribuicao.md`** — **o documento central**: o que já está estabelecido (não remedir), as três etapas, a
   **ordem de leitura do resultado** (§3) e a **regra de parada** (§4).
4. **`tasks.md`** — 6 fases. A Fase 3 é o portão que decide o resto.
5. **`quickstart.md`** — as seis travas, o E2E e o roteiro de TV com os alvos ao lado da linha de base.
6. **`.planning/memory/constitution.md`**.

## Testes de contrato

**3 de 5 do orçamento**, num arquivo travado — todos da **Fase 2**:

| Arquivo | Testes |
| --- | --- |
| `tv-web/src/lib/perf/phaseSpans.tarefas-longas-navegacao.contract.test.ts` | 3 |

```bash
npx vitest run src/lib/perf/phaseSpans.tarefas-longas-navegacao.contract.test.ts
```

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 088-tarefas-longas-navegacao
```

**Por que a story P1 não tem contrato**: o aceite dela só é verificável no aparelho (vai para o `quickstart.md`), e o
comportamento que uma otimização quebraria **já está travado por outras features**. Registrado em `plan.md` →
`## Estratégia de Testes`.

**Travas de outras features que esta pode quebrar — confira as cinco, são o guarda-corpo do FR-002/FR-006:**

- **`052-vitrine-filmes-series`** — a mais importante: fixa `← →` na fileira, `↑ ↓` entre fileiras, Enter, e **o foco
  devolvido restaura o mesmo cartão por id**.
- **`053-carrosseis-filmes-series`** — lista lateral (`← →` paginam, recolhe ao entrar nos cards) e **"categoria
  pendente não inventa cards"**.
- `057-top10-dica-tmdb` — a forma do retorno de `useWeeklyTop10`/`useDailyTip` (os hooks são mockados lá).
- `086-montagem-rapida-telas` — a montagem não lê bloco do catálogo.
- `087-top10-dica-segundo-plano` — a tela lê o registro guardado.

Quebrar qualquer uma significa que **a otimização mudou comportamento** — nunca que o teste envelheceu.

## Stubs criados

- **`lib/perf/phaseSpans.ts`** — `SpanName` (conjunto **fechado**: `tecla`, `render`, `capa`), `summarizeSpans` e
  `createPhaseSpanTracker` com corpo `throw new Error('not implemented')`. **Não é travado**: é o ponto de partida.

## Armadilhas já mapeadas

- **"A vitrine não tem `useMemo`" é pista falsa.** É verdade (zero em 733 linhas), mas o **React Compiler memoiza** e
  **não desiste nesta tela** — `npm run lint` não reporta `react(incompatible-library)`/`purity`/`refs` em
  `features/vod/`. Só mexa nisso se a etapa `render` dominar a medição (R-004).
- **A virtualização já existe nas duas direções**: vertical `overscan: 2` (`VodShowcaseScreen.tsx:483`) e horizontal
  `overscan: 3` (`Rail.tsx:53`). Cortar `overscan` sem medir é a tentação clássica aqui.
- **A medição altera o que mede** (R-002): instrumentar o manipulador de tecla acrescenta trabalho no caminho mais
  quente. Agregue **por janela**, nunca por evento — e compare sempre medição contra medição no mesmo build.
- **O canal de métricas tem lista fechada** de `source` e de rótulos (`lib/perf/metricsChannel.ts`), com **contrato
  travado da 085**. Não crie `source` novo: use chaves numéricas planas, como o `longTasks.ts` e o `dbWarmup.ts` fazem.
- **`npm run test` não roda `tsc`.** Um erro de tipo em teste passa pela suíte e quebra o `build`.
- **O E2E precisa de `npm run dev` no ar.** Sem ele a suíte dá 4/54 e parece regressão.
- **Flake conhecido** (alheio): `orcamento-armazenamento-migracao` falha 1 em 4 execuções paralelas e passa em série.
- **Teclas sintéticas (se mexer na sonda): uma por tick, nunca em rajada** — o foco é estado React, e a sonda já tocou
  uma série por engano quando as teclas saíram no mesmo tick.
- **A TV precisa de 3 rodadas no mínimo** (atribuição + duas de verificação), cada uma com **autorização do usuário** e
  o pacote normal reinstalado ao final.

## Pendências do Analyze

| ID | Sev. | Resumo | Recomendação |
| --- | --- | --- | --- |
| A-01 | MEDIUM | **O T024 é parada obrigatória** — decisão do usuário sobre encerrar ou seguir. Em modo contínuo ela é fácil de atropelar | Pare no T024 mesmo em modo contínuo: é um dos 4 gatilhos de parada do `sdd-execute`, e o FR-008 depende dele |
| A-02 | MEDIUM | A feature precisa de **3 rodadas de TV** (T020, T032, T033), cada uma com autorização e ~15 min | Combine o momento com o usuário antes de começar a Fase 3; não enfileire rodadas sem aval |
| A-03 | LOW | **FR-010** (abertura não regride, 313–386 ms) aparece só como critério de conclusão da Fase 4, sem task própria | Ler `assembly` → `revealMs` nas mesmas rodadas; não precisa de task nova, mas não esqueça |
| A-04 | LOW | **T022 e T041 se sobrepõem** na evidência (atribuição × reprodução) | Grave um arquivo de evidência só, com as duas seções |

## Gate de pronto

1. **3/3 contratos verdes** e `check-contract-tests.ps1` íntegro para **088, 052, 053, 057, 086 e 087**.
2. `npm run test` · `npx tsc -b` · `npm run lint` · `npm run build` · `npm run test:e2e` (com `dev` no ar).
3. **TV é gate** para SC-001 a SC-006, em **duas rodadas independentes** na mesma sessão, com o roteiro de duração fixa
   do `quickstart.md` §4 — e **cada instalação pede autorização**.
4. `quickstart.md` §3 executado no navegador.
5. Polish: `CLAUDE.md` só se alguma regra permanente mudou; **pacote normal reinstalado** na TV.
6. **Ou**, pelo FR-008: o alvo declarado **não cumprido** com a causa nomeada e os números — e isso é conclusão
   honesta, não falha.
