# Bug Assessment: Abrir o app não atualiza todas as categorias (tela principal sem os recém-adicionados)

- **Slug**: abrir-app-nao-atualiza-todas-categorias
- **Criado**: 2026-10-09
- **Origem**: texto colado (relato do usuário depois da passada na TV do bug `categoria-aberta-nao-mostra-itens-novos`)
- **Veredito**: valid
- **Severidade**: critical

## Report

> Eu instalei na TV, depois que eu entrei na categoria, apareceu, mas isso é um
> pouco perigoso, porque o usuário pode entrar na tela principal e não ver os
> recém-adicionados. Deveria ter uma forma de carregar isso quando abrisse o app
> para todas as categorias. É crítico ter todos os filmes, séries e canais
> atualizados quando o usuário abre o app.

## Symptom

Na TV, depois de abrir a lista, só a categoria em que a pessoa entra é
renovada logo (bug anterior). As demais, e com elas o Início, as vitrines de
Filmes/Séries ("Adicionados recentemente", "Bem avaliados", Top 10/Dica), a
busca e "Todos", continuam com o conteúdo antigo enquanto a pré-carga de
segundo plano não termina. Na TV, com a pessoa usando o controle, ela pode não
terminar na sessão. Esperado: ao abrir o app, todo o catálogo (canais, filmes e
séries) fica atualizado em pouco tempo, sem que a pessoa precise entrar em cada
categoria.

## Reproduction

Pelo código, mais a medição do tamanho real da lista:

1. Abrir a lista (> 10 min da última sincronização) → atualização de estrutura
   → toda categoria mantida recebe `renewRequestedAt` → `wakePrefetch()`.
2. O agendador (`prefetchScheduler.ts`) só começa uma rodada com o portão de
   atividade aberto (`waitUntilOpen`): **2 s sem nenhuma tecla**, sem player,
   app visível e online (FR-003/FR-004 da 038).
3. A carga por seção (`sectionLoader.ts`) consulta o mesmo portão antes de cada
   descarga de preparo (a cada 20 mil itens, e o fluxo de rede **para de ser
   lido** enquanto espera) e antes de gravar **cada** categoria.
   `sectionRunner.ts` repassa ao Worker pausa/retomada a cada 250 ms.
4. Quem está navegando no Início ou nas grades aperta tecla a cada segundo ou
   dois: o portão fica fechado quase o tempo todo, e a renovação avança aos
   pedaços ou nem começa. Com o player aberto, não anda.
5. A vitrine e o Início só mudam quando as categorias renovadas avisam
   (`onCategoryDone` → `catalog-search-index`), o que não acontece.

Medição contra o provedor real (Node no PC, 2026-10-09, sem registrar URL nem
credencial):

| Seção | Tamanho | Itens | Download no PC | Novos nas últimas 24 h |
| --- | --- | --- | --- | --- |
| `get_live_streams` | 0,8 MB | 2.360 | 1,0 s | 0 |
| `get_vod_streams` | 17,6 MB | 43.386 | 3,0 s | 71 |
| `get_series` | 9,8 MB | 9.733 | 1,8 s | 20 |

O catálogo inteiro cabe em ~28 MB e ~55 mil itens. A atualização completa
é viável em segundos de rede; o que a impede na TV é a espera pelo portão,
não o tamanho. Em 24 h entraram 71 filmes e 20 séries, então o problema é
diário e visível.

## Suspected Code Paths

- `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts:156-170`
  (`waitUntilOpen`): exige silêncio de teclas inclusive para renovar o que uma
  atualização pediu.
- `tv-web/src/lib/catalog/prefetch/index.ts` (`runSection` → `isBlocked`):
  mesma regra de tecla dentro da carga por seção.
- `tv-web/src/lib/catalog/sectionLoader.ts:160-186`: espera do portão nos
  descarregamentos e antes de cada categoria. Também chama `onCategory` para
  **toda** categoria gravada, mesmo quando `renewCategoryItems` não mudou nada
  (`written: false`). Cada aviso invalida as vitrines e o índice do tipo, o
  que relê o tipo inteiro na thread da interface (`loadShowcaseSelections`)
  sem necessidade.

## Root Cause Hypothesis

A pré-carga da 038 foi desenhada para a **primeira** carga de uma lista grande
(tudo frio, muita gravação), e por isso cede a vez a qualquer tecla. A
renovação depois de uma atualização reaproveitou o mesmo agendador com a
mesma regra. Só que ela é outra coisa: o catálogo já está no aparelho, e
quase toda categoria volta idêntica (`writeBlockWithin` só carimba o
instante). O custo real é o download (~28 MB) e o preparo no Worker. Ceder a
cada tecla adia indefinidamente justamente o trabalho que a pessoa considera
crítico. Confiança: **alta**. O mecanismo está no código, e o tamanho foi
medido.

