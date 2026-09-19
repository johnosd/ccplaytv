# Feature Specification: Conector Xtream JSON para canais ao vivo

**Slug**: `004-conector-xtream-live`

**Created**: 2026-09-18

**Status**: Convergida

**Input**: Item 1 da Fase 0 do backlog — "Conector Xtream JSON
(`player_api.php`) separado do conector M3U". Dívida de fundação: hoje o
backend monta `get.php?...&type=m3u_plus` e reaproveita o parser M3U para
fontes de provedor, o que **contraria a ADR-006 §4.3** e descarta
`stream_id`, categorias e hierarquia que o provedor já oferece.

## Escopo

Fatia vertical fina sobre **canais ao vivo**, pela API certa. O valor não
está em mostrar algo novo na tela: está em o catálogo passar a carregar a
identidade e as categorias que o provedor declara, em vez de um texto
extraído de um arquivo M3U. É a fundação que os itens 9 e 10 (Filmes e
Séries reais) exigem para existir sem inventar estrutura.

### Incluído

- Conector de provedor próprio, falando o protocolo JSON do painel
  (`player_api.php`), separado do conector M3U e com **saída normalizada
  comum** aos dois — nenhum dos lados sabe como o outro obtém os dados.
- Normalização do endereço do servidor: o usuário pode colar a base, ou uma
  URL terminando em `get.php`, `player_api.php` ou `panel_api.php`, e todas
  reduzem à mesma base, preservando subpath quando houver.
- Resolução do **estado real da conta** com tentativas em ordem, porque nem
  todo painel responde à primeira: `get_account_info` → sem action →
  `get_profile`. Interpretar autorização e data de expiração para distinguir
  conta ativa, expirada e credencial inválida.
- Canais ao vivo obtidos com as **categorias declaradas pelo provedor**,
  preservando nome e ordem, e com o **identificador estável do provedor**
  por canal.
- Formatos de reprodução derivados do que a conta **permite**, nunca
  assumidos. A preferência é TS; os formatos permitidos ficam registrados na
  fonte para uso posterior.
- **Modo limitado**: painel que não fala o protocolo JSON continua sendo
  importado pelo caminho M3U existente, e a fonte é marcada como tal, com
  indicação discreta na lista de listas.
- **Migração única** das fontes de provedor já importadas pelo caminho
  antigo: ao abrir uma dessas fontes, a reimportação dispara **uma vez**, em
  segundo plano, com o catálogo anterior utilizável enquanto ela não termina.
  Depois de migrada, a fonte só volta a baixar do provedor por resync
  explícito.
- Todas as requisições ao provedor sujeitas à **mesma política de rede** que
  o caminho M3U já aplica: proteção anti-SSRF por hop, limites de bytes,
  tempo e redirecionamentos, e o User-Agent de player usado hoje.
- **Atualização por idade**: abrir uma fonte cuja última sincronização
  bem-sucedida seja mais antiga que o prazo definido dispara uma
  reimportação em segundo plano, com o catálogo atual servindo enquanto ela
  roda. Vale para **qualquer** fonte, de provedor ou de URL M3U — a regra é
  da fonte, não do conector.
- A ação explícita de **ressincronizar**, que já existe na Home, continua
  sendo o caminho imediato para quem sabe que algo mudou agora.

### Fora de Escopo

- **Filmes (VOD) e séries pelo protocolo JSON** — é a próxima fatia, e o que
  destrava os itens 9 e 10 do backlog. Aqui só canais.
- **Telas de Filmes e Séries** — continuam lendo `mockCatalog.ts`. Esta
  feature não as toca.
- **EPG e catch-up** — dependem de endpoints que esta fatia não consome.
- **Escolha de formato por canal no momento de reproduzir** — a preferência
  é uma só por fonte. Fallback de formato durante a reprodução é assunto do
  item 20 (diagnóstico de reprodução).
