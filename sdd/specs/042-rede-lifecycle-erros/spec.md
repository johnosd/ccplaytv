# Feature Specification: Rede, lifecycle e erros acionáveis

**Slug**: `042-rede-lifecycle-erros`

**Created**: 2026-10-01

**Status**: Convergida

**Input**: Itens 61 + 19 do backlog (trilha P): rede e lifecycle completos (§40 do Design System V14) junto com erros acionáveis com código e diagnóstico de reprodução (§45).

## Escopo

### Incluído

- Estados de rede explícitos (`online`, `offline`, `suspenso`, `retomado`, `verificando rede`, `reconectando stream`) com UI própria onde a pessoa os percebe.
- Banner de offline global no shell (telas sob a topbar) e dentro do player, com "Tentar novamente" focável; bloqueia só o que depende de internet.
- Ao ocultar o app: suspender timers e persistir o foco essencial. Ao retomar: rede → estado → foco → player só quando seguro.
- Reconexão automática e limitada do stream quando ele cai com a rede disponível.
- Taxonomia única de erros acionáveis (o que aconteceu, por quê, **uma** ação primária, código discreto) aplicada a **todas** as telas que hoje mostram erro, em três ondas de prioridade (P1 player+rede, P2 catálogo/fonte/EPG/TMDB/trailer, P3 demais avisos).
- Diagnóstico de reprodução distinguindo rede × codec × fonte expirada/credencial recusada, com no máximo 3 ações (Tentar novamente / Info técnica / Editar credenciais) e painel "Info técnica" sanitizado.
- Pré-carga em segundo plano (feature 038) passa a respeitar limite de API (429) com espera.
- Códigos e ação nos erros do formulário de lista (endereço inválido, falha de conexão, autenticação recusada, resposta incompatível).

### Fora de Escopo

- Acabamento do IME do formulário (campo nunca coberto, Next/Done, máscara de senha, anti-duplo-envio): segue no item 18.
- Troca automática de motor de reprodução e retentativa infinita (proibidas pela regra §45).
- Cache offline novo: o app já abre do IndexedDB; não se cria armazenamento adicional.
- Timeshift/catch-up (item 43), teste de velocidade (item 54).
- Medição de rede própria (ping/banda): `navigator.onLine` é só o sinal inicial; o sucesso real de requisição/stream é a verificação final.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rede e lifecycle no player e no shell (Priority: P1)

A pessoa assiste a um canal ou filme. A rede cai, ou ela oculta o app e volta. O app diz o que está acontecendo, tenta recuperar sozinho dentro de limites e nunca deixa a pessoa num beco sem foco.

**Why this priority**: é o cenário de falha mais frequente numa TV doméstica (Wi-Fi instável, app em segundo plano) e hoje só tem tratamento parcial (feature 020 pausa/fecha ao ocultar; `OfflineBanner` existe como componente).

**Independent Test**: simular perda de rede durante reprodução (Live e VOD) e ocultar/retomar o app com e sem rede; conferir estados, foco e ações sem depender das demais histórias.

**Acceptance Scenarios**:

1. **Given** um canal tocando, **When** o stream cai com a rede disponível, **Then** aparece "Reconectando…" e o app tenta reabrir até 3 vezes com espera crescente; se todas falham, mostra erro com "Tentar novamente" focado.
2. **Given** um filme tocando, **When** o stream cai com a rede disponível, **Then** a reconexão retoma da posição atual (nunca do zero) e, esgotadas as tentativas, mostra o erro sem perder a posição salva.
3. **Given** a rede indisponível, **When** a queda é detectada, **Then** nenhuma tentativa automática ocorre, o banner offline aparece com "Tentar novamente" focável e o app não fica em laço.
4. **Given** um filme pausado e o app oculto, **When** a pessoa volta com a rede ainda fora, **Then** aparece "Verificando rede", o filme **permanece pausado na mesma posição**, com aviso e "Tentar novamente"; quando a rede volta, a URL é reconfirmada (como na 020) e só então o play é liberado.
5. **Given** o app oculto, **When** `visibilitychange` ocorre, **Then** timers do app são suspensos e o foco essencial persistido; ao retomar, a ordem é rede → estado → foco → player.
6. **Given** uma tela sob o shell, **When** a rede cai, **Then** um banner explica o estado, a navegação em conteúdo local continua e só ações que dependem de internet ficam bloqueadas (soft disabled com motivo).
7. **Given** o banner offline visível, **When** a conexão é restabelecida, **Then** ele some sozinho e o foco permanece onde estava.

