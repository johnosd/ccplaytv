# Feature Specification: Desvincular a TV do portal e backup dos dados de uso

**Slug**: `072-desvincular-backup`

**Created**: 2026-10-14

**Status**: Convergida

**Input**: "Desvincular a TV do portal (limpar só o pareamento local e parear de novo, preservando listas, favoritos, histórico, progresso, chave TMDB e PIN) e backup dos dados de uso no serviço, preso à identidade da TV e restaurado ao re-parear/reinstalar." Origem: TV física da 070 (2026-10-13) e conversa de 2026-10-14 — hoje a única saída de um pareamento ruim ("não autorizado" ou ID errado) é desinstalar o app e perder tudo.

## Escopo

### Incluído

- **Desvincular**: ação em Configurações → Portal & licença que solta só o pareamento local da TV (identidade, chave, token e filas do portal) e deixa a TV pronta para parear de novo, sem tocar no catálogo nem nos dados de uso.
- **Backup dos dados de uso** no serviço, preso à identidade da TV: favoritos, histórico, progresso de reprodução, categorias ocultas/bloqueadas, PIN por lista (só hash com sal), configurações do app e chave TMDB (cifrada).
- **Restauração** com confirmação depois de reinstalar ou re-parear, aplicando cada dado à sua lista correta.
- **Apagar backup** na TV e no site; o site mostra só data e contagens.

### Fora de Escopo

- Login com Google ou qualquer conta de pessoa (ADR-004: sem conta obrigatória). Fica como ideia futura no backlog.
- Levar os dados para **outra** TV (troca de aparelho): o backup pertence à identidade desta TV.
- Backup das listas: elas já estão no serviço desde a 071 (credenciais cifradas) e voltam pelo fluxo existente.
- Sincronização contínua ou em segundo plano: nada sobe sem ação da pessoa (ADR-016).
- Mais de uma versão de backup, histórico de backups ou edição dos dados de uso pelo site.
- Apagar o registro da TV no serviço ou trocar o ID (ADR-015: o ID é imutável).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Destravar a TV sem perder nada (Priority: P1)

A TV ficou "não autorizado" (o registro dela no serviço foi apagado, a chave não vale mais) ou o pareamento ficou inconsistente. A pessoa vai em Portal & licença → **Desvincular**, confirma, e a TV volta a funcionar com o portal depois de parear de novo — com listas, favoritos, histórico, progresso, chave TMDB e PIN intactos.

**Why this priority**: é a dor que existe hoje: a única saída é desinstalar e perder tudo. Sozinha já entrega valor, mesmo sem backup.

**Independent Test**: com uma TV pareada e com dados de uso, desvincular e parear de novo; conferir que nenhum dado de catálogo/uso mudou e que o portal volta a responder.

**Acceptance Scenarios**:

1. **Given** uma TV pareada com listas e dados de uso, **When** a pessoa aperta Desvincular e confirma, **Then** a identidade e as filas do portal somem do aparelho e listas, favoritos, histórico, progresso, chave TMDB e PIN continuam iguais.
2. **Given** a TV desvinculada, **When** a pessoa abre uma tela que precisa de ID/chave ou aperta Atualizar, **Then** a TV pareia de novo e, sendo o mesmo aparelho, volta à **mesma** identidade no serviço (mesmo ID, mesmas listas no site, mesma licença); só a chave muda.
3. **Given** internet disponível, **When** a pessoa confirma Desvincular, **Then** o backup é feito antes de soltar o vínculo; **Given** sem internet, **Then** o desvincular acontece mesmo assim e a confirmação avisa que o backup não foi feito.
4. **Given** o diálogo de confirmação aberto, **When** a pessoa escolhe Cancelar ou aperta RETURN, **Then** nada muda e o foco volta ao botão Desvincular.

---

### User Story 2 - Fazer backup dos dados de uso (Priority: P1)

A pessoa aperta **Atualizar** na tela de listas ou **Fazer backup agora** em Portal & licença, e os dados de uso da TV ficam guardados no serviço, substituindo o backup anterior.

**Why this priority**: sem backup, reinstalar continua perdendo favoritos, histórico e progresso — metade da dor original.