- **Virtualização de lista** (item 7) e **cache offline** (item 4).
- **Estratégia DB-first completa** (item 3 da Fase 0) — marcador de
  `import_status` por fonte e tipo, decidindo "cache válido" vs "frio", é
  item próprio. Esta feature só respeita a regra que dele decorre: **abrir
  uma lista não re-baixa o provedor**, fora a migração única descrita acima.
- **Favoritos e histórico** (itens 12 e 13) — não existem ainda, e é por
  isso que substituir o catálogo no resync é seguro agora.
- **Mudanças no classificador** — a classificação de tipo continua como
  está; esta feature muda a origem dos dados, não as regras.
- **Tela de detalhe de fonte** — a indicação de modo limitado vive na lista
  existente, sem tela nova.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver os canais com as categorias que o provedor declara (Priority: P1)

Como usuário que cadastrou uma lista por DNS/usuário/senha, abro Live TV e
vejo os canais organizados pelas categorias do meu provedor — as mesmas que
apareceriam no painel dele.

**Why this priority**: é a razão da feature existir. Sem os dados
estruturados do provedor, tudo o que vem depois (séries com temporadas, VOD
por categoria) é adivinhação sobre texto de M3U.

**Independent Test**: cadastrar uma fonte de provedor, aguardar a
importação e conferir em Live TV que os nomes e a ordem das categorias
correspondem aos do provedor, e que os canais estão nas categorias certas.

**Acceptance Scenarios**:

1. **Given** credenciais válidas de um painel que fala o protocolo JSON,
   **When** a importação termina, **Then** os canais aparecem agrupados
   pelas categorias declaradas pelo provedor, na ordem em que o provedor as
   declara.
2. **Given** a mesma fonte importada, **When** o catálogo é gravado,
   **Then** cada canal carrega o identificador estável do provedor, e não
   apenas nome e URL.
3. **Given** um canal importado por este conector, **When** o usuário
   pressiona Enter sobre ele, **Then** ele reproduz — a mudança de conector
   não pode regredir a reprodução validada na feature 003.

---

### User Story 2 - Entender o estado real da minha conta (Priority: P1)

Como usuário, quando minha assinatura expirou ou digitei a senha errada,
recebo uma explicação precisa do que aconteceu — não uma falha genérica de
importação.

**Why this priority**: é a diferença entre "não funcionou" e "sua conta
expirou em tal data". Hoje o backend só sabe que a resposta não parece uma
lista M3U válida, e trata causas diferentes como o mesmo erro.

**Independent Test**: tentar importar com credenciais inválidas, e depois
com uma conta expirada, e confirmar que as mensagens são distintas e
corretas.

**Acceptance Scenarios**:

1. **Given** credenciais inválidas, **When** o usuário tenta importar,
   **Then** o app explica que as credenciais não foram aceitas, sem expor a
   senha nem o endereço completo do servidor.
2. **Given** uma conta expirada, **When** o usuário tenta importar, **Then**
   o app informa que a assinatura expirou, distinguindo isso de credencial
   inválida.
3. **Given** um painel que não responde à primeira forma de consulta de
   status, **When** o app tenta as formas alternativas, **Then** o estado é
   resolvido sem o usuário perceber as tentativas.

---

### User Story 3 - Continuar funcionando com painel incompatível (Priority: P2)

Como usuário de um provedor que só serve lista M3U, minha lista continua
funcionando como antes, e eu entendo por que ela mostra menos informação que
as outras.

**Why this priority**: nenhuma fonte que funciona hoje pode parar de
funcionar. Mas isso só importa depois que o caminho principal (P1) existe.

**Independent Test**: apontar uma fonte de provedor para um painel que não
responde ao protocolo JSON e confirmar que a importação acontece pelo
caminho M3U, com a fonte sinalizada.

**Acceptance Scenarios**:

1. **Given** um painel que não fala o protocolo JSON, **When** a importação
   roda, **Then** ela acontece pelo caminho M3U existente e conclui com
   sucesso.
2. **Given** uma fonte importada em modo limitado, **When** o usuário vê a
   lista de listas, **Then** há uma indicação discreta de que aquela fonte
   veio em modo limitado, sem tratá-la como erro.
