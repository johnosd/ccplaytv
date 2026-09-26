# Implementation Plan: Virtualização de Grades e Foco Direcional

**Slug**: `009-virtualizacao-foco` | **Date**: 2026-09-23 (replanejamento) | **Spec**: `sdd/specs/009-virtualizacao-foco/spec.md`

## Summary

Virtualizar o painel de conteúdo das três telas de categoria (Live TV,
Filmes, Séries — todas construídas pela feature 010 com a mesma estrutura
de trilha + conteúdo obtido sob demanda) para que abrir uma categoria com
milhares de itens não trave o engine da TV nem exija o teto artificial
`CHANNELS_PER_GROUP_CAP` (500) que existe hoje só por falta disso.

**Isto é um replanejamento**, não a primeira vez que `sdd-plan` roda nesta
feature. O plano de 22/09 partia de duas premissas que não resistiram à
exploração do código real desta vez — ver `## Riscos e Decisões` (R-001,
R-002) para o registro completo:

1. Assumia `@noriginmedia/norigin-spatial-navigation` como a engine de
   foco (conforme ADR-006 recomendava), mas essa biblioteca nunca foi
   instalada neste projeto — a engine real, usada e testada em toda tela
   existente, é o hook próprio `useRemoteNav`.
2. Foi desenhado contra a estrutura de `LiveScreen.tsx` de antes da feature
   010 (uma lista plana `.map` sobre `activeGroup.channels`), que não
   existe mais — as três telas hoje são trilha de categorias (col 0) +
   conteúdo obtido sob demanda (col 1).

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Vite 8 (build alvo
`chrome108` — Tizen 8.0 / Chromium 108 do Samsung QN50Q60DAGXZD; não mexer
em `vite.config.ts`).

**Primary Dependencies**: `@tanstack/react-virtual` ^3.14.13 (instalado na
primeira rodada desta feature, nunca consumido até agora);
`@tanstack/react-query` ^5.102.8 (já em uso por `useCategoryContent`); o
motor de foco próprio do repositório, `useRemoteNav`/`clamp`/
`gridNextIndex` (`tv-web/src/lib/useRemoteNav.ts`) — **não** Norigin
Spatial Navigation (ver Decisões Invariantes D-001 e Riscos R-002).

**Storage**: IndexedDB via Dexie, inalterado por esta feature —
`listChannels(sourceId, groupOrder, offset, limit, kind)`
(`catalogRepository.ts`) já é paginado; hoje toda leitura de categoria
(`loadCategoryContent`, `tv-web/src/features/catalog/catalogApi.ts`) chama
com `offset=0, limit=CHANNELS_PER_GROUP_CAP`. Essa feature remove o teto
(D-002), sem mudar a assinatura da função nem o repositório.

**Testing**: Vitest + Testing Library + jsdom (`npm run test`). Lint por
oxlint (`npm run lint`). jsdom não mede layout real — ver `research.md`
R0-4 para como os testes lidam com isso.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 8.0 / Chromium 108.

**Performance Goals**: SC-001 (memória não cresce linearmente com o
tamanho da lista) e SC-002 (latência de input < 200ms por movimento) da
spec original — agora medidos contra o tamanho de **uma categoria aberta**,
não do catálogo inteiro. A feature 010 já reduziu o problema de "300 mil
itens numa tela" para "até alguns milhares de itens numa categoria" — ver
Decisões Invariantes D-002.

**Constraints**: a TV não entrega console (mesma restrição da feature
010) — SC-001/SC-002 só são confirmáveis observando a TV física, nunca
por medição automatizada. A grade de pôsteres (`.poster-grid`,
`grid-template-columns: repeat(6, 1fr)`) usa colunas fluidas — a
virtualização por `lanes` (TanStack Virtual) preserva isso (ver
`research.md` R0-1), mas exige medir a largura real do contêiner
(`research.md` R0-2) em vez de fixar um pixel — ADR-007 proíbe cor/raio/
tamanho de fonte literal, e o mesmo espírito vale para geometria de
layout.

**Scale/Scope**: pior caso agora é uma categoria só do provedor real
(algumas centenas a poucos milhares de itens) — não mais o catálogo de
311.367 entradas de uma vez, que já não é lido inteiro desde a feature 010.

## Decisões Invariantes

- **D-001**: **Sem Norigin Spatial Navigation.** A engine de foco desta
  feature é `useRemoteNav` — estado React (`focusedIdentity`/índice
  derivado) + classe CSS `tv-focus` (ADR-007), nunca `.focus()` de DOM. O
  virtualizador só decide **quais nós existem**; nunca decide **o que está
  focado** nem **como o foco aparece**. Isso diverge da recomendação
  original da ADR-006 §"Foco direcional" — divergência formal, não
  descoberta silenciosa (ver R-002 abaixo e a recomendação de `sdd-adr` no
  relatório final).