---

### User Story 2 - Erro de reprodução acionável com código e Info técnica (Priority: P1)

Quando um stream falha, a pessoa entende a categoria (rede, formato, fonte expirada ou credencial recusada), vê um código discreto e tem no máximo 3 ações.

**Why this priority**: hoje a mensagem de reprodução é genérica (bug `mensagem-generica-erro-reproducao` só ajustou o rótulo); sem causa a pessoa não sabe se deve esperar, tentar de novo ou editar a lista.

**Independent Test**: forçar cada categoria de falha no adaptador (rede, codec não suportado, 401/403 da fonte, URL expirada) e conferir mensagem, código, ações e conteúdo da Info técnica.

**Acceptance Scenarios**:

1. **Given** falha de reprodução por rede, **When** o erro aparece, **Then** diz o que houve e por quê, mostra um código `NET-xx`/`PLAY-xx` e "Tentar novamente" como ação primária focada.
2. **Given** falha por credencial recusada/conta expirada, **When** o erro aparece, **Then** a ação primária é "Editar credenciais" e o código é da família `SRC-xx` (reaproveitando o nome "Credencial inválida" da feature 034).
3. **Given** falha por formato/codec não suportado, **When** o erro aparece, **Then** a ação primária é "Info técnica" e o app não troca de motor sozinho nem repete em laço.
4. **Given** qualquer erro de reprodução, **When** a pessoa abre "Info técnica", **Then** vê código, categoria da causa, tipo de mídia, motor e horário — e **nunca** URL, host, usuário, senha, nem erro cru do motor.
5. **Given** o erro aberto, **When** a pessoa aperta RETURN, **Then** volta ao contexto anterior com foco restaurado; há no máximo 3 ações, todas focáveis.

---

### User Story 3 - Taxonomia nos erros de catálogo, fonte, EPG, metadados e trailer (Priority: P2)

Os erros de carga de categoria, de fonte (sincronização, conta), de EPG, de metadados/TMDB e de trailer seguem a mesma estrutura: causa, uma ação, código.

**Why this priority**: são os pontos onde a pessoa mais encontra falha depois do player, mas cada um já tem tratamento; aqui só se unifica.

**Independent Test**: provocar cada falha (categoria sem rede, painel 429, EPG indisponível, TMDB 401/429, trailer sem início) e verificar o padrão sem abrir o player.

**Acceptance Scenarios**:

1. **Given** falha ao carregar uma categoria, **When** o estado de erro aparece, **Then** mostra código e "Tentar novamente" focável, preservando o conteúdo já visível.
2. **Given** o painel respondendo limite de API, **When** a pré-carga em segundo plano recebe 429, **Then** ela pausa por um tempo, mostra o estado no Início sem toast por categoria e retoma sozinha quando possível.
3. **Given** falha do EPG, **When** o erro aparece, **Then** usa o código já existente `EPG-02` dentro da mesma tabela de códigos.
4. **Given** erro 401/429 do TMDB, **When** exibido em Integrações/dock, **Then** segue a taxonomia sem toast por detalhe (comportamento da 032 preservado).

---

### User Story 4 - Taxonomia nos demais avisos e no formulário de lista (Priority: P3)

Os erros da conexão de uma lista (endereço inválido, falha de conexão, autenticação recusada, resposta incompatível) ganham a mesma estrutura — aparecem na tela de progresso da importação, onde o erro de fato surge. Só códigos e mensagens distintas; o acabamento do IME fica no item 18. *(Emenda de 2026-10-01: os avisos transitórios de operação local — favorito, histórico, ator, semelhantes, zapping — saíram deste escopo; ver FR-015.)*

**Why this priority**: coerência final; valor menor por tela, e o formulário compartilha a taxonomia com o item 18.

**Independent Test**: provocar os quatro erros do formulário e uma falha de gravação de favorito; conferir código e ação sem tocar em IME.

**Acceptance Scenarios**:

1. **Given** o formulário de lista, **When** o endereço é inválido, a conexão falha, a autenticação é recusada ou a resposta é incompatível, **Then** cada caso tem mensagem distinta, código próprio e uma ação clara.
2. **Given** qualquer aviso migrado, **When** exibido, **Then** o foco permanece previsível e nenhuma credencial aparece.

---

### Edge Cases

