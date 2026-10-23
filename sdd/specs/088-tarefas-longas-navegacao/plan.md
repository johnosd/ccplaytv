# Implementation Plan: tarefas longas no caminho de navegação das vitrines

**Feature**: 088-tarefas-longas-navegacao
**Spec**: `spec.md` · **Método**: `logic/atribuicao.md`
**Criado**: 2026-10-22

## Summary

Reduzir as tarefas longas de JavaScript do caminho `tecla → foco → render → pintura` nas vitrines de Filmes e Séries,
até a thread ficar presa em menos de 15% da janela, o pior quadro ficar abaixo de 300 ms e o fps mediano chegar a 45.

O trabalho começa por **atribuir**: a medição de 2026-10-22 provou que é código nosso (48 de 49 quadros longos
coincidem com tarefa longa), mas `longtask` não diz **qual** código. A primeira fase instrumenta três etapas nomeadas e
mede na TV; só depois alguma coisa é otimizada. Essa ordem é o FR-001, e existe porque na feature 087 eu registrei uma
causa provável duas vezes sem medir — e o código refutou as duas.

## Technical Context

- **Linguagem/plataforma**: TypeScript + React 19 + Vite, alvo `chrome108`; Tizen 9 / Chromium 120 na TV de referência
  (QN50Q60DAGXZD), origem `file://`, ~310 MB livres.
- **React Compiler ativo**: `npm run lint` reporta `react(incompatible-library)`, `react(purity)` e `react(refs)` por
  arquivo, e **não reporta nenhum para `features/vod/`** — a vitrine é memoizada pelo compilador. `VodShowcaseScreen.tsx`
  tem 733 linhas e **zero `useMemo`**, o que por si só **não** é explicação.
- **Virtualização já existe nas duas direções**: fileiras verticais com `overscan: 2` (`VodShowcaseScreen.tsx:483`) e
  trilho horizontal com `overscan: 3` (`components/Rail.tsx:53`, feature 022/D-008). Cada fileira é limitada a
  `SHOWCASE_LIMIT`/`DISCOVERY_LIMIT` itens.
- **Foco**: `lib/useRemoteNav.ts` (319 linhas), ouvinte de `keydown` em `document`, lendo `event.key`; o estado do foco
  é estado React na tela (`setFocusState`), não `document.activeElement` (ADR-009). Repetição de tecla tem tratamento
  próprio (`lib/focus/keyRepeat.ts`, feature 083).
- **Instrumentação existente, a reusar**: canal de métricas da feature 085 (`lib/perf/metricsChannel.ts`, `source`
  de lista fechada e rótulos de lista fechada), quadros ativos da 083 (`lib/perf/activeFrames.ts`), tarefas longas
  (`lib/perf/longTasks.ts`, ad-hoc de 2026-10-22) e a **sonda automática** (`lib/perf/autopilot.ts`, feature 087), que
  navega sozinha em janelas de 60 s com cadência e número de teclas fixos.
- **Linha de base**: `sdd/assessments/tarefa-longa-na-leitura-categoria-gorda/app-metricas-tv-2026-10-22.jsonl`.
- **Testes**: Vitest em dois projetos (`dom` para `*.test.tsx`, `node` para `*.test.ts`; `.ts` que precisa de DOM entra
  em `TESTES_TS_COM_DOM` no `vite.config.ts`); E2E próprio em `tv-web/e2e/`.
- **ADRs relevantes, não relitigadas**: ADR-009 (o foco é o `useRemoteNav` do projeto, sem biblioteca de foco por ref),
  ADR-007/ADR-011 (identidade visual e DS V14 — a receita de foco é 4px + offset + glow + `scale(1.06)`, 140 ms).
  Mudança visual aqui é **ajuste medido com aprovação do usuário**, não troca de identidade.

## Decisões Invariantes

1. **Atribuir antes de otimizar** (FR-001). Nenhuma mudança no caminho de render antes de a medição na TV nomear o
   custo, pela ordem de leitura de `logic/atribuicao.md` §3.
