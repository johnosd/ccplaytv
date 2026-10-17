# Feature Specification: Redesenho da tela Portal & licença e item Backup

**Slug**: `075-redesenho-portal-licenca`

**Created**: 2026-10-16

**Status**: Implementada

**Input**: "A tela portal & licença é confusa hoje. Muitos botões: poderia já mostrar o QR code, device id (MAC) e device key; o código de licença pode ficar apenas com um ícone de olho que mostra ou não. Backup precisa ir para um novo item no menu. Quero que use melhores práticas de UI/UX pois está bem ruim." (sdd-adhoc redirecionado; regra de exibição decidida na ADR-019 / constitution 1.14.0.)

## Escopo

### Incluído

- Nova composição de Configurações → **Portal & licença** em duas colunas: cartão **Acessar o portal** (QR fixo, endereço do site, ID e chave à vista) e cartão **Licença** (estado, validade, preço, código com olho, Comprar/Renovar, Atualizar), mais um botão **Mais opções**.
- Código da licença oculto por padrão com controle de olho na própria tela (ADR-019).
- Menu modal **Mais opções** com as ações raras: **Gerar nova chave e código** (unifica "Revogar acessos ao portal" e "Gerar novo código da licença"), **Recuperar pelo site** e **Desvincular esta TV**, cada uma com confirmação.
- Novo item **Backup** no menu de Configurações, logo após Portal & licença, com estado do backup, Fazer backup agora, Restaurar e Apagar.
- Fim do modal de "revelar" chave/código e do botão "Gerar QR para o portal".
- Textos novos/alterados nos três idiomas (pt/en/es) e inclusão das duas telas na auditoria de legibilidade.
- Emenda aprovada dos testes/roteiros que dependem do layout antigo (ver FR-020).

### Fora de Escopo

- Qualquer mudança no serviço/backend do portal (`api/`) ou no `portal-web`: a rotação unificada reutiliza a chamada existente.
- Separar de verdade "trocar só o código" de "trocar a chave" no serviço.
- Mudar as telas **Adicionar lista** (`PortalPairingPanel`) e **bloqueio da licença** (`LicenseGate`), inclusive o agrupamento da chave nelas (ver Clarifications).
- Mudar o fluxo de compra por Pix (073) além de como ele é aberto a partir do cartão Licença.
- Mudar as regras de backup/restauração/desvinculação (072); só a localização na UI muda.
- Validação na TV física como gate desta feature (decisão do usuário).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver QR, ID e chave sem apertar nada (Priority: P1)

A pessoa abre Configurações → Portal & licença porque quer entrar no site pelo celular ou digitar ID/chave no computador. A tela já mostra o QR fixo grande, o endereço do site, o ID do dispositivo e a chave de 10 dígitos agrupada em blocos.

**Why this priority**: é o motivo mais comum de abrir a tela e hoje exige 2–3 interações (botão, aviso, confirmar).

**Independent Test**: com uma TV pareada de teste, abrir a aba e verificar que QR, endereço, ID e chave aparecem sem nenhum SELECT e que o QR codifica `<site>/#id=<ID>&key=<chave>`.

**Acceptance Scenarios**:

1. **Given** uma TV já cadastrada no portal, **When** a pessoa abre Portal & licença, **Then** o cartão Acessar o portal mostra o QR fixo, o endereço do site, o ID e a chave (como `123 456 7890`), sem nenhuma ação e sem requisição de rede.
2. **Given** uma TV sem cadastro e com rede, **When** a pessoa abre a tela, **Then** o cartão mostra um estado de carregando e, após o cadastro único, o QR, o ID e a chave; reabrir a tela não repete o cadastro.
3. **Given** o portal não configurado ou o cadastro falhou, **When** a pessoa abre a tela, **Then** o cartão mostra uma mensagem acionável no lugar do QR e a tela continua tendo elementos focáveis.

---

### User Story 2 - Cartão Licença enxuto com código atrás do olho (Priority: P1)

A pessoa vê de relance se a licença está ativa, em teste ou vencida, até quando vale e quanto custa, e tem a ação principal (Comprar ou Renovar) com foco ao entrar. O código da licença aparece como máscara; SELECT no olho mostra o código na própria tela e outro SELECT oculta.

**Why this priority**: concentra a decisão de compra e a credencial de recuperação, hoje espalhadas entre textos soltos e dois botões com modal.

**Independent Test**: abrir a aba em cada estado da licença (teste, ativa, vencida, sem licença, build não comercial) e conferir conteúdo, foco inicial e o comportamento do olho.