- **D-002**: **A categoria aberta é buscada inteira do IndexedDB, sem
  paginação incremental por scroll.** `CHANNELS_PER_GROUP_CAP` (500) sai;
  `listChannels`/`countChannels` deixam de ser chamados com teto artificial
  para a categoria em exibição. O gargalo que a feature 010 mediu foi de
  **escrita** no IndexedDB, não de leitura — uma consulta por índice
  composto para uma categoria real (centenas a poucos milhares de linhas)
  é rápida. Paginação incremental (buscar mais conforme rola) fica de fora
  por não ter necessidade comprovada hoje — pode ser revisitada se uma
  categoria real se mostrar grande demais mesmo pra isso.
- **D-003**: **Escopo estendido às três telas de categoria** (Live TV,
  Filmes, Séries) — decisão do usuário em 23/09/2026, porque a feature 010
  deu às três exatamente a mesma estrutura (trilha + painel de conteúdo) e
  o mesmo risco de categoria grande. **Diverge da letra da `spec.md`**
  ("Fora de Escopo": só Live TV, escrita quando Filmes/Séries ainda eram
  mock) — registrado aqui como desvio explícito. `spec.md` continua sendo
  a fonte da intenção original; este plano documenta por que a foi
  ampliada, em vez de reabrir `sdd-specify` para um ajuste de uma frase.
- **D-004**: **Só o painel de conteúdo da categoria (col 1) é virtualizado
  — nunca a trilha de categorias (col 0).** A trilha tem no máximo algumas
  centenas de linhas (a mesma escala de `categories`, não de `channels`) —
  não precisa de virtualização, e simplifica o desenho a um lugar por
  tela.
- **D-005**: **Lista de canais usa um `useVirtualizer` de uma lane
  (padrão); grade de Filmes/Séries usa o mesmo hook com `lanes: GRID_COLS`**
  — nunca dois virtualizadores compostos. Ver `research.md` R0-1 e
  `logic/virtualizacao-foco.md` para a implementação exata.
- **D-006**: **O helper anterior (`virtualFocusHelper.ts`, construído para
  foco por chave de DOM) é descartado, não adaptado.** Substituído por
  `useVirtualFocusSync` (`logic/virtualizacao-foco.md` §2), que se apoia no
  ciclo de render normal do React em vez de `requestAnimationFrame`
  duplo — porque não existe engine de foco por DOM a esperar (D-001).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Feature não toca fontes/contas. |
| Segredos Fora dos Clientes e dos Logs | N/A | N/A | Nenhuma credencial nova envolvida. |
| Categorias da Fonte São Preservadas | N/A | N/A | Não toca taxonomia. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | Não toca classificação. |
| Comandos Locais Independem de Rede, Backend ou IA | PASS | PASS | Mover foco/rolar não depende de rede — a categoria já foi obtida por inteiro antes de renderizar (D-002); virtualização só afeta quantos nós existem no DOM. |
| Trailers e Metadados Não Alteram Estado da Obra | N/A | N/A | Não aplicável. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | PASS | PASS | Nenhuma ação essencial nova; a navegação por setas continua sendo o único meio, como hoje. **Nota**: R-011 da feature 010 (botões "Tentar de novo"/"Voltar" não ativáveis por OK) é pré-existente nos mesmos painéis que esta feature virtualiza — fora do escopo corrigir aqui (não é sobre virtualização), mas o desenho não pode piorá-lo. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | Não aplicável. |
| Foco Visível e Sem Becos Sem Saída | PASS | PASS | Foco continua vindo de estado + classe CSS (D-001); estados de carregando/erro das três telas não mudam por esta feature. |
| Voltar Restaura Foco e Posição | ATENÇÃO | PASS | Risco real: virtualização muda como "posição de rolagem" é representada. Resolvido pelo desenho — `scrollToIndex` na montagem/retomada usa a mesma identidade de item (`locate()` por id) que já reconcilia foco hoje; a posição *visual* de rolagem é sempre derivada do índice focado, nunca guardada separadamente. |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | Não aplicável. |
| Progresso e Capacidades São Reais, Nunca Prometidos | PASS | PASS | Nenhum percentual novo; a nota de truncamento ("mostrando os primeiros N de M") deixa de aparecer no caminho normal, porque deixa de haver truncamento artificial (D-002) — continua existindo só para o caso real de FR-018 da feature 005 (espaço do aparelho insuficiente). |
| Documentação do Repositório É Canônica | ATENÇÃO | ATENÇÃO | ADR-006 recomenda Norigin Spatial Navigation como engine de foco (§"Foco direcional"); este plano formaliza que isso nunca foi adotado e não será agora (D-001). **Não é violação desta feature** — é uma divergência pré-existente, exposta agora. Recomendação: rodar `sdd-adr` para emendar ADR-006, reconhecendo `useRemoteNav` como a engine de fato. Fica como recomendação no relatório final, não bloqueia este plano. |