## Proposed Remediation

**Preferida**: renovação **urgente** depois de uma atualização.

1. Agendador: quando alguma categoria tem renovação pendente pedida por uma
   atualização (`renewRequestedAt > itemsFetchedAt`), a rodada é urgente e o
   portão **ignora a tecla**. Player aberto, app oculto e sem rede continuam
   pausando (FR-004 intacto). Carga fria normal (lista nova, nada no aparelho)
   continua cedendo à tecla como hoje (FR-003 vale para ela).
2. Carga por seção: recebe `urgent` e, no `isBlocked`, também ignora a tecla.
   O download, o preparo no Worker e a gravação seguem sem esperar silêncio.
3. Avisar a tela só quando a categoria **mudou** (`renewCategoryItems` →
   `written: true`) ou era fria. Categoria idêntica não invalida nada. Assim,
   numa renovação típica (~poucas categorias com novidades), as vitrines e o
   índice são relidos poucas vezes, não 100+.
4. Emenda inline à FR-003 da 038 registrando a exceção (renovação pedida por
   atualização não espera silêncio de teclas), sem reescrever o texto.

Resultado esperado: ao abrir o app, em segundos a dezenas de segundos (rede da
TV), canais, filmes e séries estão atualizados em todas as categorias. O
Início, as vitrines e a busca se atualizam sozinhos quando cada seção termina.

**Alternativas**:
- Bloquear a abertura com "Atualizando lista…" até terminar: garante tudo
  atualizado antes de navegar, mas põe uma espera de rede em toda abertura e
  fere o cache-first (ADR-002). Rejeitada.
- Só baixar `IDLE_AFTER_KEY_MS`: continua dependendo de a pessoa parar de
  apertar teclas.
- Indicador "Atualizando lista" no topo com contagem real: complementar,
  possível ideia de backlog. Não é necessário para o fix.

**Files likely to change**:
- `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts`
- `tv-web/src/lib/catalog/prefetch/prefetchOrder.ts` (helper de "renovação pedida", se preciso)
- `tv-web/src/lib/catalog/prefetch/index.ts`
- `tv-web/src/lib/catalog/sectionLoader.ts` (aviso só quando mudou)
- testes: `prefetchScheduler.test.ts` (ou arquivo novo `prefetchScheduler.renovacao-urgente.test.ts`), teste do `sectionLoader`
- `sdd/specs/038-carga-listas-pre-carga/spec.md` (emenda inline à FR-003)

**Tests to add or update**:
- Agendador com renovação pendente e tecla recente: roda a categoria/seção
  sem esperar o silêncio. Com player aberto ou app oculto: espera.
- Agendador só com categorias frias e tecla recente: espera (comportamento da 038).
- `runSection` recebe `urgent: true` numa rodada de renovação.
- `sectionLoader`: categoria idêntica não chama `onCategory`; categoria com
  item novo chama.
- Regressão: contratos da 038 (`prefetchScheduler.*.contract.test.ts`,
  `prefetchOrder.*`), testes do `sectionLoader`, E2E `carga-listas`.

## Risks & Considerations

- **Fluidez na TV durante a renovação**: download e parse ficam no Worker. A
  thread da interface sente a disputa do IndexedDB (preparo de 20 mil itens por
  vez) e as releituras das vitrines quando algo muda. Precisa ser visto na TV.
  Se pesar, o ajuste é reduzir o preparo (`STAGE_FLUSH_ITEMS`) ou espaçar as
  gravações, não voltar a ceder à tecla.
- **Contratos da 038**: os testes de contrato travados (`check-contract-tests`)
  cobrem FR-003 para a carga normal. A exceção não pode quebrá-los. Se algum
  exigir silêncio também na renovação, registrar o desvio em vez de editar o
  contrato.
- **Player**: abrir um canal logo ao entrar pausa a renovação até fechar
  (FR-004). Isso é intencional (AVPlay e rede disputam), e o restante
  atualiza ao sair do player.
- **Limite do painel** (`rate_limited`): três pedidos de seção por abertura,
  como já era uma vez por dia. O intervalo mínimo de 10 min entre atualizações
  continua valendo.
- **Constituição**: nada nasce do foco. A renovação nasce da abertura da lista.

## Open Questions

- Nenhuma bloqueante.