**Acceptance Scenarios**:

1. **Given** licença em teste, vencida ou ausente (build comercial), **When** o foco entra no painel, **Then** ele cai em **Comprar licença**.
2. **Given** licença ativa (build comercial), **When** o foco entra no painel, **Then** ele cai em **Atualizar**, e o botão de compra mostra **Renovar licença**.
3. **Given** o código oculto, **When** a pessoa só move o foco até o olho, **Then** o código continua oculto; **When** aperta SELECT, **Then** o código aparece na própria tela, sem modal e sem limite de tempo.
4. **Given** o código visível, **When** a pessoa sai da aba, a página vai para segundo plano ou o código é regenerado, **Then** ao voltar o código está oculto.
5. **Given** build não comercial, **When** a pessoa abre a tela, **Then** o cartão Licença mostra só o código com olho (sem estado, preço, Comprar/Renovar nem Atualizar da licença) e o foco inicial cai no olho.

---

### User Story 3 - Ações raras em "Mais opções" (Priority: P2)

Gerar nova chave e código, Recuperar pelo site e Desvincular ficam num menu modal aberto por **Mais opções**; cada uma explica o efeito e pede confirmação.

**Why this priority**: tira da tela principal ações destrutivas ou raras, que hoje somam 4 dos 12 botões, sem perder nenhuma capacidade.

**Independent Test**: abrir Mais opções, executar cada ação com confirmar e com cancelar, e conferir o resultado e para onde o foco volta.

**Acceptance Scenarios**:

1. **Given** a tela principal, **When** a pessoa aperta SELECT em Mais opções, **Then** abre um menu modal com três ações e o foco na primeira; Voltar fecha o menu e devolve o foco a Mais opções.
2. **Given** o menu, **When** a pessoa escolhe **Gerar nova chave e código** e confirma, **Then** a confirmação deixa claro que chave, QR e código mudam e que o site desconecta; após o sucesso, o cartão mostra a nova chave e o novo QR, e o código volta a ficar oculto.
3. **Given** o menu, **When** a pessoa escolhe **Recuperar pelo site**, **Then** o QR temporário de recuperação substitui o QR fixo no cartão Acessar o portal, com contagem regressiva e um rótulo de recuperação; ao expirar ou ao sair da tela, o QR fixo volta.
4. **Given** o menu, **When** a pessoa escolhe **Desvincular esta TV** e confirma, **Then** o comportamento é o da 072 (backup antes, se houver rede) e a tela reflete a TV desvinculada.
5. **Given** qualquer confirmação aberta, **When** a pessoa cancela ou aperta Voltar, **Then** nada muda e o foco volta ao item do menu que a abriu.

---

### User Story 4 - Backup como item próprio do menu (Priority: P2)

A pessoa encontra **Backup** no menu de Configurações, logo abaixo de Portal & licença, com o estado do backup e as ações Fazer backup agora, Restaurar e Apagar.

**Why this priority**: separa a gestão de dados de uso da gestão de acesso e licença, reduzindo a tela de Portal & licença.

**Independent Test**: navegar até Backup e executar cada ação com e sem backup existente e com e sem portal configurado.

**Acceptance Scenarios**:

1. **Given** o menu de Configurações, **When** a pessoa desce após Portal & licença, **Then** encontra o item **Backup** (pt "Backup", en "Backup", es "Copia de seguridad").
2. **Given** a aba Backup, **When** ela abre, **Then** mostra a mesma informação de estado de hoje (último backup, oferta, pendências, desligado) e as ações Fazer backup agora, Restaurar e Apagar, com as mesmas confirmações e regras da 072.
3. **Given** portal não configurado ou TV não pareada, **When** a aba abre, **Then** as ações indisponíveis aparecem soft-disabled com motivo visível e há pelo menos um elemento focável.
4. **Given** Portal & licença, **When** a pessoa percorre a tela, **Then** nenhuma ação de backup aparece mais nela.

---

### Edge Cases

