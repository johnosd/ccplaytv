# Feature Specification: Importação de Fonte M3U por URL e por Provedor

**Slug**: `001-importacao-fonte-m3u`

**Created**: 2026-09-14

**Status**: Convergida

**Input**: Importação de fonte M3U por URL e por credenciais de provedor (DNS,
usuário, senha), com ImportJob acompanhável e catálogo básico classificado em
canal, filme, série/episódio e não classificado.

## Escopo

### Incluído

- Tela "Adicionar fonte" com alternância entre duas entradas: URL de lista
  M3U (RF-003) e endereço do servidor/DNS do provedor + usuário + senha
  (RF-005).
- Criação de um `ImportJob` acompanhável por fonte adicionada, com estados
  (`queued`, `running`, `completed`, `completed_with_warnings`, `failed`,
  `cancelled`) e etapa atual visível.
- Tela de progresso com contadores reais (entradas lidas, canais, filmes,
  séries únicas, episódios, não classificados, inválidos).
- Classificação de cada entrada em **Canal**, **Filme**, **Série** (com
  episódios agrupados sob a série correta) ou **Não Classificado**.
- Cancelamento de um job em andamento pela tela de progresso.
- Publicação de um catálogo básico assim que lotes coerentes estiverem
  prontos, mesmo com enriquecimento externo (capas, TMDB, IMDb) pendente.
- Consulta do estado do job após fechar e reabrir a tela.
- Tratamento de erro específico para URL inválida, resposta não-M3U,
  lista vazia, autenticação de provedor inválida e falha de rede.

### Fora de Escopo

- Adicionar fonte por arquivo `.m3u` selecionado/enviado na TV (RF-004) —
  item separado no backlog.
- Reimportar/atualizar uma fonte já existente sem duplicar catálogo ou
  apagar favoritos/histórico (RF-007) — item 13 do backlog, feature futura.
- Telas de navegação do catálogo resultante (grid de canais, filmes, séries)
  — features separadas no backlog (itens 4, 5 e 6).
- Enriquecimento com TMDB, capas externas, IMDb ou recomendações.
- Retry automático de rede (esta versão usa apenas nova tentativa manual).
- Múltiplas fontes simultâneas com resolução de conflito de categorias
  homônimas entre fontes diferentes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adicionar fonte por URL M3U (Priority: P1)

Como pessoa configurando o CCPlay pela primeira vez, quero informar a URL de
uma lista M3U e acompanhar a importação, para ter canais, filmes e séries
disponíveis para assistir sem precisar entender detalhes técnicos do
processo.

**Why this priority**: É o caminho mais simples de entrada de conteúdo e a
base de tudo — sem uma fonte importada não há catálogo para nenhuma outra
feature exibir. Entrega valor sozinha mesmo sem a entrada por provedor.

**Independent Test**: Informar uma URL M3U válida e de teste, confirmar, e
verificar que o job avança de `queued` a `completed`/`completed_with_warnings`
com contadores reais e catálogo básico consultável ao final.

**Acceptance Scenarios**:

1. **Given** a tela "Adicionar fonte" aberta, **When** a pessoa escolhe a
   opção URL, informa um nome de exibição e uma URL M3U válida e confirma,
   **Then** um `ImportJob` é criado em estado `queued`/`running` e a tela de
   progresso mostra etapa e contadores reais.
2. **Given** um job em execução, **When** a importação termina sem erros,
   **Then** o estado muda para `completed`, todas as entradas lidas aparecem
   classificadas em uma das quatro categorias, e o catálogo básico fica
   disponível para consulta.
3. **Given** uma URL que responde com HTML de erro ou conteúdo vazio,
   **When** a pessoa confirma a adição, **Then** o sistema reporta um erro
   específico e não marca a importação como bem-sucedida.
4. **Given** o campo de nome de exibição vazio, **When** a pessoa tenta
   confirmar, **Then** o sistema impede o envio e indica que o nome é
   obrigatório.

---

