# Feature Specification: Entrada de listas estilo gerenciador

**Slug**: `070-entrada-listas-gerenciador`

**Created**: 2026-10-13

**Status**: Convergida

**Input**: "Na tela de perfil, ao clicar em adicionar, deve mostrar o QR code, device id, device key e a URL do painel para o usuário adicionar a lista, ou a opção manual. Reescrever a tela de cadastro/edição de listas: tela grande com Nome da lista, URL, usuário e senha; campos grandes, que não escondam o que o usuário escreve, ou com opção de ativar (olho). No painel também mostrar a device key, a lista de listas e poder incluir ou editar. A saída do app deve ter como última tela sempre a tela de listas." Referências do usuário: fotos do gerenciador de um app concorrente (tela "Adicionar Playlist" na TV com ID no formato MAC, chave numérica, QR e URL; painel web com ID, status, validade, tabela de playlists e formulário de edição com senha visível).

## Escopo

### Incluído

- **Tela "Adicionar lista" na TV**, aberta pelo cartão/ação de adicionar da tela de listas, com duas opções lado a lado: **Pelo celular** (ID do dispositivo, chave do dispositivo, endereço do painel, QR e botões Voltar/Recarregar) e **Digitar na TV** (o formulário).
- **ID do dispositivo no formato de endereço MAC** (`A0:8C:FD:19:0A:8C`): o MAC real da TV quando disponível; quando indisponível, um ID gerado no mesmo formato.
- **Chave do dispositivo numérica de 10 dígitos, permanente e sempre visível** na tela Adicionar, com ação para gerar uma nova chave.
- **Formulário grande de cadastro/edição de lista na TV**: Nome da lista, URL, Usuário e Senha, tipo M3U/Xtream escolhido explicitamente, campos grandes, texto **visível por padrão** e olho para ocultar; a edição na TV mostra os valores já salvos.
- **Painel (portal)**: cabeçalho com ID, estado da licença, validade e ativar por pagamento; lista de listas com incluir, editar e remover; formulário com os mesmos campos grandes e olho; entrada por QR ou manualmente com ID + chave; a edição **mostra os valores salvos**.
- **Saída do app**: RETURN volta em cadeia até a tela de listas; a confirmação de sair só aparece nela; ao abrir o app a primeira tela útil é sempre a de listas.
- **Emendas normativas** que as decisões acima exigem (ver Assumptions e Requisitos FR-024 a FR-026).

### Fora de Escopo

- **Ativar por código** (emissão/gestão de códigos de ativação): feature separada.
- **Proteger lista com PIN no painel**: a proteção por PIN por lista segue só na TV (feature 067).
- Mudar preço, oferta, provedor de pagamento ou regras de vencimento da feature 069.
- Mudar o catálogo, a importação, o player ou a classificação de listas.
- Usar marca, cores ou fundo do aplicativo de referência: as fotos definem a estrutura; o visual segue o Design System V14.
- Recuperação pelo site por código da licença (069) permanece como está.
- Campo de porta separado do endereço: a porta, quando existir, vai dentro da URL (premissa; ver Clarifications).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adicionar lista pelo celular a partir da tela Adicionar (Priority: P1)

A pessoa está na tela de listas da TV, ativa "Adicionar lista" e vê, sem nenhuma ação extra, o ID do dispositivo, a chave do dispositivo, o endereço do painel e o QR. Ela lê o QR (ou digita ID + chave no painel), cadastra a lista no celular e a lista aparece na TV.

**Why this priority**: é o gargalo relatado ("acesso confuso"): hoje a entrada do portal fica num rodapé que só se alcança descendo duas vezes e as credenciais ficam atrás de ações protegidas.

**Independent Test**: com o app comercial, abrir "Adicionar lista", ver ID/chave/URL/QR, entrar no painel pelo QR e, em outra sessão, por ID + chave digitados, criar uma lista e vê-la na TV.

**Acceptance Scenarios**:

