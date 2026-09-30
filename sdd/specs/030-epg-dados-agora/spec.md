# Feature Specification: EPG — Dados de Programação e "Agora" na Live TV, no Player e na Home

**Slug**: `030-epg-dados-agora`

**Created**: 2026-09-28

**Status**: Convergida

**Input**: Item 42 do backlog, incrementos 42a e 42b — entrega #4 da tabela
"Próximas entregas": "EPG: dados + 'Agora' na Live TV e no player". 42a —
download/parse/armazenamento do EPG por fonte no aparelho, frescor e
sincronização manual, estados "EPG vinculado"/"EPG não configurado"/erro
(§24.3, §45); remove o mock `settings-epg`. 42b — programa atual + progresso
real na linha de canal, "A seguir" no preview, programa atual na banda do
player Live e na Home; sem EPG para um canal, o slot fica vazio, nunca texto
inventado. O Guia completo em tela cheia (42c) é a entrega #5, outra feature.

## Escopo

### Incluído

- **Obtenção do EPG no formato XMLTV para todo tipo de fonte**:
  - fonte Xtream (e M3U detectada como painel Xtream, feature 014): endereço
    XMLTV do próprio painel, com a mesma credencial, sem configuração extra;
  - fonte M3U: endereço declarado no cabeçalho da lista (`url-tvg` /
    `x-tvg-url`), quando houver;
  - qualquer fonte: endereço XMLTV **informado pela pessoa** em
    Configurações, que tem precedência sobre o detectado.
- XMLTV **puro ou comprimido (gzip)**, reconhecido pelo conteúdo, não só
  pela extensão.
- Leitura do XMLTV **sem travar a interface** e sem carregar o arquivo
  inteiro de uma vez, guardando só a janela **de 12 h antes a 48 h depois**
  do momento da sincronização; programas já encerrados fora da janela são
  descartados a cada sincronização.
- Programação guardada no aparelho, **por fonte**, e usada offline enquanto
  válida (ADR-002).
- **Associação canal ↔ programação só por identificador exato**: o id de EPG
  que a fonte declara para o canal (`epg_channel_id` no Xtream, `tvg-id` no
  M3U) igual ao id do canal no XMLTV. Canal sem id, ou sem correspondência,
  fica sem EPG.
- Captura desse id de EPG do canal na importação/leitura de categoria;
  categorias de canais já gravadas **sem** esse dado são tratadas como
  vencidas e renovadas na próxima entrada, sem ação da pessoa.
- **Frescor**: sincroniza logo após importar/ressincronizar a fonte; ao
  abrir o app com o EPG da fonte ativa mais velho que 12 h, atualiza em
  segundo plano sem bloquear nada; e "Sincronizar agora" manual.
- **Configurações › Fontes IPTV › botão "EPG"** (hoje mock `settings-epg`)
  vira real: estado do EPG, endereço em uso (detectado ou manual, sem
  expor credencial), campo para informar/trocar/limpar o endereço manual,
  **deslocamento de horário por fonte** (±N horas), "Sincronizar agora",
  "Desativar EPG"/"Ativar EPG". Remove `settings-epg` de `comingSoon.ts`.
- Estado de EPG da fonte visível na linha de fonte em Configurações (§24.1):
  "EPG vinculado", "EPG não configurado", "Sincronizando EPG", "EPG
  desativado" ou erro com código (`EPG-02`, §45).
- **"Agora"** — programa atual e barra de progresso real — em:
  - linha de canal da Live TV (slot já reservado pela feature 024), inclusive
    em "★ Favoritos", "Todos", na busca por categoria e na lista de zapping
    (feature 016);
  - preview da Live TV: "Agora" (título, horário início–fim, progresso,
    sinopse truncada quando existir) e **"A seguir"** (título e horário);
  - banda do player Live (feature 027): programa atual e progresso,
    atualizados na troca de canal;
  - cards da rail "Canais favoritos" da Home (feature 026).
- Atualização do "Agora" com a passagem do tempo enquanto a tela está aberta
  (programa que termina dá lugar ao seguinte, progresso avança).
- Excluir uma fonte apaga também a programação e a configuração de EPG dela.

### Fora de Escopo

- **Guia completo em tela cheia** (grade, timeline, Hoje/Amanhã, linha de
  hora atual) — item 42c, próxima feature. O botão "Guia completo" do
  preview e o botão "Guia" do chrome do player **continuam mock**
  (`epg-guide`).
