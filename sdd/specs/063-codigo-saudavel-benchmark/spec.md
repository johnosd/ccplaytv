# Feature Specification: Código saudável — divisão do repositório do catálogo, fronteiras e tamanho por lint, benchmark de importação

**Slug**: `063-codigo-saudavel-benchmark`

**Created**: 2026-10-07

**Status**: Implementada

**Input**: Pacote G5 de `.planning/backlog.md` (`## Ideias Futuras`), itens 49a-2 → 49b → 35, nessa ordem: dividir `catalogRepository.ts` por responsabilidade sem mudar comportamento nem API pública; fronteiras de código e limite de tamanho por lint; benchmark determinístico de importação (1 000/10 000/100 000 entradas, fetch/parse/classify/store e XMLTV, com aparelho e commit registrados).

## Escopo

### Incluído

- **49a-2** — Dividir o repositório do catálogo (`tv-web/src/lib/catalog/catalogRepository.ts`, 1 428 linhas em 07/10/2026) em módulos por responsabilidade: categorias, blocos/leitura de itens, resolução do estado da pessoa (favoritos, histórico, continuar assistindo), gerações/limpeza e preparo da carga. O arquivo original continua existindo como **fachada** que só reexporta; nenhum importador muda.
- **49b** — Regras de arquitetura verificadas pelo lint do frontend, como **catraca** (o que já existe fica numa lista de exceções congelada que só pode diminuir; nada novo entra):
  - `features/<a>` não importa de `features/<b>`;
  - `lib/` não importa UI (`components/`, `features/`);
  - `components/` não importa de `features/`;
  - `lib/catalog` não importa `lib/player` (a direção permitida é `lib/player` → `lib/catalog`);
  - arquivo de produção novo com no máximo ~300 linhas; os arquivos já acima disso ficam com teto no tamanho atual (podem diminuir, nunca crescer).
- Correção da única importação `lib/catalog` → `lib/player` existente hoje (`homeHero.ts` → `player/resumePolicy`), pra que a regra de direção nasça sem exceção.
- **35** — Benchmark de importação executado no navegador, com fontes fictícias geradas de forma determinística (Xtream, M3U e XMLTV) em 1 000, 10 000 e 100 000 entradas, medindo tempo por etapa (obtenção, parse, classificação, gravação) e uso/quota de armazenamento antes e depois; cada execução grava um resultado versionado no repositório com aparelho, commit e data. O mesmo roteiro pode ser rodado manualmente contra a TV física.

### Fora de Escopo

- Dividir os outros arquivos grandes (`catalogApi.ts` com 2 055 linhas, `SeriesDetailScreen.tsx`, `importPipeline.ts` etc.). Eles só ganham teto; a divisão fica para trabalho futuro.
- Desfazer os ~150 imports cruzados entre features já existentes (ex.: `series`/`movies`/`home` → `vod`, `live`/`vod`/`home` → `catalog`, vários → `shell`) ou mover módulos compartilhados para fora de `features/`. A catraca só impede que surjam novos.
- Migrar os importadores de produção para os módulos novos do repositório; eles continuam importando pela fachada.
- Qualquer mudança de comportamento visível, de esquema do Dexie (continua v17) ou de API pública do repositório.
- Benchmark como gate: ele não reprova por lentidão nem entra na rodada padrão do `npm run test:e2e`.
- Reabrir o item 51 (aviso de espaço/quota). O benchmark só fornece a medição que permitiria reabri-lo.
- Regras de lint para arquivos de teste, fixtures e roteiros E2E.
- Usar fonte real ou credenciais no benchmark.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Repositório do catálogo dividido sem mudar nada por fora (Priority: P1)

Quem mantém o código abre a parte do repositório do catálogo que precisa (categorias, leitura de blocos, estado da pessoa, gerações, preparo da carga) sem percorrer um arquivo de 1 400 linhas. O app e todos os seus importadores se comportam exatamente como antes.

**Why this priority**: é o primeiro da ordem do pacote e o 49b depende dele. É o arquivo mais central da camada de dados, com 54 importadores e testes de contrato travados.

