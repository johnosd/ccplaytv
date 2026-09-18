# Feature Specification: Live TV com catálogo real e reprodução AVPlay

**Slug**: `003-live-tv-avplay`

**Created**: 2026-09-16

**Status**: Convergência Pendente

**Input**: "Fatia vertical de Live TV: tela de canais lendo o catálogo real
importado (substituindo mockCatalog) + PlayerService/AVPlay reproduzindo um
canal de verdade na TV. Escopo fino, deliberadamente só canais ao vivo (não
depende do conector Xtream). Objetivo duplo: matar o mock da tela mais
simples e executar a porta de validação V1 da ADR-006 (AVPlay nunca foi
testado em hardware)."

## Escopo

Esta é uma **fatia vertical fina**: atravessa backend, frontend e hardware,
mas cobre só canais ao vivo. O valor não está no tamanho — está em provar,
ponta a ponta, que o catálogo importado leva a vídeo tocando na TV-alvo.

### Incluído

- Tela de Live TV lendo os canais reais da fonte em que o usuário entrou
  (`kind=channel`), organizados pelos grupos declarados pela própria fonte,
  substituindo por completo `tv-web/src/features/catalog/mockCatalog.ts` no
  caminho de canais.
- Obtenção da informação de reprodução de um canal **no momento de
  reproduzir**, não embutida na listagem comum do catálogo.
- `PlayerService` como abstração de reprodução, com adaptador AVPlay para a
  TV e adaptador `<video>` para desenvolvimento no navegador.
- Reprodução em tela cheia: Enter num canal abre o player; RETURN encerra a
  sessão e volta à lista com o foco restaurado no canal de origem.
- Estados explícitos da sessão de reprodução: preparando, carregando,
  reproduzindo e erro.
- Tratamento mínimo de falha de reprodução: mensagem sanitizada com duas
  ações focáveis (tentar de novo / voltar à lista), sem retentativa
  automática em ciclo.
- Painel direito da tela de canais mostrando informação estática do canal em
  foco (slot de logo, nome, grupo, slot vazio de "Agora:"), substituindo a
  prévia de ruído estático atual.
- Canais sem URL de reprodução aparecem na lista, focáveis, sinalizados como
  indisponíveis.
- Teto temporário na quantidade de canais renderizados por grupo, com aviso
  visível quando o grupo for truncado.

### Fora de Escopo

- **Filmes e Séries** — continuam lendo `mockCatalog.ts`. Esta fatia não os
  toca.
- **Conector Xtream JSON (`player_api.php`)** — a feature opera sobre o
  catálogo que a importação atual já produz. É deliberado: canais ao vivo não
  dependem desse conector, e mantê-lo fora é o que torna esta fatia
  executável agora (backlog, Fase 0 item 1).
- **Virtualização de lista e navegação por Norigin** — backlog item 7. Aqui
  entra apenas o teto temporário descrito acima.
- **Controles de player na tela** — play/pause, saltos de ±10 s, barra de
  progresso e ocultação após 5 s ficam para depois (guia Samsung 06).
  Transmissão ao vivo sem janela DVR não teria busca temporal de qualquer
  forma.
- **Diagnóstico de reprodução com causas distinguidas** (rede × codec ×
  fonte expirada) e ações ranqueadas — backlog item 20.
- **Logo real do canal** — o parser lê `tvg-logo`, mas o `CatalogItem` não o
  persiste. Guardar e exibir o logo exigiria migração de banco; aqui só o
  slot é reservado. Backlog item 16.
- **EPG / "Agora:"** com dado real — o slot nasce vazio no layout; a fonte de
  dados é o backlog item 44, ainda em `A avaliar`.
- **Favoritos, histórico e busca em canais** — backlog itens 12, 13 e 14.
- **Ciclo de vida completo do player** (screensaver, `visibilitychange`,
  troca rápida de canal sem sessões sobrepostas) — backlog item 11. Esta
  fatia encerra a sessão em RETURN; não cobre suspensão do app.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver os canais que realmente importei (Priority: P1)

Como usuário que já cadastrou uma lista e entrou nela, abro Live TV e vejo
os grupos e canais que vieram da minha fonte — não um catálogo de exemplo.

