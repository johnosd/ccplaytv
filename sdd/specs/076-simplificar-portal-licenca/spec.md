# Feature Specification: Simplificar Portal & licença — ações raras e código de recuperação em Avançado

**Slug**: `076-simplificar-portal-licenca`

**Created**: 2026-10-16

**Status**: Convergida

**Input**: "Quero simplificar, pois na maioria dos apps de IPTV não vejo essas opções." Decisão do usuário sobre a 075: "Esconder em Avançado", com a explicação de cada item muito clara, porque nem o próprio usuário entendeu o fluxo de código/chave/recuperação/desvincular.

## Escopo

### Incluído

- Tela principal de Configurações → Portal & licença só com o essencial: cartão **Acessar o portal** (QR, site, ID e chave à vista), cartão **Licença** (estado, validade, oferta, Comprar/Renovar licença e Atualizar), botão **Avançado** e uma linha discreta lembrando de guardar o código de recuperação.
- O "código da licença" deixa de ser mostrado na tela principal e passa a se chamar **código de recuperação** em toda a interface (ele nunca foi uma licença comprada; é a credencial de reserva do vínculo da TV com o portal). Ele fica no Avançado, oculto por padrão, com olho.
- O botão **Mais opções** vira **Avançado** e abre uma **subtela dentro da aba** (não mais um modal) com quatro itens, cada um com um texto curto, sempre visível, dizendo **para que serve** e **quando usar**: Código de recuperação, Gerar nova chave e código, Recuperar pelo site e Desvincular esta TV.
- Textos novos nos três idiomas (pt/en/es) e inclusão das telas na auditoria de legibilidade.
- Emenda aprovada dos testes de contrato e roteiros que assumem o layout da 075 (ver FR-016).

### Fora de Escopo

- Remover qualquer capacidade: Gerar nova chave e código, Recuperar pelo site e Desvincular continuam existindo, com as mesmas confirmações, regras e efeitos da 075/072/069.
- Mudanças no serviço/backend (`api/`) e na lógica do `portal-web`; do `portal-web` entram **somente** 4 textos i18n que ainda dizem "código da licença" (FR-009).
- Religar a TV sozinha ao mesmo cadastro depois de reinstalar o app (exigiria mudar o serviço e a segurança).
- Mudar as telas Adicionar lista e bloqueio da licença, o fluxo de compra por Pix e a aba Backup.
- Passada na TV física como gate desta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tela principal enxuta (Priority: P1)

A pessoa abre Configurações → Portal & licença e vê só o necessário: o cartão para acessar o portal pelo celular (QR, site, ID e chave), o cartão da licença (estado, validade, preço, Comprar ou Renovar, Atualizar) e um botão **Avançado**. Uma linha discreta diz para guardar o código de recuperação em Avançado. Nenhum código aparece nem há olho nessa tela.

**Why this priority**: é o pedido central — menos coisas na tela e nenhuma credencial secreta ou termo confuso à vista.

**Independent Test**: abrir a aba em cada estado de licença e no build não comercial e conferir o conteúdo, o foco inicial e a ausência do código e do olho.

**Acceptance Scenarios**:

1. **Given** build comercial, **When** a pessoa abre a tela, **Then** vê os cartões Acessar o portal e Licença, o botão Avançado e a linha lembrando de guardar o código de recuperação; não há botão de olho nem código (nem mascarado).
2. **Given** licença em teste, vencida ou ausente, **When** o foco entra no painel, **Then** cai em **Comprar licença**; com licença ativa, cai em **Atualizar** (e o botão de compra diz **Renovar licença**).
3. **Given** build não comercial, **When** a pessoa abre a tela, **Then** o cartão Licença não aparece, só o cartão Acessar o portal e o Avançado, e o foco inicial cai em **Avançado**.
4. **Given** a tela principal, **When** a pessoa percorre os elementos focáveis, **Then** no build comercial há no máximo três: Comprar/Renovar, Atualizar e Avançado.

---

### User Story 2 - Avançado explica cada item (Priority: P1)

A pessoa aperta **Avançado** e abre uma subtela com quatro itens. Cada item mostra o título e, logo abaixo, uma ou duas frases em linguagem simples dizendo o que faz e quando usar — antes de apertar qualquer coisa. O primeiro item é o **Código de recuperação**, que aparece como máscara e tem um olho para mostrar e ocultar.

