# Bug Assessment: Lista Xtream não traz filmes/séries/canais novos ao abrir o app

- **Slug**: lista-xtream-nao-atualiza-novos-filmes
- **Criado**: 2026-10-09
- **Origem**: texto colado (relato do usuário, teste comparativo com outros apps)
- **Veredito**: valid
- **Severidade**: critical

## Report

> eu testei a mesma lista xtream em apps diferentes e no meu, percebi que a
> lista entrou filmes e series novos e no meu app para mesma lista não entrou.
> é um item critico entrar novos items na lista sempre que abrir o app, caso
> contrario o usuario não tera acesso a novos filmes e series adicionados, o
> mesmo vale apra quando entra ou sai canais, filmes ou series

## Symptom

Com a mesma lista Xtream, outros apps mostram filmes e séries recém-adicionados
pelo provedor; o ccplayTv continua mostrando o catálogo antigo. Esperado: ao
abrir o app (escolher a lista), entradas novas aparecem e as que o provedor
removeu somem — canais, filmes e séries.

## Reproduction

1. Lista Xtream sincronizada com sucesso (`lastSuccessfulSyncAt` = T).
2. O provedor adiciona filmes/séries (ou remove canais) depois de T.
3. Abrir o app e escolher a lista em qualquer instante antes de T + 24 h.
4. `decideOnOpen` devolve `'none'` → nenhuma atualização de estrutura; as
   categorias já carregadas são consideradas "frescas" por `isCategoryFresh`
   (também 24 h) → nem a tela nem a pré-carga buscam os itens de novo.
5. Resultado: nenhum item novo aparece até passar 24 h da última sincronização
   **e** a lista ser escolhida de novo.

Agravantes, deduzidos do código:

- Quem abre o app todo dia em horários parecidos (ex.: 20h e, no dia seguinte,
  19h) pode passar vários dias sem nunca cruzar as 24 h no momento da abertura.
- Na TV o app costuma ficar residente (multitarefa do Tizen): voltar ao app é
  um `visibilitychange`, não uma nova escolha de lista — `useOpenSource` nem
  é chamado, então nada é verificado, por mais tempo que tenha passado.
- Paliativo hoje: "Ressincronizar" manual (FR-021 da 004) — o usuário comum
  não sabe que precisa.

Reprodução por código (determinística), não por aparelho: a regra está em
funções puras com o instante injetado. Não foi executada contra o provedor
real nesta fase.

## Suspected Code Paths

- `tv-web/src/lib/catalog/freshness.ts:3` — `STALE_AFTER_MS = 24 h`, prazo
  único de "velho" para fonte e para categoria.
- `tv-web/src/lib/catalog/freshness.ts:36-41` — `decideOnOpen` só devolve
  `'update_by_age'` quando `now - lastSuccessfulSyncAt > 24 h`; abaixo disso,
  `'none'`. **Causa raiz.**
- `tv-web/src/lib/catalog/freshness.ts:62-65` — `isCategoryFresh`: itens de
  uma categoria `on_demand` valem 24 h; `ensureCategory`
  (`categoryLoader.ts:362-367`) e `workNeeded` (`prefetch/prefetchOrder.ts:67`)
  não renovam antes disso.
- `tv-web/src/features/import/importApi.ts:476-505` — `useOpenSource`: só
  importa quando `decideOnOpen !== 'none'`.
- `tv-web/src/App.tsx:171-188` — `enterSource` é o único ponto que chama
  `openSource.mutate`; não há gatilho na volta do app ao primeiro plano.

O que **já funciona** e deve ser reaproveitado, não reescrito (feature 038):
quando `startLocalImport` roda numa lista com geração ativa,
`repository/structureRefresh.ts` (`applyStructureRefresh`) acrescenta
categorias novas, remove as que o provedor não declara mais e marca as
mantidas com `renewRequestedAt`; a pré-carga (`prefetch/`) renova os itens em
segundo plano (carga por seção inteira via `runSection`), e `App.tsx:110-131` +
`onSourceSyncFinished`/`setPrefetchCategoryDone` invalidam as consultas das
telas. Ou seja: o caminho de atualização existe e é incremental — o problema é
só **quando** ele é disparado.

## Root Cause Hypothesis

O gatilho de atualização ao abrir uma lista foi especificado (feature 004,
FR-020) com um prazo de 24 h desde a última sincronização bem-sucedida, e o
mesmo prazo foi reaproveitado para a validade dos itens de cada categoria
(feature 010/038). Abrir o app dentro desse prazo não pergunta nada ao
provedor, e retomar o app residente não passa por nenhuma verificação. Por
isso entradas e saídas do provedor ficam invisíveis por até 24 h — ou
indefinidamente, se a abertura nunca cair depois do prazo. A própria FR-020
diz que o valor de 24 h é "ajuste de configuração, não de comportamento".
Confiança: **high**.

## Proposed Remediation

**Preferida** — atualizar a lista em segundo plano a cada abertura, pelo
caminho incremental que já existe:

