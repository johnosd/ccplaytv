# Assessment Decision: Carga de listas — progresso claro, entrada instantânea, contagens e atualização

- **Slug**: carga-listas-progresso-claro-entrada-instantanea
- **Decidido**: 2026-09-30
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | As quatro dores batem com o código: tela de progresso com etapas e contadores agregados (`ImportProgressScreen.tsx`); itens só ao entrar/repousar 300 ms (`categoryLoader.ts`, R-013 da 010); Xtream sem contagem em `get_*_categories` (`xtreamConnector.ts`); atualização por 24 h (`freshness.ts`) sem nenhum sinal visível. |
| Força da evidência | strong | Relato em primeira mão do dono do produto + confirmação no código + tamanhos medidos do painel real (research.md da 010). **Linha de base informada pelo dono do produto (2026-09-30): a primeira entrada numa categoria leva ~1 minuto na TV** — 20× a meta SC-002 da 010 (≤ 3 s). Número observado, não cronometrado; a Fase 0 do plano o mede com precisão. |
| Valor vs. custo de inação | strong | Dor de primeira impressão, prioridade declarada "alta, antes de tudo". Bônus estrutural: com pré-carga, o catálogo local fica útil offline (ADR-002), hoje só vale o que foi aberto. |
| Viabilidade / apetite | adequate | Reaproveita peças prontas: `categoryLoader`/`ensureCategory` (já idempotente e com frescor), `useCategoryFocusPrefetch`, `declaredCount`/`itemsCount`, estados de sincronização da 034. **Risco central**: a 010 registrou "gravar tudo em segundo plano… adia o sintoma" e travou a regra D-007 — a abordagem só é viável se a pré-carga for **em lotes pequenos, cedendo à navegação e pausada no play**, e isso precisa ser **provado na TV** (SC-C) antes de o resto ser construído. Esta decisão reabre D-007 de forma registrada, não silenciosa. |
| Fit estratégico | strong | Coerente com client-first (ADR-008) e offline-first (ADR-002); respeita a constitution (sem percentual inventado, contagem só de dado real, foco nunca dispara consulta — a pré-carga é agendada pela abertura da lista, não pelo foco). |

## Abordagens Candidatas

### A. Pré-carga ociosa em segundo plano + tela de carga por seção + contagens e atualização visíveis

- Após a lista abrir (estrutura já gravada), um agendador percorre as
  categorias de cada seção pelo mesmo `ensureCategory` que a entrada usa,
  uma de cada vez, com pausa entre lotes, cedendo quando há tecla recente,
  **pausado com o player aberto** e retomado depois; prioriza a seção/categoria
  em que a pessoa está. A tela de carga ganha uma linha por seção (Canais,
  Filmes, Séries, Guia) com estado e contagens reais. O trilho mostra a
  contagem real assim que a categoria está no disco. A atualização por idade
  usa o mesmo agendador (sem travar) e aparece como "Atualizada há…" /
  "Atualizando…".
- **Recomendada**: sim — é a única que ataca as quatro dores juntas sem
  voltar à carga eager que congelava a TV, e é incremental: se a medição da
  Fase 0 mostrar travamento, a pré-carga cai para "só vizinhança" sem perder
  as outras três partes.

### B. Só percepção

- Skeleton imediato, pré-busca mais agressiva por vizinhança (categorias
  adjacentes à focada), textos melhores na tela de carga.
- **Recomendada**: não como solução — não resolve a primeira entrada fria nem
  as contagens. Serve de **plano de recuo** se A reprovar na TV.

### C. Contar sem gravar

- Baixar a seção inteira uma vez só para contar itens por `category_id` no
  Worker e descartar.
- **Recomendada**: não — 12,4 MB (filmes) + 9,7 MB (séries) de rede e parse
  só para um número; a própria 034 já descartou isso. A abordagem A entrega a
  contagem de graça conforme a pré-carga avança.

## Veredito