Nenhuma violação **desta feature** ficou sem justificativa. A única
ATENÇÃO que permanece pós-design (Documentação do Repositório É Canônica)
é sobre uma decisão de **outra** ADR ficar desatualizada — não sobre o
desenho desta feature, que é consistente com a arquitetura real.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/009-virtualizacao-foco/
├── spec.md                        # Saída do sdd-specify (22/09, não reescrita aqui)
├── plan.md                        # Este arquivo (replanejado 23/09)
├── research.md                    # Fase 0 — decisões técnicas (lanes, medição, sync de foco)
├── logic/
│   └── virtualizacao-foco.md      # Pseudocódigo normativo — evita repetir o erro de 22/09
├── quickstart.md                  # Fase 1 — verificação manual na TV
└── tasks.md                       # Saída do sdd-plan
```

### Source Code (repository root)

Monorepo com frontend Tizen, projeto de empacotamento e backend congelado.
Esta feature toca **apenas** `tv-web/` (nada em `api/` nem em `CCPlayTv/` —
não há mudança de build, só de componente).

```text
tv-web/
├── src/
│   ├── features/
│   │   ├── live/LiveScreen.tsx           # ALTERADO — painel de canais (col 1) vira lista virtualizada
│   │   ├── movies/MoviesScreen.tsx       # ALTERADO — grade de pôsteres (col 1) vira grade virtualizada (lanes)
│   │   ├── series/SeriesScreen.tsx       # ALTERADO — idem
│   │   ├── catalog/catalogApi.ts         # ALTERADO — loadCategoryContent para de aplicar CHANNELS_PER_GROUP_CAP
│   │   └── screens.css                   # ALTERADO — .live-item ganha altura fixa (token); .poster-grid ganha contêiner posicionável
│   └── lib/
│       ├── catalog/catalogRepository.ts  # INALTERADO — listChannels/countChannels já aceitam offset/limit
│       └── focus/
│           ├── useVirtualFocusSync.ts    # NOVO — substitui virtualFocusHelper.ts
│           ├── usePosterColumnWidth.ts   # NOVO — medição por ResizeObserver (R0-2)
│           ├── virtualFocusHelper.ts     # REMOVIDO — premissa errada (foco por chave de DOM)
│           └── virtualFocusHelper.test.ts # REMOVIDO — junto com o helper
└── package.json                          # INALTERADO — @tanstack/react-virtual já instalado
```

**Structure Decision**: frontend-only, dentro de `tv-web/src/features/` (as
três telas de categoria) e um par de hooks novos em `tv-web/src/lib/focus/`
substituindo o helper da rodada anterior. Nenhuma mudança em
`tv-web/src/lib/catalog/` além de deixar de passar um teto artificial —
`catalogRepository.ts` já suporta o que esta feature precisa.

## Complexity Tracking

> Nenhuma violação de constitution exigiu justificativa nesta feature.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — | — | — |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso,
e único capaz de confirmar SC-001/SC-002 — a TV não entrega console).

O que é testável sem a TV: `useVirtualFocusSync` (índice → `scrollToIndex`
chamado com o índice certo, mockando o virtualizador), `usePosterColumnWidth`
(largura injetada via `ResizeObserver` mockado), e o comportamento das três
telas sob uma categoria com milhares de itens mockados (confirma que só uma
fração é montada no DOM em teste — não confirma FPS/memória real, isso é
manual).

Comandos-base:

```powershell
cd tv-web
npm run test        # vitest run
npm run lint        # oxlint
npm run build       # tsc -b && vite build
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Dependência | `@tanstack/react-virtual` ^3.14.13 confirmada em `package.json`, válida. |
| Helper de foco anterior | Removido (T001-T003) — `virtualFocusHelper.ts`/`.test.ts` saíram do repositório via `git rm`. Nenhum consumidor restante. |
| Hooks de foco/medição | `useVirtualFocusSync`/`usePosterColumnWidth` prontos e testados isoladamente (`tv-web/src/lib/focus/`), e agora consumidos pelas três telas (`LiveScreen.tsx`; `MoviesScreen.tsx`/`SeriesScreen.tsx` desde a Fase 4). |
| CSS | `.live-column-channels .live-item`/`.live-channel-list`/`.live-channel-list-inner` (Fase 3) e `.poster-grid`/`.poster-grid-inner`/`.poster-cell` (Fase 4) — as cinco telas/painéis de conteúdo das três seções estão com CSS de virtualização. `.category-content` inalterado (segue só como contêiner flex externo, não precisou virar posicionamento absoluto). |
| Telas | As três telas de categoria (Live TV, Filmes, Séries) virtualizadas — painel/grade sem teto artificial e sem truncamento em nenhuma das três. Grade de pôsteres confirmada renderizando corretamente (sem sobreposição) após T019. |
| `catalogApi.ts` | `loadCategoryContent` sem teto para as três seções (T012 + T017, D-002 completo), usando `NO_LIMIT = 0xffffffff` (T019) — `Number.MAX_SAFE_INTEGER` lançava `TypeError` no `IDBIndex.getAll` nativo. `CHANNELS_PER_GROUP_CAP` não tem mais nenhum consumidor neste arquivo. |
| Verificação na TV física | **Concluída (T018, 23/09/2026).** 5/5 cenários aprovados. Cenário A precisou de T019 (dois bugs na grade: ref que não media + cache de medição do virtualizador); Cenário B precisou de T020 (trilha de categorias sem rolagem automática, fora do escopo de virtualização mas corrigido com autorização do usuário). C, D, E aprovados de primeira. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **Achado no replanejamento (23/09/2026)**: o plano de 22/09 assumia Norigin Spatial Navigation (conforme ADR-006 recomendava) como engine de foco. Nunca foi instalado neste projeto (`package.json` só tem `@tanstack/react-virtual`; busca por "norigin" em todo `tv-web/src` só acha um comentário dentro do próprio helper descartado) | Era crítico — desenhar virtualização para sincronizar com uma engine que não existe produziria código morto, como de fato aconteceu na Fase 2 anterior | **Resolvido**: D-001 trava `useRemoteNav` como a engine real. Recomendação registrada no relatório final: rodar `sdd-adr` para emendar ADR-006 formalmente — esta feature não pode fazer isso sozinha (foge do escopo de `sdd-plan`) |
| R-002 | **Achado no replanejamento**: a Fase 3 do plano de 22/09 descrevia refatorar `.map` direto sobre `activeGroup.channels` em `LiveScreen.tsx` — essa estrutura não existe mais desde a feature 010 (trilha + conteúdo obtido sob demanda) | Era crítico — as tasks antigas referenciavam um arquivo que já mudou de forma | **Resolvido**: `plan.md`/`tasks.md` desta rodada descrevem a estrutura real (`col 0`/`col 1`, `useCategoryContent`, `FocusIdentity`) |
| R-003 | Fase 2 anterior (`virtualFocusHelper.ts`) foi marcada `[X]` em `tasks.md` por um script solto (`update-tasks-009-2.js`, achado na raiz do repositório) em vez de pelo fluxo do `sdd-execute` — o Registro da Fase correspondente ficou em branco apesar dos checkboxes marcados | Baixo — não é um bug de produto, mas indica que aquela "conclusão" não passou pela disciplina normal de checkpoint | **Resolvido: confirmado por auditoria (`sdd-converge`)** — todas as fases desta rodada (1-5) têm Registro da Fase completo, preenchido pelo `sdd-execute` a cada checkpoint. `update-tasks-009-2.js` continua na raiz, sem uso; fica para o usuário decidir se apaga |
| R-004 | Grade de pôsteres depende de medir a largura real do contêiner (R0-2) — jsdom não mede layout, então o teste unitário não pega um erro de cálculo que só aparece com layout real | Médio — regressão visual só visível na TV/navegador, não no CI | **Resolvido: confirmado por auditoria** — teste unitário cobre a fórmula com largura injetada (research.md R0-4); Cenário C do `quickstart.md` aprovado na TV física (T018), 6 colunas consistentes do início ao fim da rolagem |
| R-005 | Painel de conteúdo virtualizado muda a interação com o botão "Tentar de novo"/"Voltar" nos estados de erro (herdados de R-011 da feature 010) | Baixo — R-011 já é conhecido e não corrigido; risco é só de esquecer de preservar o estado atual (por pior que seja) ao trocar a renderização por virtualizador | Nenhuma mudança nova nesses estados — eles continuam fora do `.category-content`/`poster-grid` virtualizado, sem alteração de comportamento por esta feature |
| R-006 | Achado na Fase 2: a T008 original preparava `.poster-grid`/`.live-item` pra posicionamento absoluto antes de qualquer tela consumir isso. Como `.poster-grid` hoje depende de `display: grid` pra funcionar sem virtualização, mudar o CSS antes das telas quebraria Filmes/Séries no intervalo até a Fase 4 | Médio — regressão visual temporária, autoinfligida pela ordem das tasks | **Resolvido**: T008 resequenciada — o CSS de cada tela entra junto com a task que a virtualiza (T011 para `.live-item`, escopado a `.live-column-channels` pra não afetar a trilha de categorias por D-004; T015/T016 para `.poster-grid`) |
| R-007 | **Achado na Fase 3**: `research.md`, `logic/virtualizacao-foco.md` e `quickstart.md` — citados como prerequisito em `tasks.md` e nos comentários dos hooks da Fase 2 (`useVirtualFocusSync.ts`/`usePosterColumnWidth.ts`) — nunca foram commitados neste repositório. `git log --all` para os três caminhos não retorna nenhum commit; existiram só como estado local de uma sessão anterior e não sobreviveram à troca de container desta sessão remota | Médio — a Fase 4 ainda cita `logic/virtualizacao-foco.md` §4/§5 e `research.md` R0-1/R0-2 por número de seção; sem os arquivos, essas referências são inúteis para quem executar a Fase 4 a seguir | **Resolvido**: os três arquivos foram reconstruídos via `sdd-plan` em 23/09/2026, consistentes com o código real já implementado nas Fases 1-3 e com todas as referências por número de seção/item já existentes em `tasks.md`/`plan.md`/comentários de código (conferido um a um — nenhuma ficou órfã). `logic/virtualizacao-foco.md` §4 já é normativo para a Fase 4, ainda não implementada |
| R-008 | **Achado na Fase 3 (testes de `LiveScreen.test.tsx`, T009/T010)**: jsdom não implementa `Element.prototype.scrollTo` e não faz layout real. O `getMaxScrollOffset()` interno do `@tanstack/virtual-core` usa `scrollHeight - clientHeight`; sem mockar as duas junto com `offsetHeight`/`offsetWidth`, o resultado é `0 - 0 = 0`, e **todo** `scrollToIndex` é grampeado em 0 — a janela virtual nunca se move, mesmo com o resto do polyfill (medição de tamanho, `scrollTo`→evento `scroll` assíncrono) correto | Médio — reproduziria o mesmo silêncio (teste passa "por acidente" mostrando só os primeiros itens) na Fase 4 se não for lembrado | **Resolvido**: documentado em `LiveScreen.test.tsx` (comentário no `beforeAll`) com os quatro mocks necessários: `offsetHeight`/`offsetWidth` (`HTMLElement.prototype`) e `clientHeight`/`scrollHeight` (`Element.prototype`), mais um polyfill de `scrollTo` que despacha o evento `scroll` via `queueMicrotask` (síncrono reentraria no React em plena fase de commit — `flushSync was called from inside a lifecycle method`). Reaproveitado com sucesso em `MoviesScreen.test.tsx`/`SeriesScreen.test.tsx` na Fase 4, mais um `FakeResizeObserver` (necessário ali por causa de `usePosterColumnWidth`) |
| R-009 | **Achado na Fase 4** (T013/T014): `class FakeResizeObserver { constructor(private callback: ResizeObserverCallback) {} }` — a forma abreviada de propriedade de parâmetro do construtor do TypeScript — passa no `vitest run` mas falha `npm run build` com `TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled` (`tsc -b` é mais estrito que o transform do Vitest) | Baixo — pego pelo próprio gate de build desta task, não chegou a vazar pra frente | **Resolvido**: trocado por um campo de classe normal (`callback: ResizeObserverCallback`) atribuído no corpo do construtor — mesmo efeito, sintaxe totalmente erasable. `usePosterColumnWidth.test.ts` (Fase 2) já evitava isso por outro caminho (variável de closure em vez de campo de classe) — nenhuma mudança necessária lá. Lição para qualquer mock futuro com classe: nunca usar `private`/`public`/`readonly` na assinatura do construtor neste repositório |
| R-010 | **Achado na TV física (T018/T019), grade de Filmes/Séries "se fundindo e entrelaçada"**: três bugs reais em código da Fase 4, achados em duas rodadas. (1) `usePosterColumnWidth`'s `useEffect` tinha `[containerRef, cols]` como dependências, mas o contêiner só monta no DOM depois que o conteúdo carrega — o efeito nunca rodava de novo e `columnWidth` ficava travado em `0`. (2) `loadCategoryContent` passava `Number.MAX_SAFE_INTEGER` como `limit` do Dexie, que chega até `IDBIndex.getAll(query, count)` — `count` é validado como `unsigned long` (máx. `2**32-1`); um valor maior lança `TypeError`, reproduzido no Chrome de desktop. (3) **Persistiu depois de corrigir (1) e (2), só na TV**: o `useVirtualizer` guarda em cache a medição de cada item na primeira vez que o vê; se isso acontecer antes do primeiro `ResizeObserver` disparar, o `rowHeight` mínimo fica preso — passar um `estimateSize` novo depois não invalida sozinho o que já foi medido. No navegador de desenvolvimento a corrida entre medição e `ResizeObserver` tende a favorecer o `ResizeObserver`; a TV, mais lenta, perdia essa corrida | Alto — bug (1) sozinho já quebrava visualmente a entrega principal da Fase 4 em qualquer navegador moderno; bug (2) quebraria de vez (erro) num motor mais rigoroso que o Chromium 108 da TV; bug (3) só aparecia na própria TV, invisível em qualquer verificação de desktop | **Resolvido**: `usePosterColumnWidth` reescrito com callback ref; `loadCategoryContent` passou a usar `0xffffffff` (`NO_LIMIT`); `MoviesScreen.tsx`/`SeriesScreen.tsx` ganharam `useEffect(() => virtualizer.measure(), [rowHeight, virtualizer])` — padrão confirmado contra a documentação oficial do TanStack Virtual. Achado relacionado corrigido junto: as três telas não distinguiam `content.isError` de "categoria vazia". Regressão de (1) coberta por `usePosterColumnWidth.test.ts`; (3) não tem teste automatizado (exigiria simular a corrida de tempo real entre medição e `ResizeObserver`, que jsdom não reproduz de forma significativa) — a evidência é a TV física. Suíte: 268/268 |
| R-011 | **Achado na TV física (T018/T020, Cenário B), Live TV**: o foco "some" descendo pela **trilha de categorias** (não o painel virtualizado, já corrigido em R-010). Fora do escopo de virtualização desta feature (D-004 exclui a trilha de propósito) — pré-existente desde a feature 010, exposto só agora por uma fonte real com dezenas de categorias. Confirmado com o usuário antes de corrigir | Médio — viola "Foco Visível e Sem Becos Sem Saída" da constitution; a trilha tem `overflow: auto` mas nada rolava o item focado pra dentro da vista, porque o foco é uma classe CSS, não foco real de DOM (o navegador só rola sozinho pra foco de verdade) | **Resolvido, com autorização explícita do usuário pra corrigir agora** (fora do escopo original, mas no mesmo arquivo, mesma sessão): `useScrollFocusedIntoView` novo (`tv-web/src/lib/focus/`), `scrollIntoView({ block: 'nearest' })` no botão da categoria focada, conectado nas três telas. jsdom não implementa `scrollIntoView` — polyfill de no-op em `setupTests.ts`. Suíte: 270/270 |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-22 | Fase 1 (rodada anterior) | `@tanstack/react-virtual` instalado. Ainda válido. | — |
| 2026-09-22 | Fase 2 (rodada anterior) | `virtualFocusHelper.ts` construído para foco por chave de DOM (premissa Norigin) — **descartado nesta rodada**, ver R-001/R-002/D-006. | Substituir por `useVirtualFocusSync` (Fase 1 desta rodada) |
| 2026-09-23 | Replanejamento (`sdd-plan`) | Achadas as duas premissas erradas acima durante a exploração dirigida. Escopo estendido às três telas de categoria por decisão do usuário (D-003). `research.md`/`logic/virtualizacao-foco.md` novos, `plan.md`/`tasks.md` reescritos contra a arquitetura real pós-feature-010. | `sdd-execute` ainda não rodou sob este plano |
| 2026-09-23 | Fase 1 (Setup) | Dependência confirmada; `virtualFocusHelper.ts`/`.test.ts` removidos do repositório (`git rm`). Suíte: 256/256 (28 arquivos), `npm run build` limpo. ADR-009 criada e ADR-006 emendada nesta mesma sessão, antes do `sdd-execute` começar. | Nenhuma — Fase 2 (Foundational) liberada |
| 2026-09-23 | Fase 2 (Foundational) | `useVirtualFocusSync`/`usePosterColumnWidth` criados e testados isolados. T008 resequenciada (R-006) — CSS de cada tela move pra dentro de T011/T015/T016, pra não quebrar Filmes/Séries no meio do caminho. Suíte: 263/263 (30 arquivos), `tsc`/`oxlint` limpos. | Nenhuma — Fases 3/4 liberadas |
| 2026-09-23 | Fase 3 (US1 — Live TV) | `LiveScreen.tsx` virtualizado: `useVirtualizer` (1D) + `useVirtualFocusSync` no painel de canais; CSS novo em `screens.css` (`.live-item` fixo a 72px escopado a `.live-column-channels`, `.live-channel-list`/`.live-channel-list-inner`). `catalogApi.ts`: canais sem teto (`Number.MAX_SAFE_INTEGER`), filmes/séries inalterados. Achados registrados como R-007 (docs de design da Fase 0 nunca commitados) e R-008 (jsdom precisa de `clientHeight`/`scrollHeight` mockados, não só `offsetHeight`/`offsetWidth`, ou `scrollToIndex` grampeia em 0). Suíte: 265/265 (30 arquivos, +2 novos). `tsc`/`oxlint`/`build` limpos. | R-007 (regenerar docs de design antes da Fase 4, se o usuário quiser) |
| 2026-09-23 | `sdd-plan` (regeneração de docs, sob pedido do usuário) | `research.md` (R0-1 a R0-4), `logic/virtualizacao-foco.md` (§1-§5) e `quickstart.md` (Cenários A-E) reconstruídos, consistentes com o código real das Fases 1-3 e com toda citação por número/letra já existente em `tasks.md`/`plan.md`/comentários de código (conferidas uma a uma). R-007 marcado Resolvido. Não foi um replanejamento — `tasks.md`/Decisões Invariantes/Constitution Check não foram tocados. | Nenhuma — Fase 4 liberada com o `logic/virtualizacao-foco.md` §4 normativo disponível |
| 2026-09-23 | Fase 4 (Filmes/Séries, extensão D-003) | `MoviesScreen.tsx`/`SeriesScreen.tsx` virtualizados: `useVirtualizer` com `lanes: GRID_COLS` + `usePosterColumnWidth` + `useVirtualFocusSync`, seguindo `logic/virtualizacao-foco.md` §4. CSS novo (`.poster-grid` vira `position: relative`, `.poster-grid-inner`/`.poster-cell` novos) vale para as duas telas. `catalogApi.ts`: `CHANNELS_PER_GROUP_CAP` removido de vez (D-002 completo, T017) — as três seções buscam a categoria inteira. Achado novo, R-009 (sintaxe de propriedade de parâmetro do construtor falha `tsc -b` com `erasableSyntaxOnly`, mesmo passando no Vitest) resolvido inline. Suíte: 267/267 (30 arquivos, +2 novos). `tsc`/`oxlint`/`build` limpos. | Nenhuma conhecida — só falta a Fase 5 (verificação manual, T018) |
| 2026-09-23 | Fase 5 (T018/T019/T020) | Instalado na TV física (skill `tizen-tv`) para rodar o `quickstart.md` — 4 ciclos de build/instalação ao longo da verificação. Cenário A revelou grade de Filmes/Séries com cards sobrepostos (R-010): (1) `usePosterColumnWidth` reescrito com callback ref; (2) `loadCategoryContent` trocou `Number.MAX_SAFE_INTEGER` por `0xffffffff` (`IDBIndex.getAll` valida `count` como `unsigned long`); (3) mesmo depois de (1)+(2), persistiu na TV até `virtualizer.measure()` ser chamado explicitamente quando `rowHeight` muda (o virtualizador cacheava a medição errada de antes do `ResizeObserver` disparar). `content.isError` passou a contar como falha nas três telas. Cenário B revelou a trilha de categorias sem rolagem automática (R-011, fora do escopo de virtualização — D-004 — mas corrigido com autorização explícita do usuário): `useScrollFocusedIntoView` novo, `scrollIntoView` nas três telas, polyfill de no-op em `setupTests.ts` (jsdom não implementa). C, D, E aprovados de primeira. `quickstart.md` fechado: 5/5 cenários aprovados. Suíte final: 270/270 (31 arquivos), `tsc`/`oxlint`/`build` limpos. | Nenhuma — feature pronta para `sdd-converge` |