**Independent Test**: a suíte unitária inteira, os testes de contrato travados (sem alteração, conferidos pelo `check-contract-tests.ps1`) e a suíte E2E passam antes e depois. O conjunto de nomes exportados pela fachada é idêntico ao de antes da divisão.

**Acceptance Scenarios**:

1. **Given** o repositório antes da divisão, **When** a divisão é aplicada, **Then** o conjunto de símbolos exportados por `catalogRepository.ts` (funções, tipos, classes) é idêntico, com as mesmas assinaturas.
2. **Given** os 54 arquivos que importam do repositório, **When** a divisão é aplicada, **Then** nenhum deles precisa ser editado.
3. **Given** os testes de contrato travados das features anteriores, **When** a verificação de travas roda, **Then** nenhum hash mudou e todos passam.
4. **Given** a suíte E2E, **When** roda após a divisão, **Then** passa com o mesmo resultado de antes.
5. **Given** cada módulo novo, **When** é medido, **Then** fica dentro do limite de ~300 linhas de produção, ou excede com justificativa registrada e entra no teto da catraca.

---

### User Story 2 - Fronteiras e tamanho verificados pelo lint, como catraca (Priority: P2)

Quem mantém o código recebe erro do lint ao criar um import proibido novo (feature → outra feature, lib → UI, components → features, catalog → player) ou ao fazer um arquivo de produção passar do limite. O que já existe hoje não quebra o lint; a lista de exceções só pode diminuir.

**Why this priority**: impede que a dívida cresça, mas depende do 49a-2 para o repositório do catálogo sair da lista de exceções de tamanho.

**Independent Test**: com o lint verde no estado atual, criar em um ramo de teste (1) um import novo de uma feature para outra, (2) um import de `lib/catalog` para `lib/player`, (3) um arquivo novo de produção com mais de 300 linhas e (4) uma linha a mais num arquivo da lista de teto. Cada caso falha o lint com mensagem que diz qual regra foi violada.

**Acceptance Scenarios**:

1. **Given** o código atual com os imports cruzados existentes, **When** o lint roda, **Then** passa (as violações existentes estão na lista de exceções).
2. **Given** um arquivo em `features/a` que passa a importar de `features/b` sem constar nas exceções, **When** o lint roda, **Then** falha apontando o arquivo e a regra.
3. **Given** um arquivo em `lib/` que importa de `components/` ou `features/`, **When** o lint roda, **Then** falha.
4. **Given** um arquivo em `components/` que passa a importar de `features/` (fora da exceção existente), **When** o lint roda, **Then** falha.
5. **Given** um arquivo em `lib/catalog` que importa de `lib/player`, **When** o lint roda, **Then** falha (sem exceção alguma, já que a única ocorrência atual é corrigida nesta feature).
6. **Given** um arquivo de produção novo com mais de ~300 linhas, ou um arquivo da lista de teto que cresceu acima do seu teto, **When** o lint roda, **Then** falha.
7. **Given** uma exceção que deixou de ser necessária (o import foi removido ou o arquivo encolheu), **When** a verificação roda, **Then** ela sinaliza a exceção obsoleta para ser retirada, e o teto pode ser baixado.
8. **Given** arquivos de teste, fixtures e roteiros E2E, **When** o lint roda, **Then** nenhuma das regras de fronteira ou tamanho se aplica a eles.

---

### User Story 3 - Benchmark de importação com resultado registrado (Priority: P3)

Quem mantém o código roda um comando próprio que importa fontes fictícias de 1 000, 10 000 e 100 000 entradas (Xtream, M3U e XMLTV) no app real, no navegador, e obtém tempos por etapa e o uso/quota de armazenamento. O resultado fica gravado num arquivo versionado, com aparelho, commit e data, e é comparado com a medição anterior. O mesmo roteiro pode ser apontado para a TV física.

**Why this priority**: dá base objetiva para decisões de desempenho e é a medição que reabriria o item 51, mas nenhum usuário está bloqueado por ele hoje.

**Independent Test**: rodar o comando com o app em modo dev, verificar que gera um arquivo de resultado com todas as combinações formato × tamanho, as etapas preenchidas e uso/quota antes e depois. Rodar de novo com o mesmo commit mostra a comparação com a execução anterior.