3. **Given** uma fonte em modo limitado, **When** o usuário abre Live TV,
   **Then** os canais aparecem com as categorias que o M3U declarava — nunca
   com categorias inventadas para compensar a falta.

---

### User Story 4 - Migrar uma lista antiga sem perceber a troca (Priority: P2)

Como usuário que já tinha listas importadas antes desta mudança, ao abrir
uma delas o catálogo passa a vir pela API nova sem que eu precise fazer
nada, sem ficar esperando — e isso acontece **uma vez**, não toda vez que eu
entro na lista.

**Why this priority**: sem isso, as listas existentes ficariam para sempre
com os dados antigos. Mas o valor só aparece depois que a importação nova
funciona.

**Independent Test**: com uma fonte de provedor importada pelo caminho
antigo, abrir a lista e confirmar que o conteúdo continua acessível durante
a migração e reflete os dados novos depois; abrir a mesma lista de novo e
confirmar que **nenhuma** nova importação é disparada.

**Acceptance Scenarios**:

1. **Given** uma fonte de provedor importada antes desta feature, **When** o
   usuário abre essa lista, **Then** a migração começa em segundo plano e o
   catálogo anterior continua navegável enquanto ela roda.
2. **Given** uma migração em andamento, **When** ela termina, **Then** o
   catálogo daquela fonte é substituído pelo novo, com a identidade e as
   categorias do provedor.
3. **Given** uma fonte **já migrada e dentro do prazo**, **When** o usuário
   abre a lista de novo, **Then** o catálogo vem do que já está armazenado e
   **nenhuma requisição ao provedor é disparada** — re-baixar só acontece
   pela idade (US5) ou pelo resync explícito.
4. **Given** uma migração que falha (rede, conta expirada), **When** o erro
   ocorre, **Then** o catálogo anterior permanece utilizável, a fonte
   continua marcada como não migrada, e o usuário é informado sem perder o
   que já tinha.

---

---

### User Story 5 - Ver o que o provedor adicionou, sem precisar pedir (Priority: P2)

Como usuário, quando meu provedor adiciona canais ou filmes, eles aparecem
no meu catálogo sem eu ter que lembrar de mandar atualizar toda vez.

**Why this priority**: sem isso, o catálogo envelhece em silêncio e só a
memória do usuário o corrige. Mas é a story que menos importa se o conector
novo não funcionar — por isso P2, depois das duas P1.

**Independent Test**: com uma fonte sincronizada há mais tempo que o prazo,
abrir a lista e confirmar que a atualização dispara sozinha e que o catálogo
continua navegável; com uma sincronizada há pouco, abrir e confirmar que
nada é disparado.

**Acceptance Scenarios**:

1. **Given** uma fonte cuja última sincronização bem-sucedida é mais antiga
   que o prazo, **When** o usuário abre a lista, **Then** a reimportação
   começa em segundo plano e o catálogo atual continua navegável.
2. **Given** uma fonte sincronizada dentro do prazo, **When** o usuário abre
   a lista, **Then** nenhuma requisição ao provedor é disparada.
3. **Given** uma atualização por idade concluída, **When** o catálogo é
   substituído, **Then** a navegação em curso não é desorganizada: o foco e
   a posição continuam no item em que estavam, reconciliados por
   identidade — nunca por posição na lista.
4. **Given** o usuário que sabe que algo mudou agora, **When** ele usa a
   ação de ressincronizar na Home, **Then** a atualização acontece na hora,
   sem esperar o prazo.

### Edge Cases

- **Painel responde ao protocolo JSON mas devolve zero canais**: a fonte é
  importada com sucesso e o estado vazio da tela explica, sem tratar como
  falha de credencial.
- **Endereço colado com subpath** (painel hospedado em `/iptv/`): a
  normalização preserva o subpath em vez de assumir raiz.
- **Endereço colado já com `get.php` ou `player_api.php`**: reduz à base
  correta, sem gerar caminho duplicado.