### User Story 2 - Adicionar fonte por provedor (DNS/usuário/senha) (Priority: P2)

Como pessoa que já tem acesso a um serviço IPTV com login, quero informar o
endereço do servidor, usuário e senha, para importar o catálogo desse
serviço do mesmo jeito que importaria por URL.

**Why this priority**: Segunda forma de entrada confirmada como requisito
(RF-005), mas depende do mesmo mecanismo de `ImportJob` da User Story 1 —
entrega valor incremental sem alterar o que já funciona por URL.

**Independent Test**: Informar endereço, usuário e senha de um provedor de
teste autorizado, confirmar, e verificar que o mesmo fluxo de `ImportJob` e
catálogo básico se aplica, com erros de autenticação tratados
especificamente.

**Acceptance Scenarios**:

1. **Given** a tela "Adicionar fonte" aberta, **When** a pessoa alterna para
   a opção de provedor, informa endereço do servidor, usuário, senha e nome
   de exibição, e confirma, **Then** um `ImportJob` é criado e a tela de
   progresso mostra etapa e contadores reais, como na entrada por URL.
2. **Given** usuário ou senha inválidos, **When** a pessoa confirma a
   adição, **Then** o sistema reporta erro de autenticação específico, sem
   expor a senha em logs ou mensagens, e sem afetar outras fontes já
   configuradas.
3. **Given** um endereço de servidor que não fala o protocolo esperado,
   **When** a importação tenta iniciar, **Then** o sistema reporta
   incompatibilidade de protocolo de forma clara, sem tentar portas ou
   caminhos arbitrários para contornar o problema.

---

### User Story 3 - Cancelar uma importação em andamento (Priority: P3)

Como pessoa que iniciou uma importação por engano ou percebeu um erro nos
dados informados, quero cancelar o job em andamento, para não esperar uma
importação que não é mais necessária.

**Why this priority**: Melhoria de controle sobre um fluxo que já funciona
nas User Stories 1 e 2; não bloqueia o valor central de importar e publicar
catálogo, mas evita frustração em importações longas ou equivocadas.

**Independent Test**: Iniciar uma importação (por URL ou provedor), acionar
"Cancelar" na tela de progresso, e verificar que o job muda para `cancelled`
somente após o job reconhecer a solicitação, sem deixar itens parcialmente
gravados visíveis como prontos para reprodução.

**Acceptance Scenarios**:

1. **Given** um `ImportJob` em estado `running`, **When** a pessoa aciona
   "Cancelar" na tela de progresso, **Then** a interface indica que o
   cancelamento foi solicitado e só confirma `cancelled` quando o job
   reconhece a solicitação.
2. **Given** um job cancelado após publicar parte dos lotes, **When** a
   pessoa consulta o catálogo, **Then** nenhum item do lote incompleto
   aparece como pronto para reprodução.

---

### Edge Cases

- URL aponta para um manifesto de streaming (HLS) em vez de uma playlist de
  catálogo — o sistema não deve importar segmentos como se fossem centenas
  de canais.
- Lista M3U sintaticamente válida, mas sem nenhuma entrada — reportar
  catálogo vazio, não erro genérico nem "sucesso" enganoso.
- Duplo envio acidental do mesmo pedido de adicionar fonte (ex.: reenvio de
  rede) — não deve criar dois `ImportJob`/fontes duplicadas para o mesmo
  pedido.
- Fechar a tela de progresso e reabri-la depois que o job já terminou
  (`completed`, `failed` ou `cancelled`) enquanto a tela estava fechada —
  deve mostrar o estado final real, não reiniciar a consulta do zero.
- Falha de rede no meio da aquisição da lista — reportar erro específico e
  oferecer nova tentativa manual (sem retry automático nesta versão).
- Evidência insuficiente para classificar uma entrada como canal, filme ou
  série — vai para "Não Classificado", sem hierarquia inventada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE permitir adicionar uma fonte informando URL de
  uma lista M3U e um nome de exibição obrigatório.
