# Feature Specification: IME da TV nos formulários — teclado, Next/Done, senha e erros de conexão

**Slug**: `045-ime-formularios-tv`

**Created**: 2026-10-02

**Status**: Convergida

**Input**: Item 18 do backlog — "IME da TV: teclado não cobre o campo, Next/Done, máscara de senha e os 4 erros do formulário. Cadastrar lista é o primeiro contato do usuário; os 4 erros já têm código na 042."

## Escopo

Contexto verificado no código antes de escrever (para a spec não prometer o que já existe): o cadastro de lista já tem rótulo permanente, um campo por finalidade (URL, usuário, senha com máscara), nenhum `<form>` (salvar só por OK no botão, sem envio implícito) e botão "Conectando…" que continua focável e ignora um segundo OK. **Não existe ainda**: Next/Done entre campos, garantia de que o teclado não cobre o campo, "mostrar" a senha, e — o ponto principal — os quatro erros de conexão **só aparecem depois** que a pessoa já saiu do formulário, na tela de progresso da importação (`SRC-001`, `SRC-401`, `NET-02`, `SRC-422`, tabela da 042).

### Incluído

- Os três formulários de texto do app: **cadastro e edição de lista** (Xtream e M3U), **chave TMDB** e **endereço manual de EPG**.
- No cadastro/edição de lista: **confirmar a conexão antes de sair do formulário**, com os quatro erros distinguidos (endereço inválido, falha de conexão, autenticação recusada, resposta incompatível) mostrados no próprio formulário, com os dados preservados.
- **Next/Done** previsíveis em todos os formulários: Next avança ao próximo campo; Done fecha o teclado e leva o foco à ação principal, sem enviar nada.
- **Campo nunca coberto pelo teclado**: o campo em edição fica na metade superior da tela.
- **Senha (e chave TMDB) mascarada** com controle focável "Mostrar/Ocultar", sem prazo, que volta a mascarar ao sair da tela.
- Espera da confirmação com limite de tempo e cancelável por RETURN.

### Fora de Escopo

- Pareamento por celular / QR (`pair-phone`, item 22b) — segue "Em breve".
- Teclado virtual próprio do app (a regra do DS §37.1 é usar o IME da Samsung).
- Novos códigos de erro ou novos textos fora da tabela da 042 (esta feature só **usa** a tabela).
- Importação por arquivo `.m3u` (item 22a) e o parser M3U (item 25).
- Alterar o fallback "Modo limitado" da feature 014 (continua como está).
- Busca (campos de busca global/por categoria): só herdam o critério "teclado não cobre o campo" se compartilharem o mesmo componente; nenhum comportamento de Next/Done ou erro de conexão é pedido para eles.
- Persistir "mostrar senha" entre telas ou sessões.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Erros de conexão no formulário, sem perder o que foi digitado (Priority: P1)

Ao escolher "Conectar e sincronizar", a TV primeiro confirma que a lista responde. Se algo falha, a pessoa **continua no formulário**, com tudo preenchido, e vê uma faixa única acima das ações dizendo o que aconteceu, por quê, o que fazer e o código. Só quando a conexão é confirmada o app segue para o progresso da importação.

**Why this priority**: Cadastrar lista é o primeiro contato; hoje um erro de digitação de uma senha de 12 caracteres obriga a voltar da tela de progresso e digitar tudo de novo no controle remoto. É o maior atrito real do item.

**Independent Test**: Pode ser testado sozinho contra um painel falso que responde cada um dos quatro casos (e um que responde certo), conferindo que o formulário permanece, com os dados, a faixa de erro correta e o foco na ação; e que no caso certo a tela de progresso abre.

**Acceptance Scenarios**:

1. **Given** um endereço de servidor que não é um endereço (ex.: sem host, ou com usuário/senha embutidos), **When** a pessoa aciona "Conectar e sincronizar", **Then** o formulário permanece, a faixa mostra "Endereço inválido" com o código `SRC-001`, sem que nenhuma rede seja consultada, e todos os campos continuam preenchidos.
2. **Given** um servidor que não responde (ou o aparelho sem internet), **When** a pessoa aciona a ação, **Then** a faixa mostra a falha de conexão (`NET-02`, ou `NET-01` se o aparelho está offline) com "Tentar de novo" como ação.
3. **Given** um servidor que recusa o usuário ou a senha, **When** a pessoa aciona a ação, **Then** a faixa mostra "Credencial inválida" (`SRC-401`) e a pessoa pode corrigir os campos sem redigitar os demais.
4. **Given** uma fonte cujo conteúdo não serve nem pelo protocolo Xtream nem como M3U (formato inválido, vazio, ou apontando para um canal), **When** a pessoa aciona a ação, **Then** a faixa mostra "Resposta incompatível" (`SRC-422`).
5. **Given** um painel Xtream que não fala o protocolo JSON mas cujo M3U de fallback serve, **When** a pessoa aciona a ação, **Then** NÃO há erro: a lista segue para o Modo limitado como na feature 014.
6. **Given** a conexão confirmada, **When** a pessoa aciona a ação, **Then** a lista é criada e a tela de progresso abre — uma única vez, mesmo com OK repetido.
7. **Given** qualquer das faixas acima, **When** ela aparece, **Then** nenhum texto, rótulo acessível ou registro contém a URL, o usuário ou a senha.