- TV pareada antes da 070 (sem ID exibido ou com chave longa): abrir a tela faz a atualização única de pareamento já existente, mostrando carregando até concluir.
- Falha de rede durante o cadastro, a rotação ou a recuperação: mensagem curta no cartão afetado com o código não secreto de diagnóstico, nunca a chave, o código ou a URL; foco preservado.
- Rotação ou recuperação já pendente (write-ahead da 069): a tela retoma o estado pendente em vez de oferecer uma nova operação.
- Licença muda enquanto a tela está aberta (Atualizar, retorno da compra Pix): cartão Licença e foco inicial se atualizam sem perder o foco atual.
- Página vai para segundo plano: o código volta a ficar oculto; o convite de recuperação é descartado; o QR fixo e a chave continuam (são permitidos à vista).
- Textos longos em en/es (ex.: "Copia de seguridad", rótulos de Mais opções) não podem cortar.
- Volta da tela de compra Pix: o foco volta para Comprar/Renovar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Portal & licença DEVE ser organizada em dois cartões lado a lado — **Acessar o portal** à esquerda e **Licença** à direita — com um botão **Mais opções** abaixo deles, seguindo os tokens e o foco do DS V14.
- **FR-002**: O cartão Acessar o portal DEVE mostrar, ao abrir a tela e sem nenhuma ação, o QR fixo da 071 (`<site>/#id=<ID>&key=<chave>`, gerado na TV), o endereço do site, o ID do dispositivo e a chave (ADR-019).
- **FR-003**: A chave DEVE ser exibida agrupada em blocos (`123 456 7890`) só visualmente; o valor, o QR e qualquer cópia continuam os 10 dígitos sem espaço.
- **FR-004**: Sem cadastro, abrir a tela DEVE disparar o cadastro único (ADR-016 decisão 3) mostrando estado de carregando; sem configuração ou com falha, DEVE mostrar mensagem acionável no lugar do QR. Nenhuma requisição DEVE ocorrer ao reabrir uma TV já cadastrada.
- **FR-005**: O cartão Licença (build comercial) DEVE mostrar estado (teste, ativa, vencida, sem licença), validade quando houver, o preço/oferta atual, o código da licença com olho, o botão **Comprar licença** ou **Renovar licença** (licença ativa) e **Atualizar** com sua linha de status.
- **FR-006**: Fora do build comercial, o cartão Licença DEVE mostrar só o código com olho.
- **FR-007**: O código da licença DEVE começar oculto (máscara) a cada abertura da tela; SELECT no olho DEVE alternar mostrar/ocultar na própria tela, sem modal e sem limite de tempo; o olho DEVE ter rótulo acessível que reflete o estado ("Mostrar código da licença"/"Ocultar código da licença").
- **FR-008**: O código DEVE voltar a ficar oculto ao sair da aba, com a página em segundo plano (`visibilitychange` oculto/`pagehide`) e após regeneração; focar o olho NÃO DEVE revelá-lo.
- **FR-009**: Ao entrar no painel, o foco DEVE cair em Comprar licença (teste, vencida, sem licença), em Atualizar (licença ativa) ou no olho (build não comercial).
- **FR-010**: Mais opções DEVE abrir um menu modal com, nesta ordem, **Gerar nova chave e código**, **Recuperar pelo site** e **Desvincular esta TV**; Voltar DEVE fechar o menu devolvendo o foco a Mais opções.
- **FR-011**: **Gerar nova chave e código** DEVE substituir as antigas ações "Revogar acessos ao portal" e "Gerar novo código da licença", reutilizando a rotação existente do serviço; a confirmação DEVE dizer que chave, QR e código mudam e que as sessões abertas no site são encerradas, e que listas, favoritos e licença são preservados.
- **FR-012**: Após a rotação, o cartão Acessar o portal DEVE mostrar a nova chave e o novo QR sem outra ação, e o código DEVE estar oculto.
- **FR-013**: **Recuperar pelo site** DEVE manter o fluxo da 069, exibindo o QR temporário no lugar do QR fixo com contagem regressiva e rótulo de recuperação; ao expirar, ao concluir ou ao sair da tela, o QR fixo DEVE voltar.
- **FR-014**: **Desvincular esta TV** DEVE manter a confirmação e o comportamento da 072 (backup antes, se houver rede; aviso quando não houver).
- **FR-015**: Configurações DEVE ganhar o item **Backup** logo após Portal & licença, com estado do backup, **Fazer backup agora**, **Restaurar** e **Apagar**, preservando confirmações, regras, mensagens e a linha de status do Atualizar de backup da 072.
- **FR-016**: Portal & licença NÃO DEVE mais exibir ações de backup, o botão "Gerar QR para o portal", o botão "Mostrar chave da TV" nem o modal de revelar chave/código.
- **FR-017**: Toda ação indisponível DEVE aparecer soft-disabled com motivo visível; todo estado (carregando, vazio, erro, sem configuração) DEVE ter ao menos um elemento focável; voltar da compra Pix ou de um modal DEVE restaurar o foco no elemento de origem.
- **FR-018**: Mensagens de falha DEVEM aparecer no cartão afetado, com o código não secreto de diagnóstico já existente, e NUNCA conter chave, código, credenciais ou URL com segredo.
- **FR-019**: Todo texto novo ou alterado DEVE estar no catálogo i18n em pt/en/es; as abas Portal & licença e Backup DEVEM entrar na auditoria de legibilidade (`e2e/legibilidade-tv.mjs`) sem texto abaixo do mínimo nem cortado nos três idiomas.
- **FR-020**: Os testes e roteiros que dependem do layout antigo DEVEM ser atualizados por emenda registrada no plano: o contrato travado da 067 que lista as abas de Configurações (`SettingsScreen.configuracoes-lista-global.contract.test.tsx`) e os roteiros E2E de portal/licença/backup (`portal-configuracao`, `consulta-sob-demanda`, `desvincular-backup`, `compra-licenca-pix`, `licenca-anual`, e afins).