- **FR-002**: Sistema DEVE permitir adicionar uma fonte informando endereço
  do servidor (DNS do provedor), usuário, senha e um nome de exibição
  obrigatório.
- **FR-003**: Sistema DEVE apresentar as duas formas de entrada (URL e
  provedor) na mesma tela, com alternância entre elas.
- **FR-004**: Sistema DEVE criar um `ImportJob` associado à fonte
  imediatamente após validação inicial dos dados de entrada; a criação do
  job não significa que o catálogo já foi importado.
- **FR-005**: Sistema DEVE expor o estado do job (`queued`, `running`,
  `completed`, `completed_with_warnings`, `failed`, `cancelled`) e uma etapa
  atual, como campos distintos.
- **FR-006**: Sistema DEVE mostrar contadores reais e distintos de entradas
  lidas, canais, filmes, séries únicas, episódios, itens não classificados e
  itens inválidos, sem somá-los como se fossem a mesma unidade.
- **FR-007**: Sistema NÃO DEVE exibir percentual quando o denominador de uma
  etapa não for conhecido; nesse caso, DEVE usar indicador indeterminado com
  contagem visível.
- **FR-008**: Sistema DEVE classificar cada entrada lida em Canal, Filme,
  Série (com episódios agrupados sob a série correta) ou Não Classificado,
  com base em evidências (grupo de origem, IDs do provedor quando houver,
  padrões de nome). Entradas sem evidência suficiente vão para Não
  Classificado, sem hierarquia inventada.
- **FR-009**: Sistema NÃO DEVE tratar um manifesto de streaming (ex.: HLS)
  recebido como entrada como se fosse uma lista de canais a importar.
- **FR-010**: Sistema DEVE permitir cancelar um job em andamento pela tela
  de progresso; o cancelamento só é confirmado como `cancelled` quando o job
  reconhece a solicitação.
- **FR-011**: Sistema DEVE publicar um catálogo básico assim que lotes
  coerentes estiverem prontos, mesmo com enriquecimento externo pendente;
  nenhum item de um lote parcialmente gravado DEVE aparecer como pronto para
  reprodução.
- **FR-012**: Sistema DEVE permitir consultar o estado real do job após
  fechar e reabrir a tela de progresso, sem depender de manter a tela
  aberta continuamente.
- **FR-013**: Sistema DEVE reportar um erro específico — nunca "importação
  bem-sucedida" — quando a URL for inválida, a resposta não for um M3U
  válido (ex.: HTML de erro), a lista estiver vazia, ou a autenticação do
  provedor falhar.
- **FR-014**: Sistema NÃO DEVE registrar credenciais do provedor, a senha
  ou a URL completa da fonte em logs ou em respostas comuns do catálogo.
- **FR-015**: Sistema DEVE tratar falha de rede na aquisição da lista como
  erro específico e recuperável, oferecendo nova tentativa manual (sem
  retry automático nesta versão).
- **FR-016**: Sistema DEVE isolar falha de uma fonte (autenticação inválida,
  indisponibilidade, protocolo incompatível) sem afetar outras fontes já
  configuradas nem provocar perda de dados de outra fonte.
- **FR-017**: Sistema DEVE validar a URL informada contra SSRF — protocolos
  permitidos, verificação do destino após resolução e a cada redirecionamento,
  limite de tempo/tamanho, e bloqueio de destinos internos por padrão.
- **FR-018**: Sistema DEVE evitar criar fonte/job duplicados quando o mesmo
  pedido de adição for reenviado (ex.: reenvio de rede) para a mesma
  submissão.

### Key Entities

- **Source**: origem de conteúdo adicionada pela pessoa — tipo (`m3u_url` ou
  `provider_credentials`), nome de exibição, estado de conexão/importação,
  data da última atualização bem-sucedida.
- **ImportJob**: trabalho de importação associado a uma `Source` — estado,
  etapa atual, contadores por categoria, avisos sanitizados, referência à
  submissão que o originou (para evitar duplicidade).