2. **As travas de outras features são o guarda-corpo do comportamento**, não burocracia: 052 (`← →` na fileira, `↑ ↓`
   entre fileiras, foco devolvido por id), 053 (lista lateral e "categoria pendente não inventa cards"), 057, 086 e
   087. Quebrar qualquer uma significa que a otimização mudou comportamento — **nunca** que o teste envelheceu.
3. **A instrumentação é agregada por janela e só números**, no conjunto fechado de etapas (`tecla`, `render`, `capa`),
   no mesmo formato do `longTasks.ts`. Nome de etapa livre é por onde nome de item vazaria.
4. **O veredito é do aparelho, em duas rodadas** da sonda de duração fixa. O navegador do PC não aprova fluidez.
5. **Mudança visual só permanece com a tela aprovada pelo usuário** (decisão dele, 2026-10-22).
6. **Encerrar com o alvo não cumprido é resultado válido** (FR-008) se o custo dominante for `capa` ou ficar fora dos
   três intervalos e exigir Worker/outro formato de dados. Não escalar sem decisão nova.
7. **Fora do alcance desta feature**: `lib/catalog` (formato da 082), a produção do Top 10/Dica (087, 8,6% do
   problema), Início, Live TV e a grade de categoria.

## Constitution Check

| Princípio | Pré-Design | Pós-Design |
| --- | --- | --- |
| Foco Visível e Sem Becos Sem Saída | **Atenção**: a feature mexe justamente no caminho do foco | OK — FR-002 proíbe mudar ordem/SELECT/rolagem, e as travas de 052/053 falham se mudar |
| Voltar Restaura Foco e Posição | **Atenção**: otimizar render pode perder a memória de foco | OK — já travado pela 052 ("o foco devolvido restaura o mesmo cartão por id") |
| Progresso e Capacidades São Reais, Nunca Prometidos | **Atenção**: card em estado intermediário | OK — FR-006: moldura e dados reais, nunca inventados; 053 já trava "não inventa cards" |
| Segredos Fora dos Clientes e dos Logs | **Atenção**: instrumentação nova emitindo dados | OK — conjunto fechado de etapas, só números; contrato C1 trava isso |
| Comandos Locais Independem de Rede/Backend/IA | OK — nada de rede neste caminho | OK |
| Categorias da Fonte São Preservadas | OK — não toca taxonomia | OK |
| IA e Classificação Nunca Inventam Dados | OK | OK |
| Documentação do Repositório É Canônica | OK — a linha de base e o método ficam em arquivo | OK — `logic/atribuicao.md` e a evidência da rodada |
| Uma Lista Nunca É Tratada Como Manifesto de Streaming | OK — não toca leitura de lista | OK |
| Toda Ação Essencial Tem Caminho por Controle Remoto | **Atenção**: é exatamente o caminho mexido | OK — FR-002 o congela |

Sem violação não justificável. Nada para `## Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```
sdd/specs/088-tarefas-longas-navegacao/
├── spec.md
├── plan.md
├── tasks.md
├── logic/atribuicao.md        ← o que medir, a ordem de leitura e a regra de parada
├── quickstart.md
└── contract-tests.lock
```

### Source Code (repository root)

```
tv-web/src/
├── lib/perf/
│   ├── phaseSpans.ts            ← NOVO (stub criado): as três etapas nomeadas
│   ├── longTasks.ts               tarefas longas por janela (já existe)
│   ├── activeFrames.ts            quadros na janela de tecla (já existe)
│   ├── metricsChannel.ts          canal da 085 — NÃO MUDA (source/rótulos de lista fechada)
│   └── autopilot.ts               sonda automática da 087 (já existe)
├── lib/useRemoteNav.ts          ← abre/fecha a etapa `tecla`
├── components/PerfOverlay.tsx   ← emite as etapas junto dos quadros
├── components/Rail.tsx            trilho horizontal virtualizado
└── features/vod/
    ├── VodShowcaseScreen.tsx    ← a tela medida (e, se a atribuição apontar, otimizada)
    └── vodShowcase.ts             regras de fileira