**PRÓXIMO**: Feature concluída — todas as tasks de `tasks.md` marcadas,
incluindo T018/T019/T020. `sdd-converge` pode rodar quando o usuário
quiser fechar a feature formalmente.

## Arquivos Principais

- `tv-web/src/lib/focus/useVirtualFocusSync.ts`, `usePosterColumnWidth.ts` — consumidos pelas três telas de categoria (`usePosterColumnWidth` reescrito com callback ref em T019, R-010)
- `tv-web/src/lib/focus/useScrollFocusedIntoView.ts` — novo (T020, R-011), trilha de categorias nas três telas
- `tv-web/src/features/catalog/catalogApi.ts` — `NO_LIMIT = 0xffffffff` (T019), `content.isError` tratado como falha
- `tv-web/src/setupTests.ts` — polyfill de `Element.scrollIntoView` (T020, jsdom não implementa)
- `tv-web/src/features/live/LiveScreen.tsx`, `movies/MoviesScreen.tsx`, `series/SeriesScreen.tsx` — as três virtualizadas (Fases 3 e 4)
- `tv-web/src/features/catalog/catalogApi.ts` — `loadCategoryContent` sem teto para as três seções (D-002 completo)
- `tv-web/src/features/screens.css` — `.live-column-channels .live-item`/`.live-channel-list`/`.live-channel-list-inner` (Fase 3) e `.poster-grid`/`.poster-grid-inner`/`.poster-cell` (Fase 4)
- `sdd/specs/009-virtualizacao-foco/quickstart.md` — próximo (Fase 5, T018): roteiro dos 5 cenários (A-E) a rodar na TV física/navegador