- `get_short_epg`/`get_simple_data_table` do Xtream — o formato único é
  XMLTV.
- Associação por nome (aproximado ou exato), por `tvg-name` ou por qualquer
  heurística — só id exato.
- Mapeamento manual canal ↔ id de EPG pela pessoa.
- Frequência de atualização configurável (fixa em 12 h nesta feature).
- Várias URLs XMLTV por fonte, ou EPG compartilhado entre fontes.
- TV Archive/Catch-up/Timeshift (item 43), lembretes/gravação, busca por
  programa.
- Estado de EPG no cartão da tela "Quem está assistindo?" (item 46).
- Política de descarte por falta de espaço (item 51) — nesta feature, falta
  de espaço vira erro declarado, como já acontece com o catálogo.
- Logos/imagens de programa, classificação indicativa, categorias de
  programa do XMLTV.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver o que está passando agora na lista de canais (Priority: P1)

A pessoa abre a TV ao vivo numa fonte Xtream (ou M3U com `url-tvg`) e, ao
lado do nome de cada canal, vê o programa em exibição e uma barra de quanto
dele já passou. O EPG foi obtido sozinho, sem nenhuma configuração, logo
após a importação.

**Why this priority**: é a lacuna mais visível do DS (slot "Agora" vazio
desde a feature 024) e sozinha já entrega o valor central de EPG: escolher
canal pelo que está passando. Inclui toda a base de dados (obtenção,
leitura, armazenamento, associação) sem a qual nada mais funciona.

**Independent Test**: com uma fonte de teste servindo um XMLTV conhecido,
importar a fonte, entrar numa categoria de canais e verificar que cada
canal com id correspondente mostra o título certo e o progresso coerente
com a hora atual, e que canais sem id/sem correspondência mostram o slot
vazio.

**Acceptance Scenarios**:

1. **Given** uma fonte Xtream recém-importada cujo painel oferece XMLTV,
   **When** a pessoa entra numa categoria de canais, **Then** cada canal cujo
   id de EPG casa com o XMLTV mostra o título do programa em exibição e uma
   barra de progresso proporcional ao tempo decorrido.
2. **Given** um canal sem id de EPG, ou com id ausente do XMLTV, **When** ele
   aparece na lista, **Then** o slot "Agora" fica vazio e sem barra — nunca
   "Sem informação", nunca um título inventado.
3. **Given** a lista aberta e um programa que termina, **When** o horário de
   término passa, **Then** o slot passa a mostrar o programa seguinte sem a
   pessoa precisar sair e voltar.
4. **Given** uma fonte M3U cujo cabeçalho declara `url-tvg` apontando para um
   XMLTV comprimido, **When** a fonte é importada, **Then** o EPG é obtido e
   o "Agora" aparece como no cenário 1.
5. **Given** o EPG sincronizado e o aparelho sem rede, **When** a pessoa
   reabre o app e entra na TV ao vivo, **Then** o "Agora" continua aparecendo
   a partir do que está guardado.
6. **Given** uma fonte importada antes desta feature (canais gravados sem id
   de EPG), **When** a pessoa entra numa categoria de canais, **Then** a
   categoria é renovada e passa a mostrar o "Agora", sem ação extra.

---

### User Story 2 - Configurar e acompanhar o EPG da fonte (Priority: P1)

Em Configurações › Fontes IPTV, a pessoa vê o estado do EPG de cada fonte e,
pelo botão "EPG", consegue informar um endereço XMLTV (quando a lista não
declara um, ou declara um ruim), ajustar o deslocamento de horário, forçar
uma sincronização ou desativar o EPG.

**Why this priority**: sem isso, uma fonte M3U sem `url-tvg` nunca teria EPG,
um provedor com horário errado seria inutilizável, e uma falha de download
ficaria invisível. É também o que remove o mock `settings-epg`.

**Independent Test**: numa fonte M3U sem `url-tvg`, abrir o painel de EPG,
informar um endereço XMLTV de teste, sincronizar, ver o estado virar "EPG
vinculado" e o "Agora" aparecer na TV ao vivo; aplicar +1 h e ver o
programa atual mudar coerentemente.

**Acceptance Scenarios**:

1. **Given** uma fonte sem endereço XMLTV detectado nem informado, **When** a
   pessoa abre Configurações › Fontes IPTV, **Then** a linha da fonte mostra
   "EPG não configurado" e o botão "EPG" é real (não mais "Em breve").