1. **Given** a tela de listas, **When** a pessoa ativa "Adicionar lista", **Then** a tela mostra ID no formato `XX:XX:XX:XX:XX:XX`, chave de 10 dígitos, endereço do painel, QR e os botões Voltar e Recarregar, com um deles em foco. **Atualização (071):** o botão "Recarregar" é mantido (contrato C1); o QR é o fixo, local.
2. **Given** a tela Adicionar aberta, **When** a pessoa lê o QR, **Then** o painel abre já autenticado nesta TV, sem pedir ID/chave.
3. **Given** o painel aberto sem QR, **When** a pessoa digita o ID e a chave exibidos, **Then** entra no gerenciador desta TV; com chave errada, recebe recusa sem revelar se o ID existe.
4. **Given** uma lista criada no painel, **When** a pessoa ativa Recarregar na TV, **Then** a lista aparece sem esperar o ciclo automático.
5. **Given** a chave foi fotografada, **When** a pessoa ativa "Gerar nova chave" e confirma, **Then** a chave antiga deixa de funcionar e as sessões abertas do painel são encerradas.

---

### User Story 2 - Cadastrar e editar lista na TV com formulário grande (Priority: P1)

Na opção "Digitar na TV" (e na edição de uma lista existente) a pessoa preenche Nome da lista, URL, Usuário e Senha em campos grandes, vendo o que digita, com um olho para ocultar.

**Why this priority**: digitar com o controle é difícil; texto escondido causa erro e retrabalho.

**Independent Test**: cadastrar uma lista Xtream e uma M3U na TV só com o controle, conferindo o texto digitado; editar uma lista existente e ver os valores salvos.

**Acceptance Scenarios**:

1. **Given** o formulário aberto, **When** a pessoa digita, **Then** nome, URL, usuário e senha aparecem em texto legível (mínimo 20 px) nos campos grandes.
2. **Given** URL, usuário e senha preenchidos, **When** a pessoa ativa o olho, **Then** usuário/senha/URL ficam ocultos; ativando de novo, voltam a aparecer.
3. **Given** uma lista salva, **When** a pessoa a edita na TV, **Then** o formulário traz os valores salvos (visíveis por padrão) e permite alterá-los.
4. **Given** o tipo escolhido (M3U ou Xtream), **When** o formulário é exibido, **Then** mostra só os campos do tipo e valida antes de enviar, mantendo o que foi digitado em caso de erro.

---

### User Story 3 - Painel gerenciador com status, listas e edição (Priority: P2)

No painel, a pessoa vê o ID da TV, o estado da licença e a validade, pode ativar por pagamento, e gerencia a lista de listas (incluir, editar, remover) com o mesmo formulário grande, inclusive vendo os valores salvos.

**Why this priority**: completa o ciclo de gerenciamento a partir do celular/computador.

**Independent Test**: no painel, criar, editar (vendo senha e URL salvas) e remover listas; conferir ID, status e validade.

**Acceptance Scenarios**:

1. **Given** o painel autenticado, **When** a página abre, **Then** o topo mostra o ID da TV, o estado (teste/ativa/vencida), a validade e a ação de ativar por pagamento.
2. **Given** listas existentes, **When** a pessoa abre uma para editar, **Then** os campos mostram URL, usuário e senha salvos, visíveis por padrão, com olho.
3. **Given** a edição concluída, **When** a pessoa salva, **Then** a TV aplica a alteração e o painel mostra o resultado (aplicada/pendente/conflito), como na feature 069.
4. **Given** uma lista removida no painel, **When** a TV sincroniza, **Then** ela some da TV e dos dois lados; e a remoção feita na TV some do painel.

---

### User Story 4 - Saída do app termina sempre na tela de listas (Priority: P2)

De qualquer tela, RETURN volta camada por camada até a tela de listas; só nela aparece a confirmação de sair. Ao abrir o app, a primeira tela útil é a de listas.

**Why this priority**: evita ficar preso em configurações/portal/player ao sair e dá previsibilidade ao controle.