## Cuidados para Retomada

- **Não reaproveite `virtualFocusHelper.ts`** mesmo que pareça "quase
  pronto" — ele resolve um problema (sincronizar com foco por DOM) que
  este projeto não tem. Ver R-001/R-002 e `logic/virtualizacao-foco.md`.
- **`CHANNELS_PER_GROUP_CAP` em `groupChannels.ts` sai de uso** nesta
  feature (D-002) — mas `groupChannels()` em si já estava sem consumidor em
  produção desde a feature 010 (R-012 daquela feature). Não é esta feature
  que decide remover a função morta; só o teto de renderização deixa de
  ser aplicado em `catalogApi.ts`.
- **`update-tasks-009-2.js`** (script solto na raiz do repositório, achado
  durante este replanejamento) não foi tocado — decisão de removê-lo ou não
  fica com o usuário, fora do escopo de `sdd-plan`.
- **`research.md`/`logic/virtualizacao-foco.md`/`quickstart.md` foram
  reconstruídos em 23/09/2026** (R-007, via `sdd-plan`) depois de nunca
  terem sido commitados na primeira vez — **desta vez estão no `git log`**.
  Se algum deles voltar a "sumir" numa sessão futura, é sinal de que não
  foram commitados de novo — confira `git status`/`git log --all -- <caminho>`
  antes de assumir que precisam ser recriados outra vez.