**Why this priority**: o usuário não entendia o fluxo; sem a explicação visível, esconder as ações só troca um problema por outro.

**Independent Test**: abrir o Avançado e verificar que os quatro itens existem na ordem, com seus textos, e que o código só aparece depois do SELECT no olho.

**Acceptance Scenarios**:

1. **Given** a tela principal, **When** a pessoa aperta Avançado, **Then** abre a subtela com, nesta ordem, Código de recuperação, Gerar nova chave e código, Recuperar pelo site e Desvincular esta TV, cada um com seu texto explicativo visível e o foco no primeiro item.
2. **Given** o código oculto, **When** a pessoa só move o foco até o olho, **Then** o código continua oculto; **When** aperta SELECT, **Then** o código aparece na própria tela, sem modal e sem limite de tempo; outro SELECT oculta.
3. **Given** o código visível, **When** a pessoa volta à tela principal, sai da aba, a página vai para segundo plano ou o código é regenerado, **Then** ao voltar o código está oculto.
4. **Given** a subtela, **When** a pessoa aperta Voltar, **Then** retorna à tela principal com o foco em **Avançado**.
5. **Given** o texto do Código de recuperação, **When** a pessoa o lê, **Then** entende que **não é uma licença comprada**, que serve para recuperar o acesso e religar a TV (por exemplo, depois de reinstalar o app) e que deve ser guardado em local privado.

---

### User Story 3 - Ações do Avançado funcionam como antes (Priority: P2)

Gerar nova chave e código, Recuperar pelo site e Desvincular esta TV mantêm confirmações, efeitos e mensagens, agora a partir da subtela.

**Why this priority**: garante que simplificar a tela não perdeu nenhuma capacidade (SC-003).

**Independent Test**: executar cada ação com confirmar e com cancelar e conferir resultado e para onde o foco volta.

**Acceptance Scenarios**:

1. **Given** a subtela, **When** a pessoa escolhe **Gerar nova chave e código** e confirma, **Then** a confirmação diz que chave, QR e código de recuperação mudam e que as sessões abertas no site são encerradas e que listas, favoritos e licença são preservados; depois do sucesso, a tela principal mostra a nova chave e o novo QR, e o código de recuperação volta a ficar oculto.
2. **Given** a subtela, **When** a pessoa escolhe **Recuperar pelo site**, **Then** a tela volta à principal e o QR temporário de recuperação substitui o QR fixo no cartão Acessar o portal, com contagem regressiva e rótulo de recuperação; ao expirar, concluir, ir a segundo plano ou sair, o QR fixo volta.
3. **Given** a subtela, **When** a pessoa escolhe **Desvincular esta TV** e confirma, **Then** o comportamento é o da 072 (backup antes, se houver rede; aviso quando não houver) e a tela principal reflete a TV desvinculada com o botão **Vincular de novo**.
4. **Given** qualquer confirmação aberta, **When** a pessoa cancela ou aperta Voltar, **Then** nada muda e o foco volta ao item da subtela que a abriu.
5. **Given** TV sem vínculo ou sem portal configurado, **When** a pessoa abre o Avançado, **Then** os itens indisponíveis aparecem soft-disabled com o motivo visível e há sempre ao menos um elemento focável.

---

### Edge Cases

