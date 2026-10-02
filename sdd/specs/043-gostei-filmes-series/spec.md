# Feature Specification: "Gostei" em filmes e séries

**Slug**: `043-gostei-filmes-series`

**Created**: 2026-10-01

**Status**: Especificada

**Input**: Item 27 do backlog (trilha D): sinal explícito "Gostei" em filmes e séries, distinto de favorito e de histórico, persistido por identidade lógica estável. Base do item 30 (recomendações).

## Escopo

### Incluído

- Um sinal binário "Gostei" (marcado / sem marca) para filme e para série.
- Ação "Gostei" na tela de detalhe de filme e de série, com estado visível (ícone + texto, nunca só cor).
- Marcador discreto de "Gostei" nos cards de filme/série onde o card é exibido.
- Persistência por identidade lógica estável (lista + tipo + id estável da obra), sem depender da URL do stream.
- Limpeza do sinal quando a lista é removida, como já acontece com favoritos e retomada.

### Fora de Escopo

- "Não gostei" ou qualquer escala (o valor é guardado de forma que permita estender depois sem migração destrutiva, mas não há UI agora).
- "Gostei" em episódio ou em canal de Live TV: vale só a série como obra.
- Tecla de cor na grade, prompt ao fim da reprodução ou qualquer marcação dentro do player.
- Lista/visão dedicada de curtidos na trilha lateral (fica para o item 30 ou futuro).
- Uso do sinal em recomendações (item 30), reconciliação pós-resync (item 24) e IA (item 31).
- Sincronização entre aparelhos ou exportação.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Marcar e desmarcar "Gostei" no detalhe (Priority: P1)

A pessoa abre o detalhe de um filme ou série e marca "Gostei"; o estado fica visível e permanece ao reabrir, mesmo depois de reiniciar o app ou ressincronizar a lista.

**Why this priority**: é o próprio sinal; sem ele não há base para recomendações. Entrega valor sozinha (a pessoa registra preferência).

**Independent Test**: abrir um filme, marcar, voltar e reabrir (e reiniciar o app); conferir que continua marcado, e desmarcar volta ao estado neutro. Repetir com uma série.

**Acceptance Scenarios**:

1. **Given** um filme sem marca, **When** a pessoa aciona "Gostei" no detalhe, **Then** o estado muda para marcado com ícone e texto distintos, um aviso curto é anunciado e o foco permanece na própria ação.
2. **Given** um filme marcado, **When** a pessoa aciona a ação de novo, **Then** a marca é removida e o estado volta ao neutro.
3. **Given** uma série, **When** marca "Gostei", **Then** o sinal vale para a série (não para um episódio) e aparece em qualquer abertura dela.
4. **Given** um título marcado, **When** o app é reiniciado ou a lista é ressincronizada e o mesmo título continua no catálogo, **Then** a marca é mantida.
5. **Given** o detalhe de filme/série, **When** a linha de ações é montada, **Then** a ação primária continua no índice 0 e "Gostei" nunca a desloca.

---

### User Story 2 - Ver o que foi marcado nos cards (Priority: P2)

A pessoa percebe, nas grades e rails, quais filmes/séries já marcou, por um marcador discreto no card.

**Why this priority**: confirma o sinal fora do detalhe sem criar tela nova; depende da P1.

**Independent Test**: marcar um título e voltar à grade/rail onde ele aparece; o card mostra o marcador, e desmarcar o remove.

**Acceptance Scenarios**:

1. **Given** um título marcado, **When** seu card é exibido em grade ou rail, **Then** mostra o marcador "Gostei" sem alterar as dimensões do card nem o texto principal.
2. **Given** a grade já aberta, **When** a pessoa volta do detalhe após marcar/desmarcar, **Then** o marcador reflete a mudança sem recarregar a categoria nem perder foco/scroll.
3. **Given** o marcador, **When** lido por tecnologia assistiva, **Then** o nome acessível do card inclui "Gostei" (não depende só da cor).

---

### User Story 3 - Estado coerente com remoção de lista e outras ações (Priority: P3)

O sinal acompanha o ciclo de vida da lista e não interfere em favoritos, histórico ou "assistido".

**Why this priority**: evita dado órfão e efeitos colaterais; é correção de borda, não o valor principal.

**Independent Test**: remover uma lista com títulos marcados e conferir que os sinais dela somem; limpar histórico e conferir que "Gostei" permanece.

**Acceptance Scenarios**:

1. **Given** uma lista com títulos marcados, **When** a lista é excluída, **Then** os sinais "Gostei" dela são removidos e os de outras listas permanecem.
2. **Given** um título marcado, **When** a pessoa remove-o do `↺ Histórico` ou limpa o histórico (Privacidade), **Then** "Gostei" não muda.
3. **Given** um título marcado, **When** é favoritado/desfavoritado ou marcado "assistido", **Then** "Gostei" não muda, e vice-versa.

---

### Edge Cases