**Why this priority**: sem isso o resto da tela é decoração. É também a
única parte que continua entregando valor se a reprodução na TV falhar por
incompatibilidade de mídia.

**Independent Test**: com uma fonte importada com sucesso e pelo menos um
canal publicado, entrar em Live TV e conferir que os nomes de grupo e de
canal correspondem aos da fonte, navegáveis só por controle remoto.

**Acceptance Scenarios**:

1. **Given** uma fonte com canais publicados, **When** o usuário abre Live
   TV, **Then** a coluna de grupos mostra os grupos declarados pela fonte, na
   ordem em que a fonte os declarou, e a coluna de canais mostra os canais do
   grupo selecionado.
2. **Given** canais importados sem grupo declarado, **When** a tela é
   montada, **Then** eles aparecem agrupados em "Sem categoria", sem receber
   um grupo inventado.
3. **Given** o usuário movendo o foco entre canais, **When** um canal recebe
   foco, **Then** o painel direito mostra nome e grupo desse canal — e
   **nenhuma reprodução é iniciada**.
4. **Given** um grupo com mais canais que o teto de renderização, **When** o
   usuário abre esse grupo, **Then** a lista mostra os primeiros canais até o
   teto e exibe um aviso visível de que a lista está truncada.

---

### User Story 2 - Assistir a um canal de verdade (Priority: P1)

Como usuário, seleciono um canal e ele começa a tocar em tela cheia na minha
TV; ao apertar Voltar, retorno à lista exatamente onde estava.

**Why this priority**: é a razão de existir do aplicativo e a hipótese
técnica nunca verificada do projeto. Um catálogo bonito que não reproduz não
é um produto.

**Independent Test**: na TV física, com uma fonte real importada, selecionar
um canal compatível e confirmar vídeo e áudio; apertar Voltar e confirmar
que o foco retorna ao mesmo canal.

**Acceptance Scenarios**:

1. **Given** um canal com URL de reprodução, **When** o usuário pressiona
   Enter, **Then** o player abre em tela cheia e a sessão passa pelos estados
   preparando → carregando → reproduzindo.
2. **Given** um canal reproduzindo em tela cheia, **When** o usuário
   pressiona RETURN, **Then** a sessão de reprodução é encerrada, o áudio
   para imediatamente e a tela volta à lista com o foco no canal de origem e
   o grupo anterior ainda selecionado.
3. **Given** a lista de canais, **When** o usuário move o foco entre canais
   sem pressionar Enter, **Then** nenhuma sessão de reprodução é criada e
   nenhuma requisição de informação de reprodução é disparada.

---

### User Story 3 - Entender quando não dá para assistir (Priority: P2)

Como usuário, quando um canal não reproduz, entendo que falhou e consigo
sair dali pelo controle remoto, sem o aplicativo travar ou me prender.

**Why this priority**: streams IPTV falham com frequência, e uma tela de
erro sem saída focável inutiliza o controle. Mas o fluxo feliz (P1) entrega
valor antes disso existir.

**Independent Test**: apontar um canal para uma URL inválida e confirmar que
a falha aparece como mensagem, com as duas ações alcançáveis pelo D-pad.

**Acceptance Scenarios**:

1. **Given** um canal cuja reprodução falha, **When** o erro ocorre, **Then**
   a tela mostra uma mensagem de falha com as ações "Tentar de novo" e
   "Voltar", ambas focáveis, e o foco inicial cai numa delas.
2. **Given** a mensagem de falha exibida, **When** o usuário escolhe
   "Voltar", **Then** ele retorna à lista com o foco no canal que tentou
   abrir.
3. **Given** um canal sem URL de reprodução no catálogo, **When** o usuário
   pressiona Enter sobre ele, **Then** o aplicativo explica que o canal está
   indisponível, sem tentar abrir o player.
4. **Given** qualquer falha de reprodução, **When** a mensagem é montada ou
   registrada, **Then** ela não contém a URL do stream, o endereço do
   provedor nem credenciais.

---

### Edge Cases