- Textos explicativos longos em en/es não podem cortar nem ficar abaixo do tamanho mínimo; a subtela rola mantendo o item focado visível.
- Sem device (portal não configurado ou cadastro falhou): o item Código de recuperação mostra o motivo, o olho fica soft-disabled e o SELECT não revela nada.
- Recuperação ou rotação já pendente (write-ahead da 069): a tela retoma o estado pendente em vez de oferecer nova operação.
- Licença muda enquanto a tela está aberta (Atualizar, retorno da compra Pix): o foco inicial e os rótulos se atualizam sem perder o foco atual.
- Mensagem de falha de qualquer ação aparece com o código não secreto de diagnóstico, nunca a chave, o código ou URL com segredo.
- Voltar da compra Pix devolve o foco a Comprar/Renovar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela principal de Portal & licença DEVE conter apenas: o cartão Acessar o portal (QR fixo, site, ID e chave agrupada à vista, como na 075), o cartão Licença (build comercial), o botão **Avançado** e uma linha discreta pedindo para guardar o código de recuperação em Avançado.
- **FR-002**: A tela principal NÃO DEVE exibir o código de recuperação (nem mascarado) nem controle de olho.
- **FR-003**: O cartão Licença (build comercial) DEVE mostrar estado, validade quando houver, a oferta, **Comprar licença** ou **Renovar licença** (licença ativa) e **Atualizar** com sua linha de status; fora do build comercial o cartão Licença NÃO DEVE ser exibido.
- **FR-004**: Ao entrar no painel, o foco DEVE cair em Comprar licença (teste, vencida, sem licença), em Atualizar (licença ativa) ou em **Avançado** (build não comercial); quando houver falha de vínculo, o botão de nova tentativa/vincular de novo DEVE continuar focável como na 075.
- **FR-005**: O botão **Mais opções** DEVE ser renomeado **Avançado** e abrir uma subtela dentro da aba (não um modal) com, nesta ordem: **Código de recuperação**, **Gerar nova chave e código**, **Recuperar pelo site** e **Desvincular esta TV**; Voltar DEVE fechá-la devolvendo o foco a Avançado.
- **FR-006**: Cada item da subtela DEVE mostrar, sempre visível e antes de qualquer ação, um texto curto em linguagem simples com **para que serve** e **quando usar**. Os textos DEVEM cobrir: (a) Código de recuperação — não é uma licença comprada; é a credencial de reserva usada para recuperar o acesso e religar a TV (por exemplo, depois de reinstalar o app); guardar em local privado; (b) Gerar nova chave e código — troca chave, QR e código de recuperação; usar se a chave foi vista por outra pessoa ou para desconectar o site; sessões do site são encerradas; listas, favoritos e licença continuam; (c) Recuperar pelo site — usar quando esta TV perdeu o acesso; mostra um QR temporário, informar o código de recuperação no site e confirmar o ID; nada é apagado; (d) Desvincular esta TV — solta o vínculo sem apagar listas e dados; depois, **Vincular de novo** volta ao mesmo cadastro (mesmo ID) com chave nova.
- **FR-007**: O item Código de recuperação DEVE começar oculto (máscara fixa) a cada abertura; SELECT no olho DEVE alternar mostrar/ocultar na própria subtela, sem modal e sem limite de tempo; o rótulo do olho DEVE refletir o estado ("Mostrar código de recuperação"/"Ocultar código de recuperação"); focar o olho NÃO DEVE revelar o código.
- **FR-008**: O código DEVE voltar a ficar oculto ao sair da subtela, sair da aba, com a página em segundo plano (`visibilitychange` oculto/`pagehide`) e após regeneração.
- **FR-009**: O termo "código da licença" DEVE deixar de aparecer na interface (pt/en/es) e na documentação canônica do repositório; no lugar, **código de recuperação** (em es "código de recuperación"; en "recovery code").
- **FR-010**: **Gerar nova chave e código** DEVE manter a rotação única da 075 e a confirmação, que DEVE dizer o efeito completo (FR-006b); após o sucesso, a tela principal mostra a nova chave e o novo QR e o código de recuperação volta oculto.
- **FR-011**: **Recuperar pelo site** DEVE fechar a subtela e exibir, na tela principal, o QR temporário no lugar do QR fixo, com contagem regressiva e rótulo de recuperação, mantendo o fluxo da 069; ao expirar, concluir, ir a segundo plano ou sair, o QR fixo DEVE voltar.
- **FR-012**: **Desvincular esta TV** DEVE manter a confirmação e o comportamento da 072 (backup antes, se houver rede; aviso quando não houver); depois, a tela principal DEVE oferecer **Vincular de novo**.
- **FR-013**: Itens indisponíveis (sem portal, sem vínculo) DEVEM aparecer soft-disabled com o motivo visível; todo estado (carregando, vazio, erro, sem configuração) DEVE ter ao menos um elemento focável; voltar de uma confirmação, da subtela ou da compra Pix DEVE restaurar o foco no elemento de origem.
- **FR-014**: Mensagens de falha DEVEM aparecer na tela afetada com o código não secreto de diagnóstico já existente e NUNCA conter chave, código, credenciais ou URL com segredo.
- **FR-015**: Todo texto novo ou alterado DEVE estar no catálogo i18n em pt/en/es e as telas Portal & licença e Avançado DEVEM entrar na auditoria de legibilidade (`e2e/legibilidade-tv.mjs`) sem texto abaixo do mínimo nem cortado nos três idiomas.
- **FR-016**: Os testes e roteiros que dependem do layout da 075 DEVEM ser atualizados por emenda registrada no plano: o contrato travado da 075 (`PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx`, que assume o olho no cartão e o menu "Mais opções" com três itens) e os roteiros E2E de portal/licença/backup que acionam esses rótulos.
- **FR-017**: A ADR-019 DEVE receber nota de atualização (o código muda de lugar e de nome; a regra de exibição — oculto por padrão, olho, reoculta ao sair, em segundo plano ou ao regenerar — permanece) e qualquer trecho da constitution que use "código da licença" DEVE ter a terminologia alinhada sem enfraquecer a regra.