---

### User Story 2 - Next e Done previsíveis (Priority: P1)

Preenchendo "Servidor → Usuário → Senha", Next no teclado da TV leva ao campo seguinte; Done no último campo fecha o teclado e deixa o foco em "Conectar e sincronizar", pronto para um OK **consciente**.

**Why this priority**: Sem isso a pessoa fecha o teclado, navega com as setas até o próximo campo, e reabre o teclado — a cada campo, num formulário de 4 campos.

**Independent Test**: Em Chromium, com o IME simulado por eventos de teclado e foco; e na TV física (ver SC-007).

**Acceptance Scenarios**:

1. **Given** o foco em "Servidor" com o teclado aberto, **When** a pessoa aciona Next, **Then** o foco passa a "Usuário" e o teclado permanece aberto para ele; idem Usuário → Senha.
2. **Given** o foco no último campo de texto, **When** a pessoa aciona Done, **Then** o teclado fecha, o foco vai a "Conectar e sincronizar" (ou "Salvar alterações") e **nada é enviado**.
3. **Given** o cadastro M3U (Nome → URL M3U), **When** a pessoa aciona Next no Nome, **Then** o foco vai à URL; Done na URL leva à ação principal.
4. **Given** qualquer ponto, **When** a pessoa aciona OK no botão de ação, **Then** (e somente então) o envio acontece.

---

### User Story 3 - O campo nunca fica atrás do teclado (Priority: P2)

Ao focar um campo (e ao abrir o teclado), a tela rola até o campo — com seu rótulo, dica e erro — ficar na metade superior da tela, onde o teclado da Samsung não chega.

**Why this priority**: O formulário cabe na tela só em parte (rola como fallback); o campo de baixo ("Senha") é justamente o que o teclado cobre.

**Independent Test**: Em Chromium, medir a posição do campo focado em 1920×1080 após cada Next/foco; na TV física, ver o campo com o teclado aberto.

**Acceptance Scenarios**:

1. **Given** qualquer campo do formulário, **When** ele recebe o foco, **Then** seu retângulo (rótulo, campo, dica e erro) está inteiro na metade superior da área segura.
2. **Given** o último campo e a faixa de erro abaixo dele, **When** o campo é focado, **Then** o critério acima continua valendo (a tela rola, não encolhe o campo).
3. **Given** que a pessoa fecha o teclado, **When** o foco vai ao botão de ação, **Then** o botão fica visível (a rolagem não o deixa fora da tela).

---

### User Story 4 - Senha mascarada com "Mostrar" (Priority: P2)

A senha aparece mascarada. Ao lado do campo há um controle focável "Mostrar senha"; acionado, revela o texto e passa a "Ocultar senha", e assim fica até a pessoa desligar ou sair da tela.

**Why this priority**: Digitar senha com o controle remoto erra muito; poder conferir reduz o erro que a US1 apanha.

**Independent Test**: Teste de componente + Chromium: máscara por padrão, alternância, reset ao sair, estado lido por tecnologia assistiva sem depender de cor.

**Acceptance Scenarios**:

1. **Given** o campo Senha, **When** a tela abre, **Then** o conteúdo está mascarado, também em modo de edição.
2. **Given** o controle "Mostrar senha" em foco, **When** a pessoa aciona OK, **Then** o texto é revelado, o nome acessível passa a "Ocultar senha" e o estado é anunciado; um segundo OK mascara de novo.
3. **Given** a senha revelada, **When** a pessoa sai da tela (por qualquer caminho) e volta, **Then** ela volta mascarada.
4. **Given** a senha revelada ou não, **When** a faixa de erro ou qualquer anúncio é emitido, **Then** o valor da senha não aparece neles.

---

### User Story 5 - Mesmos comportamentos na chave TMDB e no EPG manual (Priority: P3)