**Independent Test**: com dados de uso na TV, apertar Fazer backup agora; conferir no serviço que existe um backup desta TV com as contagens corretas e sem nenhum segredo em claro.

**Acceptance Scenarios**:

1. **Given** dados de uso na TV, **When** a pessoa aperta Atualizar na tela de listas, **Then** o backup sobe junto, sem requisição extra perceptível e sem atraso na lista.
2. **Given** Portal & licença aberto, **When** a pessoa aperta Fazer backup agora, **Then** o backup sobe e a tela mostra data/hora do último backup.
3. **Given** um backup anterior, **When** um novo é feito, **Then** ele substitui o anterior (só a última versão fica).
4. **Given** sem internet, **When** a pessoa pede o backup, **Then** aparece "sem internet" e nada é perdido; nenhuma nova tentativa automática é agendada.
5. **Given** o app parado em qualquer tela, **When** passa o tempo, **Then** nenhum backup sobe sozinho.

---

### User Story 3 - Restaurar depois de reinstalar ou re-parear (Priority: P1)

Depois de reinstalar o app (ou desvincular e parear de novo), a TV volta à mesma identidade e encontra um backup. Ela pergunta **"Restaurar backup de <data>?"**; a pessoa confirma e favoritos, histórico, progresso, preferências, PIN, configurações e chave TMDB voltam, cada um na sua lista.

**Why this priority**: é o que fecha a dor da reinstalação; sem restauração o backup não serve.

**Independent Test**: fazer backup, apagar os dados locais (ou reinstalar), parear de novo, aceitar a restauração; conferir que cada favorito/histórico/progresso voltou à lista certa.

**Acceptance Scenarios**:

1. **Given** um backup no serviço e a TV pareada de novo, **When** a TV sabe do backup (na primeira ação que fala com o serviço), **Then** mostra "Restaurar backup de <data>?" com Restaurar / Agora não, focável.
2. **Given** a pessoa escolhe Restaurar, **When** a lista dona de um dado já existe na TV, **Then** o dado é aplicado a essa lista (identidade lógica: lista + tipo + id estável + temporada/episódio, nunca a URL do stream).
3. **Given** a lista dona ainda não existe na TV, **When** a restauração roda, **Then** os dados dela ficam pendentes e são aplicados sozinhos quando a lista voltar com o mesmo identificador; passados **5 dias** sem a lista aparecer, os pendentes são descartados.
4. **Given** a TV já tem dados de uso, **When** a restauração roda, **Then** os conjuntos são mesclados (união) e, para o mesmo item, vale o registro mais recente; nada local é perdido.
5. **Given** a pessoa escolhe Agora não, **When** volta depois, **Then** pode restaurar por Portal & licença → Restaurar backup; a pergunta não reaparece sozinha a cada abertura.

---

### User Story 4 - Apagar o backup (Priority: P2)

A pessoa decide que não quer mais os dados de uso guardados e apaga o backup, pela TV (Portal & licença) ou pelo site.

**Why this priority**: privacidade (dado pessoal na nuvem); não bloqueia o uso principal.

**Independent Test**: apagar pela TV e pelo site; conferir que o serviço não guarda mais nada e que a TV/site mostram "sem backup".

**Acceptance Scenarios**:

1. **Given** um backup, **When** a pessoa aperta Apagar backup na TV e confirma, **Then** o serviço apaga o backup e a TV mostra "sem backup".
2. **Given** o painel do site desta TV, **When** a pessoa apaga o backup e confirma, **Then** o mesmo efeito, e a TV fica sabendo no próximo Atualizar.
3. **Given** o site, **When** a pessoa olha o backup, **Then** vê só a data e as contagens (ex.: "32 favoritos, 120 no histórico"), nunca títulos, nomes de canais nem a chave TMDB.

### Edge Cases