2. **Given** o painel de EPG aberto, **When** a pessoa informa um endereço
   XMLTV válido e confirma, **Then** o app sincroniza, mostra "Sincronizando
   EPG" durante o processo e "EPG vinculado" com a data da última
   sincronização ao terminar.
3. **Given** um endereço que falha (rede, resposta que não é XMLTV, arquivo
   ilegível), **When** a sincronização termina, **Then** o estado mostra o
   erro com o que aconteceu, uma ação primária "Tentar novamente" focável e
   o código `EPG-02`; a programação anterior, se havia, continua em uso; o
   catálogo da fonte não é afetado.
4. **Given** um deslocamento de +1 h aplicado, **When** a pessoa volta à TV ao
   vivo, **Then** todos os horários e o programa "Agora" daquela fonte
   refletem o deslocamento, sem novo download.
5. **Given** o EPG vinculado, **When** a pessoa escolhe "Desativar EPG" e
   confirma, **Then** a programação guardada daquela fonte é apagada, o
   estado vira "EPG desativado", nenhum download automático acontece, e os
   slots "Agora" daquela fonte ficam vazios; "Ativar EPG" reverte.
6. **Given** um endereço detectado da fonte, **When** a pessoa informa um
   manual, **Then** o manual passa a valer; ao limpar o manual, volta o
   detectado.
7. **Given** qualquer estado do painel, **When** ele é exibido, **Then** o
   endereço mostrado nunca expõe usuário, senha ou token da fonte.

---

### User Story 3 - "Agora" e "A seguir" no preview da Live TV (Priority: P2)

Com um canal focado, o painel de preview mostra o programa atual com
horário, progresso e sinopse curta, e logo abaixo o que vem a seguir.

**Why this priority**: aprofunda a decisão de qual canal assistir; depende
da base da US1, mas é independente das demais superfícies.

**Independent Test**: focar um canal com EPG e conferir título, horário
início–fim, progresso, sinopse truncada (quando existir) e "A seguir";
focar canal sem EPG e conferir que a área fica vazia.

**Acceptance Scenarios**:

1. **Given** um canal focado com EPG, **When** o preview atualiza, **Then**
   mostra "Agora": título, horário (ex.: "20:00 – 21:30"), progresso e até
   ~3 linhas de sinopse quando o XMLTV trouxer uma; e "A seguir": título e
   horário do próximo programa, quando houver.
2. **Given** um canal sem EPG, **When** focado, **Then** a área de
   programação fica vazia, sem rótulo "Agora"/"A seguir" solto.
3. **Given** focar canais em sequência rápida, **When** o foco passa, **Then**
   nenhuma requisição de rede é disparada (a programação já está no
   aparelho).

---

### User Story 4 - Programa atual no player Live e na Home (Priority: P3)

Assistindo a um canal em tela cheia, a banda que aparece ao entrar e a cada
troca de canal mostra o programa em exibição e seu progresso. Na Home, os
cards de "Canais favoritos" mostram o que está passando em cada um.

**Why this priority**: completa o "Agora em todo lugar", mas cada superfície
é um acréscimo sobre a US1.

**Independent Test**: abrir um canal com EPG em tela cheia e ver o programa
na banda; trocar de canal por ↑/↓ e ver a banda atualizar para o programa do
novo canal; na Home, ver o programa em cada card de canal favorito com EPG.

**Acceptance Scenarios**:

1. **Given** um canal com EPG tocando, **When** a banda aparece (entrada ou
   troca de canal), **Then** mostra título e progresso do programa atual.
2. **Given** um canal sem EPG tocando, **When** a banda aparece, **Then** ela
   mostra só o que já mostrava (número, logo, nome), sem espaço de programa.
3. **Given** a rail "Canais favoritos" na Home, **When** exibida, **Then**
   cada card de canal com EPG mostra o programa atual; os demais ficam como
   hoje.

---

### Edge Cases

- XMLTV muito grande (dezenas de MB, milhares de canais): a leitura não pode
  congelar a navegação; a interface continua respondendo ao controle
  durante toda a sincronização.
- XMLTV com programas sobrepostos ou com lacunas no mesmo canal: em lacuna,
  o slot "Agora" fica vazio (nunca estica o programa anterior); em
  sobreposição, vale o de início mais recente que já começou.
- Programa sem título: não é exibido (slot vazio), nunca "Sem título".
- Horário do XMLTV sem fuso declarado: tratado como UTC, sujeito ao
  deslocamento manual da fonte.
- Espaço do aparelho esgota durante a gravação: sincronização falha com erro
  declarado, programação anterior preservada.