**go.** Problema válido e forte, evidência adequada em todos os critérios
centrais, sem `weak` nem `unknown` crítico. O único dado ausente (tempo real
da primeira entrada hoje e o impacto da pré-carga na navegação da TV) é
reconhecido e fica como gate explícito da Fase 0 do plano: medir antes de
construir, com critério de recuo para a abordagem B.

### Se go — Handoff

- **Problema**: após incluir uma lista Xtream/URL, a carga é opaca (tela de
  progresso genérica), cada primeira entrada em categoria espera a rede, a
  contagem só aparece depois de entrar e a atualização é invisível e temida
  como fonte de travamento.
- **Abordagem recomendada**: A — pré-carga ociosa em segundo plano por
  categoria (reusa `ensureCategory`), em lotes pequenos, cedendo à navegação e
  pausada durante a reprodução; tela de carga com uma linha por seção (Canais,
  Filmes, Séries, Guia) com estado e contagens reais; contagem real no trilho
  assim que a categoria está no disco (M3U guardada: desde a importação, via
  `declaredCount`); "Atualizada há… / Atualizando…" visível, com a
  atualização por idade passando pelo mesmo agendador.
- **Escopo sugerido**:
  - Entra: as quatro partes acima, para Xtream, M3U confirmada como painel e
    M3U guardada (`stored`: materializar `storedEntries` → `channels` em
    segundo plano também).
  - Não entra: importação eager; contagem total Xtream na importação;
    frequência configurável; reconciliação pós-resync (item 24);
    single-flight (item 36); estados da fonte em Configurações/cartão (034 —
    esta só consome); pré-carga de TMDB, capas ou episódios; pré-carga durante
    o play.
- **Métricas de sucesso**: SC-A ≤ 300 ms OK→itens em categoria pré-carregada
  (TV de referência); SC-B ≥ 80 % das categorias prontas num prazo a fixar
  após medição; SC-C p95 tecla→foco dentro de ±20 % com a pré-carga rodando;
  SC-D zero rebuffer atribuível (pausada no play); SC-E 0 percentuais
  estimados na tela de carga; SC-F nenhuma contagem diferente do disco.
- **Perguntas em aberto pro sdd-specify**:
  - Reabrir **D-007 / R0-1 da 010** explicitamente ("gravar tudo em segundo
    plano adia o sintoma") — a spec precisa dizer por que o ritmo controlado
    muda isso e qual é o critério de recuo.
  - **Linha de base: ~1 minuto na primeira entrada** (dono do produto,
    2026-09-30). É 20× a meta de 3 s que a 010 aprovou na TV em 23/09 — a
    Fase 0 precisa **decompor esse minuto** (rede do painel × parse × gravação
    × render/capas) antes de fixar SC-B. Se parte relevante for regressão
    (ex.: algo introduzido depois da 010), isso é bug a corrigir na própria
    feature ou via `sdd-bugfix` — a pré-carga não pode servir para esconder
    uma regressão. Com ~1 min por categoria, "≥ 80 % prontas" pode levar
    horas: o prazo de SC-B só se fixa depois dessa decomposição.
  - Ordem da pré-carga: **ainda indefinida** pelo dono do produto — a spec
    propõe uma ordem padrão (sugestão: seção em que a pessoa está, depois as
    categorias vizinhas da focada, depois o resto na ordem do provedor) e a
    marca como decisão a validar na TV.
  - Espaço em disco: **confirmado pelo dono do produto que o catálogo inteiro
    cabe** na TV. A spec ainda define o comportamento em `storage_full`
    (parar a pré-carga, nunca apagar o que a pessoa usa).
  - Sequência com a **034**: **esta entra antes** (decisão do dono do
    produto, 2026-09-30). A 034 (Especificada, mesma zona `IMPORT`/`FONTE`)
    é planejada depois e rebaseia; esta feature mostra "Atualizada há… /
    Atualizando…" onde precisar (Início/trilho/tela de carga) sem invadir a
    linha de Configurações e o cartão, que continuam da 034.
  - Pré-busca amortecida de 300 ms (R-013) passa a ser só "prioridade" dentro
    do agendador, ou continua como mecanismo separado?
