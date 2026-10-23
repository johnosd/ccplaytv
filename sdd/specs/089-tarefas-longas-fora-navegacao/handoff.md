# Handoff — feature 089, tarefas longas fora do caminho de navegação

## Contexto

- Repositório `ccplayTv`, branch **`feature/licenca`**. React 19 + TypeScript + Vite em `tv-web/`, app Tizen empacotado
  de `CCPlayTv/`.
- Próximo comando: **`/sdd-execute 089-tarefas-longas-fora-navegacao`**.
- Backlog: **Planejada**, 0/41 tasks.
- **Nada da 088 nem da 089 está commitado.** O working tree também carrega trabalho paralelo do usuário que **não é
  seu**: `docs/analise-comparativa-xstream-player-2026-10-21.md`, `sdd/adr/ADR-021-chaves-padrao-protegidas-byok.md` e
  `sdd/assessments/opensubtitles-legendas-externas/`. **Nunca use `git add -A`** — na 087 isso varreu um arquivo alheio
  para um commit e exigiu `reset --soft`.
- Arquivos criados por este planejamento que você precisa ler em disco: `keyDelay.ts` (stub), os dois contratos
  travados, e a entrada nova em `TESTES_TS_COM_DOM` (`tv-web/vite.config.ts`).

## O que a feature entrega

- **US1 (P1)** — nomear **de quem** são os 95,4% do tempo em que a thread fica presa, que a 088 não atribuiu. O
  instrumento é o **atraso de cada tarefa longa desde a última tecla**, já decidido pelo usuário (não é escolha do
  executor).
- **US2 (P1)** — reduzir o que a US1 nomear, com ganho medido em **duas** rodadas. **Não tem alvo até a US1 fechar**, e
  o FR-001 proíbe otimizar antes.
- **US3 (P2)** — consertar a sonda automática para fechar com `falhas = 0`. **Vem antes da US1**, porque hoje metade
  das janelas de cada rodada é abandonada e o orçamento é de **quatro** instalações.

Decisões do usuário que contrariam a expectativa óbvia:

- O escopo **exclui** o caminho de navegação (tecla, memoização do render, pintura de capa) — a 088 provou que valem
  menos de 5% somados. Não "melhore" isso de passagem.
- Worker e mudança no formato de gravação do catálogo estão **fora de escopo**: se o alvo exigir, a feature **encerra
  declarando** (FR-011).
- Trocar fluidez por **mais tempo de card sem capa** é permitido, mas só com o usuário **olhando a TV** e aprovando
  (FR-006).
- Encerrar com o alvo **não cumprido** é resultado correto (FR-010), não derrota. A 088 fechou assim.

## Leitura obrigatória, em ordem

1. **`spec.md`** — 15 FR, 12 SC, as três stories e os edge cases (inclusive o que fazer se a causa for layout do
   navegador: **reduzir o que o causa**, não desistir).
2. **`plan.md`** — Technical Context, as 8 Decisões Invariantes (D-001 a D-008), Constitution Check e a Estratégia de
   Testes com a saída vermelha de cada contrato.
3. **`tasks.md`** — as cinco fases. A Fase 2 é **bloqueante**.
4. **`logic/atraso-e-sonda.md`** — §1 o algoritmo do atraso (faixas, chaves, o invariante da soma) e §2 a causa do
   `falhas = 2` com o conserto. **Leia antes de tocar em `keyDelay.ts` ou `autopilot.ts`.**
5. **`quickstart.md`** — as checagens, o ensaio obrigatório no PC (§3.1) e o roteiro das rodadas de TV (§4).
6. **`sdd/specs/088-tarefas-longas-navegacao/evidencias/`** — as três rodadas que são a linha de base. A `-controle.md`
   é a mais importante: tem a comparação com e sem o painel.
7. **`.planning/memory/constitution.md`** — os princípios de foco, restauração por id e dados reais.

## Testes de contrato

**5 de 5 do orçamento**, em 2 arquivos, ambos fechados na **Fase 2**:

| Arquivo | Testes |
| --- | --- |
| `tv-web/src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts` | 3 |
| `tv-web/src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts` | 2 |

```powershell
npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 089-tarefas-longas-fora-navegacao
```

**Travas de outras features que esta pode quebrar** — são o guarda-corpo do FR-004/FR-007, e rodá-las é gate, não
cortesia: `052-vitrine-filmes-series` (navegação e restauração por id), `053-carrosseis-filmes-series`,
`057-top10-dica-tmdb`, `082-orcamento-armazenamento-tv`, `085-gravacao-carga-secao-tv`, `086-montagem-rapida-telas`,
`087-top10-dica-segundo-plano`, `088-tarefas-longas-navegacao`. **Nove no total, com a desta.**

## Stubs criados

- **`tv-web/src/lib/perf/keyDelay.ts`** — `summarizeKeyDelays` e `createKeyDelayTracker`, as duas com
  `throw new Error('not implemented')`. O tipo `LongTaskWindow` é **importado** de `longTaskAttribution.ts` (feature
  088), não redeclarado.
- **`tv-web/vite.config.ts`** — o contrato do `autopilot` entrou em `TESTES_TS_COM_DOM`, porque precisa de DOM e, sendo
  travado, não pode levar o comentário `@vitest-environment` (mudaria o SHA256).

## Armadilhas já mapeadas