- A rede cai e volta durante as 3 tentativas: a reconexão em andamento é cancelada/concluída sem abrir sessão duplicada (`webapis.avplay` é singleton); uma troca de canal por zapping descarta a reconexão pendente.
- `navigator.onLine` diz online, mas nenhuma requisição passa (rede cativa, DNS): o resultado real da requisição/stream prevalece e o estado vira offline/erro.
- Canal ao vivo oculto: o app já fecha a camada (feature 020, `canPause=false`); ao voltar, não há reconexão automática, só o estado de rede.
- Pessoa aperta "Tentar novamente" repetidamente: single-flight, uma tentativa por vez.
- Erro durante o autoplay do próximo episódio: segue a mesma taxonomia, sem perder a lista de episódios nem a posição salva.
- Credenciais nunca aparecem em Info técnica, código, mensagem, log ou `aria-*` (constituição).
- Reduced motion ativo: indicadores "Reconectando…"/"Verificando rede" não dependem de animação.
- Estados de erro/offline sempre têm ao menos um elemento focável (nenhum beco sem saída).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE representar explicitamente os estados `online`, `offline`, `suspenso`, `retomado`, `verificando rede` e `reconectando stream`, derivados de sinais reais (eventos de rede, visibilidade, resultado de requisição/stream), nunca de valor estático.
- **FR-002**: O sistema DEVE tratar `navigator.onLine` apenas como sinal inicial; o resultado real de requisição ou stream DEVE prevalecer.
- **FR-003**: O sistema DEVE exibir banner de offline nas telas sob o shell e no player, explicando o estado, com "Tentar novamente" focável, e removê-lo ao restabelecer a conexão.
- **FR-004**: Offline DEVE bloquear apenas ações que dependem de internet (soft disabled com motivo no nome acessível) e preservar a navegação em conteúdo local/cacheado.
- **FR-005**: Ao ocultar o app, o sistema DEVE suspender timers próprios, evitar novas chamadas BYOK/TMDB e persistir o foco essencial.
- **FR-006**: Ao retomar, o sistema DEVE seguir a ordem rede → estado → foco → player, e NÃO DEVE retomar stream automaticamente enquanto a conexão estiver indisponível.
- **FR-007**: Filme/episódio pausado e retomado sem rede DEVE permanecer pausado na mesma posição, com aviso e "Tentar novamente"; ao voltar a rede, a URL DEVE ser reconfirmada antes de liberar o play.
- **FR-008**: Quando o stream cai com a rede disponível, o sistema DEVE tentar reconectar automaticamente até 3 vezes com espera crescente e, depois, mostrar o erro; NUNCA DEVE haver retentativa infinita.
- **FR-009**: A reconexão de Live DEVE reabrir o canal; a de VOD DEVE retomar da posição atual.
- **FR-010**: Reconexão e "Tentar novamente" DEVEM ser single-flight e DEVEM ser descartadas por uma troca de canal/episódio ou fechamento do player.
- **FR-011**: Todo erro exibido DEVE dizer o que aconteceu, quando possível o porquê, oferecer **uma** ação primária e mostrar um código discreto de uma única tabela de códigos (`NET`, `SRC`, `PLAY`, `API`, `EPG`, ...).
- **FR-012**: O erro de reprodução DEVE distinguir ao menos rede, formato/codec e fonte (expirada/credencial recusada), com no máximo 3 ações (Tentar novamente / Info técnica / Editar credenciais), conforme a causa.
- **FR-013**: O sistema NÃO DEVE trocar de motor de reprodução sozinho.
- **FR-014**: "Info técnica" DEVE mostrar código, categoria da causa, tipo de mídia, motor e horário, e NÃO DEVE conter URL, host, usuário, senha, nem erro cru do motor.
- **FR-015**: A taxonomia DEVE ser aplicada, em ondas, a: P1 player e rede; P2 carga de categoria, fonte, EPG, metadados/TMDB e trailer; P3 erros da conexão de uma lista (cadastro/progresso da importação). *Emenda aprovada em 2026-10-01 (T049): os avisos transitórios de operação **local** — favorito, histórico, ator, semelhantes, zapping — ficam fora, porque não têm causa de rede/fonte/serviço nem ação nova a oferecer.*
- **FR-016**: O formulário de lista DEVE distinguir endereço inválido, falha de conexão, autenticação recusada e resposta incompatível, cada um com código e ação; teclado/IME fora do escopo.
- **FR-017**: A pré-carga em segundo plano DEVE pausar com app oculto/offline (já existente) e, ao receber 429 do painel, DEVE aguardar antes de retomar, sem exibir toast por categoria e mostrando o estado no Início.
- **FR-018**: Todo estado de erro, offline, verificando rede e reconectando DEVE ter ao menos um elemento focável, preservar foco e contexto, e ter nome acessível; o aviso DEVE ser anunciado pela região `aria-live` existente sem interromper em excesso.
- **FR-019**: Nenhum código, mensagem, Info técnica, log ou `aria-*` DEVE conter credencial ou URL de reprodução.
- **FR-020**: Os estados "Reconectando…" e "Verificando rede" NÃO DEVEM depender de animação nem só de cor (reduced motion e DS §11).
- **FR-021**: RETURN em qualquer estado de erro/offline DEVE restaurar o contexto anterior (por id, não por índice).

