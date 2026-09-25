# Implementation Plan: Fonte M3U Estrutura-Primeiro (Detecção de Painel Xtream ou Arquivo Guardado)

**Slug**: `014-m3u-sob-demanda` | **Date**: 2026-09-24 | **Spec**: `sdd/specs/014-m3u-sob-demanda/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Uma fonte por URL M3U hoje classifica e grava cada item em `channels`
durante a importação (`importPipeline.ts`, `consumeM3u`, categorias
`fetchMode: 'eager'`). Esta feature troca isso por dois caminhos, escolhidos
a cada importação:

1. **Painel Xtream reconhecido na URL** (US1): se a URL tem a forma
   `…/get.php?username=…&password=…`, o app extrai endereço, usuário e senha
   e consulta o painel (`resolveAccountStatus`). Confirmado, a importação
   segue o caminho de provedor da feature 010 inteiro (só categorias,
   `on_demand`), e `readCredential` passa a derivar a credencial da URL
   guardada — `categoryLoader`, `seriesLoader` e `playbackUrl` funcionam sem
   mudança. Acesso recusado ou assinatura vencida fazem a importação falhar
   com esse motivo.
2. **Conteúdo guardado** (US3): quando não há painel reconhecido, ou ele não
   confirma o protocolo (e sempre no Modo limitado de fonte de provedor), a
   importação percorre o arquivo uma vez — classificando e agrupando séries
   como hoje —, grava as categorias com `fetchMode: 'stored'` e a contagem
   real, e guarda as entradas **já separadas por categoria** numa tabela
   nova (`storedEntries`), em blocos. Nenhum registro vai para `channels`.
   Entrar numa categoria lê os blocos dela, grava os itens (e os episódios
   das séries) em `channels` numa transação e apaga os blocos lidos.

A US2 dá ao Modo limitado um motivo registrado (`limitedReason`) e uma
explicação no hub da lista (`ListHomeScreen`).

A ADR-010 (2026-09-24) é o que permite guardar o conteúdo do arquivo, com
URLs e credenciais, no aparelho.

## Technical Context

**Language/Version**: TypeScript ~6.0 (`tv-web/`), React 19, alvo de build
`chrome108` (Tizen 8.0).

**Primary Dependencies**: Dexie 4 (IndexedDB), `@tanstack/react-query` 5,
`@tanstack/react-virtual` 3. Nenhuma dependência nova.

**Storage**: IndexedDB via Dexie, banco `ccplaytv`. Hoje na v9
(`tv-web/src/lib/catalog/db.ts`). Esta feature cria a **v10**: tabela nova
`storedEntries`, valor novo `'stored'` em `CatalogFetchMode`, campo novo
`limitedReason` em `SourceRecord`. Ver `data-model.md`.

**Testing**: Vitest 5 + jsdom + `fake-indexeddb` (`npm run test`);
Playwright via scripts Node (`npm run test:e2e`: `e2e.mjs`,
`e2e/favoritos.mjs`, e o novo `e2e/m3u-sob-demanda.mjs`). Lint com
`oxlint`, tipos com `tsc -b` (`npm run build`).

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 8.0 / Chromium 108).
Desenvolvimento e medição no navegador (`npm run dev`). TV física
recomendada, não obrigatória (spec, Assumptions).

**Performance Goals**: SC-001 — import de URL M3U de painel ≤ 15 s com a
lista de referência. SC-002 — import pelo conteúdo guardado menor que o
integral atual, medido antes/depois com a mesma lista. SC-003 — entrar numa
categoria nunca aberta ≤ 3 s, sem rede. Medições no ambiente disponível,
declarado junto de cada número.

**Constraints**:
- Import roda no Web Worker (`importWorker.ts`/`importRunner.ts`); leitura
  de categoria roda na thread de interface (`categoryLoader.ts`), como na
  010.
- ADR-008 (b): não materializar o catálogo inteiro na memória — a
  varredura grava blocos com teto de entradas em buffer.
- URL, credencial e conteúdo do arquivo nunca em log, tela, erro ou
  exportação (constitution 1.5.0, ADR-010).
- Toda escrita de uma importação vai para uma geração nova, publicada no
  fim (D-004 da 005); `storedEntries` segue a mesma regra.

**Scale/Scope**: lista de referência de ~311 mil entradas (010, SC-001);
algumas centenas de categorias.

## Decisões Invariantes

- **D-001 — Detecção só pela forma `get.php`.** Uma URL é "de painel"
  quando o caminho termina em `/get.php` e a query tem `username` e
  `password` não vazios. Outras formas (`/playlist/<u>/<p>`, links
  encurtados) contam como lista avulsa. A base do painel é
  `normalizeServerAddress` sobre o que vem antes de `/get.php`.
- **D-002 — Resultado da confirmação decide o caminho** (FR-002):
  - `authorized && !expired` → caminho Xtream (`on_demand`), modo
    `xtream_api`, sem motivo de limitação;
  - `authorized === false` ou `ProviderError('invalid_credentials')` →
    importação falha com `invalid_credentials`;
  - `expired` → falha com `subscription_expired`;
  - `ProviderIncompatibleError` ou `ProviderError('direct_connection_refused')`
    → conteúdo guardado, modo `legacy_m3u`, motivo `protocol_unavailable`;
  - `ProviderError('network_failure')` → conteúdo guardado, modo
    `legacy_m3u`, motivo `panel_unreachable`;
  - `ProviderIncompatibleError` ao ler as categorias depois de autorizado →
    conteúdo guardado, `legacy_m3u`, `protocol_unavailable` (mesma regra que
    a fonte de provedor já segue hoje).
- **D-003 — Credencial derivada, nunca copiada.** Para `type: 'm3u_url'`,
  `readCredential` extrai `dns`/`username`/`password` da `m3uUrl` guardada
  (D-001). Nada é copiado para `providerUsername`/`providerPassword`: editar
  a URL muda a credencial sem risco de ficarem duas.
- **D-004 — O "arquivo guardado" é o conteúdo já interpretado e separado
  por categoria**, não o texto bruto. A ADR-010 permite as duas formas.
  Motivos: (a) a importação já precisa classificar cada entrada para saber
  em que seção fica cada categoria e para contar os itens (FR-008); (b)
  reparsear o texto inteiro a cada categoria custaria a varredura de
  ~311 mil linhas por entrada, contra a meta de 3 s (SC-003); (c) o
  agrupamento de séries (012) precisa ver todos os episódios de um grupo, e
  isso é feito uma vez na varredura. Comportamento visível igual ao que a
  spec descreve: nenhum download novo, leitura só da categoria pedida.
- **D-005 — Blocos com teto global.** A varredura acumula registros por
  categoria e, quando o total em buffer chega a `STORED_FLUSH_THRESHOLD`
  (5.000), grava cada buffer não vazio como um bloco (`storedEntries`) numa
  transação e zera os buffers. No fim, grava o que sobrou. Memória limitada
  independente do número de categorias.
- **D-006 — Episódios moram no bloco da categoria da série.** O
  `createSeriesGrouper` roda na varredura como hoje; o registro `series` e
  os `episode` de uma série vão para os blocos da categoria da série. Na
  leitura, séries entram por `storeCategoryItems`-equivalente e episódios
  entram com `categoryId` indefinido e `seriesId` preenchido — exatamente
  como o caminho integral grava hoje.
- **D-007 — Ler uma categoria consome os blocos dela.** Uma transação:
  apaga itens antigos da categoria, grava itens e episódios, carimba
  `itemsFetchedAt`/`itemsCount`, apaga os blocos da categoria. Depois disso
  a categoria nunca mais é lida do conteúdo guardado na mesma geração
  (FR-011) — `ensureCategory` devolve `fresh` para `stored` com
  `itemsFetchedAt` definido.
- **D-008 — Conteúdo ausente vira resultado próprio.** Categoria `stored`
  sem `itemsFetchedAt` e sem nenhum bloco → `ensureCategory` devolve
  `'source_missing'`. As três telas de categoria mostram estado de erro com
  "Ressincronizar lista" (FR-014), que dispara a mesma ressincronização da
  Home.
- **D-009 — Sem espaço ao guardar = falha, nunca publicação parcial**
  (FR-015). No caminho do conteúdo guardado, `StorageFullError` descarta a
  geração em escrita e encerra com `errorKind: 'storage_full'` (valor novo).
  A regra antiga de publicar o que coube continua valendo só para as fontes
  que ainda gravam integral (nenhuma depois da US3; fica para categoria
  `eager` antiga até ressincronizar).
- **D-010 — Modo limitado é `providerImportMode === 'legacy_m3u'` em
  qualquer tipo de fonte**, com `limitedReason` ao lado. Fonte M3U avulsa
  grava `providerImportMode` e `limitedReason` como ausentes, e
  `markSynced` passa a limpar os dois quando a importação não os informa
  (FR-023).
- **D-011 — Contagem de categoria `stored`** = `declaredCount` calculado na
  varredura (séries contam séries, não episódios). O hub soma
  `declaredCount` enquanto a categoria não foi lida e `count` depois.
- **D-012 — O caminho integral (`fetchMode: 'eager'`) deixa de ser
  escrito** quando a US3 entra, mas continua sendo **lido**: fontes
  importadas antes desta feature seguem funcionando até ressincronizar.
  Sem migração de dados.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

Constitution v1.5.0 (emendada nesta sessão pela ADR-010).

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Nada muda no acesso; fonte segue opcional. |
| Segredos Fora dos Clientes e dos Logs | OK (com ADR-010) | OK | Conteúdo do arquivo e URL no IndexedDB: permitido pela exceção estendida. Credencial derivada só pela porta `readCredential` (D-003). `limitedReason` é categoria fixa; nenhum texto de erro cru chega à tela (FR-020/FR-022). Testes de não-vazamento na US1 e US2 (SC-007). |
| Categorias da Fonte São Preservadas | OK | OK | Nomes e ordem de aparição vêm do arquivo ou do painel, como hoje. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Mesmo classificador e mesmo agrupamento exato de séries; teste de paridade (SC-005). Contagem é a real (D-011). |
| Comandos Locais Independem de Rede | OK | OK | Leitura de categoria `stored` não usa rede. |
| Trailers e Metadados Não Alteram Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | "Ressincronizar lista" no estado de conteúdo ausente é botão focável; explicação do hub é texto, as três tiles continuam focáveis. |
| Lista de Catálogo ≠ Manifesto de Streaming | OK | OK | A varredura reusa `parseM3uLines`, que já recusa manifesto HLS. |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Estado `source_missing` tem "Ressincronizar lista" e "Voltar", ambos ativáveis por SELECT (FR-017). |
| Voltar Restaura Foco e Posição | OK | OK | Nenhuma navegação nova; volta da ressincronização cai na Home como hoje. |
| Identidade de Reprodução Não Depende da URL | OK | OK | Itens lidos do conteúdo guardado recebem os mesmos campos do caminho integral; caminho Xtream usa `providerStreamId`. Favorito/retomada de M3U avulsa continuam por `originalName`, como hoje. |
| Progresso e Capacidades São Reais | OK | OK | Tela de progresso sem percentual; categoria `stored` ainda não lida é cobertura parcial declarada, como a `on_demand` da 010. |
| Documentação É Canônica | OK | OK | Tarefas de Polish atualizam CLAUDE.md ("Known deviation"), notas `Atualização (014)` na FR-011/FR-012 da 010 e o backlog. |

Nenhuma violação.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/014-m3u-sob-demanda/
├── spec.md
├── plan.md                         # este arquivo
├── data-model.md                   # v10: storedEntries, fetchMode 'stored', limitedReason
├── logic/
│   └── importacao-m3u.md           # roteamento, varredura em blocos, leitura de categoria
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e.mjs
├── e2e/
│   ├── favoritos.mjs
│   ├── m3u-sob-demanda.mjs         # novo
│   └── fixtures/
│       └── m3u-sob-demanda/        # novo: lista avulsa + respostas de painel fictícias
├── package.json                    # test:e2e ganha o script novo
└── src/
    ├── App.tsx                     # ListHomeScreen recebe a fonte; telas de categoria recebem onResync
    ├── features/
    │   ├── catalog/catalogApi.ts   # sectionCount para 'stored'; outcome 'source_missing'
    │   ├── import/importApi.ts     # SourceOut.limited_reason; mensagem de 'storage_full'
    │   ├── import/ImportProgressScreen.tsx
    │   ├── list-home/ListHomeScreen.tsx      # explicação do Modo limitado
    │   ├── list-home/LimitedModeNotice.tsx   # novo
    │   ├── live/LiveScreen.tsx     # estado 'source_missing'
    │   ├── movies/MoviesScreen.tsx # idem
    │   ├── series/SeriesScreen.tsx # idem
    │   └── screens.css
    └── lib/catalog/
        ├── db.ts                   # v10
        ├── importPipeline.ts       # roteamento M3U + varredura para conteúdo guardado
        ├── m3uPanelUrl.ts          # novo: reconhecer URL de painel
        ├── storedEntries.ts        # novo: gravar/ler/apagar blocos
        ├── categoryLoader.ts       # leitura 'stored'
        ├── seriesLoader.ts         # 'stored' não toca rede
        ├── catalogRepository.ts    # descarte de blocos; gravação de categoria lida
        └── sourceRepository.ts     # readCredential derivada; limitedReason; markSynced limpa modo
```