**Acceptance Scenarios**:

1. **Given** o app rodando localmente, **When** o comando do benchmark roda, **Then** importa cada formato (Xtream, M3U, XMLTV) em cada tamanho (1k, 10k, 100k) a partir de fontes fictícias geradas sempre iguais para a mesma semente.
2. **Given** uma importação medida, **When** ela termina, **Then** o resultado registra o tempo de cada etapa aplicável (obtenção, parse, classificação, gravação; para XMLTV, obtenção, parse e gravação) e o uso e a quota de armazenamento antes e depois.
3. **Given** o fim da execução, **When** o resultado é gravado, **Then** contém aparelho/navegador, versão do app, commit, data e parâmetros (semente, tamanhos), num arquivo versionado na pasta de resultados.
4. **Given** uma execução anterior gravada, **When** o benchmark roda de novo, **Then** imprime a variação por etapa em relação à anterior, sem reprovar por lentidão.
5. **Given** a execução contra a TV física (manual), **When** o roteiro é usado, **Then** o resultado identifica o aparelho como a TV e segue o mesmo formato.
6. **Given** `npm run test:e2e`, **When** roda, **Then** o benchmark não faz parte dele.

---

### Edge Cases

- **Símbolo exportado apenas como tipo** (`interface`, `type`): a fachada precisa continuar exportando-o como tipo; a comparação do conjunto exportado considera valores e tipos.
- **Dependência circular entre os módulos novos** (ex.: gerações e blocos usando ajudantes em comum): ajudantes internos compartilhados vão para um módulo interno, sem criar ciclo, e não são exportados pela fachada se antes não eram.
- **Estado de módulo** (memoização, caches em memória, contadores): se o arquivo atual guarda estado no escopo do módulo, ele precisa continuar único após a divisão. Duas cópias mudariam o comportamento.
- **Ordem de efeitos em transações do Dexie**: funções que hoje rodam na mesma transação continuam na mesma transação.
- **Import cruzado via reexportação ou import dinâmico** (`import()`): conta como import para as regras de fronteira.
- **Import por caminho de alias** (se houver) e por caminho relativo: os dois são verificados.
- **Exceção obsoleta** (o import existente foi removido): a verificação aponta e a lista diminui; ela nunca aceita uma entrada nova silenciosamente.
- **Arquivo da lista de teto renomeado ou movido**: conta como arquivo novo e precisa caber no limite, ou a exceção é atualizada explicitamente e de forma revisável (nunca automática).
- **Quota indisponível** no navegador ou na TV: o resultado registra "não informado" em vez de um número inventado.
- **Importação de 100k falha** (falta de espaço, aba fecha): o resultado registra a falha e a etapa em que ocorreu, e as demais combinações continuam.
- **Primeira execução sem medição anterior**: imprime sem comparação, e não falha.
- **Resultados de máquinas diferentes**: a comparação só é feita com a execução anterior do mesmo aparelho.

## Requirements *(mandatory)*

### Functional Requirements

**49a-2 — Divisão do repositório do catálogo**

- **FR-001**: O repositório do catálogo DEVE ser dividido em módulos por responsabilidade: categorias, blocos/leitura de itens, resolução do estado da pessoa, gerações/limpeza e preparo da carga. Agrupamentos melhores podem ser definidos no plano.
- **FR-002**: `catalogRepository.ts` DEVE continuar existindo como fachada que exporta exatamente o mesmo conjunto de símbolos (valores e tipos), com as mesmas assinaturas, e sem lógica própria.
- **FR-003**: Nenhum importador existente (produção ou teste) DEVE precisar de edição por causa da divisão.
- **FR-004**: Os testes de contrato travados DEVEM continuar sem alteração e passando.
- **FR-005**: O comportamento DEVE ser idêntico, comprovado por suíte unitária, travas de contrato e suíte E2E verdes. Isso inclui fronteiras de transação, estado de módulo único e ordem de efeitos.
- **FR-006**: A regra "itens de categoria só por `catalogRepository.ts`, nunca `db.channels`" DEVE continuar valendo. Os módulos novos fazem parte do repositório; o resto do app continua entrando pela fachada.