### Key Entities *(include if feature involves data)*

Sem entidades novas. Usa os registros já existentes do dispositivo (ID, chave, código da licença), do estado da licença e do estado do backup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ID, chave e QR visíveis com 0 interações após abrir a aba (hoje 2–3).
- **SC-002**: Código da licença visível com 1 SELECT a partir do olho (hoje 3: botão, aviso, revelar); no build comercial o foco entra em Comprar licença, então chegar ao olho custa um ↑ antes do SELECT.
- **SC-003**: A tela principal de Portal & licença tem no máximo 4 elementos focáveis no build comercial (olho, Comprar/Renovar, Atualizar, Mais opções), contra 12 hoje.
- **SC-004**: Nenhuma capacidade existente perdida: cada uma das 12 ações antigas tem um caminho equivalente (na tela, no Mais opções ou na aba Backup), verificado em teste.
- **SC-005**: Zero requisições de rede ao abrir a aba numa TV já cadastrada.
- **SC-006**: Auditoria de legibilidade sem violações nas duas abas em pt, en e es.

## Assumptions

- A rotação unificada usa a chamada de serviço que hoje atende "Revogar acessos" (envia o MAC, cobrindo a atualização de ID da 070); o serviço já troca chave, código e sessões nas duas chamadas (`api/app/portal/access_rotation.py` `_prepare`).
- O preço/oferta exibido é o mesmo texto já existente (`portal.licenseOffer`).
- O ícone de olho usa o componente de ícones já existente; se faltar o glifo, ele entra no conjunto local de ícones (sem CDN).
- O menu Mais opções segue o padrão de modal/lista já usado no app (DS V14 §11/§13).
- A aba Backup reaproveita o comportamento atual de `PortalBackupActions`, sem Desvincular.

## Clarifications

### Sessão 2026-10-16

- Q: Layout da tela? → A: Duas colunas — cartão Acessar o portal (QR, ID, chave) e cartão Licença — com "Mais opções" abaixo.
- Q: Onde ficam Revogar, Gerar novo código e Recuperar? → A: Menu modal "Mais opções", cada ação com confirmação.
- Q: Onde fica Desvincular? → A: No Mais opções do Portal (é ação do vínculo, não do backup).
- Q: Nome/posição do novo item? → A: "Backup", logo após Portal & licença (es "Copia de seguridad").
- Q: Foco inicial? → A: Ação principal da licença — Comprar (teste/vencida/sem licença), Atualizar (ativa), olho (não comercial).
- Q: Onde aparece o QR de recuperação? → A: Substitui o QR fixo no cartão, com contagem; o fixo volta ao expirar ou sair.
- Q: Cartão Licença fora do build comercial? → A: Só o código com olho.
- Q: O que fecha a feature? → A: Unit + E2E + legibilidade, **sem** passada na TV física (leitura real do QR e segundo plano na TV ficam sem prova).
- Q: O que é "Revogar acessos ao portal"? → A: (investigado) gera nova chave, novo código e novo token da TV e derruba as sessões do site; "Gerar novo código" faz a mesma rotação no serviço. Decisão: unificar em "Gerar nova chave e código", sem mudar o serviço.
- Q: Formato da chave? → A: Agrupada em blocos (`123 456 7890`), só visual. Em Adicionar lista/bloqueio fica como está nesta feature: o contrato travado da 070 (`PortalPairingPanel.entrada-listas-gerenciador.contract.test.tsx`) procura a chave como texto contínuo, e agrupá-la lá exigiria emenda fora deste escopo.
- Q: Olho do código (ADR-019)? → A: Oculto por padrão, sem prazo, reoculta ao sair, em segundo plano ou ao regenerar.