- **Fonte sem nenhum canal** (só filmes, ou importação que não classificou
  canais): Live TV mostra um estado vazio explicativo com pelo menos uma ação
  focável, nunca uma tela morta.
- **Importação ainda em andamento**: a tela mostra os canais já publicados
  (o backend já filtra por `published`), e o catálogo parcial não é
  apresentado como completo. Nesta fatia isso é obtido **por omissão** — a
  tela não exibe contagem total nem indicação de "fim do catálogo" —, não por
  um indicador de importação em andamento. Ver FR-016. Um aviso ativo de
  "importando agora" dependeria de a API dizer se há job em execução para a
  fonte, e fica fora desta feature.
- **Falha ao buscar os canais** (backend fora do ar): estado de erro com ação
  focável de tentar de novo, sem tratar a falha como "fonte sem canais" e sem
  carregamento infinito.
- **Grupo vazio** depois de selecionado: mensagem de grupo vazio distinta do
  estado "nenhum canal na fonte".
- **RETURN pressionado durante o estado "preparando"**, antes de o vídeo
  começar: a sessão é cancelada e a tela volta à lista, sem deixar áudio nem
  sessão pendente.
- **Enter pressionado repetidamente** sobre o mesmo canal: uma única sessão
  de reprodução é criada.
- **Canal cuja URL responde mas cujo formato o AVPlay não suporta**: cai no
  fluxo de falha da User Story 3 (esta fatia não distingue a causa).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela de Live TV DEVE listar os canais publicados da fonte em
  que o usuário entrou, obtidos do catálogo importado, e NÃO DEVE usar dados
  de exemplo.
- **FR-002**: Os canais DEVEM ser agrupados pelos grupos declarados pela
  fonte, preservando nome e ordem de declaração; canais sem grupo DEVEM
  aparecer em "Sem categoria".
- **FR-003**: Mover o foco entre canais DEVE apenas selecionar — NÃO DEVE
  iniciar reprodução nem disparar consulta de informação de reprodução.
- **FR-004**: Pressionar Enter sobre um canal reproduzível DEVE iniciar a
  reprodução em tela cheia.
- **FR-005**: A informação de reprodução de um canal DEVE ser obtida no
  momento da reprodução e NÃO DEVE ser devolvida nas listagens comuns do
  catálogo.
- **FR-006**: A reprodução DEVE passar por uma abstração de serviço de
  player, com implementação AVPlay na TV e implementação alternativa para o
  navegador de desenvolvimento; as telas NÃO DEVEM chamar a API do player
  diretamente.
- **FR-007**: A sessão de reprodução DEVE expor estados distinguíveis de
  preparando, carregando, reproduzindo e erro; um estado de carregamento NÃO
  DEVE encobrir uma falha.
- **FR-008**: Pressionar RETURN durante a reprodução DEVE encerrar a sessão,
  interromper o áudio e retornar à lista.
- **FR-009**: Ao retornar do player, o foco DEVE ser restaurado no canal que
  originou a reprodução, com o mesmo grupo ainda selecionado.
- **FR-010**: Uma falha de reprodução DEVE ser apresentada com pelo menos
  duas ações focáveis (tentar de novo e voltar), sem retentativa automática
  em ciclo.
- **FR-011**: Mensagens de erro, estados de interface e registros de log NÃO
  DEVEM conter a URL do stream, o endereço do provedor ou credenciais.
- **FR-012**: Canais sem URL de reprodução DEVEM permanecer visíveis e
  focáveis na lista, sinalizados como indisponíveis; Enter sobre eles DEVE
  explicar a indisponibilidade em vez de abrir o player.
- **FR-013**: Todo estado da tela — carregando, vazio, grupo vazio, erro de
  carga e erro de reprodução — DEVE conter pelo menos um elemento focável.
- **FR-014**: A quantidade de canais renderizados por grupo DEVE ter um teto,
  e a interface DEVE avisar visivelmente quando a lista estiver truncada.
- **FR-015**: O painel de informação do canal em foco DEVE exibir nome e
  grupo, com área reservada para logo e para a informação de "Agora:", sem
  alterar a geometria da tela quando esses dados estiverem ausentes.