**49b — Fronteiras e tamanho por lint (catraca)**

- **FR-007**: O lint do frontend DEVE falhar quando um arquivo de produção em `features/<a>` importar de `features/<b>` (a ≠ b), salvo se o par arquivo → destino constar na lista de exceções.
- **FR-008**: O lint DEVE falhar quando um arquivo de produção em `lib/` importar de `components/` ou `features/`.
- **FR-009**: O lint DEVE falhar quando um arquivo de produção em `components/` importar de `features/`, salvo a exceção existente na lista.
- **FR-010**: O lint DEVE falhar quando um arquivo de produção em `lib/catalog` importar de `lib/player`, sem exceção. A importação atual de `homeHero.ts` para a política de retomada DEVE ser eliminada nesta feature, movendo a política para um lugar que os dois possam importar, sem mudar comportamento.
- **FR-011**: O lint DEVE falhar quando um arquivo de produção que não está na lista de teto passar de ~300 linhas (valor exato no plano), e quando um arquivo da lista de teto passar do teto registrado para ele.
- **FR-012**: A lista de exceções (imports e tetos) DEVE ser gerada a partir do estado do código no momento da adoção. A partir daí, só pode diminuir. Uma entrada nova exige edição explícita e revisável, nunca regeneração automática como parte do lint.
- **FR-013**: A verificação DEVE apontar exceções obsoletas (import que não existe mais, arquivo que encolheu abaixo do teto ou do limite) para que sejam removidas ou tenham o teto reduzido.
- **FR-014**: As regras de fronteira e de tamanho NÃO DEVEM se aplicar a arquivos de teste, fixtures de teste nem roteiros E2E.
- **FR-015**: Toda falha DEVE dizer o arquivo, a regra violada e, para importação, o destino proibido.
- **FR-016**: `npm run lint` DEVE incluir essas regras. Uma violação faz o comando falhar.

**35 — Benchmark de importação**

- **FR-017**: DEVE existir um comando próprio do frontend que rode o benchmark no navegador, contra o app real em modo dev, fora da rodada padrão do `npm run test:e2e`.
- **FR-018**: O benchmark DEVE gerar fontes fictícias determinísticas (mesma semente → mesmo conteúdo) nos formatos Xtream, M3U e XMLTV, com 1 000, 10 000 e 100 000 entradas. Nunca usa fonte real nem credencial.
- **FR-019**: Para cada formato × tamanho, DEVE medir o tempo de cada etapa aplicável (obtenção, parse, classificação, gravação), além do tempo total.
- **FR-020**: DEVE registrar o uso e a quota de armazenamento informados pelo ambiente antes e depois de cada importação, e "não informado" quando o ambiente não fornecer.
- **FR-021**: Cada execução DEVE gravar um arquivo de resultado versionado numa pasta de resultados do repositório, com aparelho/navegador, versão do app, commit, data, semente e tamanhos.
- **FR-022**: Quando houver resultado anterior do mesmo aparelho, o benchmark DEVE imprimir a variação por etapa. Ele NÃO DEVE falhar por lentidão.
- **FR-023**: Uma combinação que falhe (ex.: falta de espaço) DEVE ser registrada com a etapa da falha, sem impedir as demais.
- **FR-024**: O roteiro DEVE poder ser apontado manualmente para a TV física, produzindo resultado no mesmo formato que identifique o aparelho.
- **FR-025**: A medição NÃO DEVE alterar o comportamento de produção. Qualquer instrumentação fica restrita ao modo dev/benchmark, ou é passiva e sem custo perceptível na TV.

### Key Entities