- **Testando `useVirtualizer`/`usePosterColumnWidth` em jsdom (R-008)**:
  mockar só `offsetHeight`/`offsetWidth` (`HTMLElement.prototype`) não
  basta — `scrollToIndex` fica grampeado em 0 sem `clientHeight`/
  `scrollHeight` (`Element.prototype`) também mockados, porque
  `getMaxScrollOffset()` do `@tanstack/virtual-core` usa
  `scrollHeight - clientHeight`. O polyfill de `scrollTo` precisa despachar
  o evento `scroll` de forma assíncrona (`queueMicrotask`), nunca síncrona,
  ou reentra no React em plena fase de commit. O bloco pronto (mais
  `FakeResizeObserver` onde a tela usa `usePosterColumnWidth`) está
  duplicado no topo de `LiveScreen.test.tsx`/`MoviesScreen.test.tsx`/
  `SeriesScreen.test.tsx` — copiar de um desses em vez de redescobrir do
  zero em qualquer teste futuro que precise virtualizar algo novo.
- **Mock de classe com `ResizeObserver`/similar: nunca use propriedade de
  parâmetro do construtor** (`constructor(private x: T) {}`) — passa no
  Vitest mas quebra `npm run build` com `TS1294 (erasableSyntaxOnly)`
  (R-009). Declare o campo separado e atribua no corpo do construtor.

