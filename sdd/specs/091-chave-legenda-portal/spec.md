# Feature Specification: Chave de legenda digitada no portal

**Slug**: `091-chave-legenda-portal`

**Created**: 2026-10-23

**Status**: Convergida

**Input**: "Abra a feature 'chave de legenda pelo portal' — hoje já temos o TMDB, podemos incluir na mesma sessão como já é feito com ele." Motivo (do usuário, ao medir a feature 090 na TV): *"Muito difícil digitar manualmente. Precisa ter opção pelo portal ou de copiar e colar pelo celular."*

## Escopo

### Incluído

- No **portal** (celular/PC), em **Ajustes**, a pessoa **adiciona, substitui e remove** a chave pessoal do **OpenSubtitles** e a do **SubDL**, por colagem, no mesmo molde da chave TMDB (feature 077, ADR-020, exceção (j) da constitution).
- A chave segue **cifrada pelo serviço** até a TV aplicá-la no próximo **Atualizar**; o portal mostra o **estado real** por fornecedor (aguardando a TV, aplicada, recusada pelo fornecedor, removida) e **nunca** exibe a chave de volta.
- Na **TV**, o mesmo **Atualizar** do card TMDB (aba Integrações) passa a buscar também as chaves de legenda pendentes; a seção **Legendas** mostra o resultado por fornecedor e tem o seu próprio **Atualizar**.
- A TV aplica a chave pelo caminho que já existe (`saveSubtitleKey`: formato, teste **no fornecedor** antes de gravar, `chosen = true`); recusada, nada é trocado.
- **Gate de governança**: ADR nova + emenda da constitution (exceção nova no molde da (j)) **antes** de qualquer código que envie a chave de legenda ao serviço.

### Fora de Escopo

- A TV **não** pede confirmação antes de aplicar (mesma decisão da ADR-020); quem tem a sessão do portal pode trocar a chave.
- Não existe "cancelar envio pendente" nem "Usar o padrão do ccplayTv" pelo portal (a pessoa substitui ou remove; "usar o padrão" continua na TV).
- Nenhuma chave **padrão** do desenvolvedor passa por aqui (continua só no serviço, exceção (k)); só chave **da pessoa**.
- O portal **não** mostra, mascara nem confere o valor de uma chave guardada na TV (só "tem chave / estado").
- OpenAI e qualquer outro BYOK **não** herdam esta exceção.
- Envio automático à TV (push): a TV só busca no **Atualizar** (ADR-016, nenhuma consulta automática).
- Mudar o que a TV faz com a chave depois de aplicada (busca direta ao fornecedor, 090) ou o serviço de legendas do ccplayTv.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Colar a chave no celular e a TV aplicar no Atualizar (Priority: P1)

A pessoa abre o portal no celular, vai em **Ajustes → Chaves de legenda**, escolhe **SubDL** (ou **OpenSubtitles**), cola a chave e envia. O portal diz **"Enviado — na TV, aperte Atualizar"**. Na TV, em **Configurações → Integrações**, ela aperta **Atualizar**; a TV busca a chave, testa no fornecedor, grava e passa a usá-la. O portal passa a mostrar **"Aplicada na TV"**.

**Why this priority**: é o motivo da feature — digitar a chave com o controle é "muito difícil".

**Independent Test**: com a TV pareada e o serviço de pé (ou simulado), enviar uma chave de legenda pelo portal, apertar Atualizar na TV e ver a chave em uso (linha do fornecedor na seção Legendas) e o portal em "Aplicada na TV", sem a chave aparecer em lugar nenhum do navegador.

**Acceptance Scenarios**:

1. **Given** nenhuma chave de legenda, **When** a pessoa abre Ajustes → Chaves de legenda, **Then** vê uma linha por fornecedor (OpenSubtitles, SubDL) com "Não configurada", um campo oculto por padrão (com olho) e um link de onde criar a chave.
2. **Given** uma chave com formato aceitável colada, **When** a pessoa envia, **Then** o campo é limpo, o portal mostra "Enviado — na TV, aperte Atualizar" e a chave não aparece em endereço, histórico, armazenamento do navegador, log ou erro.
3. **Given** uma chave pendente, **When** a pessoa aperta **Atualizar** no card TMDB da aba Integrações, **Then** a TV aplica a chave TMDB (se houver) **e** a de legenda pendente, e mostra um resultado por fornecedor.
4. **Given** uma chave de legenda pendente, **When** a pessoa aperta o **Atualizar** da seção **Legendas**, **Then** a TV aplica só as chaves de legenda pendentes.
5. **Given** o fornecedor aceita a chave no teste da TV, **When** a TV a aplica, **Then** a linha do fornecedor mostra "Sua chave — válida", a chave fica em uso e o portal mostra "Aplicada na TV" depois do ack.
6. **Given** o fornecedor recusa a chave, **When** a TV a testa, **Then** nada é trocado (a chave anterior, se houver, fica), a TV mostra o motivo e o portal mostra "Recusada pelo fornecedor" com a ação de substituir.