- Sincronização em andamento quando a pessoa troca de fonte ativa, exclui a
  fonte ou desativa o EPG: o resultado daquela sincronização é descartado,
  nada é gravado para uma fonte removida/desativada.
- Duas sincronizações da mesma fonte disparadas juntas (abertura do app +
  "Sincronizar agora"): só uma roda.
- EPG vencido (mais de 12 h) e sem rede: continua exibindo o que ainda cabe
  na janela guardada; quando a janela acaba, os slots ficam vazios — nunca
  mostra programa já encerrado como "Agora".
- Relógio do aparelho visivelmente errado: fora de escopo corrigir; o
  progresso reflete o relógio do aparelho.
- Endereço XMLTV informado pela pessoa com espaços/formato inválido: rejeitado
  no painel antes de tentar baixar, com mensagem clara e foco preservado.
- XMLTV do painel Xtream devolvendo vazio ou erro de autenticação: estado de
  erro `EPG-02`, sem expor a URL com credencial em mensagem ou log.
- Canal com id de EPG que aparece em mais de uma categoria (inclusive
  "Todos"/"★ Favoritos"): mesma programação em todos os lugares.

## Requirements *(mandatory)*

### Functional Requirements

**Obtenção e armazenamento (42a)**

- **FR-001**: O sistema DEVE determinar o endereço XMLTV de cada fonte nesta
  ordem: (1) endereço manual informado pela pessoa; (2) endereço XMLTV do
  painel Xtream, com a credencial da fonte, para fonte Xtream ou M3U
  confirmada como painel (feature 014); (3) `url-tvg`/`x-tvg-url` do
  cabeçalho da lista M3U. Sem nenhum, o estado é "EPG não configurado".
- **FR-002**: O sistema DEVE aceitar XMLTV puro e comprimido em gzip,
  reconhecendo a compressão pelo conteúdo.
- **FR-003**: O sistema DEVE ler o XMLTV de forma incremental e fora da
  thread da interface, mantendo a navegação por controle remoto responsiva
  durante toda a sincronização.
- **FR-004**: O sistema DEVE guardar, por fonte, somente os programas que se
  sobrepõem à janela de 12 h antes a 48 h depois do momento da
  sincronização, com: id do canal no XMLTV, início, fim, título e, quando
  existir, sinopse. Cada sincronização bem-sucedida DEVE substituir por
  inteiro a programação anterior daquela fonte.
- **FR-005**: Uma sincronização que falhe DEVE preservar a programação
  anterior da fonte e nunca afetar o catálogo (categorias, canais, filmes,
  séries, favoritos, progresso).
- **FR-006**: O sistema DEVE capturar e guardar o id de EPG declarado para
  cada canal (`epg_channel_id` no Xtream, `tvg-id` no M3U) ao obter os itens
  de uma categoria de canais, pelos dois caminhos de importação (feature
  010 `on_demand` e feature 014 `stored`).
- **FR-007**: Categorias de canais gravadas antes desta feature, sem o id de
  EPG, DEVEM ser tratadas como vencidas e renovadas na próxima entrada da
  pessoa, pelo mesmo caminho da feature 010/014, sem pedir ação a ela.
- **FR-008**: A associação canal ↔ programação DEVE ser feita só por
  igualdade exata entre o id de EPG do canal e o id de canal do XMLTV.
  Nenhuma associação por nome.
- **FR-009**: O sistema DEVE sincronizar o EPG logo após importar ou
  ressincronizar uma fonte, e ao abrir o app quando a última sincronização
  bem-sucedida da fonte ativa tiver mais de 12 h — sempre em segundo plano,
  sem bloquear nenhuma tela.
- **FR-010**: O sistema DEVE garantir no máximo uma sincronização de EPG em
  andamento por fonte; um pedido enquanto outra roda reaproveita a que já
  roda.
- **FR-011**: O resultado de uma sincronização cuja fonte foi excluída, ou
  cujo EPG foi desativado durante a execução, DEVE ser descartado.
- **FR-012**: Excluir uma fonte DEVE apagar sua programação e sua
  configuração de EPG.
- **FR-013**: Credencial da fonte e o endereço XMLTV do painel com
  credencial NUNCA DEVEM aparecer em log, mensagem de erro, tela ou
  requisição a terceiros (constitution; ADR-008/ADR-010).
- **FR-014**: Horários DEVEM respeitar o fuso declarado em cada horário do
  XMLTV (UTC quando ausente) e ser exibidos no horário local do aparelho,
  somados ao deslocamento manual da fonte.