## Resultado Final

`sdd-converge` rodado em 23/09/2026. Nenhum achado acionável — convergência
limpa na primeira passada.

**O que foi de fato construído** bate com o desenho do replanejamento em
tudo que importa: as três telas de categoria (Live TV, Filmes, Séries)
virtualizam o painel de conteúdo (`useVirtualizer` — lista 1D em canais,
`lanes: GRID_COLS` em pôsteres), sincronizado com o motor de foco próprio
do projeto (`useVirtualFocusSync`, D-001) em vez de Norigin Spatial
Navigation — que nunca chegou a ser adotado, e cuja recomendação original
(ADR-006) foi formalmente substituída por ADR-009 nesta mesma sessão. A
categoria buscada inteira sem paginação incremental (D-002) removeu o teto
artificial `CHANNELS_PER_GROUP_CAP` das três seções. A trilha de categorias
(col 0) permanece deliberadamente fora da virtualização (D-004).

**Único desvio real de spec.md, já registrado como decisão consciente**:
FR-002 nomeia Norigin Spatial Navigation; o código usa `useRemoteNav`
(D-001/ADR-009). Não é uma lacuna de implementação — é uma correção de
premissa técnica que a spec original (22/09) carregava por engano, mantida
aqui como registro histórico em vez de reescrita silenciosa.