```

## Complexity Tracking

Nada a registrar.

## Estratégia de Testes

Prioridade: unitário → contrato → E2E → **TV (único veredito de fluidez)**.

```bash
# contratos desta feature
npx vitest run src/lib/perf/phaseSpans.tarefas-longas-navegacao.contract.test.ts

# área tocada
npx vitest run src/lib/perf src/features/vod src/lib/useRemoteNav.test.tsx

# gates finais
npm run test && npx tsc -b && npm run lint && npm run build
npm run test:e2e        # precisa de `npm run dev` no ar
```

Travas a conferir — **as cinco**, porque são o guarda-corpo do FR-002/FR-006:

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 088-tarefas-longas-navegacao
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 052-vitrine-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 053-carrosseis-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano
```

### Testes de Contrato

**3 de 5 do orçamento usados**, num arquivo travado:

| Teste | Origem | Vermelho confirmado por |
| --- | --- | --- |
| agrega por etapa em chaves planas do conjunto fechado, arredondadas, e devolve `null` sem amostra | **FR-012**, Constitution "Segredos Fora dos Clientes e dos Logs" | `not implemented` (`phaseSpans.ts:32`) |
| fechar o mesmo intervalo duas vezes conta uma só | o caso traiçoeiro: o fechamento será chamado de `finally`, de cleanup e de erro | `not implemented` (`phaseSpans.ts:36`) |
| `snapshot` zera a janela: a chamada seguinte não repete o que já foi reportado | formato de agregação por janela (`logic/atribuicao.md` §2) | `not implemented` (`phaseSpans.ts:36`) |

Confirmado em 2026-10-22: **3 failed (3)**, nenhum por import, sintaxe ou tipo (`npx tsc -b` limpo), e a área
`src/lib/perf` seguiu com **24 passed** — o stub não quebrou nada.

**Por que só 3, e por que nada da story P1 está travado aqui:**

1. O aceite da P1 (os três números) **só é verificável no aparelho** — por regra do próprio sistema, isso vai para o
   `quickstart.md`, não para contrato.
2. O comportamento que uma otimização quebraria **já está travado por outras features** (Decisão Invariante 2): 052
   fixa `← →`/`↑ ↓`/Enter e o foco devolvido por id; 053 fixa a lista lateral e "não inventa cards". Duplicar aqui
   gastaria orçamento sem acrescentar proteção — e o gate desta feature roda as cinco travas.
3. "Atribuir antes de otimizar" (FR-001) e "otimização sem ganho medido não fica" (FR-003) são **disciplina de
   processo**: não há saída determinística para travar em teste. Ficam como critério de conclusão de fase.

## Estado Atual