A tela da chave TMDB e o endereço manual de EPG (Configurações › Fontes IPTV) seguem as mesmas regras: Done leva à ação principal sem enviar, o campo fica fora do alcance do teclado, e a chave TMDB tem a mesma máscara com "Mostrar/Ocultar". Os erros próprios de cada um continuam os que já têm (`API-401`/`API-429` da chave; endereço de EPG inválido / `EPG-02`).

**Why this priority**: Consistência (DS §37.2 lista todos esses fluxos), mas nenhum é o primeiro contato.

**Independent Test**: Testes de cada tela + Chromium.

**Acceptance Scenarios**:

1. **Given** a tela da chave TMDB, **When** a pessoa digita e aciona Done, **Then** o foco vai à ação principal e nada é enviado; a chave está mascarada e alternável como a senha.
2. **Given** o campo de endereço manual de EPG, **When** a pessoa aciona Done, **Then** o foco vai a "Salvar"/ação principal e nada é enviado.
3. **Given** qualquer dessas telas, **When** o campo é focado, **Then** o critério da US3 vale.

---

### Edge Cases

- **Espera longa**: a confirmação tem limite (~15 s); passado o limite vira falha de conexão (`NET-02`) com os dados preservados e "Tentar de novo".
- **RETURN durante a espera**: cancela a confirmação, mantém todos os dados e devolve o foco à ação; RETURN fora da espera sai da tela como hoje.
- **OK repetido / Done**: durante a espera e depois do sucesso, um segundo OK não envia de novo; Done e Enter dentro de um campo nunca enviam.
- **Edição de lista**: usuário e senha em branco significam "manter os atuais"; a confirmação de conexão só roda quando endereço, usuário, senha ou URL M3U foram **alterados** — salvar só o nome não consulta a rede.
- **Dois erros ao mesmo tempo** (ex.: endereço inválido e campo vazio): valida-se na ordem local (campos vazios → endereço → rede), mostrando um por vez; nunca duas faixas.
- **Faixa já visível e a pessoa edita um campo**: a faixa permanece até a próxima tentativa (não some sozinha, para não deixar o motivo ser perdido no meio da digitação).
- **Offline desde o início**: vai direto a falha de conexão `NET-01`, sem esperar o limite.
- **Falha de armazenamento** (disco cheio) ao criar: usa o código já existente `STO-01`, na mesma faixa.
- **Conta expirada ou serviço limitado** (`SRC-402`, `API-429`) na confirmação: a faixa mostra o texto da tabela da 042, sem caminho novo.
- **IME fechado por RETURN**: fecha só o teclado, não sai da tela (como já ocorre hoje com o campo focado; não pode regredir).
- **Segredo na tela**: a senha revelada aparece apenas no próprio campo; faixa, rótulos acessíveis e anúncios nunca a repetem.

## Requirements *(mandatory)*

### Functional Requirements

**Erros e confirmação de conexão (cadastro/edição de lista)**

- **FR-001**: Ao acionar "Conectar e sincronizar" (ou "Salvar alterações" com dados de conexão alterados), o sistema DEVE confirmar a conexão **antes** de criar/atualizar a lista e antes de abrir a tela de progresso.
- **FR-002**: O sistema DEVE distinguir quatro falhas, usando os códigos e textos da tabela da 042 sem alterá-los: endereço inválido (`SRC-001`), falha de conexão (`NET-02`, ou `NET-01` quando o aparelho está offline), autenticação recusada (`SRC-401`) e resposta incompatível (`SRC-422`).
- **FR-003**: Falha de endereço (`SRC-001`) DEVE ser detectada localmente, sem nenhuma consulta de rede.
- **FR-004**: O sistema DEVE manter o fallback "Modo limitado" da feature 014: um painel Xtream que não fala o protocolo, mas cujo M3U serve, NÃO é erro; `SRC-422` só aparece quando nem o fallback serve.
- **FR-005**: Em qualquer falha, o formulário DEVE permanecer aberto com **todos** os campos preservados (inclusive a senha, mascarada).
- **FR-006**: O erro DEVE aparecer numa **faixa única** acima das ações, com título, motivo, o código discreto e a ação ("Tentar de novo" para as recuperáveis; para as demais, o texto indica o campo a corrigir), e o foco DEVE ir ao botão de ação — nunca ficar sem elemento focável.
- **FR-007**: A faixa e qualquer anúncio ou rótulo DEVEM ser anunciados por tecnologia assistiva (região `aria-live` existente) e NUNCA conter URL, usuário, senha ou mensagem bruta de erro do navegador/servidor.
- **FR-008**: A confirmação DEVE ter limite de tempo (~15 s); ao estourar, trata-se como falha de conexão (`NET-02`).
- **FR-009**: RETURN durante a confirmação DEVE cancelá-la, preservar os dados e devolver o foco à ação, sem sair da tela.
- **FR-010**: Durante a confirmação, o botão DEVE continuar focável e DEVE ignorar um segundo acionamento; o sucesso DEVE abrir o progresso uma única vez.
- **FR-011**: A confirmação de conexão em edição DEVE rodar apenas quando endereço, usuário, senha ou URL M3U foram alterados.
- **FR-012**: A validação de campos obrigatórios (nome, URL M3U, servidor/usuário/senha) DEVE continuar como hoje, e a faixa única DEVE mostrar um problema por vez (ordem: campos vazios → endereço → rede).