- **FR-016**: A tela NÃO DEVE exibir contagem total de canais nem qualquer
  indicação de "fim do catálogo" que sugira completude, já que uma importação
  pode estar em andamento e o catálogo publicado ser parcial. O aviso de
  lista truncada do FR-014 é sobre o teto de renderização e DEVE ser
  distinguível de "isto é tudo que a fonte tem".

### Key Entities

Nenhuma entidade nova. A feature consome `CatalogItem` (`kind=channel`,
campos `name`, `original_group`, `playback_url`, `published`) e `Source`,
ambas existentes desde a feature 001. A **sessão de reprodução** é um
conceito de tempo de execução no cliente, não uma entidade persistida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um canal da fonte real reproduz com vídeo e áudio na TV-alvo, e
  a evidência registrada inclui modelo, firmware, contêiner/codec observado e
  a sequência de comandos usada.
- **SC-002**: Nenhum canal, grupo ou contagem exibido em Live TV vem de dados
  de exemplo — 100% da tela reflete a fonte importada.
- **SC-003**: Voltar do player devolve o foco ao canal de origem em 100% das
  tentativas, sem reiniciar a lista do topo.
- **SC-004**: Nenhum estado da tela, incluindo os de falha, deixa o controle
  remoto sem ação possível.
- **SC-005**: Nenhuma URL de stream, endereço de provedor ou credencial
  aparece em tela ou em log durante um ciclo completo de sucesso e de falha.
- **SC-006**: Mover o foco por toda a lista de um grupo não dispara nenhuma
  requisição de reprodução.

## Assumptions

- A fonte de teste já importada produz pelo menos um canal com
  `playback_url` preenchida e formato compatível com o AVPlay. **Se nenhum
  canal reproduzir**, o resultado ainda é válido como execução da porta V1 —
  a feature registra a incompatibilidade como evidência em vez de ser
  declarada concluída.
- As credenciais da fonte de teste estão válidas no momento da verificação.
  O arquivo local `docs/m3u/dados.md` guarda as credenciais de teste em texto
  puro; ele é gitignored e nunca foi commitado (resolvido na feature 001),
  então não há exposição a remediar — mas seus valores continuam proibidos em
  código, fixtures, specs e commits.
- O teto de canais por grupo é uma salvaguarda temporária desta fatia, não um
  limite de produto — sai quando a virtualização (backlog item 7) entrar.
- A tela continua operando no escopo da fonte em que o usuário entrou pela
  Home, como já acontece hoje; visão agregada de múltiplas fontes não faz
  parte desta feature.
- "Canal ao vivo" significa `CatalogItem` com `kind=channel`, conforme a
  classificação atual do importador — esta feature não altera regras de
  classificação.

## Clarifications

### Sessão 2026-09-16

- Q: Até onde vai o player nesta fatia? → A: Mínimo — tela cheia, RETURN
  volta e restaura o foco. Sem barra de controles, sem play/pause (item 11 e
  guia Samsung 06 ficam para depois).
- Q: Lista de canais: virtualizar agora ou depois? → A: Depois. Nesta fatia,
  teto temporário de canais por grupo com aviso visível; virtualização
  completa no item 7 do backlog, junto com Norigin.
- Q: Logo dos canais entra agora? → A: Não. Só nome, com o slot de logo
  reservado no layout — persistir `tvg-logo` exigiria migração de banco e
  fica fora desta fatia.
- Q: O que fecha a feature? → A: Canal tocando na TV física (Q60D), com
  evidência registrada. É a porta V1 da ADR-006, até aqui "não executada".
- Q: O painel direito (hoje prévia de ruído) — o que vira? → A: Informação
  estática do canal em foco (slot de logo + nome + grupo + slot vazio de
  "Agora:"), sem vídeo.
- Q: Falha ao reproduzir: até onde tratar? → A: Mínimo com saída focável —
  mensagem sanitizada + "tentar de novo" e "voltar". Distinguir rede × codec
  × fonte expirada fica no item 20 do backlog.
- Q: Canal sem URL de reprodução: o que fazer? → A: Mostrar na lista como
  indisponível, focável; Enter explica em vez de tentar abrir o player.