| Área | Estado |
| --- | --- |
| Contratos travados (088) | **3/3 verdes**; trava íntegra |
| Travas do guarda-corpo (052, 053, 057, 086, 087) | **Íntegras** |
| Instrumentação | **Completa e validada na TV**: etapas, atribuição por tarefa longa, `capa` corrigida |
| `npm run test` | **3727/3727** (688 arquivos), sem flake |
| Pacote normal | **Na TV**, sem nenhum dos marcadores |
| **A atribuição (2 rodadas)** | `tecla` **0,1%** · `render` **4,5%** · **fora de todas: 95,4%** |
| Pior tarefa longa (777 ms) | **Inteiramente fora** das três etapas |
| Fontes de fundo (`entry`, `section-load`, `showcase`, `assembly`) | **Todas refutadas** — medianas planas |
| `lib/useRemoteNav.ts` e `features/vod/VodShowcaseScreen.tsx` | **Intocados** (R-007) |
| **Fase 4 (reduzir)** | **Sem alvo válido** — o caminho de navegação está inocentado (R-011) |
| **Decisão pendente** | **Do usuário**: encerrar pelo FR-008 ou abrir investigação fora do escopo desta feature |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação |
| --- | --- | --- | --- |
| R-001 | **A atribuição pode apontar para fora do alcance** (decodificação de capa, layout do navegador) | A feature não atinge os três números e fecha sem o ganho pedido | **Resolvido: foi exatamente o que aconteceu** — e o mecanismo previsto funcionou. A atribuição apontou para fora do alcance (95,4% fora das etapas) e a feature encerrou pelo FR-008 com a causa nomeada por eliminação, sem escalar. Decisão do usuário (2026-10-22): encerrar declarando **não cumprido**, com a causa nomeada, é o resultado correto (FR-008). A US3 (atribuição registrada) entrega valor mesmo nesse caso |
| R-002 | **A medição altera o que mede**: instrumentar o manipulador de tecla acrescenta trabalho no caminho mais quente | Números piores do que a realidade, ou ganho fantasma ao remover a instrumentação | **Resolvido**: a rodada de controle (`VITE_CCPLAY_PERF_QUIET=1`) mediu o próprio medidor. Sem o painel, `longTaskMs` cai **5%** e a pior tarefa longa é idêntica (420 contra 422 ms). A medição **não** alterou o que mede. Agregar por janela (sem alocar por evento), manter tudo atrás de `VITE_CCPLAY_PERF`, e comparar sempre medição-contra-medição no mesmo build. A 086 já viu isso: a sonda de orçamento virou opt-in porque disputava o aparelho |
| R-003 | **Otimizar foco/render pode quebrar comportamento sem o teste local acusar** | Foco perdido, ordem trocada, rolagem pulando — o pior tipo de regressão numa TV | **Resolvido**: nenhuma otimização foi aplicada, então não havia o que quebrar — e ainda assim foi conferido: travas 052/053 íntegras, `vitrine-filmes-series` e `carrosseis-filmes-series` verdes, e `useRemoteNav.ts`/`VodShowcaseScreen.tsx` **intocados**. As travas de 052/053/057/086/087 fazem parte do gate (Decisão Invariante 2); o E2E `carrosseis-filmes-series` e `vitrine-filmes-series` também |
| R-004 | **"Zero `useMemo` na vitrine" é uma pista falsa atraente** | Horas gastas memoizando à mão sem ganho, porque o React Compiler já memoiza e não desistiu nesta tela | **Resolvido, e o risco era pior do que o registrado**: o lint reporta `react(incompatible-library)` em `VodShowcaseScreen.tsx:483` — o React Compiler **desiste** de memoizar a vitrine, ao contrário do que `logic/atribuicao.md` §1 afirmava (corrigido em §1.1). Mesmo assim a pista continua falsa: o render responde por **4,5%**, então memoizar à mão não devolveria fluidez. Registrado em `logic/atribuicao.md` §1 com a evidência (`npm run lint` sem aviso de desistência em `features/vod/`). Só mexer se a etapa `render` dominar a medição |
| R-005 | **Mudança visual recusada pelo usuário depois de implementada** | Trabalho jogado fora | **Resolvido por não se aplicar**: nenhuma mudança visual foi feita. Medir a alternativa e **mostrar antes de integrar** (FR-005); a 083 fez assim e o ganho foi aceito (35 → 51 fps) |
| R-006 | **Uma rodada de TV sozinha não decide** (ruído de ±2–3 fps e um quadro lento a mais ou a menos) | Ganho declarado que não existe | **Resolvido**: três rodadas. As duas da sonda deram 37/40 fps nas duas, idênticas dentro do ruído, e a de controle confirmou 36/40 — a reprodutibilidade ficou provada (SC-005). FR-004/SC-005: duas rodadas independentes na mesma sessão, e o ganho precisa aparecer nas duas. **Cada instalação pede autorização do usuário** |
| R-007 | **A medição saiu do caminho quente** (decidido na Fase 2): `useRemoteNav.ts` (319) e `VodShowcaseScreen.tsx` (733) estavam **exatamente no teto** do ratchet, e instrumentar por dentro os estourava | Ou eu gastaria o orçamento de linhas desses arquivos com medição temporária, ou precisaria extrair código de navegação só para medir | **Resolvido, e com desenho melhor**: `installKeySpan()` abre `tecla` na captura do `keydown` e fecha numa microtarefa (depois de todos os ouvintes síncronos daquele evento), e `render` fecha no primeiro quadro pintado pelo laço de rAF que o `PerfOverlay` já tinha. Os dois arquivos do caminho quente ficaram **intocados**, e `render` passou a medir “da tecla até ver o foco novo” — o número que a pessoa sente, em vez do commit isolado |
| R-008 | **A etapa `capa` não mede CPU**: abre quando o card pede a imagem e fecha no `onLoad`, com 8 imagens em paralelo, então mede **espera de parede** (266 s numa janela de 5 s) | Comparar `capaMs` com `longTaskMs` levaria a atribuir a causa à decodificação de imagem sem prova — exatamente o erro que o FR-001 proíbe | **Reconhecido, não corrigido**: registrado no §4 da evidência e excluído da atribuição. Medir CPU de imagem exigiria outro instrumento (`decode()` ou o intervalo até o quadro seguinte ao `onLoad`) |
| R-009 | **A sonda automática cobriu só Filmes** (`falhas = 2`): as duas janelas de Séries foram abandonadas por a navegação em malha fechada não chegar ao destino | A atribuição vale para Filmes, não para Séries — e o T020 pedia `falhas = 0` | **Aberto**: a sonda agiu certo (não inventou medida). Se a Fase 4 acontecer, investigar por que o destino Séries não é alcançado antes de confiar numa rodada de quatro janelas |
| R-010 | **76% da thread presa está fora** de `tecla` e `render`, e o candidato óbvio (leitura de fundo do prefetch) foi **refutado** pelos próprios números | Sem uma quarta etapa, a Fase 4 não tem alvo — e escolher um por intuição é o que o FR-001 proíbe | **Resolvido pelo R-011**: os 76% viraram 95,4% com a medida correta, e nenhuma fonte do canal os explica. A quarta etapa foi acrescentada e medida, como o passo 4 de §3 manda. **Aberto, e é o conteúdo do T024**: o passo 4 de `logic/atribuicao.md` §3 autoriza **uma** etapa nova, o que custa outra rodada na TV (nova autorização) |
| R-011 | **O caminho de navegação está inocentado** (rodada 2): `tecla` + `render` + `capa` somam **menos de 5%** do tempo em que a thread fica presa, e **95,4%** cai fora de todas as etapas — inclusive a pior tarefa longa da sessão (777 ms) | A Fase 4 foi planejada para reduzir o custo do caminho de navegação. Esse custo **não existe** na magnitude suposta: otimizar tudo o que a feature previa não alcançaria o SC-001 nem de longe | **Resolve o R-010 e esvazia a Fase 4**: as otimizações planejadas estão eliminadas **com número do aparelho**. A decisão de encerrar pelo FR-008 ou abrir uma investigação nova é do usuário |
| R-012 | **Erro de leitura meu na rodada 1**: eu dividi `renderMs` (tempo de **parede** entre a tecla e o primeiro quadro) por `longTaskMs` (tempo de **thread**) e reportei "o render é 23%" | É o mesmo erro de categoria que eu havia acabado de diagnosticar na etapa `capa` (R-008) — e ele apontaria a Fase 4 para o alvo errado | **Corrigido pela medição**: dentro do intervalo `render` caem **4,5%**. Registrado no §1 da evidência da rodada 2. Lição: só comparar parede com parede e thread com thread |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-22 | Fase 3 (T024–T0291) | Decidido **medir os 76%**. Atribuição por tarefa longa + `capa` corrigida, 6 testes, 3727/3727. Rodada 2 na TV: **95,4% do tempo preso cai fora de todas as etapas**, e nenhuma fonte do canal explica. Caminho de navegação **inocentado** | **A Fase 4 ficou sem alvo** (R-011): decisão do usuário entre encerrar pelo FR-008 e abrir investigação nova |
| 2026-10-22 | Fase 3 (US1, atribuição na TV) | Rodada na TV com a sonda automática. **`tecla` = 1% (eliminada), `render` = 23%, 76% fora dos intervalos.** Leitura de fundo do prefetch **refutada**. Evidência em `evidencias/medicao-tv-2026-10-22.md`; pacote normal de volta | **T024 aberto**: a quarta etapa pede outra rodada na TV (R-010); `capa` inválida (R-008); Séries não medida (R-009) |
| 2026-10-22 | Fase 1 (Setup) | T001/T002: 3 contratos vermelhos por `not implemented` e as seis travas íntegras | Nenhuma |
| 2026-10-22 | Fase 2 (Foundational) | T010–T015: instrumentação pronta e 3/3 contratos verdes. O ratchet empurrou a medição para **fora** do caminho quente (R-007), e o desenho ficou melhor. Pacote normal sem nenhum marcador | Flake 1 em 2 em `VodShowcaseScreen.test.tsx` (passa isolado), sem atribuição concluída |

