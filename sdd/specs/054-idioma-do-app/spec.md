# Feature Specification: Idioma do app

**Slug**: `054-idioma-do-app`

**Created**: 2026-10-03

**Status**: Convergência Pendente

**Input**: Opção nas Configurações para escolher o idioma preferido da pessoa, valendo para a interface, para a sinopse e demais metadados do TMDB (hoje fixos em pt-BR) e para a escolha do trailer, com fallback automático para inglês e depois qualquer idioma disponível. Generaliza a preferência `preferredLanguage` ("Idioma preferido (trailers)") que hoje só reordena trailers, na aba Player & reprodução, sem spec.

## Escopo

### Incluído

- Uma preferência única de **idioma do aparelho**, com três opções: Português, Inglês e Espanhol.
- Interface (todos os textos próprios do app) traduzida nos três idiomas, trocando na hora.
- Sinopse e metadados vindos do TMDB (sinopse, gêneros, elenco/papéis, títulos de semelhantes e demais campos textuais) no idioma escolhido, com fallback.
- Trailer no idioma escolhido, com fallback para inglês e depois qualquer idioma disponível.
- Formatos de data, hora, duração, números e nomes de país/idioma acompanhando o idioma escolhido.
- Padrão inicial detectado a partir do idioma da TV, quando for um dos três suportados; senão Português.
- A linha "Idioma preferido (trailers)" da aba Player & reprodução é absorvida pela nova linha "Idioma" (a preferência guardada hoje é migrada, não perdida).

### Fora de Escopo

- Tradução de qualquer texto declarado pelo provedor/lista IPTV: nomes de canais, categorias, grupos, títulos e sinopse declarada pelo provedor. O provedor continua vencendo; o TMDB só preenche lacunas (feature 032).
- Mudar o padrão de áudio e legenda do player: continuam independentes (feature 041).
- Idiomas além de Português, Inglês e Espanhol (a estrutura deve permitir acrescentar depois, mas nenhum outro é entregue).
- Reconsulta em lote do catálogo ao trocar de idioma; nenhuma consulta ao TMDB por foco.
- Mudança de layout/direção de leitura (RTL) ou de teclado do IME por idioma.
- Qualquer uso do `api/` (fallback congelado, ADR-008).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolher o idioma e ver a interface trocar (Priority: P1)

A pessoa abre Configurações → Acessibilidade & sistema, escolhe "Idioma" e seleciona English ou Español; todos os textos próprios do app passam a aparecer nesse idioma imediatamente, sem reiniciar.

**Why this priority**: É o núcleo da feature e a base de todas as outras (sem uma preferência única e global, metadados e trailer não têm o que ler). Entrega valor sozinha.

**Independent Test**: Trocar o idioma para Inglês e percorrer Início, Live TV, Filmes, Séries, Configurações e o player: nenhum texto próprio do app permanece em português; voltar para Português restaura tudo.

**Acceptance Scenarios**:

1. **Given** o app em Português, **When** a pessoa escolhe Inglês e confirma, **Then** a interface passa a Inglês na hora, a linha "Idioma" mostra English e o foco permanece nela.
2. **Given** o idioma Inglês escolhido, **When** o app é fechado e reaberto, **Then** abre em Inglês.
3. **Given** qualquer estado (carregando, vazio, erro), **When** o idioma é Espanhol, **Then** o estado tem texto em Espanhol e pelo menos um elemento focável.
4. **Given** nome de canal, categoria ou título declarado pelo provedor, **When** o idioma muda, **Then** esse texto não muda.

---

### User Story 2 - Sinopse e metadados no idioma escolhido (Priority: P2)

Ao abrir o detalhe de um filme ou série, a sinopse e os demais textos do TMDB aparecem no idioma escolhido; se não existirem nele, aparecem no melhor idioma disponível, com a indicação de que não estão no idioma escolhido.

**Why this priority**: Depende da P1 (preferência global) e é o ganho mais visível depois da interface.

**Independent Test**: Com TMDB configurado, mudar para Espanhol e abrir um título já visto antes: sinopse e gêneros são buscados de novo, só ao abrir o detalhe, e aparecem em Espanhol.

**Acceptance Scenarios**:

1. **Given** título com metadados guardados em outro idioma, **When** a pessoa abre o detalhe, **Then** o app consulta o TMDB no idioma atual e substitui o texto guardado.
2. **Given** sinopse inexistente no idioma escolhido, **When** o detalhe abre, **Then** vale o fallback inglês e depois o idioma original, com a marca de idioma já usada hoje (FR-021 da 032).
3. **Given** sinopse declarada pelo provedor, **When** o detalhe abre, **Then** ela continua vencendo, sem tradução.
4. **Given** falha ou ausência de rede, **When** o detalhe abre, **Then** vale o que já está guardado, sem erro visível e sem apagar nada.
5. **Given** a troca de idioma, **When** a pessoa só navega e foca em cards, **Then** nenhuma consulta ao TMDB é disparada.

---

### User Story 3 - Trailer no idioma escolhido, com fallback (Priority: P2)

O trailer oferecido é, nesta ordem de preferência: no idioma escolhido, em inglês, em qualquer outro idioma. O rótulo do botão indica o idioma quando não for o escolhido.

**Why this priority**: É a dor que originou o pedido; parte já existe (reordenação) e passa a ler a preferência global.

**Independent Test**: Para um título com trailers em en e fr apenas, escolher Espanhol: o trailer é o inglês e o botão indica "Inglês".

**Acceptance Scenarios**:

1. **Given** trailer existente no idioma escolhido, **When** o detalhe abre, **Then** ele é o primeiro candidato.
2. **Given** nenhum no idioma escolhido, **When** o detalhe abre, **Then** o primeiro é o inglês; sem inglês, o melhor que existir.
3. **Given** o idioma muda, **When** o detalhe abre, **Then** o ranking e a lista de idiomas pedidos ao TMDB usam o idioma novo.

---

### User Story 4 - Formatos acompanham o idioma (Priority: P3)

Datas, horas (inclusive no guia de programação), durações, números e nomes de país/idioma seguem o idioma escolhido.

**Why this priority**: Acabamento; a interface já está utilizável sem isso.

**Independent Test**: Em Inglês, o horário do guia e as datas aparecem no formato inglês e países/idiomas têm nome em inglês.

**Acceptance Scenarios**:

1. **Given** idioma Inglês, **When** abre um detalhe com país e duração, **Then** o país aparece em inglês e a duração no formato do idioma.

---

### User Story 5 - Padrão inicial pelo idioma da TV (Priority: P3)

Na primeira abertura, sem preferência gravada, o app usa o idioma da TV se for pt, en ou es; senão Português.

**Why this priority**: Conveniência; sem ela a pessoa escolhe manualmente.

**Independent Test**: Sem preferência gravada e TV em Espanhol, o app abre em Espanhol; TV em Japonês abre em Português.

**Acceptance Scenarios**:

1. **Given** nenhuma preferência gravada e TV em idioma suportado, **When** o app abre, **Then** usa o idioma da TV.
2. **Given** preferência já escolhida pela pessoa, **When** o app abre, **Then** ela vale, mesmo que a TV esteja em outro idioma.
3. **Given** quem já usava a preferência "Idioma preferido (trailers)", **When** o app atualiza, **Then** esse valor vira o idioma do app (migração sem perda).

---

### Edge Cases