**Configurações (42a)**

- **FR-015**: A linha de fonte em Configurações › Fontes IPTV DEVE mostrar o
  estado do EPG: "EPG vinculado" (com data/hora da última sincronização),
  "EPG não configurado", "Sincronizando EPG", "EPG desativado" ou erro.
- **FR-016**: O botão "EPG" da linha de fonte DEVE abrir um painel real com:
  estado, origem do endereço (detectado da fonte ou manual), campo para
  informar/trocar/limpar o endereço manual, deslocamento de horário de −12 h
  a +12 h em passos de 1 h (padrão 0), "Sincronizar agora" e
  "Desativar EPG"/"Ativar EPG". O mock `settings-epg` DEVE ser removido de
  `comingSoon.ts`.
- **FR-017**: O endereço exibido no painel NUNCA DEVE revelar usuário, senha
  ou token; o endereço detectado de painel Xtream é descrito ("do painel da
  fonte"), não mostrado.
- **FR-018**: Um endereço manual com formato inválido DEVE ser rejeitado no
  próprio painel, antes de qualquer download, com mensagem e foco
  preservados no campo.
- **FR-019**: Uma falha de sincronização DEVE ser exibida seguindo o §45: o
  que aconteceu, por quê quando se sabe (rede, resposta que não é XMLTV,
  arquivo ilegível, espaço insuficiente), uma ação primária "Tentar
  novamente" focável, e o código `EPG-02`.
- **FR-020**: Mudar o deslocamento de horário DEVE refletir-se em todas as
  superfícies sem novo download.
- **FR-021**: "Desativar EPG" DEVE pedir confirmação (`Modal`), apagar a
  programação da fonte e suspender a sincronização automática até
  "Ativar EPG".
- **FR-022**: Todo estado do painel (inclusive sincronizando e erro) DEVE ter
  pelo menos um elemento focável, e RETURN fecha o painel devolvendo o foco
  ao botão "EPG" que o abriu.

**"Agora" nas superfícies (42b)**

- **FR-023**: A linha de canal (`ChannelRow`) DEVE mostrar título do programa
  atual e barra de progresso real (tempo decorrido ÷ duração) para canal com
  programa atual; sem programa atual, slot vazio e sem barra.
- **FR-024**: O FR-023 DEVE valer em toda lista de canais da Live TV:
  categorias, "★ Favoritos", "Todos", resultados de busca e lista de zapping
  sobre o vídeo.
- **FR-025**: O preview da Live TV DEVE mostrar, para o canal focado com EPG,
  "Agora" (título, horário início–fim, progresso, sinopse truncada em até 3
  linhas quando existir) e "A seguir" (título e horário) quando houver
  programa seguinte na janela guardada; sem EPG, a área fica vazia, sem
  rótulos soltos.
- **FR-026**: A banda do player Live (feature 027) DEVE mostrar título e
  progresso do programa atual do canal em reprodução, atualizados a cada
  troca de canal; sem EPG, a banda fica como hoje.
- **FR-027**: Cada card da rail "Canais favoritos" da Home DEVE mostrar o
  título do programa atual quando houver.
- **FR-028**: Enquanto uma superfície com "Agora" estiver visível, o
  programa exibido e o progresso DEVEM avançar com o tempo (no máximo 1
  minuto de atraso), trocando para o programa seguinte quando o atual
  termina.
- **FR-029**: Exibir, focar ou rolar canais NUNCA DEVE disparar requisição
  de rede para EPG — a programação vem só do que está guardado.
- **FR-030**: Programa sem título, lacuna na programação ou programa já
  encerrado NUNCA DEVEM gerar texto no slot ("Sem informação", "Sem
  título", programa anterior esticado) — o slot fica vazio.
- **FR-031**: Os botões "Guia completo" (preview) e "Guia" (chrome do
  player) DEVEM permanecer como mock "Em breve" (`epg-guide`).

### Key Entities

- **Configuração de EPG da fonte**: por fonte — endereço manual (opcional),
  deslocamento de horário, ativo/desativado, data da última sincronização
  bem-sucedida, último erro (código e motivo, sanitizado). O endereço
  detectado é derivado da fonte, não copiado.
- **Programa**: por fonte — id do canal no XMLTV, início, fim, título,
  sinopse opcional. Só dentro da janela guardada.
- **Canal (existente, estendido)**: ganha o id de EPG declarado pela fonte.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa fonte Xtream real com XMLTV do painel, o "Agora" aparece
  na TV ao vivo sem nenhuma configuração feita pela pessoa.
- **SC-002**: Com um XMLTV de referência grande (ordem de dezenas de MB),
  a navegação por setas na TV de referência continua respondendo durante
  toda a sincronização, sem congelamento perceptível.
- **SC-003**: Em 100% dos canais sem id de EPG, sem correspondência ou em
  lacuna de programação, o slot "Agora" fica vazio — nenhum texto inventado.
- **SC-004**: O programa exibido como "Agora" confere com o XMLTV de teste,
  para a hora do aparelho e o deslocamento aplicado, em todas as quatro
  superfícies.
- **SC-005**: Nenhuma credencial ou URL com credencial aparece em log,
  mensagem ou tela em qualquer caminho de sucesso ou erro do EPG.
- **SC-006**: Uma falha de sincronização nunca remove programação válida já
  guardada nem altera o catálogo.

## Assumptions

- O painel Xtream expõe XMLTV em `xmltv.php` com a mesma credencial, e o
  navegador da TV consegue baixá-lo diretamente (mesma premissa de CORS da
  ADR-008); se algum painel bloquear, esse caso fica documentado como risco,
  não resolvido pelo backend congelado.
- O navegador da TV (Chromium 108) oferece descompressão gzip por stream.
- O relógio do aparelho está correto.
- A fonte ativa é única (ADR-011); a sincronização automática ao abrir vale
  para ela, as demais sincronizam ao serem importadas/ressincronizadas ou
  pela ação manual.
- O parâmetro exato do Xtream para o id de EPG do canal é `epg_channel_id`
  (confirmar no `sdd-plan` contra um painel real, como a feature 024 fez com
  `num`).
- A programação cabe na quota de armazenamento da TV para a janela de 60 h;
  medir no `sdd-plan`/execução (item 51 trata do caso contrário).
- **Dados reais de teste**: o `.env` da raiz (gitignored) tem uma lista e um
  EPG reais (`CCPLAY_PROBE_USER`, `CCPLAY_PROBE_PASS`, `CCPLAY_PROBE_DNS`,
  `CCPLAY_PROBE_M3U`, `CCPLAY_PROBE_EPG`). Spikes (campo `epg_channel_id`,
  CORS do `xmltv.php`, tamanho/tempo de parse do XMLTV), E2E e a passada na
  TV DEVEM usá-los, lidos em tempo de execução — os valores nunca vão para
  spec, plano, fixture, commit ou log.

## Clarifications

### Sessão 2026-09-28

- Q: 42a e 42b viram uma feature só ou duas? → A: Uma feature (entrega #4),
  com P1 = dados + "Agora" na linha de canal e Configurações, P2 = preview,
  P3 = player Live e Home.
- Q: De onde vem o EPG de cada fonte? → A: XMLTV para todas — Xtream via
  endereço do painel com a mesma credencial; M3U via `url-tvg`/`x-tvg-url`
  ou endereço informado pela pessoa. `get_short_epg` fora.
- Q: A pessoa pode informar/trocar manualmente a URL XMLTV? → A: Sim, pelo
  botão "EPG" em Configurações (remove `settings-epg`), sem recriar a fonte.
- Q: Quando o EPG é baixado/atualizado? → A: Logo após importar/ressincronizar,
  ao abrir o app quando mais velho que 12 h (em segundo plano), e
  "Sincronizar agora" manual.
- Q: Qual janela guardar? → A: De 12 h antes a 48 h depois da sincronização;
  o resto do XMLTV é descartado.
- Q: Como associar canal ↔ programação? → A: Só por id exato
  (`epg_channel_id`/`tvg-id`); nunca por nome.
- Q: Ajuste de fuso? → A: Respeita o offset do XMLTV e oferece deslocamento
  manual por fonte (±N horas) em Configurações.
- Q: Quais superfícies mostram "Agora"? → A: Linha de canal da Live TV,
  preview (com "A seguir"), banda do player Live e rail "Canais favoritos"
  da Home.
- Q: Canais já gravados sem id de EPG? → A: Categoria tratada como vencida e
  renovada na próxima entrada, sem ação da pessoa.
- Q: Aceitar XMLTV gzip? → A: Sim, detectado pelo conteúdo.
- Q: Sinopse no preview? → A: Sim, truncada (~3 linhas), só quando existir.
- Q: Desativar EPG por fonte? → A: Sim, com confirmação; apaga a programação
  guardada e suspende downloads automáticos.