PRÓXIMO: **decisão do usuário, e ela não é mais a do T024.** A medição cumpriu o que a Fase 3 prometia e o resultado **esvazia a Fase 4**: o caminho de navegação responde por menos de 5% do problema. As opções são encerrar pela regra do FR-008 (com a causa nomeada por eliminação, que é um resultado correto) ou abrir uma investigação nova para os 95,4% — que está **fora do escopo** desta spec e pede outro ciclo. **Não otimizar nada do caminho de navegação**: a medição já provou que não compensa.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. -->

## Cuidados para Retomada

- **`capaMs`/`capaMax` do `.jsonl` NÃO são tempo de CPU** (R-008). Valores como 266 000 ms numa janela de 5 000 ms são espera de parede de 8 imagens em paralelo. Não compare com `longTaskMs`.
- **A sonda automática pode fechar com `falhas > 0`** e ainda assim gravar janelas válidas. Confira `falhas` na linha `"janela":0` **antes** de ler qualquer média: uma tela pode não ter sido medida (foi o caso de Séries).

- **`lib/useRemoteNav.ts` (319) e `features/vod/VodShowcaseScreen.tsx` (733) estão EXATAMENTE no teto do ratchet.** Uma linha a mais em qualquer um reprova `npm run lint` e o contrato `architecture.codigo-saudavel`. Instrumentação e código novo entram por fora (R-007) ou exigem extração.
- **`npm run test` tem flake de 1 em 2** em `VodShowcaseScreen.test.tsx > categorias carregando...` (passa isolado, 9/9). Antes de culpar uma mudança, rode a suspeita isolada e a suíte duas vezes.