**Independent Test**: percorrer configurações, portal, formulário, detalhes e player, e apertar RETURN repetidamente: sempre chega à tela de listas antes de pedir para sair; reabrir o app cai nas listas.

**Acceptance Scenarios**:

1. **Given** qualquer tela fora das listas, **When** a pessoa aperta RETURN, **Then** volta à tela anterior e, ao esgotar a pilha, à tela de listas (nunca fecha o app direto).
2. **Given** a tela de listas, **When** a pessoa aperta RETURN, **Then** aparece a confirmação de sair; cancelar mantém o app.
3. **Given** o app fechado numa tela interna, **When** é reaberto, **Then** abre na tela de listas.

---

### Edge Cases

- MAC indisponível ou bloqueado pela plataforma: usar ID gerado no mesmo formato, estável entre aberturas e reinstalações, sem esconder que é gerado em diagnóstico.
- Duas TVs com o mesmo ID (colisão do ID gerado ou MAC repetido): o cadastro recusa e gera outro; nunca mistura listas.
- Tentativas excessivas de chave: bloqueio temporário por ID e por origem, sem revelar se o ID existe.
- Sem internet: a tela Adicionar mostra ID/chave locais, QR indisponível com explicação e continua oferecendo "Digitar na TV".
- Chave vazada/fotografada: "Gerar nova chave" invalida a anterior imediatamente e encerra sessões.
- URL muito longa ou com caracteres especiais: campo rola/quebra sem cortar o texto e sem perder o foco.
- Teclado em tela da TV (IME): abrir/fechar não perde o texto nem o foco; RETURN fecha o IME antes de sair do formulário.
- Painel aberto durante a troca de chave: a sessão cai com mensagem clara.
- Lista pendente de aplicação ou em conflito de revisão: o painel mostra o estado, como na 069.
- Idiomas pt/en/es: nenhum texto cortado, rótulos dos campos e do olho traduzidos.

## Requirements *(mandatory)*

### Functional Requirements

**Tela Adicionar (TV)**

- **FR-001**: A tela de listas DEVE oferecer "Adicionar lista" como único ponto de entrada para adicionar; o rodapé "Adicionar pelo site" deixa de ser o caminho principal.
- **FR-002**: A tela Adicionar DEVE mostrar, sem ação extra, o ID do dispositivo, a chave do dispositivo, o endereço do painel e o QR, com Voltar e Recarregar focáveis.
- **FR-003**: O ID do dispositivo DEVE ter o formato `XX:XX:XX:XX:XX:XX` (hexadecimal maiúsculo): o MAC da TV quando disponível; do contrário, um ID gerado no mesmo formato, estável e único.
- **FR-004**: A chave do dispositivo DEVE ser numérica, de 10 dígitos, permanente até ser regenerada, e exibida o tempo todo na tela Adicionar.
- **FR-005**: A tela DEVE oferecer "Gerar nova chave" com confirmação; a chave antiga e as sessões do painel deixam de valer ao confirmar.
- **FR-006**: Recarregar DEVE buscar e aplicar na hora o que foi enviado pelo painel, informando resultado ou falha com código de erro.
- **FR-007**: A opção "Digitar na TV" DEVE estar na mesma tela, alcançável por controle remoto, com foco previsível entre as duas colunas e o rodapé.

**Formulário de lista (TV)**

- **FR-008**: O cadastro e a edição DEVEM usar uma tela grande com Nome da lista, URL, Usuário e Senha, sem rolagem horizontal e com campos de altura e fonte para TV (texto mínimo 20 px).
- **FR-009**: O tipo (M3U ou Xtream) DEVE ser escolhido explicitamente e determinar os campos exibidos.
- **FR-010**: O conteúdo digitado DEVE aparecer em texto legível por padrão; um olho DEVE ocultar e reexibir usuário, senha e URL.
- **FR-011**: A edição na TV DEVE mostrar os valores já salvos da lista.
- **FR-012**: Erros de validação DEVEM manter tudo o que foi digitado e indicar o campo.