1. `decideOnOpen`: fonte já sincronizada passa a devolver `'update_by_age'`
   sempre que a última sincronização bem-sucedida tiver mais que um intervalo
   mínimo curto (proposta: `REFRESH_ON_OPEN_MIN_MS` = 10 min), e não mais
   24 h. O intervalo mínimo só existe para não reimportar ao alternar listas
   ou reabrir em sequência; o padrão de "sempre que abrir" fica atendido.
   Renomear o valor (ex.: `'update_on_open'`) é opcional — o comportamento a
   jusante (`startLocalImport` + acompanhamento em `App.tsx`) é o mesmo.
2. Volta ao primeiro plano: em `App.tsx`, ouvir `visibilitychange` → visível
   com lista ativa e acesso aberto e reaplicar a mesma decisão
   (`openSource.mutate`), respeitando o mesmo intervalo mínimo e sem disparar
   se uma sincronização da lista já estiver em andamento (`isSourceSyncing`).
3. `isCategoryFresh` pode continuar com 24 h: depois de uma atualização, toda
   categoria mantida já fica com renovação pendente (`renewRequestedAt`), e é
   isso que faz os itens novos/removidos de uma categoria existente
   aparecerem. O prazo de 24 h passa a ser só a rede de segurança de uma
   sessão longa sem reabertura.
4. Nada muda na experiência de abertura: a navegação continua servindo o
   catálogo do disco na hora (ADR-002, cache-first); a atualização é "fogo e
   esquece", como já é.

**Alternativas**:
- Só baixar o prazo de 24 h para algo como 1–6 h: menos rede, mas não
  atende "sempre que abrir" e mantém o buraco do app residente.
- Comparar contagens (`declaredCount`, ou `get_*_streams` inteiro) e só marcar
  renovação nas categorias que mudaram: economiza rede, mas `declaredCount`
  não detecta troca de item com o mesmo total, e a comparação completa já é
  o próprio download. Fica como otimização futura, não como fix.
- Frequência configurável em Configurações: fora do escopo de um bugfix
  (a 038 deixou isso explicitamente fora); pode virar ideia no backlog.

**Files likely to change**:
- `tv-web/src/lib/catalog/freshness.ts`
- `tv-web/src/lib/catalog/freshness.test.ts`
- `tv-web/src/features/import/importApi.ts` (só se a ação for renomeada)
- `tv-web/src/App.tsx` (gatilho na volta ao primeiro plano)
- teste novo para o gatilho de primeiro plano (ex.:
  `tv-web/src/navigation/` ou junto do `App`, conforme o padrão dos testes
  existentes do `App.tsx`)
- `sdd/specs/004-conector-xtream-live/spec.md` — emenda inline à FR-020
  registrando o novo prazo (não reescrever o texto original)

**Tests to add or update**:
- `freshness.test.ts`: fonte sincronizada há 11 min → `'update_by_age'`; há
  5 min → `'none'`; `never_synced` continua `'none'`; migração continua
  `'migrate'`. Ajustar casos que hoje esperam `'none'` abaixo de 24 h.
- Gatilho de primeiro plano: `visibilitychange` para visível com lista ativa
  dispara a decisão uma vez; dentro do intervalo mínimo ou com sincronização
  em andamento, não dispara; sem lista ativa (tela de perfis), não dispara.
- Regressão de `importPipeline.atualizacao.test.ts` /
  `catalogRepository.atualizacao.test.ts` (estrutura nova/removida na geração
  ativa) — rodar, não mudar.
- E2E: o fluxo de abertura não pode ganhar espera visível; rodar
  `npm run test:e2e` como gate.

## Risks & Considerations

- **Custo na TV a cada abertura**: a atualização relê as categorias das três
  seções e, depois, a pré-carga renova todas as categorias mantidas — com a
  carga por seção, são ~3 downloads grandes (`get_live_streams`,
  `get_vod_streams`, `get_series`; a lista de referência tem ~311 mil
  entradas). Isso já acontece hoje uma vez por dia; passa a acontecer a cada
  abertura. O portão de atividade (`prefetchGate`) já pausa a gravação durante
  navegação, mas é preciso medir na TV física (memória/disco — ver o
  "disco cheio" tratado na 065) antes de fechar o bug como `verified`.
- **Lista M3U por URL** (`stored`): a mesma regra re-baixa o arquivo M3U
  inteiro a cada abertura. FR-020 vale "para qualquer fonte"; manter a
  paridade, mas registrar o custo.
- **Limite de requisições do provedor** (`rate_limited` já é tratado pela
  pré-carga): mais aberturas = mais chamadas; o intervalo mínimo mitiga.
- **Conta vencida/recusada**: `enterSource` só roda depois de
  `decideSourceAccess` liberar; o gatilho de primeiro plano precisa da mesma
  guarda (não atualizar lista cujo acesso está bloqueado).
- **Foco**: a invalidação ao fim da atualização já reconcilia foco por id
  (LiveScreen e grades); um item removido que estava focado precisa cair no
  vizinho — já é o comportamento da 038, mas vale conferir no E2E.
- **Constituição**: "focar nunca dispara consulta externa" — não é afetado;
  o gatilho é abrir/retomar o app, não foco.

## Open Questions

- Intervalo mínimo entre atualizações automáticas: proposto 10 min. Se a
  preferência for literalmente toda abertura (0), a fase Fix ajusta a
  constante — não muda o desenho.