**Next / Done / teclado**

- **FR-013**: Em formulários com mais de um campo de texto, Next DEVE mover o foco ao próximo campo de texto na ordem visual, mantendo o teclado utilizável nele; a ordem do cadastro Xtream é Nome → Servidor → Usuário → Senha e a do M3U é Nome → URL M3U.
- **FR-014**: Done do IME no último campo DEVE fechar o teclado e levar o foco à ação principal, **sem** enviar o formulário; o envio só ocorre por OK na ação principal. `Enter` sozinho num campo continua sendo do teclado do sistema (na TV, OK abre/fecha o IME) e nunca é interceptado.
- **FR-015**: Em formulário de um só campo (chave TMDB, EPG manual), Done DEVE levar o foco à ação principal sem enviar.
- **FR-016**: Ao receber o foco, o campo (com rótulo, dica e erro) DEVE ficar inteiro na metade superior da área segura, rolando a tela quando preciso, em todos os formulários cobertos.
- **FR-017**: Fechar o teclado com RETURN DEVE fechar só o teclado, sem sair da tela nem perder o texto.
- **FR-018**: O rótulo de cada campo DEVE continuar permanente e visível (nunca um placeholder que some ao digitar).

**Senha / chave**

- **FR-019**: A senha da lista e a chave TMDB DEVEM estar mascaradas por padrão, inclusive na edição, com um controle focável "Mostrar/Ocultar" ao lado do campo, na ordem de foco imediatamente após o campo.
- **FR-020**: O controle DEVE alternar entre revelar e mascarar até a pessoa desligar; ao sair da tela por qualquer caminho, o estado DEVE voltar a mascarado.
- **FR-021**: O estado revelado/oculto DEVE ser comunicado por nome e estado acessíveis ("Mostrar senha"/"Ocultar senha", `aria-pressed`) e por um indicador visível que não dependa só de cor.
- **FR-022**: A senha e a chave NUNCA DEVEM aparecer em faixa de erro, toast, anúncio, rótulo acessível, log ou chave de cache de consulta; o campo da chave TMDB continua começando sempre vazio.

**Cobertura**

- **FR-023**: Os comportamentos de Next/Done (FR-014/FR-015), cobertura (FR-016), RETURN do teclado (FR-017) e rótulo permanente (FR-018) DEVEM valer nos três formulários: lista (cadastro e edição), chave TMDB e EPG manual.
- **FR-024**: Cada formulário DEVE manter os erros próprios que já tem (chave TMDB: `API-401`/`API-429`; EPG: endereço inválido e `EPG-02`), sem mudança de texto ou código.

### Key Entities *(include if feature involves data)*

- **Resultado da confirmação de conexão**: um de {confirmada, endereço inválido, falha de conexão, autenticação recusada, resposta incompatível, cancelada}. Transitório; não persiste e nunca guarda URL, usuário ou senha.
- **Estado de revelação da senha/chave**: booleano de tela, em memória; nunca persistido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em cada um dos quatro casos de falha, a pessoa continua no formulário com 100% dos campos preenchidos e vê uma única faixa com o código correto, em até 1 s após a falha ser conhecida (a espera de rede em si não conta).
- **SC-002**: Corrigir um dado errado e tentar de novo exige acionar **apenas** o campo errado e a ação — nenhuma redigitação dos demais campos (verificável contando teclas/campos preenchidos de novo: 0).
- **SC-003**: Em 100% dos casos de falha o foco termina num elemento focável da tela; nenhuma sequência de teclas deixa a pessoa sem foco visível.
- **SC-004**: Preencher o cadastro Xtream (4 campos) usando só Next entre campos e Done no final, e depois OK na ação, não exige nenhuma tecla direcional para mudar de campo.
- **SC-005**: Em 1920×1080, 100% dos campos focados nos três formulários têm o retângulo inteiro (rótulo, campo, dica, erro) na metade superior da área segura.
- **SC-006**: Varredura de segredos: em todos os cenários de erro e de "mostrar senha", nenhuma ocorrência da URL, do usuário ou da senha de teste em faixa, anúncio, rótulo acessível ou registro (0 ocorrências).
- **SC-007**: **Verificação na TV física (QN50Q60DAGXZD)**: Next, Done e a cobertura pelo teclado funcionam com o IME real da Samsung nos três formulários — só provável no aparelho, já que o navegador não reproduz as teclas Next/Done do IME real. "Não testado" nunca vira "aprovado".
- **SC-008**: O envio duplicado é impossível: com OK repetido durante a confirmação, exatamente 1 lista é criada e 1 importação é iniciada.