- **Lista de exceções da catraca**: pares arquivo → destino de importação permitidos por herança, e tetos de linhas por arquivo. Gerada uma vez, só diminui.
- **Resultado de benchmark**: aparelho/navegador, versão do app, commit, data, semente, e para cada formato × tamanho os tempos por etapa e total, o uso/quota antes e depois, e o status (ok/falha + etapa).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhum módulo resultante da divisão do repositório do catálogo passa de ~300 linhas, salvo exceção justificada no plano. A fachada só reexporta.
- **SC-002**: O conjunto de símbolos exportados pelo repositório antes e depois da divisão é idêntico (diferença vazia), e zero importadores foram editados por causa dela.
- **SC-003**: Suíte unitária, verificação de travas de contrato e suíte E2E terminam verdes após cada um dos três itens.
- **SC-004**: Com o lint verde no estado atual, cada uma das cinco violações sintéticas (feature → feature, lib → UI, components → features, catalog → player, arquivo acima do limite/teto) faz o lint falhar com mensagem que identifica a regra.
- **SC-005**: Zero importações de `lib/catalog` para `lib/player` no código de produção.
- **SC-006**: Uma execução do benchmark produz um resultado com as 9 combinações formato × tamanho, cada uma com tempos por etapa e uso/quota (ou "não informado"), mais aparelho, commit e data.
- **SC-007**: Duas execuções seguidas com a mesma semente importam exatamente o mesmo conteúdo (mesmas contagens de categorias e itens).

## Assumptions

- O comportamento atual, coberto pela suíte e pelos E2E, é a referência; a divisão não corrige bugs (um bug encontrado vira `sdd-bugfix`).
- O linter atual (oxlint) pode não suportar sozinho a catraca com lista de exceções e tetos por arquivo. Uma verificação complementar dentro de `npm run lint` é aceitável; a escolha é do plano.
- "~300 linhas" conta as linhas do arquivo; o plano fixa o valor exato e se linhas em branco/comentários contam.
- Arquivos de mensagens do i18n (`lib/i18n/messages/*.ts`) são produção e entram na lista de teto como os demais.
- O app em modo dev (`npm run dev`) é o alvo padrão do benchmark, como nos E2E; os tempos variam por máquina e, por isso, não são gate.
- A base para o benchmark são `e2e/catalogo-em-blocos.mjs` e `e2e/catalogo-em-blocos-real.mjs` (painel fictício, medição por CDP).
- Dexie continua na v17; nada aqui precisa da v18.
- Nenhum mock de `comingSoon.ts` é removido por esta feature.

## Clarifications

### Sessão 2026-10-07

- Q: Como entra a regra "features/ não importa de outro features/", com ~150 imports cruzados hoje? → A: Catraca com baseline. Vale como erro para imports novos, os existentes ficam numa lista congelada que só diminui, e nenhum código é movido agora.
- Q: E o limite de ~300 linhas, com 36 arquivos de produção acima dele hoje? → A: Catraca. Arquivo novo ≤ ~300, e os atuais ficam com teto no tamanho de hoje (não crescem). O repositório do catálogo sai da lista após a divisão.
- Q: `lib/player` e `lib/catalog` se importam mutuamente. Qual direção fica permitida? → A: `lib/player` → `lib/catalog`. `lib/catalog` nunca importa `lib/player`, e a ocorrência atual (`homeHero` → `resumePolicy`) é corrigida.
- Q: Onde roda o benchmark? → A: No navegador (Playwright), contra o app real com fontes fictícias. A TV física é opcional, com o mesmo roteiro.
- Q: Como ficam os 54 importadores após a divisão, incluindo testes de contrato travados? → A: `catalogRepository.ts` vira fachada que só reexporta, e nenhum importador muda.
- Q: As regras de tamanho e fronteira valem para testes? → A: Não, só para código de produção.
- Q: O benchmark reprova por lentidão? → A: Não. Só mede, registra e compara com a execução anterior.
- Q: O benchmark entra no `npm run test:e2e`? → A: Não, tem comando próprio.
- Q: Onde ficam os resultados? → A: Em arquivo versionado no repositório, com aparelho, commit e data.
- Q: O benchmark registra uso e quota de armazenamento? → A: Sim, antes e depois de cada carga.
- Q: Entra também "components/ não importa de features/"? → A: Sim, na mesma catraca (hoje há 1 ocorrência).
- Q: Quais formatos o benchmark cobre? → A: Xtream, M3U e XMLTV.