### Key Entities *(include if feature involves data)*

Sem entidades novas. Usa o registro existente do dispositivo (ID, chave, código de recuperação), o estado da licença e o estado do backup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tela principal tem no máximo 3 elementos focáveis no build comercial (Comprar/Renovar, Atualizar, Avançado) e nenhuma credencial secreta (código) à vista.
- **SC-002**: Para cada um dos quatro itens do Avançado, a pessoa vê o que ele faz e quando usar sem apertar nada: 4 de 4 itens com texto explicativo visível em pt, en e es.
- **SC-003**: Nenhuma capacidade perdida: cada ação da 075 (mostrar código, gerar nova chave, recuperar, desvincular) tem caminho equivalente a partir do Avançado, verificado em teste.
- **SC-004**: Código de recuperação visível com 1 SELECT a partir do olho dentro do Avançado, e ausente do DOM em qualquer outro momento.
- **SC-005**: A expressão "código da licença" não aparece em nenhum texto de interface nem na documentação canônica; o texto do código deixa claro que não é licença comprada.
- **SC-006**: Auditoria de legibilidade sem violações na tela principal e na subtela Avançado em pt, en e es.

## Assumptions

- A linha lembrando de guardar o código é fixa e curta (por exemplo, "Guarde seu código de recuperação em Avançado."), sem estado "já viu".
- "Gerar nova chave e código" mantém esse nome; o texto explicativo esclarece que o código é o de recuperação.
- A subtela reaproveita as confirmações (`PortalConfirmDialog`), a máscara e as regras de segundo plano da 075; o `sdd-plan` decide a divisão de componentes e como o RETURN é tratado na aba.
- As regras de exibição da ADR-019 e da constitution 1.14.0 continuam valendo; só o lugar e o nome do código mudam.
- Os textos finais (pt/en/es) estão em `logic/avancado-foco.md` §5 e em `tv-web/src/lib/i18n/messages/portalAdvanced.ts`; eles substituem os rascunhos da entrevista. Pontos que valem como requisito: o código de recuperação diz que **não é uma licença comprada**, manda **guardar fora da TV** (papel ou foto no celular) e só promete "permitir recuperar" a licença e o backup, sem garantir o resultado em toda TV (plan R-006).

## Clarifications

### Sessão 2026-10-16

- Q: Qual nível de simplificação? → A: Esconder em Avançado (nenhuma capacidade removida); a explicação de cada item precisa ser muito clara, porque o fluxo não era compreendido.
- Q: Como o Avançado se apresenta? → A: Subtela dentro da aba, com texto "para que serve / quando usar" sempre visível em cada item.
- Q: Nome do botão? → A: **Avançado**.
- Q: Onde fica o código de recuperação? → A: Item próprio no Avançado, com olho (oculto por padrão, regras da ADR-019).
- Q: A tela principal avisa para guardar o código? → A: Sim, uma linha discreta na tela principal.
- Q: O que acontece ao escolher Recuperar pelo site? → A: Volta à tela principal e o QR temporário substitui o QR fixo (como hoje).
- Q: Cartão Licença no build não comercial? → A: Oculto (só Acessar o portal e Avançado; foco inicial em Avançado).
- Q: O nome "código da licença"? → A: Renomeado para "código de recuperação" em toda a interface e documentação, por não ser uma licença comprada.