**Structure Decision**: frontend único em `tv-web/`, lógica de catálogo em
`tv-web/src/lib/catalog/` (sem acesso direto a Dexie pelas telas, D-001 da
005) e telas em `tv-web/src/features/`. O backend `api/` está congelado
(ADR-008) e não é tocado.

## Complexity Tracking

Sem violações a justificar.

## Estratégia de Testes

Prioridade: unitário → integração (pipeline + Dexie com `fake-indexeddb`)
→ E2E (Playwright contra `npm run dev`) → manual (TV física, recomendado).

- **Unitário**: `m3uPanelUrl` (formas aceitas/recusadas, sem vazar
  credencial em erro), `readCredential` derivada, `sectionCount` com
  `stored`, `LimitedModeNotice` (motivos, sem URL/usuário/senha no DOM).
- **Integração**: `importPipeline.test.ts` com `fetch` simulado para cada
  ramo da D-002 e para a lista avulsa; varredura grava zero linhas em
  `channels` e blocos com contagem certa; `categoryLoader.test.ts` para
  leitura `stored`, deduplicação de leitura simultânea, `source_missing`;
  **paridade (SC-005)**: um teste-referência escrito **antes** de mudar a
  varredura captura categorias e itens do caminho integral para uma fixture
  com canais, filmes, séries `SxxEyy`, `/series/` na URL e entradas não
  classificáveis; depois da US3, ler todas as categorias `stored` da mesma
  fixture tem de produzir o mesmo conjunto.