- A TV nunca foi pareada: Desvincular fica indisponível (soft-disabled com motivo) — não há o que soltar.
- Desvincular no meio de um Atualizar ou envio: a ação espera o envio em curso terminar ou o cancela, nunca deixa fila pela metade apontando para a identidade antiga.
- Pareamento novo devolve outra identidade (aparelho sem MAC estável, ou registro que o serviço não reconhece): sem backup daquela identidade, não há o que oferecer; os dados locais continuam intactos (o desvincular nunca apaga dado de uso).
- Lista removida depois do backup: o próximo backup reflete o estado atual (sem os dados dela).
- Backup com uma lista cujo PIN mudou: vale o mais recente (regra de mescla), com o PIN sempre como hash.
- Restaurar com a chave TMDB local já configurada: vale a da TV (foi digitada nesta TV, depois do backup); o backup só preenche se a TV não tiver chave (execute, A002). A chave nunca aparece na tela nem em log.
- Backup grande (milhares de itens de histórico): sobe em partes ou com limite documentado, sem travar a tela; o plano define o teto.
- Pendentes de restauração e a pessoa apaga o backup: os pendentes locais também são descartados.
- Licença vencida: desvincular, backup, restaurar e apagar continuam disponíveis (não abrem lista).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Portal & licença DEVE oferecer **Desvincular** com confirmação explícita (Cancelar com foco inicial); RETURN cancela.
- **FR-002**: Desvincular DEVE apagar só o pareamento local (identidade, chave, token, licença em cache e fila de envios de listas) e NUNCA listas, catálogo, favoritos, histórico, progresso, preferências, PIN, chave TMDB, teste local ou a fila de exclusões pendentes. **Esclarecimento (execute, A001):** a fila de exclusões é intenção da pessoa e é preservada para a lista excluída não reaparecer no site.
- **FR-003**: Com internet, Desvincular DEVE fazer o backup antes de soltar o vínculo; sem internet, DEVE prosseguir avisando que o backup não foi feito.
- **FR-004**: Depois de desvincular, a TV DEVE parear de novo só por ação da pessoa (tela que precisa de ID/chave ou Atualizar) e, sendo o mesmo aparelho, voltar à mesma identidade no serviço (mesmo ID — ADR-015 —, listas do site, licença e backup), com chave nova.
- **FR-005**: O backup DEVE conter favoritos, histórico, progresso, categorias ocultas/bloqueadas, PIN por lista (só hash com sal), configurações do app e a chave TMDB **cifrada**, e NUNCA URLs de stream, credenciais de provedor ou dados do catálogo.
- **FR-006**: O backup DEVE subir só por ação da pessoa: junto do Atualizar da tela de listas e pelo botão Fazer backup agora; nenhum envio automático, periódico ou na abertura (ADR-016).
- **FR-007**: O serviço DEVE guardar só a última versão do backup por TV; um backup novo substitui o anterior.
- **FR-008**: Cada dado do backup DEVE ser identificado pela lista e pela identidade lógica do item (lista + tipo + id estável + temporada/episódio), nunca pela URL do stream.
- **FR-009**: Quando houver backup e a TV pareada de novo, a TV DEVE oferecer "Restaurar backup de <data>?" com confirmação, uma vez; recusar deixa a restauração disponível em Portal & licença.
- **FR-010**: A restauração DEVE mesclar com os dados locais (união; para o mesmo item vale o mais recente) e aplicar cada dado à sua lista.
- **FR-011**: Dados de uma lista ausente DEVEM ficar pendentes e ser aplicados quando a lista voltar com o mesmo identificador; pendentes não aplicados em **5 dias** DEVEM ser descartados.
- **FR-012**: A pessoa DEVE poder apagar o backup na TV (Portal & licença) e no site, com confirmação; apagar descarta também os pendentes locais.
- **FR-013**: O site DEVE mostrar do backup só a data e as contagens; nunca títulos, nomes de canais, PIN ou chave TMDB.
- **FR-014**: O backup DEVE ser lido e escrito só pela própria TV (e apagado/visto em contagens pela sessão do painel da mesma TV); nenhum outro dispositivo acessa.
- **FR-015**: A chave TMDB e qualquer dado do backup NUNCA aparecem em log, URL, mensagem de erro, cabeçalho de cache ou analytics; a chave TMDB só volta à própria TV.
- **FR-016**: A constitution DEVE ser emendada antes da implementação para permitir a chave TMDB (BYOK) cifrada em backup no serviço, só para a mesma TV — hoje ela proíbe segredo em backup/exportação.
- **FR-017**: Todo estado novo (carregando, sem internet, erro com código, sem backup, pendentes) DEVE ter elemento focável; textos novos em pt/en/es, mínimo de 20 px.