- **CatalogItem**: item resultante da importação já classificado (canal,
  filme, série, episódio ou não classificado), com proveniência (fonte de
  origem e grupo/categoria original preservados).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa consegue adicionar uma fonte válida por URL e ver o
  catálogo básico publicado, sem precisar entender termos técnicos de
  importação.
- **SC-002**: Uma pessoa consegue adicionar uma fonte válida por provedor
  (DNS/usuário/senha) e obter o mesmo resultado da entrada por URL.
- **SC-003**: 100% das entradas lidas de uma fonte válida terminam
  classificadas em uma das quatro categorias (Canal/Filme/Série/Não
  Classificado) — nenhuma entrada desaparece silenciosamente do relatório
  final do job.
- **SC-004**: Uma fonte inválida (URL quebrada, credencial incorreta, lista
  vazia) nunca é apresentada como "importação concluída com sucesso".
- **SC-005**: Cancelar um job em andamento resulta em estado `cancelled`
  reconhecido pela interface, sem deixar itens de lotes incompletos
  visíveis como prontos para reprodução.
- **SC-006**: Reabrir a tela de progresso depois de fechá-la mostra o
  estado real e atualizado do job, sem exigir reiniciar a importação do
  zero.

## Assumptions

- Falha de rede na aquisição da lista tem apenas nova tentativa manual
  nesta versão; retry automático com backoff fica para uma iteração futura.
- O conector de provedor assume compatibilidade inicial com um protocolo
  compatível com Xtream Codes (ADR-004 §3); outro protocolo resulta em erro
  de incompatibilidade específico, não em tentativa de descoberta de
  endpoints alternativos.
- Não há meta numérica de volume de entradas como critério de aceite nesta
  spec; volume será medido durante planejamento técnico/execução
  (ADR-006 cita 1.000/10.000/100.000 como cenários de teste, não capacidade
  garantida).
- Enriquecimento (capas externas, TMDB, IMDb, recomendações) não faz parte
  desta feature; o catálogo básico publicado já é suficiente para as
  features de navegação que virão a seguir.
- Sem login de pessoa: a fonte pertence ao perfil local da instalação
  (ADR-004 §1), não a uma conta CCPlay.
- Upload de arquivo `.m3u` e atualização/reimportação de uma fonte já
  existente ficam para features separadas (itens 11 e 13 do backlog).

## Clarifications

### Sessão 2026-09-14

- Q: Esta spec cobre só a entrada por URL, ou também navegação mínima do
  catálogo resultante? → A: Só entrada + job; navegação fica para features
  separadas (itens 4/5/6 do backlog).
- Q: Upload de arquivo `.m3u` e credenciais de provedor ficam fora desta
  spec? → A: Inicialmente confirmado que sim, mas revisto logo a seguir —
  ver conflito resolvido abaixo.
- Q: Reimportação/atualização de uma fonte já existente faz parte desta
  spec? → A: Não; fica para o item 13 do backlog (pós-MVP).
- Q: Que granularidade de classificação esta versão precisa entregar? → A:
  Canal / Filme / Série+Episódio / Não Classificado.
- **Conflito identificado e resolvido**: a resposta sobre escopo geral
  citou a necessidade de duas opções de entrada (URL e provedor), o que
  contradizia a resposta seguinte que excluía credenciais de provedor. Ao
  ser confrontado com a contradição, o usuário confirmou explicitamente:
  **as duas entradas (URL e provedor) fazem parte desta mesma feature 001**;
  apenas upload de arquivo `.m3u` (RF-004) fica fora.
- Q: Tela única com alternância URL/Provedor, ou dois pontos de entrada
  separados no menu? → A: Uma tela única com alternância.
- Q: A interface desta versão já expõe botão "Cancelar" para o job em
  andamento? → A: Sim, botão Cancelar visível.
- Q: Que volume mínimo de entradas vira critério de aceite mensurável
  nesta spec? → A: Sem meta numérica nesta spec.
- Q: Nome de exibição da fonte é obrigatório ou gerado automaticamente
  quando em branco? → A: Obrigatório informar.