## Resultado Final

**Convergida em 2026-10-22, encerrando pelo FR-008: o alvo de fluidez NÃO foi cumprido, e a causa está nomeada —
por eliminação.**

### O que foi de fato construído

Nenhuma otimização. O que entrou no repositório é **instrumentação de atribuição**, toda restrita ao build de medição:

| Arquivo | O que faz |
| --- | --- |
| `lib/perf/phaseSpans.ts` | Intervalos nomeados (`tecla`, `render`, `capa`), agregados por janela em chaves planas |
| `lib/perf/longTaskAttribution.ts` | **Parte** `longTaskMs` entre as etapas abertas e o que fica **fora** de todas |
| `lib/perf/longTasks.ts` | Passou a guardar início e duração de cada tarefa longa, não só a duração |
| `components/PerfOverlay.tsx` | Instala tudo, cruza no mesmo lote de ~5 s, e aceita `VITE_CCPLAY_PERF_QUIET=1` |
| `components/PosterArt.tsx` | A etapa `capa` mede **pintura** (do `onLoad` ao quadro seguinte) |

`lib/useRemoteNav.ts` e `features/vod/VodShowcaseScreen.tsx` ficaram **intocados** — nem uma linha (R-007).

### O que a feature descobriu (três rodadas na TV de referência)