**Desvios acumulados nas Execution Notes, todos documentados no momento em
que aconteceram**:

- **D-003**: escopo estendido de "só Live TV" (letra original de `spec.md`)
  para as três telas de categoria, por decisão do usuário em 23/09/2026 —
  Filmes/Séries ganharam exatamente a mesma estrutura de trilha+conteúdo
  que a feature 010 deu à Live TV, e o mesmo risco de categoria grande.
- **R-010** (três bugs reais, achados na TV física, T019): `usePosterColumnWidth`
  nunca media a largura real (ref não reagia a montagem tardia do
  contêiner); `Number.MAX_SAFE_INTEGER` como `limit` do Dexie lançava
  `TypeError` real no `IDBIndex.getAll` nativo (o `unsigned long` do
  WebIDL tem teto de `2**32-1`); e, mais sutil, o virtualizador cacheava a
  medição errada de antes do `ResizeObserver` disparar, exigindo
  `virtualizer.measure()` explícito quando `rowHeight` muda — o padrão
  que a própria documentação do TanStack Virtual recomenda para medição
  assíncrona, e que só a TV física expôs (o navegador de desenvolvimento
  "ganhava a corrida" por sorte de velocidade).
- **R-011** (achado na TV física, T020, fora do escopo de virtualização
  desta feature por D-004, mas corrigido com autorização explícita do
  usuário): a trilha de categorias não rolava sozinha para acompanhar o
  foco — pré-existente desde a feature 010, exposto só agora por uma fonte
  real com dezenas de categorias. `useScrollFocusedIntoView` novo resolve
  isso nas três telas.

**Diferença técnica notável do plano original**: nenhuma — as Decisões
Invariantes D-001 a D-006 se mantiveram estáveis do replanejamento até a
entrega final, sem precisar reabrir design.

**O que fica genuinamente pendente, fora do escopo desta feature** (nenhum
bloqueia a convergência): R-005/R-011-da-feature-010 (botões "Tentar de
novo"/"Voltar" não ativáveis por OK do controle físico nos estados de
carregando/erro — pré-existente, já logado em `.planning/backlog.md`);
`update-tasks-009-2.js` (script solto na raiz, decisão do usuário se
remove ou não); `groupChannels()`/`CHANNELS_PER_GROUP_CAP` mortos em
`groupChannels.ts` (R-012 da feature 010, candidatos a remoção num polish
futuro, não desta feature).