### Key Entities

- **Pareamento local**: identidade da TV no portal guardada no aparelho (ID, chave, token, filas e estados do portal). É o que o Desvincular apaga.
- **Backup de uso**: um por identidade de TV; data, versão do formato, contagens e o conteúdo (favoritos, histórico, progresso, preferências de categoria, PIN em hash, configurações do app, chave TMDB cifrada).
- **Item de uso**: dado de uma lista, identificado por lista + tipo + id estável + temporada/episódio, com o instante da última alteração (base da mescla).
- **Pendente de restauração**: itens de uma lista ainda ausente, com prazo de 5 dias a partir da restauração.

### Measurable Outcomes

- **SC-001**: Depois de desvincular e parear de novo, **100%** das listas, favoritos, histórico, progresso, PIN e chave TMDB continuam no aparelho (comparação antes/depois).
- **SC-002**: Uma TV travada em "não autorizado" volta a falar com o portal sem desinstalar, em até **3 ações** a partir de Portal & licença.
- **SC-003**: Depois de reinstalar e restaurar, **100%** dos favoritos, histórico e progresso das listas presentes voltam à lista correta.
- **SC-004**: Com o app parado 24 h em qualquer tela, **0** requisições de backup.
- **SC-005**: Nenhuma chave TMDB, PIN, URL de stream ou credencial aparece em log, URL enviada ao servidor, erro ou no site, em inspeção com marcadores fictícios.
- **SC-006**: Apagar o backup (TV ou site) faz o serviço não guardar mais nenhum dado de uso daquela TV.
- **SC-007**: 100% dos textos novos legíveis e sem corte em pt/en/es, mínimo de 20 px.

## Assumptions

- A identidade "mesmo aparelho" segue a ADR-015 (MAC real congelado ou ID derivado do DUID): reinstalar ou desvincular no mesmo aparelho volta ao mesmo ID; o mecanismo de reassociação (código de recuperação da 069 ou outro) é decisão do plano.
- As listas voltam pelo fluxo da 071 com o mesmo identificador de lista, o que permite casar os dados do backup com a lista certa.
- O tamanho do backup é limitado pelo plano (teto documentado, envio em partes se preciso).
- Backup e restauração reaproveitam a autenticação da TV já existente (bearer da TV); o site só vê contagens e apaga, pela sessão da mesma TV.
- A venda continua desligada; nada aqui depende de pagamento.
- O Desvincular não remove nada no serviço; o registro antigo continua lá (ADR-015).

## Clarifications

### Sessão 2026-10-14

- Q: O que entra no backup? → A: favoritos, histórico e progresso; categorias ocultas/bloqueadas e PIN; configurações do app; chave TMDB. Favoritos, histórico e progresso pertencem a uma lista e precisam ser restaurados para a lista existente correta.
- Q: Quando o backup sobe? → A: junto do Atualizar e por um botão próprio (Fazer backup agora); nada automático.
- Q: Como a restauração acontece? → A: perguntando com confirmação.
- Q: Depois de desvincular e parear de novo, a TV volta a ser a mesma? → A: sim, mesma TV quando possível (mesmo ID, listas, licença e backup).
- Q: Lista dona dos dados ainda ausente na restauração? → A: guardar e aplicar quando a lista voltar; excluir após 5 dias se não encontrar.
- Q: Conflito entre dados locais e backup? → A: mesclar (união), o mais recente vence.
- Q: Onde fica o Desvincular? → A: Portal & licença, com confirmação e backup antes.
- Q: A pessoa pode apagar o backup? → A: sim, na TV e no site.
- Q: Quantas versões de backup? → A: só a última.
- Q: O que o site mostra do backup? → A: só data e contagens.
- Q: Sem internet, o Desvincular pode acontecer? → A: sim, avisando que o backup não foi feito.
- Q: (execute) Chave TMDB local e do backup diferentes? → A: vale a da TV; o backup só preenche se não houver chave.
- Q: (execute) A fila de exclusões pendentes é apagada no Desvincular? → A: não, é preservada.