**Painel**

- **FR-013**: O painel DEVE mostrar o ID da TV, o estado da licença, a validade e a ação de ativar por pagamento já existente.
- **FR-014**: O painel DEVE listar as listas da TV com nome, tipo e estado, e permitir incluir, editar e remover.
- **FR-015**: O formulário do painel DEVE usar os mesmos campos grandes e o olho, e a edição DEVE exibir os valores salvos (URL, usuário e senha) para a sessão autenticada daquela TV.
- **FR-016**: A entrada no painel DEVE aceitar QR (sem digitar) ou ID + chave digitados manualmente.
- **FR-017**: Alterações feitas no painel DEVEM seguir o mesmo protocolo de aplicação, conflito, pendência e exclusão bidirecional da feature 069.

**Saída**

- **FR-018**: RETURN em qualquer tela DEVE voltar à anterior e, esgotada a pilha, à tela de listas, nunca encerrando o app diretamente.
- **FR-019**: A confirmação de sair DEVE aparecer apenas na tela de listas.
- **FR-020**: Ao abrir o app, a primeira tela útil DEVE ser a tela de listas.

**Segurança e privacidade (aceitas pelo usuário; exigem emenda normativa)**

- **FR-021**: Credenciais salvas só DEVEM ser devolvidas à sessão autenticada do painel daquela TV, com resposta não armazenável em cache e nunca em log, erro, analytics, URL ou exportação.
- **FR-022**: Tentativas de entrada manual (ID + chave) DEVEM ter limite por ID e por origem, recusa uniforme e bloqueio temporário.
- **FR-023**: A chave e o ID nunca DEVEM aparecer em URL de navegação, QR (que carrega só convite efêmero e de uso único), logs ou mensagens de erro.
- **FR-024**: A exibição permanente da chave e a devolução de credenciais ao painel DEVEM ser formalizadas por emenda da constituição e da decisão arquitetural antes de qualquer implementação.
- **FR-025**: A leitura do MAC DEVE ser validada na TV física e a indisponibilidade tratada com o fallback de FR-003, sem alterar `config.xml` ou o build para "forçar" o resultado.
- **FR-026**: O QR e o convite DEVEM continuar efêmeros e de uso único, sem conter a chave nem credenciais de lista. **Atualização (071):** o QR passa a ser fixo e carrega ID e chave só no fragmento; sem convite efêmero na TV (ADR-016, constitution 1.11.0 (e)).

### Key Entities *(include if feature involves data)*

- **ID do dispositivo**: identificador legível no formato MAC, exibido na TV e no painel; mapeado à identidade interna existente; não secreto.
- **Chave do dispositivo**: número de 10 dígitos permanente por TV, regenerável; credencial de entrada manual no painel.
- **Sessão do painel**: acesso autenticado a uma TV, por QR ou por ID + chave; curta, revogável.
- **Lista (fonte)**: nome, tipo, URL, usuário e senha; ciclo de aplicação/pendência/conflito herdado da 069.
- **Estado da licença**: teste, ativa, vencida ou aguardando; validade; herdado da 069.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Da tela de listas até ver ID, chave, endereço e QR leva no máximo 2 ações do controle (ativar "Adicionar lista" e, se necessário, mover foco).
- **SC-002**: Em teste com 5 pessoas, pelo menos 4 conseguem adicionar uma lista pelo celular na primeira tentativa, sem ajuda, em até 3 minutos.
- **SC-003**: Cadastrar uma lista Xtream completa na TV só com o controle leva no máximo 5 minutos e 0 caracteres escondidos durante a digitação.
- **SC-004**: 100% dos textos do fluxo (TV e painel) ficam legíveis e sem corte em pt/en/es, com mínimo de 20 px na TV.
- **SC-005**: Uma lista criada, editada ou removida no painel aparece na TV em até 30 s com a tela Adicionar aberta e imediatamente ao ativar Recarregar.
- **SC-006**: Nenhuma credencial aparece em log, URL, erro, QR ou cabeçalho de cache em inspeção com marcadores fictícios.
- **SC-007**: De qualquer uma das 10 telas principais, no máximo 8 RETURN chegam à tela de listas e o app nunca fecha antes de passar por ela.
- **SC-008**: Com 1.000 tentativas de chave errada de uma origem, nenhuma sessão é concedida e a TV legítima continua entrando após o bloqueio.