---

### User Story 2 - Substituir uma chave e entender o que está acontecendo (Priority: P2)

A pessoa troca a chave de um fornecedor (a anterior nunca aparece), vê o estado de cada fornecedor com clareza e entende o que fazer quando a TV está desligada, offline ou o fornecedor está no limite.

**Why this priority**: sem isso o primeiro erro de colagem ou uma TV desligada deixa a pessoa sem saída.

**Independent Test**: enviar duas chaves seguidas para o mesmo fornecedor; só a última fica pendente. Com a TV sem rede no Atualizar, o portal continua em "Aguardando a TV" e a chave não se perde.

**Acceptance Scenarios**:

1. **Given** uma chave pendente, **When** a pessoa envia outra para o mesmo fornecedor, **Then** a nova substitui a pendente (uma pendente por fornecedor) e o portal continua mostrando "Aguardando a TV".
2. **Given** a TV sem rede ou o fornecedor fora do ar no Atualizar, **When** a TV tenta aplicar, **Then** a operação continua pendente (o motivo "offline"/"limite" aparece no portal) e a próxima tentativa reutiliza a mesma chave.
3. **Given** uma chave aplicada, **When** a pessoa abre a linha no portal, **Then** vê "Aplicada na TV" e a ação **Substituir** — nunca a chave.
4. **Given** uma TV antiga (sem este suporte), **When** o portal consulta o estado, **Then** mostra "Estado desconhecido" em vez de afirmar algo.

---

### User Story 3 - Remover a chave pelo portal (Priority: P3)

A pessoa remove a chave pessoal de um fornecedor pelo portal (com confirmação no portal); a TV a apaga no próximo Atualizar e o fornecedor volta ao "Padrão do ccplayTv" (ou "Sem chave" no build base).

**Why this priority**: arremata o ciclo de vida; menos urgente que enviar e trocar.

**Independent Test**: com uma chave aplicada, remover pelo portal e apertar Atualizar na TV; a linha do fornecedor volta ao padrão e o portal mostra "Não configurada".

**Acceptance Scenarios**:

1. **Given** uma chave aplicada, **When** a pessoa escolhe Remover e confirma, **Then** o portal mostra "Remoção enviada — na TV, aperte Atualizar".
2. **Given** a remoção pendente, **When** a TV aplica no Atualizar, **Then** a chave sai do aparelho e o portal mostra "Não configurada".
3. **Given** o fornecedor sem chave na TV, **When** a pessoa remove, **Then** o portal explica que não há o que remover (sem enviar operação).

---

### Edge Cases