- Idioma detectado na TV não suportado ou indisponível: Português.
- Armazenamento local bloqueado: vale o idioma detectado/Português, sem erro.
- Texto traduzido faltando em um idioma: cai no português, nunca mostra chave técnica nem vazio.
- Textos mais longos (en/es) não podem estourar cards, botões ou topbar a 1920×1080, nem tirar foco de visão.
- Troca de idioma durante reprodução ou com modal aberto: o app não interrompe a reprodução e o foco não se perde.
- Detalhe aberto durante a troca: atualiza na próxima abertura, sem consulta repetida em laço.
- App oculto: nenhuma consulta de metadados começa (feature 042).
- Chave TMDB ausente ou recusada: só interface e formatos mudam.
- Resultado "sem correspondência" já guardado: segue valendo; o idioma não o invalida.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE oferecer em Configurações → Acessibilidade & sistema uma linha "Idioma" com Português, Inglês e Espanhol, operável só por controle remoto.
- **FR-002**: O sistema DEVE guardar a escolha no aparelho (não na lista) e restaurá-la ao reabrir.
- **FR-003**: O sistema DEVE aplicar a troca de idioma na hora, sem reiniciar e sem perder o foco.
- **FR-004**: O sistema DEVE exibir todos os textos próprios do app (rótulos, avisos, erros, estados vazios/carregando, toasts, nomes acessíveis) no idioma escolhido, com fallback para português quando faltar tradução.
- **FR-005**: O sistema NUNCA DEVE traduzir nem alterar texto declarado pelo provedor/lista (canais, categorias, grupos, títulos, sinopse do provedor).
- **FR-006**: O sistema DEVE buscar no TMDB os campos textuais no idioma escolhido, com fallback para inglês e depois o idioma original, marcando a sinopse que não estiver no idioma escolhido.
- **FR-007**: Ao abrir o detalhe de um título cujos metadados do TMDB foram obtidos em outro idioma, o sistema DEVE consultar de novo no idioma atual, só nessa abertura, e nunca em lote nem por foco.
- **FR-008**: Falha de rede ou serviço ao rebuscar NÃO DEVE apagar o que está guardado nem exibir erro por si só.
- **FR-009**: O sistema DEVE ordenar os trailers por: idioma escolhido, inglês, qualquer outro, mantendo as regras atuais (trailer antes de teaser; oficial antes de idioma, R-012) e pedir ao TMDB os vídeos nesses idiomas.
- **FR-010**: O sistema DEVE formatar datas, horas, durações, números e nomes de país/idioma conforme o idioma escolhido.
- **FR-011**: Sem preferência gravada, o sistema DEVE usar o idioma da TV se for suportado; senão Português.
- **FR-012**: O sistema DEVE migrar o valor de "Idioma preferido (trailers)" para o idioma do app e remover essa linha da aba Player & reprodução.
- **FR-013**: Áudio e legenda do player DEVEM continuar com preferências próprias, independentes do idioma do app.
- **FR-014**: A troca de idioma NÃO DEVE interromper nem reiniciar uma reprodução em curso.
- **FR-015**: Cada estado (inclusive carregando, vazio e erro) DEVE continuar com ao menos um elemento focável em qualquer dos três idiomas.
- **FR-016**: Segredos (chave TMDB, credenciais) NÃO DEVEM aparecer em texto traduzido, log ou erro.

### Key Entities *(include if feature involves data)*

- **Idioma do app**: preferência do aparelho, um entre pt, en, es; substitui a antiga preferência de idioma de trailers.
- **Metadados do TMDB guardados**: passam a registrar em que idioma foram obtidos, para saber se precisam ser rebuscados na abertura do detalhe.
- **Texto da interface**: catálogo de textos por idioma, com português como base de fallback.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em cada um dos 3 idiomas, 100% dos textos próprios do app, nas telas principais e no player, aparecem no idioma escolhido, verificado por varredura das telas.
- **SC-002**: A troca de idioma se reflete na tela em até 1 segundo, sem reiniciar o app.
- **SC-003**: Nenhuma consulta ao TMDB ocorre por foco ou navegação após a troca; cada título é rebuscado no máximo uma vez, ao abrir o detalhe.
- **SC-004**: Em 100% dos títulos com ao menos um trailer, o botão oferece algum trailer; o do idioma escolhido, quando existe, é o primeiro.
- **SC-005**: Nenhum texto do provedor é alterado pela troca de idioma.
- **SC-006**: Nenhum texto em en/es corta, sobrepõe ou esconde elementos focáveis a 1920×1080, validado na TV física.
- **SC-007**: Quem já tinha preferência de trailer não a perde após a atualização.

## Assumptions

- O idioma da TV é lido por uma API do Tizen ou, na falta dela, pelo navegador; o `sdd-plan` decide qual (aqui só o comportamento).
- Todos os três idiomas têm cobertura no TMDB para os campos usados.
- O ADR-011/constituição não mudam: foco, retorno e chaves de resume independem do idioma.
- O dado de idioma do app é preferência do aparelho, nunca exportada nem enviada a terceiros além do parâmetro de idioma ao próprio TMDB.
- A estrutura de tradução deve permitir novos idiomas depois sem refatorar telas (decisão do `sdd-plan`).

## Clarifications

### Sessão 2026-10-03

- Q: Quais idiomas a interface oferece? → A: Português, Inglês e Espanhol.
- Q: Qual o padrão na primeira abertura? → A: Detectar o idioma da TV (se pt/en/es), senão Português.
- Q: Onde fica a opção? → A: Nova linha "Idioma" na aba Acessibilidade & sistema, absorvendo a linha de trailers.
- Q: Troca aplica na hora? → A: Sim, imediatamente.
- Q: O que acontece com o cache de metadados do TMDB ao trocar? → A: Rebuscar sob demanda ao abrir o detalhe; nunca em lote.
- Q: Traduzir o que o provedor declara? → A: Não; o provedor continua vencendo.
- Q: O idioma define áudio e legenda do player? → A: Não, continuam independentes.
- Q: Formatos de data/hora/número e nomes de país/idioma acompanham? → A: Sim.