A thread fica presa **28%** de uma janela de 5 s, com quadro de até 817 ms. A partição desse tempo, com a soma fechando
por construção:

| Hipótese | Medida | Veredito |
| --- | --- | --- |
| Manipulador de tecla (`useRemoteNav`) | **0,1%** (0,6 ms por tecla) | **eliminada** |
| Re-render entre a tecla e o primeiro quadro | **4,5%** | **eliminada** |
| Pintura de capa | **10 ms** por capa | **eliminada** |
| Pré-carga, carga da lista, produtor do Top 10/Dica, montagem | medianas **planas** com e sem | **refutadas** |
| O próprio painel de medição | −5% sem ele; pior quadro idêntico (420 vs 422 ms) | **refutada** |
| **Fora de todas as etapas medidas** | **95,4%** | **é aqui** |

Ou seja: **tudo o que esta feature se propôs a otimizar vale menos de 5% do problema.** Aplicar as três otimizações
perfeitamente deixaria a thread presa em ~27%, contra o alvo de < 15%. O teto da Fase 4 era menor que a distância até
o alvo, e por isso ela foi **encerrada sem execução** (critério 4 do seu Critério de Conclusão).

O que há para ganhar é real e grande: três janelas limpas da rodada 1 deram **55, 59 e 55 fps** — com *mais* teclas que
as outras. Mas está fora desta spec.

### Desvios em relação ao plano original

1. **A medição saiu do caminho quente** (R-007): o ratchet recusou qualquer linha em `useRemoteNav.ts` (319) e
   `VodShowcaseScreen.tsx` (733), ambos no teto. O desenho que sobrou é melhor — `render` passou a medir "da tecla até
   ver o foco novo", e os dois arquivos ficaram intocados.
2. **Duas adições não previstas, aprovadas pelo usuário**: a partição por tarefa longa (T024/T025) e o modo controle
   `VITE_CCPLAY_PERF_QUIET` — sem ela, a suspeita de que o medidor era o medido ficaria de pé.
3. **A etapa `capa` nasceu errada** (R-008): media espera de parede (266 s numa janela de 5 s). Corrigida no T027.
4. **Um erro de leitura meu** (R-012): dividi tempo de parede por tempo de thread e reportei "o render é 23%" quando
   são 4,5%. Corrigido pela medição seguinte, e registrado.
5. **`logic/atribuicao.md` §1 estava factualmente errado** (T029): afirmava que o React Compiler memoiza a vitrine, e o
   lint reporta `react(incompatible-library)` em `VodShowcaseScreen.tsx:483` (o `useVirtualizer`). Corrigido em §1.1 —
   e a medição mostrou que nem isso muda a conta.

### Gates no fechamento

`npm run test` **3727/3727** · `tsc` · `lint` (0 erros, ratchet 532 arquivos) · `build` · `test:e2e` **53/54** (o
único a falhar foi o flake conhecido `orcamento-armazenamento-migracao`, verde isolado em série) · as **oito** travas
de contrato do SC-009 íntegras · pacote normal reinstalado na TV e verificado sem nenhum marcador.

### Pendências que seguem abertas

- **O problema de fluidez continua**, e é o objeto de uma spec nova (95,4% do tempo preso, sem dono).
- **R-009**: a sonda automática fecha com `falhas = 2` (2 de 4 janelas). A tela Séries foi coberta na rodada de
  controle (40 fps, igual a Filmes), então a lacuna é de cobertura, não de conhecimento.
- **Flake** em `src/lib/player/progressRecorder.falhas.test.ts`, 1 em 2 na suíte completa, verde isolado 3 de 3. Arquivo
  **intocado** por esta feature — pré-existente, registrado como aberto.