- **E2E** (`e2e/m3u-sob-demanda.mjs`, servidor HTTP local com dados
  fictícios): lista avulsa (sem requisição ao servidor ao entrar numa
  categoria), painel fictício que responde ao protocolo (nenhum `get.php`
  pedido, sem selo), painel fictício sem protocolo (selo + explicação com
  motivo no hub).
- **Manual**: medição de tempo antes/depois (SC-001/SC-002/SC-003) com a
  lista real do usuário no navegador; TV física recomendada.

Comandos-base (em `tv-web/`):

```powershell
npm run test -- src/lib/catalog/importPipeline.test.ts
npm run test
npm run lint
npm run build
npm run dev            # outro terminal, antes do E2E
npm run test:e2e
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluída. Linha de base (T001) e teste-referência de paridade (T002) prontos. |
| Foundational (Fase 2) | Concluída. Schema v10 (`storedEntries`, `fetchMode: 'stored'`, `limitedReason`, `storage_full`); `markSynced` grava/limpa modo e motivo sempre; `mode`/`limitedReason` acessíveis também no caminho de falha do pipeline. |
| US1 — painel Xtream por URL | Código concluído. `parsePanelUrl`, `readCredential` derivada, `confirmPanel`+roteamento em `importPipeline.ts`, E2E cenário A verde. Falta só T051 (medição SC-001 com lista real, bloqueada em você). |
| US2 — explicação do Modo limitado | Concluída. `LimitedModeNotice` no hub da lista para os dois caminhos (provedor e `m3u_url`); E2E cenário B verde. |
| US3 — arquivo guardado | Código concluído. `storedEntries.ts`, `storeStoredCategory`, `scanToStored` (substitui `consumeM3u`, removido), ramo `stored` em `categoryLoader`/`seriesLoader`/`catalogApi`, estado `source_missing` nas três telas, E2E cenário C verde. Falta só T041 (medição SC-002/SC-003, bloqueada em você). |
| Polish | Código, documentação e verificação manual concluídos (T042–T048). Gates (T047): `test`/`lint`/`build` limpos (as 4 falhas de `npm run test` completo são o padrão flaky pré-existente, confirmadas passando isoladas); `test:e2e` combinado trava em `e2e.mjs`, bug pré-existente fora do escopo (logado no backlog, R-009); `e2e/favoritos.mjs` falha por ambiente (caminho fixo do Chromium, já documentado); `e2e/m3u-sob-demanda.mjs` isolado, 24/24, cenários A/B/C verdes. `quickstart.md` (T048): os 6 cenários e os itens da constitution verificados — a maioria por testes automatizados já existentes, o cenário 6 (ressincronizar limpa Modo limitado) com um script ad-hoc removido depois de rodar. Só falta T049 (opcional, TV física) e as medições T041/T051 (bloqueadas no usuário). |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A varredura ainda classifica e agrupa todas as entradas; se o tempo da importação atual estiver no download ou na classificação, e não na gravação, o ganho do caminho guardado (SC-002) pode ser pequeno. A divisão nunca foi medida. | SC-002 fraco | Linha de base: 60 s, informada pelo usuário (T001); T041 (US3) mede depois, com a mesma lista. Resultado registrado como achado, não escondido. O caminho Xtream (US1) não depende disso. |
| R-002 | Ler uma categoria grande (dezenas de milhares de itens) grava tudo numa transação na thread de interface — mesmo padrão da 010, que passou na TV, mas nunca com a categoria inteira de um arquivo grande. | SC-003 (3 s) pode falhar | Medir com a maior categoria da lista real; se passar de 3 s, registrar e avaliar gravação em lotes numa fase própria. |
| R-003 | Painel reconhecido pela URL entrega pelo protocolo um catálogo diferente da lista M3U (ex.: URL de lista filtrada). | Pessoa vê itens diferentes do que esperava | Assumido na spec (Assumptions). Registrar se aparecer em lista real. |
| R-004 | "Conteúdo ausente" (FR-014) quase não acontece na prática: o navegador apaga o banco inteiro, não uma tabela. O estado existe como defesa e é testado apagando os blocos. | Baixo | Resolvido: confirmado pela auditoria do `sdd-converge` (2026-09-24) — `categoryLoader.ts` devolve `'source_missing'` exatamente como D-008 descreve, e `categoryLoader.test.ts` (T028) apaga os blocos de propósito e cobre o caminho. |
| R-005 | Favorito de um item de categoria `stored` ainda não lida, depois de uma ressincronização, fica "não resolvido" até a categoria ser aberta — igual ao que já acontece com `on_demand` na 010/013. | Estado conhecido, não regressão | Resolvido: decisão aceita, sem ação pendente; confirmado pela auditoria do `sdd-converge` que nenhum código contradiz essa expectativa. |
| R-006 | Fontes M3U importadas antes desta feature continuam `eager` até ressincronizar (D-012). Dois formatos convivem por um tempo. | Baixo | Resolvido: confirmado pela auditoria do `sdd-converge` — `categoryLoader.ts`, `seriesLoader.ts` e `sectionCount` (`catalogApi.ts`) têm ramo próprio para `eager`, `on_demand` e `stored`, os três lidos corretamente lado a lado. |
| R-007 | Achado fora do escopo (US3): "Tentar de novo" nas três telas de categoria (Live/Filmes/Séries) tinha `tv-focus` visual mas SELECT do controle não o ativava — beco sem saída real, existente desde a feature 010. | Constitution ("Foco Visível e Sem Becos Sem Saída") violada em produção | Resolvido: corrigido no mesmo `onSelect` que ganhou o caso `source_missing` desta feature, com aprovação explícita do usuário antes de mexer fora do escopo original. |
| R-008 | E2E cenário C: navegar de volta a uma categoria já lida via índice relativo da trilha (`ArrowUp`/`ArrowDown`) causou um timeout intermitente — a causa exata não foi isolada. | Baixo (só afeta o script de teste) | Resolvido: o passo trocou para sair até a Home e reentrar na tela (mesmo padrão já usado por `e2e/favoritos.mjs`), estável em 3 rodadas seguidas. Se um timeout parecido aparecer de novo num E2E futuro que navegue a trilha por índice relativo, vale investigar a fundo em vez de só contornar de novo. |
| R-009 | Achado fora do escopo (Polish/T047): `e2e.mjs` (script mais antigo do repositório, intocado desde o commit inicial) espera um diálogo de confirmação de saída em `AddSourceScreen` ao apertar Escape, mas essa tela não tem mais nenhum tratamento de Escape hoje — drift entre o script e o app atual, não uma regressão desta feature (que não toca `AddSourceScreen`/`App.tsx` nesse ponto). `npm run test:e2e` combinado trava nesse `page.click('button:has-text("Sair")')` antes de chegar aos outros dois scripts. | `npm run test:e2e` (cadeia completa) não fecha verde nesta máquina | Resolvido (para esta feature): decisão do usuário (AskUserQuestion, 2026-09-24) — logar no backlog e seguir, em vez de corrigir agora. Entrada `[Bug]` registrada em `.planning/backlog.md` → Ideias Futuras (achado a resolver por um `sdd-bugfix` futuro, fora desta feature). `e2e/m3u-sob-demanda.mjs`, que é o relevante para esta feature, roda e passa isolado (`node e2e/m3u-sob-demanda.mjs`, 24/24). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-24 | Setup (T001) | Linha de base da importação atual por URL M3U: **60 s**, informada pelo usuário (teste dele no navegador, `npm run dev`, lista real; tamanho da lista não informado). Não medida nesta sessão. É a referência de "antes" para SC-002 e para comparar SC-001. | T002 (teste-referência de paridade) |
| 2026-09-24 | Setup (T002) | `m3uParity.fixtures.ts` + `m3uParity.test.ts` gravam a expectativa do caminho integral atual (M3U avulsa e Modo limitado) — categorias, itens normalizados e tallies. Derivação manual bateu com o código real de primeira (2/2 verde). `npm run test` completo: 563/567, as 4 falhas são testes de gesto (`holdEnter`, timers reais) que ficam flaky sob carga da suíte inteira e passam isolados; nenhum arquivo de produção tocado nesta fase. Lint e build limpos. | Fase 2 (Foundational): schema v10 |
| 2026-09-24 | Foundational (T003–T008) | Schema v10 (`storedEntries`, `fetchMode:'stored'`, `limitedReason`, `storage_full`); descarte/publicação de geração agora cobrem `storedEntries`; `markSynced` passa a gravar `providerImportMode`/`limitedReason` sempre, inclusive ausentes (D-010/FR-023), com `providerMigratedAt` só avançando quando `mode` vem definido; achado durante a implementação: `mode`/`allowedFormats` eram locais de `execute()` em `importPipeline.ts`, invisíveis para `fail()` — subiram para o escopo de `startImport` junto com `limitedReason` novo, e as duas chamadas de `markSynced` (sucesso e publicação parcial por espaço) agora passam os três explicitamente, para a publicação parcial não apagar o modo de uma fonte de provedor. `importApi.ts`/`ImportProgressScreen.tsx` ganharam `limited_reason` e a mensagem de `storage_full`. | Fase 3 (US1): detecção de painel Xtream na URL |
| 2026-09-24 | Foundational — testes | `npm run test` dos 6 arquivos tocados: 102/102. `npm run test` completo: 573/575 (2 falhas em `LiveScreen.test.tsx`, mesmo padrão de timer real sob carga já visto na Fase 1 — passa isolado, 22/22, nenhum arquivo desta fase envolvido). Lint só com warnings pré-existentes + 1 esperado (`limitedReason` "never assigned", resolve na T025/US2). Build limpo. | — |

| 2026-09-24 | US1 (T009–T018) | `m3uPanelUrl.ts` (`parsePanelUrl`), `readCredential` derivada para `m3u_url` (D-003), `confirmPanel`+roteamento novo em `importPipeline.ts` (D-002), `ingestProviderStructure` extraído e reusado pelos dois tipos de fonte (T016). E2E cenário A (`m3u-sob-demanda.mjs`) verde contra `npm run dev`. Achados: `run.unit` precisou de atribuição explícita no ramo "limitado direto" (nunca passa por `ingestProviderStructure`); o launch do Playwright do projeto usa um binário fixo de sandbox Linux que não existe nesta máquina Windows — `launchBrowser()` no script novo cai para a resolução padrão quando esse caminho não existe (não mexi em `favoritos.mjs`, que segue com o caminho fixo). | T051 (medição SC-001, precisa da lista real do usuário) |
| 2026-09-24 | US1 — testes | 73/73 nos arquivos tocados; E2E cenário A 6/6; `npm run test` completo 600/602 (2 falhas em `LiveScreen.test.tsx`, mesmo padrão de timer real sob carga, arquivo não tocado); lint só com warnings pré-existentes; build limpo (corrigido um erro de tipo em `Array.prototype.some` num teste novo). | — |

| 2026-09-24 | US2 (T019–T026) | `LimitedModeNotice.tsx` + `.limited-mode-notice*` (screens.css, só tokens): motivo, "itens disponíveis", o que se perde, descartadas (condicional), o que fazer. `ListHomeScreen` passa a receber `source: SourceOut` inteira (não mais `sourceId`/`sourceName` soltos) e renderiza a explicação quando `provider_import_mode === 'legacy_m3u'`. `importPipeline.ts`: o catch do ramo de provedor (pré-existente) ganhou `limitedReason = 'protocol_unavailable'`. E2E cenário B no mesmo `m3u-sob-demanda.mjs` (segundo servidor fictício, segunda fonte na mesma sessão). Achado: nome de fonte de teste continha a própria frase buscada pelos asserts (`text=`/`hasText` casam substring) — corrigido trocando o nome e usando seletores de classe específicos. | Nenhuma nesta fase; T051 (US1) segue pendente do usuário |
| 2026-09-24 | US2 — testes | `LimitedModeNotice` 10/10; `list-home/` completo 16/16; `importPipeline.test.ts` 38/38; E2E cenários A+B, 17/17, rodado 2x seguidas (estável); lint sem o warning de `limitedReason` da Fase 2 (resolvido, como previsto) e sem novidade; build limpo; `npm run test` completo 613/617 (mesmo padrão de timer real sob carga; `MoviesScreen.favorites.test.tsx`/`SeriesScreen.favorites.test.tsx` confirmados 7/7 isolados agora). | — |

| 2026-09-24 | US3 (T033–T040) | `storedEntries.ts` (armazenamento em blocos), `storeStoredCategory`/`setDeclaredCount` (`catalogRepository.ts`), `scanToStored` no lugar de `consumeM3u` em `importPipeline.ts` (código morto removido: `pendingBatch`/`flush`/`accept`/`enqueue`/`toRecord`/`storeBatch`/`markCategoryFetched` como usados aqui); `DEFAULT_BATCH_SIZE` 2500→5000 (D-005). `fail()` simplificado: `StorageFullError` sempre descarta tudo com `errorKind: 'storage_full'` — a publicação parcial antiga não fazia mais sentido sem o caminho integral. `categoryLoader.ts` ganhou `stored`/`source_missing` e um `dedup()` compartilhado. `seriesLoader.ts`/`catalogApi.ts` ajustados. Três telas: `contentMissing`, prop `onResync`, `App.tsx` liga a `useResyncSource`. **Achado fora do escopo, aprovado pelo usuário antes de corrigir**: "Tentar de novo" nas três telas (desde a feature 010) tinha `tv-focus` mas SELECT não o ativava (só `onClick`) — beco sem saída real no controle físico. Corrigido no mesmo `onSelect` que ganhou `source_missing`. E2E cenário C com fixture nova (`avulsa.m3u`); um timeout de navegação (voltar a uma categoria via índice relativo da trilha) foi trocado por sair-e-reentrar, mais robusto — 3 rodadas seguidas estáveis depois disso. | T041 (medição SC-002/SC-003, precisa da lista real do usuário) |
| 2026-09-24 | US3 — testes | Cada arquivo tocado rodado isoladamente durante a fase; `node e2e/m3u-sob-demanda.mjs` (3 cenários) rodado 3x seguidas, 22/22 nas três; `npm run lint`/`build` limpos; `npm run test` completo 634/637 (mesmo padrão de timer real sob carga, 3 arquivos de favoritos, 19/19 confirmados isolados). | — |

| 2026-09-24 | Polish (T042–T047) | Documentação canônica: `CLAUDE.md` (status da 014 + "Known deviation, mostly closed"), spec 010 (notas `Atualização (ADR-010 / feature 014)` na FR-011/FR-012/Fora de Escopo), `.planning/backlog.md` (prosa corrigida + bullet da 014). T046 (revisão de segredos): `git diff` de produção só mostra nomes de campo (`credential.username`, `panel.password`), nunca valor; varredura ampla por padrão de domínio/credencial nos 35 arquivos tocados confirmou só a palavra "xtream" como nome de módulo/protocolo e os domínios fictícios já usados nas fixtures (`exemplo.test`, `avulsa-fictício.test`, `painel-fictício.test`) — nada de `docs/m3u/dados.md`. | T048 (quickstart manual) |
| 2026-09-24 | Polish (T047 — gates) | `npm run test`: 634/637, as 4 falhas confirmadas isoladas (padrão flaky pré-existente, R-008 da feature 013/009, não desta). `npm run lint`: limpo. `npm run build`: limpo. `npm run test:e2e` combinado travou em `e2e.mjs` — achado fora do escopo (R-009): script desatualizado, diálogo de saída que `AddSourceScreen` não tem mais; usuário decidiu logar no backlog (`[Bug]`) e seguir, sem corrigir agora. Rodados isolados: `e2e/favoritos.mjs` falhou por ambiente (caminho fixo do Chromium, já documentado nesta feature); `e2e/m3u-sob-demanda.mjs` passou 100%, 24/24 verificações, cenários A/B/C. | T048 (quickstart manual), T049 (opcional) |

| 2026-09-24 | Polish (T048 — quickstart) | Os 6 cenários e os 4 itens da constitution do `quickstart.md` verificados: 1/3/4 pelo `e2e/m3u-sob-demanda.mjs` (já verde); 2 (painel recusa) pelos testes de `importPipeline.test.ts` (mesmo caminho de código de T011/T012, com checagem de não-vazamento); 5 (conteúdo ausente) por `categoryLoader.test.ts` (T028) + testes de tela (T032); 6 (ressincronizar limpa Modo limitado) com um script Playwright ad-hoc contra `npm run dev` — servidor fictício cujo protocolo liga/desliga, 3/3 verificações (selo aparece, some após ressincronizar com o protocolo ligado, explicação some do hub) — script removido depois de rodar, não faz parte do repositório. Itens da constitution conferidos por código: foco+SELECT nos estados novos, nenhuma URL/credencial em tela, progresso sem percentual; `.limited-mode-notice*` usa tokens de cor/fonte — radius/tamanhos em px seguem a convenção já estabelecida no projeto (`index.css` não define token de radius; o resto de `screens.css` faz o mesmo). | T049 (opcional), T041/T051 (bloqueadas no usuário) |

**PRÓXIMO**: T049 (opcional, TV física) e/ou T051/T041 quando o usuário testar com a lista real — Polish está essencialmente fechada; falta decidir com o usuário se converge a feature agora (deixando essas três pendências documentadas como fora do gate) ou espera os números reais primeiro

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `CLAUDE.md` — status da 014 no "Project status"; "Known deviation, mostly closed" reescrito.
- `sdd/specs/010-catalogo-sob-demanda/spec.md` — notas `Atualização (ADR-010 / feature 014)` na FR-011/FR-012/Fora de Escopo.
- `.planning/backlog.md` — prosa corrigida da 014; entrada `[Bug]` nova (R-009, `e2e.mjs` desatualizado).
- `sdd/specs/014-m3u-sob-demanda/tasks.md` — Fase 6 marcada (T042–T047), Registro da Fase e Checklist de Release atualizados.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `e2e/favoritos.mjs` lança o Chromium com `executablePath: '/opt/pw-browsers/chromium'` fixo — não existe nesta máquina Windows, só numa sandbox Linux. `e2e/m3u-sob-demanda.mjs` contorna isso com `launchBrowser()` (cai para a resolução padrão do Playwright quando o caminho fixo não existe). Se `npm run test:e2e` rodar `favoritos.mjs` nesta máquina, ele vai falhar por esse motivo, não por regressão — não é desta feature, mas vai aparecer no gate do T047.
- T051 e T041 (medições de tempo com a lista real) exigem a pessoa rodar a importação pelo app — o agente nunca digita a URL real em lugar nenhum (constitution, segredos fora de log/commit).
- `npm run test` completo, sozinho, sempre mostra de 2 a 4 falhas nos testes de gesto "segurar OK" (`*.favorites.test.tsx`, `LiveScreen.test.tsx` T010) — timer real (`holdEnter`/`waitForTimeout`) sensível à carga de rodar a suíte inteira em paralelo nesta máquina. Confirmado repetidamente ao longo de toda esta feature: os mesmos arquivos passam 100% isolados. Não é regressão desta feature — pré-existente da 013/009. Se aparecer nesta mesma lista de arquivos no gate do T047, rodar isolado antes de investigar.
- `renderLive()`/`renderMovies()`/`renderSeries()` (nos `*.test.tsx` das três telas) agora aceitam um `onResync` opcional (default `vi.fn()`) — passe um spy pra testar o caso `source_missing`, sem precisar tocar nos outros testes que já chamam a função sem argumento.
- `npm run test:e2e` combinado **não fecha verde** nesta máquina, por dois motivos alheios a esta feature (R-009 e a entrada já conhecida sobre `favoritos.mjs`, ambos acima) — nunca use o exit code desse script sozinho como sinal; rode `node e2e/m3u-sob-demanda.mjs` isolado para validar esta feature especificamente.

## Resultado Final

<!-- Anexado pelo sdd-converge em 2026-09-24. Convergência limpa — zero achados. -->

Auditoria do `sdd-converge` (2026-09-24): mapeei cada FR/SC/Decisão Invariante
contra o código real — `m3uPanelUrl.ts` (D-001), `db.ts` v10 e
`data-model.md` (schema), `storedEntries.ts` (D-004/D-005/D-009),
`importPipeline.ts` (`confirmPanel`/roteamento/D-002, `scanToStored`/D-004–
D-006, `fail()`/D-009), `catalogRepository.ts` (`storeStoredCategory`/D-007,
`storedEntries` em `publishGeneration`/`discardGeneration`/
`deleteAllForSource`), `categoryLoader.ts` (ramo `stored`, `source_missing`/
D-008), `sourceRepository.ts` (`readCredential`/D-003, `markSynced`/D-010),
`LimitedModeNotice.tsx` (FR-020–FR-022), `LiveScreen.tsx` (estado
`source_missing` + a correção do achado R-007), a spec 010 emendada
(FR-011/FR-012/Fora de Escopo) e o backlog. **Zero achados** — nenhuma
lacuna `missing`, `partial`, `contradicts` ou `unrequested`. O código
entregue é fiel ao que `spec.md`, `plan.md` e `logic/importacao-m3u.md`
descrevem.

**O que foi de fato construído**: as três user stories (detecção de painel
Xtream por URL, explicação do Modo limitado, conteúdo guardado por
categoria) estão código-completas, com a suíte automatizada (unitário +
integração + os três cenários E2E de `e2e/m3u-sob-demanda.mjs`) verde, e a
documentação canônica (`CLAUDE.md`, spec 010, backlog) sincronizada com o
estado real.

**Desvios acumulados nas Execution Notes, confirmados nesta auditoria**:
- R-007: bug pré-existente (desde a feature 010) corrigido dentro do escopo
  desta feature, com aprovação explícita do usuário — "Tentar de novo" nas
  três telas de categoria agora responde a SELECT, não só a clique de
  mouse. Confirmado no código (`LiveScreen.tsx`, `onSelect`).
- R-009: bug pré-existente e fora do escopo em `e2e.mjs` (diálogo de saída
  que `AddSourceScreen` não tem mais) — não corrigido por decisão do
  usuário, logado em `.planning/backlog.md` para um `sdd-bugfix` futuro.
  Não afeta a validação desta feature, que usa `e2e/m3u-sob-demanda.mjs`
  isolado.
- `DEFAULT_BATCH_SIZE` subiu de 2500 para 5000 (D-005) ao remover o último
  outro consumidor do valor antigo — mudança pontual, não uma decisão nova.

**Decisões técnicas que ficaram diferentes do plano original**: nenhuma. A
implementação seguiu as Decisões Invariantes (D-001 a D-012) e o
pseudocódigo de `logic/importacao-m3u.md` sem desvio de forma — as únicas
mudanças de rota foram os dois achados acima (R-007, R-009), ambos já
geridos pelo protocolo de bug do `sdd-execute`.

**Pendências que seguem em aberto, fora do gate de convergência** (não são
lacunas de código — são bloqueadas em ação do usuário ou explicitamente
opcionais, e continuam documentadas assim):
- T041/T051 (SC-001/SC-002/SC-003): medições de tempo com a lista real do
  usuário. O agente nunca digita a URL real em lugar nenhum (constitution).
- T049: validação em TV física — recomendada, não obrigatória para esta
  feature (spec, Assumptions).
- R-001/R-002/R-003 na tabela de Riscos e Decisões acima permanecem sem
  `Resolvido:` de propósito — dependem dessas mesmas medições/verificações
  pendentes, e marcá-los resolvidos seria alegar uma verificação que não
  aconteceu.

**README.md do projeto**: não existe um na raiz do repositório (só
`tv-web/README.md`, o boilerplate padrão do template Vite, sem relação com
funcionalidades do app) — nada para atualizar, conforme o escopo deste
skill.