## Assumptions

- A constituição vigente (1.9.0) restringe a exibição da chave a ação explícita e a feature 069 (FR-014/FR-015, SC-004) proíbe devolver segredo salvo ao navegador. As decisões do usuário (chave sempre visível e valores salvos no painel) contradizem essas regras e **só podem ser implementadas depois da emenda** (constituição 1.10.0 e ADR); o plano deve tratar isso como porta de entrada.
- **Risco aceito pelo usuário**: chave numérica permanente sempre visível e credenciais exibidas no painel aumentam o impacto de foto/captura de tela e de sequestro de sessão. Mitigações exigidas: 10 dígitos, limite de tentativas, regenerar chave, sessão curta, cache desativado, sem log.
- O formato do ID segue o aplicativo de referência (MAC); o MAC real pode exigir permissão de rede da plataforma e pode estar indisponível em alguns modelos (premissa a provar na TV física).
- A chave de 10 dígitos substitui a chave longa atual para a entrada manual; a identidade interna da TV não muda.
- O tipo de lista continua explícito (M3U/Xtream); a porta, quando houver, faz parte da URL.
- Reaproveita a infraestrutura da 069 (staging, API, sincronização, exclusão bidirecional, licença) sem alterar preço ou regras de vencimento.
- Design System V14 é normativo; texto mínimo 20 px; todo estado (carregando, vazio, erro) tem ao menos um elemento focável.

## Clarifications

### Sessão 2026-10-13

- Q: Como a device key deve aparecer na tela Adicionar (a constituição só permite revelar por ação explícita)? → A: **Chave sempre visível**, no estilo de máscara `A0:8C:FD:19:0A:8C` para o ID. (Emenda constitucional necessária.)
- Q: Como deve ser a tela aberta por "Adicionar lista"? → A: Uma tela, duas opções lado a lado (Pelo celular / Digitar na TV).
- Q: Como os campos tratam o que a pessoa digita? → A: Visíveis por padrão, com olho para ocultar.
- Q: O que significa "a saída do app deve ter como última tela a tela de listas"? → A: RETURN volta em cadeia até as listas e só lá pede para sair; ao abrir, começa nas listas.
- Q: Chave de 6 dígitos sempre visível: como torná-la segura? → A: Escolheu **chave permanente** (em vez de PIN efêmero), após aviso de risco.
- Q: Tamanho da chave? → A: **10 dígitos**, como no exemplo (resposta à recomendação).
- Q: De onde vem o ID no formato MAC? → A: "Acho que é o MAC da TV, a maioria dos apps como o Duplecast usa esse modelo" → **MAC real; se indisponível, ID gerado no mesmo formato**.
- Q: O que o painel deve mostrar sobre a TV? → A: "Mandei exemplo nas fotos": ID, status, validade, ativar por pagamento e tabela de listas com incluir/editar (estrutura do exemplo).
- Q: Como tratar M3U e Xtream com os mesmos campos? → A: Escolha explícita M3U/Xtream.
- Q: Editar lista no portal: mostrar valores salvos ou deixar em branco? → A: **Mostrar os valores salvos no portal** (emenda do FR-015 necessária).
- Q: O que mais dos exemplos entra? → A: Status, validade e ativar por pagamento no painel; botão Recarregar na TV. **Fora**: ativar por código; proteger lista com PIN no painel.
- Premissa registrada sem pergunta: sem campo de porta separado (a porta vai na URL); a proteção por PIN por lista segue só na TV.