- **Conta ativa mas sem formato de stream permitido declarado**: a
  importação conclui, e a ausência é registrada em vez de o app assumir um
  formato.
- **Categoria declarada pelo provedor com nome vazio**: tratada como a
  fonte declarou — nunca substituída por rótulo externo.
- **Canal sem identificador do provedor** numa resposta parcial: o canal
  continua acessível, sem identidade forjada.
- **Migração disparada duas vezes** (usuário entra e sai da lista rápido):
  apenas uma importação por fonte acontece por vez.
- **Endereço colado com credenciais dentro da URL**: as credenciais não
  entram na URL armazenada; ficam nos campos próprios ou o endereço é
  recusado com explicação.
- **Provedor lento a ponto de a migração não terminar na sessão**: o
  catálogo anterior continua servindo e a fonte permanece não migrada, para
  a próxima abertura tentar de novo.
- **Atualização por idade termina enquanto o usuário navega a lista**: o
  catálogo novo não pode fazer a tela saltar nem perder o item focado — a
  reconciliação é por identidade, não por posição.
- **Fonte que nunca teve sincronização bem-sucedida**: não há idade a
  comparar; ela é tratada como pendente de importação, não como "velha".
- **Atualização por idade falha**: o catálogo atual permanece, a marca de
  última sincronização bem-sucedida **não** avança, e a próxima abertura
  tenta de novo — sem transformar uma fonte saudável em fonte com erro.
- **Usuário pede resync explícito com uma atualização por idade já em
  curso**: continua valendo uma importação por fonte de cada vez; o pedido
  explícito não cria uma segunda.
- **Provedor que responde ao protocolo JSON em uma consulta e falha em
  outra**: a importação não pode gravar um catálogo pela metade como se
  estivesse completo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Fontes de provedor DEVEM ser importadas por um conector
  próprio que fale o protocolo JSON do painel, distinto do conector de M3U;
  os dois DEVEM produzir a mesma forma normalizada de saída.
- **FR-002**: O sistema NÃO DEVE converter a resposta estruturada do
  provedor em M3U para reaproveitar o parser existente.
- **FR-003**: O endereço do servidor informado pelo usuário DEVE ser
  normalizado a partir de qualquer uma das formas comuns (base, `get.php`,
  `player_api.php`, `panel_api.php`), preservando subpath. Credenciais
  embutidas no endereço colado NÃO DEVEM ser aceitas como parte da URL
  armazenada — as credenciais vivem apenas nos campos próprios da fonte.
- **FR-004**: O estado da conta DEVE ser resolvido tentando as formas
  alternativas de consulta em ordem, até obter resposta utilizável.
- **FR-005**: O sistema DEVE distinguir, para o usuário, conta ativa,
  assinatura expirada e credencial inválida.
- **FR-006**: Os canais importados DEVEM preservar o identificador estável
  declarado pelo provedor.
- **FR-007**: As categorias DEVEM ser as declaradas pelo provedor,
  preservando nome e ordem; o sistema NÃO DEVE substituí-las por taxonomia
  externa nem preencher ausências com rótulo inventado.
- **FR-008**: Os formatos de reprodução permitidos pela conta DEVEM ser
  registrados na fonte, e a URL de reprodução DEVE usar um formato que a
  conta permite — nunca um formato assumido.
- **FR-009**: Quando a conta permitir mais de um formato, a preferência DEVE
  ser TS.
- **FR-010**: Painel que não responda ao protocolo JSON DEVE ser importado
  pelo caminho M3U existente, e a fonte DEVE ser registrada como importada
  em modo limitado.
- **FR-011**: A lista de listas DEVE indicar discretamente as fontes em modo
  limitado, sem apresentá-las como erro.
- **FR-012**: Abrir uma fonte de provedor ainda não migrada DEVE disparar a
  migração em segundo plano, mantendo o catálogo anterior navegável enquanto
  ela não conclui.
- **FR-013**: Uma migração concluída com sucesso DEVE substituir o catálogo
  daquela fonte e marcá-la como migrada; uma que falhe NÃO DEVE destruir o
  catálogo anterior nem marcar a fonte como migrada.