- **`longTasks.takeWindows()` DRENA a lista.** No `PerfOverlay` ela já é consumida por `attributeLongTasks`. Se o T013
  chamar de novo para o atraso, a segunda chamada recebe **vazio** e as chaves de atraso saem sempre nulas — um bug
  silencioso que passa em todo teste unitário e só aparece como "a medição não mediu nada" depois de gastar uma rodada
  de TV. **Passe a mesma lista para as duas contas.**
- **`lib/useRemoteNav.ts` (319 linhas) e `features/vod/VodShowcaseScreen.tsx` (733) estão EXATAMENTE no teto do
  ratchet.** Uma linha a mais reprova `npm run lint`. Na 088 isso custou uma fiação inteira refeita (R-007 de lá) — e o
  desenho resultante ficou melhor, por ter saído do caminho quente.
- **Nunca compare tempo de parede com tempo de thread.** Dividir `renderMs` por `longTaskMs` deu "o render é 23%"
  quando a partição correta mostrou **4,5%** (R-012 da 088). Mesmo erro de categoria fez a etapa `capa` registrar
  266 s numa janela de 5 s.
- **Sempre `performance.now()`**, nunca `Date.now()`, em qualquer medida que será comparada com `task.start`.
- **O foco é estado do React** (ADR-009). Em código de sonda, a única leitura válida de onde ele está é `.tv-focus`;
  `document.activeElement` e `.focus()` não servem. E **uma tecla por turno**: várias no mesmo tick fazem o React
  agrupar e o foco andar um passo só.
- **A sonda nunca aperta `Enter` sem o foco no rótulo do destino.** Foi assim que ela tocou uma série na TV do usuário
  na 087. Os 2 contratos travados fixam as duas metades (alcança **e** não aciona fora do destino).
- **Autorização do usuário antes de CADA instalação na TV**, e **pacote normal reinstalado ao final de cada rodada**
  (FR-015). Nunca desinstale o CCPlayTV nem apague dados da TV.
- **Antes de gravar evidência, leia o `.jsonl` atrás de texto do provedor.** Nas três rodadas da 088 só apareceram
  rótulos do conjunto fechado, mas a conferência é obrigatória (FR-014).
- **`build:tizen` e `deploy-tv.ps1` reescrevem `CCPlayTv/assets`, que é rastreado pelo git.** Não "restaure" o que não
  foi você que mudou, e avise o usuário.
- **Flakes conhecidos**: `src/lib/player/progressRecorder.falhas.test.ts` (unitário, 1 em 2, herdado, arquivo que esta
  feature não toca) e o E2E `orcamento-armazenamento-migracao` (1 em 4, verde em série com `--jobs 1`). Rode a
  suspeita isolada e a suíte duas vezes antes de culpar uma mudança sua.
- **`npm run x -- --flag` perde o `--` no PowerShell.** Para o E2E com `--only`, use o Bash.

## Pendências do Analyze

| ID | Sev. | Resumo | Recomendação |
| --- | --- | --- | --- |
| A-01 | **MEDIUM** | **O orçamento de quatro rodadas pode estourar**: 1 (atribuição) + 1 (se o T022 acrescentar uma medida) + 2 (verificação) = 4, **sem folga**. A spec prometia folga de uma | Se o T022 for necessário, avise o usuário **naquele momento** que a folga foi consumida, em vez de descobrir no T037. A decisão de pedir uma 5ª rodada é dele (FR-010) |
| A-02 | MEDIUM | **A Fase 4 não tem contrato travado** — o alvo não existe até a US1 fechar, então não havia o que travar | Registrado em `plan.md` → Estratégia de Testes. Mitigado por T040/T041 e pelas travas de 052/053. Ao aplicar a redução, escreva o teste **antes**, em arquivo não travado |
| A-03 | LOW | **O 5º contrato começou verde** (desistir sem acionar já era o comportamento) e foi **fortalecido** até ficar vermelho: agora exige tentar até a profundidade nova antes de desistir | Transparência, nada a fazer. Está registrado em `plan.md` como nota de método |
| A-04 | LOW | `keyDelay.ts` importa `LongTaskWindow` de `longTaskAttribution.ts`, que **não** é arquivo travado | Se precisar mudar aquele tipo, rode os contratos da 088 e da 089 juntos — nada acusaria automaticamente |
| A-05 | LOW | **FR-012 depende de evidência de outra feature**: o "antes" de SC-007/SC-008 está nas evidências da 088 | Não mova nem reescreva `sdd/specs/088-.../evidencias/` |

Nenhum achado CRITICAL ou HIGH. Pode executar.

## Gate de pronto

```powershell
npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts   # 5/5
npm run test        # baseline 3727/3727
npx tsc -b
npm run lint        # inclui o ratchet
npm run build
```

```bash
cd tv-web && npm run test:e2e        # com `npm run dev` no ar; gate antes da TV
```

Mais: as **nove** travas íntegras; `quickstart.md` §2 e §3 executados; o **ensaio da sonda no PC** (§3.1) feito
**antes** de gastar instalação; e `CLAUDE.md` atualizado no Polish **só** se alguma regra permanente mudar — a regra da
088 já está lá e deve ser **emendada**, não duplicada.

**A passada na TV física é gate**, não recomendação: SC-001 a SC-006 só existem com número do aparelho, e o navegador
do PC dá 60 fps em tudo.