- Formato claramente inválido (espaço, aspas, curto demais): recusado **antes** de enviar, sem eco do que foi colado.
- Envio com a TV desligada por dias: a operação expira (7 dias) e o segredo é apagado do serviço; o portal volta a "Não configurada"/estado anterior com a explicação.
- Fornecedor no limite diário na hora do teste: a TV não grava, a operação fica pendente com motivo `limit`; tentar de novo depois.
- Chave digitada na TV **e** pelo portal: vale a última aplicada; o portal mostra "Configurada na TV" quando só a TV sabe.
- TV sem licença/teste ativo: a chave pessoal funciona sem licença (090); o envio pelo portal segue a mesma regra do TMDB (assumida, ver Assumptions).
- Substituir enquanto uma remoção está pendente (e vice-versa): a última operação vence.
- Dispositivo apagado/desvinculado: o envelope pendente é apagado.
- Dois navegadores enviando ao mesmo tempo: vale a última, sem mistura.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: No portal, **Ajustes** DEVE ter uma entrada **Chaves de legenda** (junto da Chave TMDB), com uma linha por fornecedor (OpenSubtitles e SubDL), cada uma com estado, descrição curta e as ações Adicionar/Substituir e Remover.
- **FR-002**: O campo da chave DEVE ser oculto por padrão (com olho), validar o formato antes de enviar, limpar-se após o envio, e a chave NUNCA DEVE ser exibida de volta, nem estar em endereço, histórico, log, erro, analytics ou armazenamento do navegador.
- **FR-003**: O portal DEVE mostrar, por fornecedor, o estado: "Não configurada", "Configurada na TV" (digitada na TV), "Aguardando a TV", "Aplicada na TV", "Recusada pelo fornecedor", "No limite — tentar depois", "Remoção pendente" ou "Estado desconhecido" (TV sem suporte). Todo envio DEVE dizer "Enviado — na TV, aperte Atualizar"; o portal NÃO DEVE sugerir que a TV é atualizada sozinha.
- **FR-004**: O serviço DEVE guardar a chave pendente **cifrada em repouso**, **uma pendente por TV e por fornecedor** (a nova substitui a anterior), entregá-la só à sessão autenticada da mesma TV, e **apagá o envelope** ao ficar aplicada, recusada, substituída, removida, expirada (7 dias) ou com o aparelho apagado/época trocada. NUNCA logá-la nem devolvê-la ao navegador.
- **FR-005**: O mesmo **Atualizar** do card TMDB (aba Integrações) DEVE buscar e aplicar, além da chave TMDB, as chaves de legenda pendentes; a seção **Legendas** DEVE ter um **Atualizar** próprio que aplica só as de legenda e mostra o resultado de cada fornecedor.
- **FR-006**: A TV DEVE aplicar a chave pelo caminho já existente — formato, teste **no próprio fornecedor** antes de gravar, `chosen = true` — e **só** trocar a chave existente depois de o fornecedor aceitar; recusa ou falha do teste nunca troca nada.
- **FR-007**: A TV DEVE devolver ao serviço só o **resultado mínimo** por operação (`applied`, `rejected` ou `retry`, com motivo de uma lista fechada: formato inválido, recusada, offline, limite) — nunca a chave, trecho dela, corpo ou texto do fornecedor; e informar no snapshot, por fornecedor, apenas se há chave pessoal em uso e seu estado (sem o valor).
- **FR-008**: **Remover** pelo portal DEVE exigir confirmação **no portal**, enviar uma operação `remove` aplicada pela TV no mesmo passo do Atualizar (`removeSubtitleKey`), e o portal DEVE passar a "Não configurada" depois do ack.
- **FR-009**: Nenhuma chave de legenda DEVE passar por URL, `Referer`, cache, atributo/texto do DOM depois do envio, checkout, exportação ou backup em claro; o backup 072 NÃO DEVE passar a conter a chave de legenda por causa desta feature.
- **FR-010**: O envio, a consulta e o ack DEVEM entrar no **mesmo limite de tentativas, fila e idempotência** das demais operações do portal (sem infraestrutura nova), e o ack DEVE ser rejeitado se `operationId` não for o pendente.
- **FR-011**: A TV DEVE continuar a funcionar com TVs antigas e serviços antigos: campos novos opcionais; sem suporte, o portal mostra "Estado desconhecido" e a TV ignora o que não conhece.
- **FR-012**: Todos os textos novos (portal e TV) DEVEM existir em português, inglês e espanhol; foco e RETURN da TV seguem a constitution (todo estado com um elemento focável).
- **FR-013**: A TV DEVE continuar a permitir digitar a chave pelo IME (090) — o portal é um caminho a mais, não substitui.
- **FR-014**: A feature NÃO DEVE afetar o desempenho: nada roda fora do Atualizar ou das telas de Integrações/portal; o player e a navegação continuam sem leitura nova (herda D-012 da 090).

### Delivery Gates (decisões fora do código que bloqueiam a entrega)

| Gate | Condição | Libera |
| --- | --- | --- |
| **G-1** | **ADR-022** (chave de legenda digitada no portal) e **emenda da constitution 1.17.0** (exceção nova no molde da (j)) aprovadas pelo usuário | Qualquer código que envie a chave de legenda ao serviço |
| **G-2** | Passada na TV física: chave enviada pelo portal é aplicada no Atualizar, recusada não troca nada, remoção funciona (quickstart) | Declarar a feature entregue (o usuário não quer janela de TV agora: fica como gate de fechamento) |
| **G-3** | Aceitação do BYOK pelos fornecedores em app distribuído (gate G-4 da 090) | Anunciar/oferecer na loja — não bloqueia implementação |