- **FR-014**: Abrir uma fonte **já migrada** NÃO DEVE disparar requisição ao
  provedor **por causa da migração** — ela acontece uma vez só. As duas
  únicas exceções que re-baixam são a atualização por idade (FR-020) e o
  resync explícito (FR-021). Fora delas, abrir uma lista lê do que já está
  armazenado (decorre do item 3 da Fase 0 — leitura DB-first).
- **FR-015**: Todas as requisições ao provedor — status de conta, categorias
  e canais — DEVEM passar pela mesma política de rede já aplicada ao
  download de M3U: proteção anti-SSRF por hop, limite de bytes, tempo,
  limite de redirecionamentos e o User-Agent de player em uso. Nenhum
  caminho novo pode contornar essa política.
- **FR-016**: O resultado da consulta de status DEVE ser refletido no estado
  de conexão registrado da fonte e na marca de última sincronização
  bem-sucedida — o app não pode exibir "sincronizada" para uma conta que
  acabou de ser recusada.
- **FR-017**: NÃO DEVE existir mais de uma importação simultânea para a
  mesma fonte.
- **FR-018**: Credenciais, senha e endereço completo do servidor NÃO DEVEM
  aparecer em mensagem de erro, em tela, nem em log, em nenhum dos caminhos
  desta feature.
- **FR-019**: Uma importação que falhe no meio NÃO DEVE gravar catálogo
  parcial apresentado como completo.
- **FR-020**: Abrir uma fonte cuja última sincronização bem-sucedida seja
  mais antiga que **24 horas** DEVE disparar uma reimportação em segundo
  plano, mantendo o catálogo atual navegável enquanto ela roda. A regra vale
  para qualquer fonte, de provedor ou de URL M3U.
  *(O prazo de 24 h é o valor inicial acordado; mudá-lo é ajuste de
  configuração, não de comportamento.)*
- **FR-021**: A ação explícita de ressincronizar DEVE continuar disponível e
  imediata, independente da idade da fonte — ela é o caminho de quem sabe
  que o provedor mudou agora.
- **FR-022**: A substituição de catálogo resultante de uma atualização em
  segundo plano NÃO DEVE desorganizar a navegação em curso: foco e posição
  são reconciliados por identidade do item, nunca por posição na lista
  (constitution, "Voltar Restaura Foco e Posição").
- **FR-023**: Uma atualização por idade que falhe NÃO DEVE avançar a marca
  de última sincronização bem-sucedida nem degradar o estado da fonte — a
  próxima abertura tenta de novo.

### Key Entities

- **Source** passa a carregar o que o painel informou sobre a conta: os
  formatos de reprodução permitidos, se a fonte foi importada pelo protocolo
  JSON ou em modo limitado, e se já foi migrada do formato antigo. O estado
  de conexão e a marca de última sincronização bem-sucedida **já existem no
  modelo** e passam a ser preenchidos a partir do resultado da consulta de
  status. As credenciais continuam onde já estão, com o mesmo tratamento de
  segredo.
- **CatalogItem** de canal passa a carregar o identificador estável do
  provedor e a referência à categoria declarada por ele. Nenhuma entidade
  nova é criada nesta fatia — séries e VOD, que exigiriam hierarquia
  própria, estão fora de escopo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa fonte de provedor real, 100% das categorias exibidas em
  Live TV correspondem, em nome e ordem, às que o provedor declara.
- **SC-002**: Todo canal importado por este conector tem identificador do
  provedor registrado.
- **SC-003**: Nenhuma fonte que era importável antes desta feature deixa de
  ser importável depois dela.
- **SC-004**: Os três estados de conta — ativa, expirada e credencial
  inválida — produzem mensagens distintas e corretas, verificados um a um.
- **SC-005**: O formato usado na URL de reprodução pertence à lista de
  formatos que a conta permite, em 100% dos canais reproduzidos.
- **SC-006**: Reproduzir um canal na TV física continua funcionando após a
  troca de conector — sem regressão da feature 003.