## Assumptions

- O bloco `TextField` compartilhado é o ponto natural para o critério de cobertura e o controle de senha, mas **como** isso é feito é decisão do `sdd-plan`.
- A confirmação de conexão não pode obrigar o app a repetir trabalho pesado (por exemplo, baixar a lista inteira duas vezes); como evitar isso é do plano.
- `SRC-402` (conta expirada) e `API-429` aparecem, se ocorrerem na confirmação, pela mesma faixa e pela tabela da 042 — não são tratados como um quinto caminho nesta spec; o bloqueio posterior da feature 034 permanece como está.
- Uma recusa por CORS (`direct_connection_refused`) é tratada como falha de conexão (`NET-02`), como já mapeia a tabela da 042.
- As teclas Next/Done do IME real da Samsung chegam à página de forma que o plano ainda precisa confirmar; por isso o SC-007 propõe verificação física obrigatória, a decidir no `sdd-plan` (mesmo padrão das features 013/027). O comportamento fora da TV é provado em Chromium por eventos simulados.
- A busca (global e por categoria) compartilha o componente de campo e, por isso, herdará o critério de cobertura sem pedir nenhum comportamento adicional.
- Nenhum novo código de erro é necessário; se o plano descobrir uma falha real sem código na tabela, volta-se à spec.
- O app nunca usa um teclado virtual próprio (DS §37.1).

## Clarifications

### Sessão 2026-10-02

- Q: Onde os 4 erros devem aparecer? (Hoje só na tela de progresso, depois de sair do formulário.) → A: No formulário, antes de sair: a ação confirma a conexão primeiro; em falha a pessoa permanece com os dados preenchidos.
- Q: Next/Done — como se comportam? → A: Next avança ao próximo campo; Done fecha o teclado e leva o foco à ação principal, sem submeter (envio só por OK no botão, mantendo a decisão atual de nunca enviar implicitamente).
- Q: "Mostrar" da senha — como? → A: Alterna até a pessoa desligar (sem prazo); ao sair da tela volta a mascarar. (Divergiu da recomendação de revelar por ~5 s; decisão do usuário.)
- Q: Quais formulários entram? → A: Cadastro e edição de lista, `TmdbKeyScreen` e EPG manual.
- Q: "Resposta incompatível" vs. fallback "Modo limitado" da 014? → A: Mantém o fallback; o erro só aparece se o fallback também falhar.
- Q: Espera da confirmação? → A: Limite de ~15 s e cancelável por RETURN.
- Q: Como o erro aparece e onde fica o foco? → A: Faixa única acima das ações, com o foco na ação (sem marcar o campo culpado). (Divergiu da recomendação de erro junto do campo; decisão do usuário.)
- Q: Critério de "nunca coberto pelo teclado"? → A: Campo (com rótulo, dica e erro) inteiro na metade superior da tela.
### Sessão 2026-10-02 (pós-plano)

- Q: FR-014 dizia "Done (ou Enter)"; o plano não intercepta Enter. Ajustar a spec? → A: Sim — FR-014 passa a "Done do IME"; Enter segue do teclado do sistema.
- Q: Emendar o mock de `fetch` do teste 1 do contrato travado da 037 (quebra com a confirmação)? → A: Aprovado, só o mock de `fetch`; re-travar a 037.
- Q: Quando medir o IME real? → A: Cedo, antes da Fase 4 (sonda T001 + passada T002 antes do Done/RETURN).
- Q: Anúncio da faixa de erro? → A: `role="alert"` na própria faixa (FR-007 entendido como região viva equivalente, sem duplicar a fala).
- Categorias da varredura sem pergunta: Integração (nenhuma nova — usa a tabela da 042 e o fallback da 014) e Não-Funcional de desempenho (sem meta além do limite de espera e do 1 s de SC-001).