### Key Entities *(include if feature involves data)*

- **Estado de rede/lifecycle**: valor derivado em memória (um dos seis estados do §40.1); não persiste.
- **Erro acionável**: código, categoria da causa, mensagem, motivo, ação primária e ações secundárias (≤ 3 na reprodução), sem dado sensível.
- **Diagnóstico de reprodução**: conteúdo sanitizado da Info técnica (código, categoria, mídia, motor, horário), apenas em memória.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de falha de reprodução simulados (rede, formato, fonte expirada, credencial recusada), o erro mostra causa, código e uma ação primária focada.
- **SC-002**: Em perda de rede com stream ativo, nenhuma tentativa automática excede 3 e não há laço; em 10/10 execuções o estado final tem foco em elemento acionável.
- **SC-003**: Em 10/10 retomadas sem rede, o filme pausado mantém a posição exata e não retoma sozinho; com rede, o play só é liberado após reconfirmação.
- **SC-004**: Varredura automática de todas as telas migradas não encontra credencial, host ou URL de reprodução em código, Info técnica, anúncio ou atributos de acessibilidade.
- **SC-005**: Todo estado de erro/offline das telas migradas tem pelo menos um elemento focável (verificado por teste de foco por tela).
- **SC-006**: Pressionar "Tentar novamente" em sequência rápida dispara no máximo uma tentativa por vez.
- **SC-007**: Com a pré-carga em curso, um 429 do painel não gera mais de um aviso visível e a pré-carga retoma sem intervenção quando o limite passa.

## Assumptions

- A tabela de códigos concreta (famílias e números) e a classificação por tipo de falha do adaptador são decisões do `sdd-plan`; esta spec fixa só as famílias do §45 e as categorias de causa.
- O "Reconectando…" usa o `PlayerAdapter` existente; se o AVPlay não distinguir causas, a categoria cai em "desconhecida" com "Tentar novamente", nunca em suposição.
- A feature 034 já entregou o estado "Credencial inválida"; o código `SRC-401` reaproveita esse nome.
- A passada na TV física é recomendada, não gate obrigatório, exceto se o plano declarar exceção para o comportamento de reconexão do AVPlay.
- Não há mudança de schema esperada (estado de rede e diagnóstico ficam em memória).

## Clarifications

### Sessão 2026-10-01

- Q: Qual o alcance dos erros com código (§45)? → A: Todas as telas com erro.
- Q: Como priorizar para continuar entregável por partes? → A: P1 player+rede, P2 catálogo/fonte/EPG/TMDB, P3 resto.
- Q: Onde aparecem o banner offline e "verificando rede"? → A: Global no shell + player.
- Q: Como se comporta o "reconectando stream"? → A: Automático e limitado a 3 tentativas, só com rede; Live reabre o canal, VOD retoma da posição.
- Q: O que a "Info técnica" mostra? → A: Código + categoria + hora, sem dado sensível; nunca erro cru do motor.
- Q: Os 4 erros do formulário (item 18) entram? → A: Só os códigos/ação; o acabamento do IME fica no item 18.
- Q: Retomar sem rede com filme pausado? → A: Fica pausado com aviso e "Tentar novamente"; reconfirma a URL ao voltar a rede.
- Q: Pré-carga frente a rede e 429? → A: Mantém a pausa offline/oculto e passa a respeitar 429 com espera.

### Sessão 2026-10-01 (convergência)

- Q: T049 — os toasts de operação local (P3) migram para a tabela de códigos ou a spec é emendada? → A: Emendar a spec (FR-015): P3 vale só para erros com causa de rede/fonte/serviço; os toasts de operação local ficam como estão (R-014 do plan.md resolvida).