- **SC-007**: Nenhuma credencial, senha ou endereço completo de servidor
  aparece em tela ou em log, num ciclo completo de sucesso **e** de falha.
- **SC-008**: Abrir uma lista ainda não migrada permite navegar o catálogo
  anterior enquanto a migração roda, sem tela de espera bloqueante.
- **SC-009**: Abrir uma lista já migrada **e dentro do prazo** não produz
  nenhuma requisição ao provedor — verificável observando o tráfego de saída
  do backend numa abertura completa da tela. Fora do prazo, o esperado é o
  oposto, e é o SC-011 que mede.
- **SC-010**: Nenhuma requisição ao provedor sai por um caminho que escape
  da política de rede vigente (anti-SSRF, limites e User-Agent), verificável
  por inspeção dos pontos de saída do conector novo.
- **SC-011**: Uma fonte sincronizada dentro do prazo abre sem disparar
  requisição ao provedor; uma fora do prazo dispara a atualização e
  permanece navegável durante ela. Os dois casos verificados.
- **SC-012**: Uma atualização concluída em segundo plano não faz a lista
  saltar nem perde o item focado — verificado com o usuário navegando no
  momento em que a substituição acontece.

## Assumptions

- O painel do provedor de teste fala o protocolo JSON. Se não falar, a
  feature ainda é verificável pelo caminho de modo limitado (US3), e o
  resultado é evidência válida — não fracasso silencioso.
- **Substituir o catálogo da fonte no resync é seguro hoje** porque
  favoritos e histórico ainda não existem (itens 12 e 13 do backlog). Quando
  existirem, a regra de reconciliação muda e passa a ser assunto daqueles
  itens — esta feature não cria essa dívida, apenas se beneficia da janela.
- A fonte de teste real tem 311.367 entradas (registrado na feature 001).
  Nenhuma meta de desempenho é fixada aqui, mas é por causa desse tamanho
  que a ressincronização não pode bloquear a abertura da lista.
- As credenciais da fonte de teste continuam válidas no momento da
  verificação. O arquivo local com elas é gitignored e nunca foi commitado;
  seus valores continuam proibidos em código, fixtures, specs e commits.
- A classificação de tipo (canal/filme/série) continua como está. Esta
  feature muda de onde os dados vêm, não como são classificados.

## Clarifications

### Sessão 2026-09-18

- Q: Quais tipos de conteúdo entram nesta fatia? → A: Só canais ao vivo.
  VOD e séries ficam para a fatia seguinte, que é o que destrava os itens 9
  e 10 do backlog.
- Q: E quando o painel não responde ao protocolo JSON? → A: Cair no caminho
  M3U atual, com a fonte marcada como modo limitado. Nenhuma fonte que
  funciona hoje pode parar de funcionar.
- Q: O que acontece com as fontes de provedor já importadas? → A:
  Ressincronizar automaticamente.
- Q: Quando a conta permite mais de um formato (TS e HLS), qual usar? → A:
  Preferir TS, registrando na fonte todos os formatos que a conta permite.
- Q: A ressincronização automática acontece quando, exatamente? → A: Ao
  abrir a fonte, em segundo plano, com o catálogo antigo utilizável até o
  novo ficar pronto — uma fonte de centenas de milhares de entradas não pode
  segurar a abertura.
- Q: Fonte em modo limitado deve ser sinalizada? → A: Sim, com indicação
  discreta na lista de listas — não como erro.
- Q: Ao ressincronizar, como tratar o catálogo que já existe? → A:
  Substituir o catálogo daquela fonte inteiro. É seguro agora porque não há
  favoritos nem histórico a preservar.

### Revisão 2026-09-18 — releitura de `docs/iptvnator/00-resumo.md` e `06-carga-listas-url-xtream.md`

Quatro correções depois de reler os relatórios de origem. As três últimas
são lacunas da primeira redação; a primeira é uma contradição que ela
introduziu.