### Key Entities *(include if feature involves data)*

- **Operação de chave de legenda**: pedido do portal à TV, por fornecedor — definir (com o envelope cifrado da chave) ou remover — com identificador, estado (pendente, aplicada, recusada, tentar depois, cancelada, expirada) e datas; **uma pendente por TV e por fornecedor**.
- **Estado da chave de legenda (visto pelo portal)**: por fornecedor — não configurada, configurada na TV, aguardando, aplicada, recusada, no limite, remoção pendente, desconhecida; **sem o valor**.
- **Resultado da TV**: `applied | rejected | retry` + motivo de lista fechada, devolvido no ack.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Enviar a chave de um fornecedor pelo portal leva no máximo 3 toques depois de abrir Ajustes, e a TV a aplica com **um** Atualizar, sem digitar nada no controle.
- **SC-002**: Em 100% dos testes automáticos, a chave enviada não aparece em endereço, armazenamento do navegador, log, erro, corpo de resposta ao navegador, backup em claro ou DOM depois do envio.
- **SC-003**: Uma chave recusada pelo fornecedor nunca substitui a anterior (verificado por teste), e o portal mostra o estado final (Aplicada/Recusada) depois do Atualizar.
- **SC-004**: O envelope cifrado deixa o serviço em até 7 dias no pior caso e imediatamente ao ser aplicado, recusado, substituído ou removido (verificado por teste).
- **SC-005**: Com TV antiga ou serviço sem a rota, o portal e a TV continuam funcionando; o portal mostra "Estado desconhecido" (verificado por teste).
- **SC-006**: Textos novos nos três idiomas passam na auditoria de legibilidade da TV (20 px mínimo, sem corte) e o portal passa nos layouts mobile/tablet/desktop.
- **SC-007**: Nenhuma regressão de desempenho na navegação e na reprodução (mesmos critérios da 090).

## Assumptions

- A TV já sabe testar, guardar e remover a chave de legenda e usá-la direto no fornecedor (feature 090); a feature só acrescenta o caminho portal → serviço → TV e a devolução do resultado.
- O caminho, o ciclo de vida do segredo (cifra de envelope, uma pendente, 7 dias, ack mínimo), os limites e a idempotência **repetem** os da chave TMDB (ADR-020/feature 077); o plano decide como reaproveitar o código sem copiar.
- Assim como a chave TMDB, o envio pelo portal **não** exige licença ativa na TV (a chave pessoal funciona sem licença na 090); o portal é acessível a quem tem o ID e a chave da TV (ADR-014).
- O "Atualizar" da TV é o único gatilho de rede da aplicação da chave (ADR-016).
- O formato aceito é o amplo da 090 (`^[A-Za-z0-9._-]{8,200}$`); o teste no fornecedor é quem decide.
- Build base de loja (sem portal): a feature não existe; a chave continua só digitada na TV.

## Clarifications

### Sessão 2026-10-23

- Q: (do usuário, medindo a 090 na TV) Como evitar digitar a chave com o controle? → A: "Muito difícil digitar manualmente. Precisa ter opção pelo portal ou de copiar e colar pelo celular." → feature nova no molde da chave TMDB pelo portal.
- Q: Pedido de escopo → A: "podemos incluir na mesma sessão como já é feito com ele [o TMDB]": mesmo fluxo e mesmo Atualizar.
- Q: Quais chaves entram? → A: OpenSubtitles **e** SubDL (Recomendada).
- Q: Como a TV busca a chave enviada? → A: O **mesmo Atualizar** do card TMDB busca tudo (TMDB + legendas); a seção Legendas também mostra o resultado e tem o seu Atualizar.
- Q: A ADR-020 exige ADR própria para cada novo BYOK enviado pelo portal; aceita o gate? → A: Sim — ADR-022 + constitution 1.17.0 como gate de entrega (G-1).
- Q: Operações no portal além de enviar? → A: **Enviar/substituir** e **Remover a chave da TV**. Sem cancelar pendente e sem "Usar o padrão" pelo portal.
- Q: (decidido sem perguntar, por herdar a 077) Aplicar sem confirmação na TV, uma pendente por fornecedor, retenção de 7 dias, estado visto pelo portal sem o valor → A: como na ADR-020.