- Título marcado que deixa de existir no catálogo após ressincronização: o sinal não é atribuído a outra obra por aproximação; permanece guardado e reaparece se o título voltar (a reconciliação ativa é o item 24).
- Marcar enquanto o detalhe ainda carrega metadados: a ação funciona porque depende só da identidade estável, não de metadados.
- Falha ao gravar: a pessoa vê aviso curto, o estado exibido não diverge do gravado e o foco continua na ação.
- Toque repetido rápido na ação: o resultado final reflete a última intenção, sem estado intermediário inconsistente.
- Mesmo título em duas listas diferentes: sinais independentes por lista.
- Reduced motion: a mudança de estado não depende de animação.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir marcar e desmarcar "Gostei" em filme e em série a partir do detalhe.
- **FR-002**: O sinal DEVE ser binário e distinto de favorito, histórico e "assistido"; mudar um NÃO DEVE alterar os outros.
- **FR-003**: O sinal DEVE ser persistido por identidade lógica estável (lista + tipo + id estável da obra) e NUNCA pela URL do stream.
- **FR-004**: Em série, o sinal DEVE valer para a série como obra, nunca para episódio.
- **FR-005**: O sinal DEVE sobreviver a reinício do app e a ressincronização da lista, enquanto o mesmo título existir.
- **FR-006**: O sinal NÃO DEVE ser atribuído a outra obra por aproximação de título.
- **FR-007**: A ação "Gostei" DEVE ficar depois da ação primária no detalhe, mantendo o índice 0 da ação primária.
- **FR-008**: O estado marcado DEVE ser perceptível por ícone e texto (nome acessível inclui "Gostei"/"Marcado como gostei"), nunca só por cor.
- **FR-009**: Marcar/desmarcar DEVE anunciar o resultado pela região `aria-live` existente e manter o foco na ação.
- **FR-010**: Cards de filme/série DEVEM exibir um marcador discreto quando o título estiver marcado, sem alterar as dimensões do card, e o nome acessível do card DEVE incluir "Gostei".
- **FR-011**: Voltar do detalhe à grade DEVE refletir a mudança do marcador sem recarregar a categoria nem perder foco ou rolagem (reconciliação por id).
- **FR-012**: Excluir uma lista DEVE remover os sinais "Gostei" dela, sem tocar nos de outras listas.
- **FR-013**: Limpar ou remover do histórico, favoritar e marcar "assistido" NÃO DEVEM alterar "Gostei".
- **FR-014**: Marcar NÃO DEVE disparar chamada externa nem depender de metadados carregados.
- **FR-015**: Falha de gravação DEVE ser comunicada e NÃO DEVE deixar o estado exibido divergente do gravado.
- **FR-016**: O valor guardado DEVE permitir adicionar outros sinais no futuro sem reescrever os já existentes.

### Key Entities *(include if feature involves data)*

- **Sinal "Gostei"**: associa uma obra (lista, tipo filme/série, id estável) a um estado binário e à data da marcação; vive junto do estado da pessoa, separado de favorito/histórico/retomada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pessoa marca ou desmarca "Gostei" em até 2 acionamentos a partir da abertura do detalhe (foco → OK).
- **SC-002**: Em 100% dos testes, a marca persiste após reinício e após ressincronização enquanto o título existir.
- **SC-003**: O marcador no card reflete a mudança em até 1 s após voltar à grade, sem perda de foco ou rolagem.
- **SC-004**: Em 100% dos testes de convivência, marcar/desmarcar não altera favoritos, histórico ou "assistido", e o inverso também.
- **SC-005**: Remover uma lista elimina 100% dos sinais dela e 0% dos de outras listas.
- **SC-006**: Nenhuma requisição de rede é gerada ao marcar ou desmarcar.

## Assumptions

- A escolha de ícone e do rótulo exato do marcador segue o catálogo de ícones do DS V14 (nenhum dos 17 atuais é "joinha" — o `sdd-plan` decide entre estender o conjunto ou usar glifo como a `Chip` fez com `✓`).
- O sinal fica no mesmo repositório de estado da pessoa (`UserStateRepository`); se exigir índice novo, a versão reservada do Dexie é a **v16** (a decidir no `sdd-plan`; o preferível é campo sem índice, sem subir versão).
- A limpeza na exclusão da lista segue o padrão já usado por favoritos e retomada (`deleteSource`).
- A aba Privacidade (feature 036) não limpa "Gostei" nesta feature.
- A passada na TV física é recomendada, não gate (nenhuma tecla nova nem camada sobre o AVPlay).

## Clarifications

### Sessão 2026-10-01

- Q: "Gostei" é binário ou tem "não gostei"? → A: Binário (gostei / sem marca).
- Q: Onde a pessoa marca? → A: Ação no detalhe de filme e de série (sem tecla de cor nem prompt no player).
- Q: Em séries, vale para a série ou o episódio? → A: Só a série.
- Q: Onde vê o que marcou? → A: Estado no detalhe e marcador no card; sem tela nova.