- **Ressincronização virou migração única.** A redação anterior dizia que
  abrir a fonte dispara o resync, o que — lido ao pé da letra — re-baixaria
  o provedor a cada abertura. Isso contraria o item 6 do
  `06-carga-listas-url-xtream.md` (*Estratégia DB-first*, P0) e o item 3 da
  Fase 0 do backlog, que fazem do resync o **único gatilho explícito de
  rede**. Corrigido: a migração roda uma vez por fonte, e fonte já migrada
  abre sem tocar no provedor (FR-012, FR-013, FR-014, SC-009).
- **Política de rede explicitada.** O `00-resumo.md` marca como P0
  "User-Agent VLC para WAF — já parcialmente no CCPlay, **completar
  cobertura**". O conector novo faz requisições próprias e a spec não exigia
  nada; sem isso ele contornaria a proteção que o caminho M3U já tem
  (FR-015, SC-010).
- **Credencial embutida na URL.** O item 4 do relatório pede normalização
  que **rejeite credenciais na URL**; a FR-003 só reduzia à base (corrigida).
- **Estado da conta persistido.** O item 5 lembra que `connection_state` e
  `last_successful_sync_at` já existem no modelo `Source` e devem refletir o
  resultado da consulta de status (FR-016 e Key Entities).

Também confirmado, sem mudança necessária: o item 8 (*preservar campos do
usuário no re-download*) é P0 no relatório, e esta spec só pode substituir o
catálogo inteiro porque favoritos e histórico ainda não existem — a
suposição já estava registrada e continua sendo a única razão de a
substituição ser segura.

### Revisão 2026-09-18 (2) — atualização de catálogo levantada pelo usuário

- Q: Se a migração é única e abrir a lista não re-baixa, como eu vejo um
  filme novo que o provedor adicionou? → A: **Mantendo os dois caminhos.**
  A ação explícita de ressincronizar, que já existe na Home
  (`HomeScreen.tsx`, `POST /sources/{id}/resync`), continua sendo a via
  imediata; e passa a existir atualização automática **por idade** — abrir
  uma fonte sincronizada há mais de 24 h dispara a reimportação em segundo
  plano, com o catálogo atual servindo enquanto isso.

  Esta pergunta expôs uma lacuna que não era só da spec: **nenhum item do
  backlog decidia o gatilho temporal de atualização**. O item 3 da Fase 0
  diz "só o resync explícito re-baixa" e o item 24 trata de atualizar várias
  fontes com concorrência limitada, mas nenhum dos dois decide *quando*. A
  regra de idade preenche isso.

- Q: A regra vale só para fontes de provedor? → A: Para **todas**. A
  condição é da fonte (há quanto tempo foi sincronizada), não do conector —
  restringir ao provedor deixaria as listas por URL M3U com exatamente o
  problema que a pergunta apontou.

Consequência assumida: o custo da reimportação é do backend, não da TV — a
TV só acompanha o progresso. O que precisa de cuidado na TV é a
**substituição do catálogo embaixo de quem está navegando**, endereçada por
FR-022 e SC-012.

### Revisão 2026-09-18 (3) — achados do Analyze do `sdd-plan`

Duas contradições internas que só apareceram ao ler os requisitos uns contra
os outros, corrigidas antes de qualquer implementação:

- **FR-014 × FR-020**: o primeiro proibia requisição ao abrir fonte já
  migrada; o segundo exige requisição quando a fonte está velha. Uma fonte
  migrada e fora do prazo caía nos dois. FR-014 passou a dizer que a
  proibição é de re-baixar **por causa da migração**, com a idade e o resync
  explícito como as duas exceções nomeadas.
- **SC-009 × SC-011**: mesma contradição nos critérios mensuráveis. SC-009
  passou a valer para fonte migrada **e dentro do prazo**, apontando para o
  SC-011 como a medida do caso oposto. O cenário 3 da US4 foi ajustado junto.

Vale registrar como isso passou: FR-014 foi escrito pensando em migração e
FR-020 em frescor, em momentos diferentes da mesma sessão. Um implementador
lendo FR-014 sozinho bloquearia exatamente o comportamento que FR-020 pede.
